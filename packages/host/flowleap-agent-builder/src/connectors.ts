/**
 * Which global tools belong to which connector choice, and the restriction that hides the tools of the connectors an
 * agent did not choose.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import { COMPARE_CLAIMS_NAME } from '@deepseek-ai/dsh-flowleap-connectors'
import type {} from '@deepseek-ai/dsh-tools'
import { officeTools, type ToolAccess } from '@flowleap/connectors'
import type { ConnectorChoiceId } from './types.ts'

/** Prefix of the tools the `mcp-flowleap` row registers. */
export const FLOWLEAP_MCP_PREFIX = 'mcp__flowleap__'

/** The connector choice an office tool's `access` spends; `mistral` (OCR) and `none` belong to no choice. */
const CHOICE_OF_ACCESS: Readonly<Record<ToolAccess, ConnectorChoiceId | undefined>> = {
  epoOps: 'epo-ops',
  usptoOdp: 'uspto-odp',
  semanticScholar: 'semantic-scholar',
  mistral: undefined,
  none: undefined,
}

/**
 * The office tools of `@flowleap/connectors`, by the connector choice they spend.
 * @returns tool name to choice, for the tools that spend a choice.
 */
export function officeToolChoices(): ReadonlyMap<string, ConnectorChoiceId> {
  const map = new Map<string, ConnectorChoiceId>()
  for (const definition of officeTools()) {
    /* v8 ignore next -- every vendored office tool declares its access */
    const choice = definition.access === undefined ? undefined : CHOICE_OF_ACCESS[definition.access]
    if (choice !== undefined) map.set(definition.name, choice)
  }
  return map
}

/**
 * Build the test for one agent: which global tool names its chosen connectors do not cover. An office tool is denied
 * when its connector is not chosen; an `mcp__flowleap__*` tool when `flowleap` is not chosen; the native
 * `compare_claims`, which fetches claims from EPO OPS or USPTO ODP, when neither is chosen.
 * @param chosen - the chosen connectors.
 * @returns a predicate over global tool names.
 */
export function deniedTool(chosen: readonly ConnectorChoiceId[]): (name: string) => boolean {
  const selected = new Set(chosen)
  const office = officeToolChoices()
  return (name) => {
    const choice = office.get(name)
    if (choice !== undefined) return !selected.has(choice)
    if (name.startsWith(FLOWLEAP_MCP_PREFIX)) return !selected.has('flowleap')
    if (name === COMPARE_CLAIMS_NAME) return !selected.has('epo-ops') && !selected.has('uspto-odp')
    return false
  }
}

/**
 * Hide the denied global tools from the agents of a preset revision, and keep the restriction current as tools come
 * and go: the MCP row registers its tools after its connection opens, and `tools.restrict` refuses a name that is not
 * registered. On each `tools/change` the restriction is replaced by one over the denied names that are registered now;
 * the new restriction is applied before the old one is lifted, so no denied tool is visible between the two.
 * @param ctx - a scoped context (a preset row); the restriction and the listener live for its scope.
 * @param denied - the predicate from {@link deniedTool}.
 */
export function restrictConnectors(ctx: Context, denied: (name: string) => boolean): void {
  let current: { key: string; lift: (() => void) | undefined } = { key: '', lift: undefined }
  const sync = (): void => {
    const names = ctx.tools.definitions().map(definition => definition.name).filter(denied).sort()
    const key = names.join('\n')
    if (key === current.key) return
    const previous = current
    current = { key, lift: undefined }
    // restrict() emits tools/change synchronously; the re-entrant sync() sees the new key and returns.
    current.lift = names.length === 0 ? undefined : ctx.tools.restrict({ deny: names })
    previous.lift?.()
  }
  ctx.on('tools/change', sync)
  // Each restriction is an effect of ctx, so the scope's disposal lifts the current one.
  sync()
}
