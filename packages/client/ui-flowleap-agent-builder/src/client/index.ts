/**
 * Browser half of the FlowLeap agent builder: the New agent and Edit agent rows in the new-session preset menu
 * (`agentPreset.menu.actions`) and the agent form in `shell.overlay`. One controller over the `flowleapAgents` Remote
 * backs all three; `flowleap-agents/changed` and a connection reset read the Host again.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-agent-preset/client'
import type { AgentId } from '@deepseek-ai/dsh-flowleap-agent-builder/types'
import { AgentFormDialog } from './AgentFormDialog.tsx'
import { EditAgentMenuItem } from './EditAgentMenuItem.tsx'
import { AgentFormController } from './form-store.ts'
import { de, en, es, fr, ja, NS, pt, ru, zh, type FlowleapAgentBuilderKey } from './locales.ts'
import { NewAgentMenuItem } from './NewAgentMenuItem.tsx'

export type { FlowleapAgentBuilderKey } from './locales.ts'
export type { AgentBuilderDeps, AgentDraft, AgentFileRow, AgentFileRowState, AgentFormError, AgentFormState } from './form-store.ts'
export { AgentFormController } from './form-store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** New agent and Edit agent menu rows and agent form copy. */
    'flowleapAgentBuilder': FlowleapAgentBuilderKey
  }
}

/**
 * Document-relative form of the Host route `AGENT_UPLOAD_PATH` of `dsh-flowleap-agent-builder/types`; the client bundle
 * may not import values across plugins, so the string is restated here.
 */
export const AGENT_UPLOAD_ROUTE = 'api/flowleap-agents/upload'

/** Required services: slots, copy, the Remote namespace, and access. */
export const inject = ['slots', 'locale', 'remote', 'remote.flowleapAgents', 'remoteAccess']

/**
 * Send one file to the Host upload route, relative to the document like the other app routes.
 * @param id - the agent.
 * @param file - the browser file.
 * @returns an error text, or undefined when the Host stored the file.
 */
export async function uploadAgentFile(id: AgentId, file: File): Promise<string | undefined> {
  const query = new URLSearchParams({ agent: id, name: file.name })
  const response = await fetch(`${AGENT_UPLOAD_ROUTE}?${query.toString()}`, {
    method: 'POST', body: file, credentials: 'include', headers: { 'content-type': 'application/octet-stream' },
  })
  if (response.status !== 200) return `HTTP ${String(response.status)}`
  const result = await response.json() as { ok: boolean; error?: { message?: string } }
  return result.ok ? undefined : result.error?.message ?? 'upload failed'
}

/**
 * Register the menu rows and the agent form.
 * @param ctx - browser services used by these contributions.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-flowleap-agent-builder: dictionaries')
  // Every flowleapAgents endpoint is owner-only; a Peer without access sees no row.
  ctx.remoteAccess.whenAccess('flowleapAgents/list', function* () {
    const agents = ctx.remote.flowleapAgents
    const form = new AgentFormController({
      list: () => agents.list(),
      read: id => agents.read(id),
      connectors: () => agents.connectors(),
      save: input => agents.save({ ...input, connectors: [...input.connectors] }),
      delete: id => agents.delete(id),
      removeFile: (id, name) => agents.removeFile(id, name),
      upload: uploadAgentFile,
    })
    yield ctx.effect(() => {
      void form.loadAgents()
      const changed = ctx.remote.$on('flowleap-agents/changed', form.changed)
      const reset = ctx.on('connection/reset', form.changed)
      return () => {
        changed()
        reset()
      }
    }, 'ui-flowleap-agent-builder: agent list')
    yield ctx.slots.inject('agentPreset.menu.actions', () => ctx.slots.register({
      name: 'agentPreset.menu.actions', id: 'flowleap-new-agent', locale: NS,
      inject: () => ({ openCreate: form.openCreate }),
    }, NewAgentMenuItem))
    yield ctx.slots.inject('agentPreset.menu.actions', () => ctx.slots.register({
      name: 'agentPreset.menu.actions', id: 'flowleap-edit-agent', order: 1, locale: NS,
      inject: () => ({ hooks: { agents: form.agents }, openEdit: form.openEdit }),
    }, EditAgentMenuItem))
    yield ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay', id: 'flowleap-agent-form', locale: NS,
      inject: () => ({
        hooks: { agentForm: form.state },
        close: form.close,
        edit: form.edit,
        toggleConnector: form.toggleConnector,
        addFiles: form.addFiles,
        removeFile: form.removeFile,
        save: form.save,
        requestDelete: form.requestDelete,
        cancelDelete: form.cancelDelete,
        confirmDelete: form.confirmDelete,
      }),
    }, AgentFormDialog))
  })
}
