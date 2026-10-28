/**
 * Browser half of the FlowLeap agent builder: a New agent row in the new-session preset menu
 * (`agentPreset.menu.actions`) and the agent form in `shell.overlay`. One form controller backs both.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-agent-preset/client'
import { AgentFormDialog } from './AgentFormDialog.tsx'
import { AgentFormController } from './form-store.ts'
import { de, en, es, fr, ja, NS, pt, ru, zh, type FlowleapAgentBuilderKey } from './locales.ts'
import { NewAgentMenuItem } from './NewAgentMenuItem.tsx'
import { SAMPLE_CONNECTORS, sampleDraft } from './sample.ts'

export type { FlowleapAgentBuilderKey } from './locales.ts'
export type { AgentDraft, AgentFileRow, AgentFormState, ConnectorChoice } from './form-store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** New agent menu row and agent form copy. */
    'flowleapAgentBuilder': FlowleapAgentBuilderKey
  }
}

/** Required services: slots and copy. */
export const inject = ['slots', 'locale']

/**
 * Register the New agent menu row and the agent form.
 * @param ctx - browser services used by these contributions.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-flowleap-agent-builder: dictionaries')
  const form = new AgentFormController(SAMPLE_CONNECTORS, sampleDraft)
  ctx.slots.inject('agentPreset.menu.actions', () => ctx.slots.register({
    name: 'agentPreset.menu.actions', id: 'flowleap-new-agent', locale: NS,
    inject: () => ({ openCreate: form.openCreate }),
  }, NewAgentMenuItem))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'flowleap-agent-form', locale: NS,
    inject: () => ({
      hooks: { agentForm: form.state },
      connectors: form.connectors,
      close: form.close,
      edit: form.edit,
      toggleConnector: form.toggleConnector,
      addFiles: form.addFiles,
      removeFile: form.removeFile,
    }),
  }, AgentFormDialog))
}
