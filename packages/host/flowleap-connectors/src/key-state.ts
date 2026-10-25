/**
 * The live patent-data key state as a system-prompt section.
 *
 * The Patent Agent persona (`dsh-flowleap-prompt`) is a static export of the
 * IDE prompt and cannot know which keys this host holds; it defers the key
 * state to the section this module registers. The section says, per
 * connector, only whether a key is stored. It names no office as reachable:
 * a call is the authority on what a route returns. The presence map refreshes
 * when a `flowleap-connectors/<id>` record changes, so a key saved in Settings
 * reaches the next turn's prompt without a restart. Values never enter the text.
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialKeyScope, type CredentialKey } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { CONNECTOR_LABELS, CREDENTIAL_SCOPE, type ConnectorCredentialStore } from './credentials.ts'
import { CONNECTOR_IDS, type ConnectorId } from './types.ts'

/** Name of the registered prompt section. */
export const KEY_STATE_SECTION_NAME = 'flowleap:patent-data-keys'

/** Order of the section: right after the persona slot (`flowleap:patent-agent` is 0). */
export const KEY_STATE_SECTION_ORDER = 1

/** The heading the persona export points the model at; keep the two in step. */
export const KEY_STATE_HEADING = 'Patent-data keys (this host)'

/** Whether a key is stored, per connector. */
export type KeyPresence = Readonly<Record<ConnectorId, boolean>>

/** No key stored anywhere: the state before the first read and after every record is removed. */
export const NO_KEYS: KeyPresence = Object.freeze(
  Object.fromEntries(CONNECTOR_IDS.map(id => [id, false])) as Record<ConnectorId, boolean>,
)

/**
 * Render the section text for one presence map.
 * @param presence - whether a key is stored, per connector.
 * @returns the section text: the heading, one line per connector, and the rules the model follows.
 */
export function renderKeyStateSection(presence: KeyPresence): string {
  const rows = CONNECTOR_IDS.map(id => `- ${CONNECTOR_LABELS[id]}: ${presence[id] ? 'key is set' : 'key is not set'}`)
  return [
    `${KEY_STATE_HEADING}:`,
    'This host runs the patent offices on the firm\'s own keys, stored in Settings > Patent data connectors. Key presence this turn:',
    ...rows,
    '',
    'Rules. A set key makes its office callable; whether a route answers is known only when the call returns. '
    + 'A missing key makes every tool of that office answer "not configured" with the settings path: name that gap as a MISSING-KEY gap, '
    + 'never as a data or coverage gap, and do not retry the call. Mistral is the OCR key, not a patent office. '
    + 'Text this host has no source for (US claims) is a paid FlowLeap service; the tool result names the route to take.',
  ].join('\n')
}

/**
 * Read the presence of every connector record from the store.
 * @param store - the connector records.
 * @returns the presence map.
 */
export async function readKeyPresence(store: ConnectorCredentialStore): Promise<KeyPresence> {
  const entries = await Promise.all(CONNECTOR_IDS.map(async id => [id, (await store.describe(id)).configured] as const))
  return Object.fromEntries(entries) as Record<ConnectorId, boolean>
}

/**
 * Register the key-state section and keep it current with the connector records.
 * @param ctx - a context carrying `systemPrompt`; the section and the record listener live for its scope.
 * @param store - the connector records.
 * @returns settles when the first presence read is in; later reads follow record changes.
 */
export async function registerKeyStateSection(ctx: Context, store: ConnectorCredentialStore): Promise<void> {
  let presence: KeyPresence = NO_KEYS
  const refresh = async (): Promise<void> => {
    try {
      presence = await readKeyPresence(store)
    } catch (error) {
      ctx.logger.warn('flowleap-connectors: key state not read; the prompt keeps the last presence', error)
    }
  }
  ctx.effect(() => ctx.systemPrompt.section({
    name: KEY_STATE_SECTION_NAME,
    order: KEY_STATE_SECTION_ORDER,
    text: () => renderKeyStateSection(presence),
    interpolate: false,
  }), 'flowleap-connectors: key-state section')
  ctx.on('credentials/record-updated', (key: CredentialKey) => {
    if (credentialKeyScope(key) === CREDENTIAL_SCOPE) void refresh()
  })
  await refresh()
}
