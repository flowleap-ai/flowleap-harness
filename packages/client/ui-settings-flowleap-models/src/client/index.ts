/**
 * Browser half of the FlowLeap model step: the Test and Connect OpenRouter controls inside the Anthropic, OpenAI, and
 * OpenRouter cards of the Models page, through the `settings.models.provider-card` slot of `llm-pi-ai`, over the
 * `flowleapModels` Remote. Registers only while the current Peer may call `flowleapModels/test`.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import { ModelStep, type ModelStepInjected } from './ModelStep.tsx'
import { de, en, es, fr, ja, NS, pt, ru, zh, type FlowleapModelsKey } from './locales.ts'

export type { ModelStepInjected, ModelStepOperations, ModelStepProps } from './ModelStep.tsx'
export type { FlowleapModelsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Model step copy. */
    'settings.flowleapModels': FlowleapModelsKey
  }
}

/** Settings namespace of the `llm-pi-ai` routes, the provider-card key this step registers under. */
const PI_AI_NAMESPACE = 'llm-pi-ai'

/**
 * The value of a Remote call, or its error thrown, so the step shows one failure line for every failed call.
 * @param call - the pending Remote result.
 * @returns the value.
 * @throws the call's RemoteError.
 */
async function value<T>(call: Promise<RemoteResult<T>>): Promise<T> {
  const result = await call
  if (!result.ok) throw result.error
  return result.value
}

/** Required services: slots, copy, the Remote namespace, and access. */
export const inject = ['slots', 'locale', 'remote', 'remote.flowleapModels', 'remoteAccess']

/**
 * Register the step in every `llm-pi-ai` card while the current Peer may test a key.
 * @param ctx - browser services used by the step.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-settings-flowleap-models: dictionaries')
  ctx.remoteAccess.whenAccess('flowleapModels/test', function* () {
    const remote = ctx.remote.flowleapModels
    const injected = (): ModelStepInjected => ({
      operations: {
        test: provider => value(remote.test(provider)),
        startOpenRouter: () => value(remote.startOpenRouter()),
        awaitOpenRouter: () => value(remote.awaitOpenRouter()),
        cancelOpenRouter: () => value(remote.cancelOpenRouter()),
        open: (url) => { window.open(url, '_blank', 'noopener,noreferrer') },
      },
    })
    yield ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
      name: 'settings.models.provider-card', key: PI_AI_NAMESPACE, locale: NS, inject: injected,
    }, ModelStep))
  })
}
