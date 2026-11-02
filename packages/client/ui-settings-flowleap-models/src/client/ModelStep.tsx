/**
 * The model step controls inside one Models page card: Connect OpenRouter on the OpenRouter card, and Test on the
 * Anthropic, OpenAI, and OpenRouter cards once a key is saved, with the result as a status line. Other cards, and a
 * card whose route is not configured, render nothing.
 */

import { useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {
  ModelProviderId, ModelTestResult, OpenRouterConnectResult, OpenRouterConnectStart,
} from '@deepseek-ai/dsh-flowleap-models/types'
import type { NS } from './locales.ts'
import css from './ModelStep.module.css'

type Copy = PropsLocale<typeof NS>

/** The Host calls of the model step. */
export interface ModelStepOperations {
  /** Test the stored key of one provider. */
  test: (provider: ModelProviderId) => Promise<ModelTestResult>
  /** Start an OpenRouter connect. */
  startOpenRouter: () => Promise<OpenRouterConnectStart>
  /** Wait for the end of the current OpenRouter connect. */
  awaitOpenRouter: () => Promise<OpenRouterConnectResult>
  /** End the current OpenRouter connect. */
  cancelOpenRouter: () => Promise<void>
  /** Open a page in the attorney's browser. */
  open: (url: string) => void
}

/** Injected share of the step. */
export interface ModelStepInjected {
  readonly operations: ModelStepOperations
}

/** Props of one card's step. */
export type ModelStepProps = PropsRuntime<'settings.models.provider-card'> & Copy & InjectFace<ModelStepInjected>

/** What the step shows after its last action. */
type Outcome =
  | { readonly kind: 'tested'; readonly result: ModelTestResult }
  | { readonly kind: 'connect'; readonly result: OpenRouterConnectResult }
  | { readonly kind: 'error'; readonly message: string }

type Busy = { readonly kind: 'idle' } | { readonly kind: 'testing' } | { readonly kind: 'connecting'; readonly url?: string }

const STEP_PROVIDERS: ReadonlySet<string> = new Set<ModelProviderId>(['anthropic', 'openai', 'openrouter'])

function isStepProvider(provider: string): provider is ModelProviderId {
  return STEP_PROVIDERS.has(provider)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The status line of an outcome.
 * @param outcome - the last result.
 * @param t - copy.
 * @returns whether it is a success, and its text.
 */
function outcomeLine(outcome: Outcome, t: Copy['t']): { ok: boolean; text: string } {
  switch (outcome.kind) {
    case 'error':
      return { ok: false, text: t('failure.call', { message: outcome.message }) }
    case 'tested': {
      const result = outcome.result
      if (!result.ok) return { ok: false, text: t(`failure.${result.reason}`, { status: String(result.status ?? '') }) }
      const adopted = result.adopted === undefined ? '' : ` ${t('adopted', { model: result.adopted.model })}`
      return { ok: true, text: `${t('ok')}${adopted}` }
    }
    case 'connect': {
      const result = outcome.result
      switch (result.state) {
        case 'connected': {
          const adopted = result.adopted === undefined ? '' : ` ${t('adopted', { model: result.adopted.model })}`
          return { ok: true, text: `${t('connected')}${adopted}` }
        }
        case 'cancelled':
          return { ok: false, text: t('cancelled') }
        case 'failed':
          return { ok: false, text: t(`failure.${result.reason}`, { status: '' }) }
      }
    }
  }
}

/**
 * Render the step for one card.
 * @param props - the card's directory row, its key state, the Host calls, and copy.
 * @returns the controls, or nothing for a card outside the step.
 */
export function ModelStep({ provider, configured, keyConfigured, operations, t }: ModelStepProps): ReactNode {
  const [busy, setBusy] = useState<Busy>({ kind: 'idle' })
  const [outcome, setOutcome] = useState<Outcome | undefined>(undefined)
  const id = provider.provider
  if (!configured || !isStepProvider(id)) return null
  // A key card shows nothing until its key is saved or it has a result.
  if (id !== 'openrouter' && !keyConfigured && outcome === undefined) return null

  const test = async (): Promise<void> => {
    setBusy({ kind: 'testing' })
    setOutcome(undefined)
    try {
      setOutcome({ kind: 'tested', result: await operations.test(id) })
    } catch (error: unknown) {
      setOutcome({ kind: 'error', message: errorMessage(error) })
    } finally {
      setBusy({ kind: 'idle' })
    }
  }

  const connect = async (): Promise<void> => {
    setBusy({ kind: 'connecting' })
    setOutcome(undefined)
    try {
      const { url } = await operations.startOpenRouter()
      setBusy({ kind: 'connecting', url })
      operations.open(url)
      setOutcome({ kind: 'connect', result: await operations.awaitOpenRouter() })
    } catch (error: unknown) {
      setOutcome({ kind: 'error', message: errorMessage(error) })
    } finally {
      setBusy({ kind: 'idle' })
    }
  }

  const line = outcome === undefined ? undefined : outcomeLine(outcome, t)
  return (
    <div className={css.step}>
      {id === 'openrouter' && <p className={css.hint}>{t('connect.hint')}</p>}
      <div className={css.actions}>
        {id === 'openrouter' && (
          <Button variant="primary" size="sm" disabled={busy.kind !== 'idle'} onClick={() => { void connect() }}>
            {t('connect')}
          </Button>
        )}
        {keyConfigured && (
          <Button variant="outline" size="sm" disabled={busy.kind !== 'idle'} onClick={() => { void test() }}>
            {t(busy.kind === 'testing' ? 'testing' : 'test')}
          </Button>
        )}
        {busy.kind === 'connecting' && (
          <Button variant="outline" size="sm" onClick={() => { void operations.cancelOpenRouter() }}>
            {t('cancel')}
          </Button>
        )}
      </div>
      {busy.kind === 'connecting' && (
        <p className={css.hint} role="status">
          {t('connect.waiting')}
          {busy.url === undefined ? null : (
            <>
              {' '}
              <a href={busy.url} target="_blank" rel="noopener noreferrer">{t('connect.open')}</a>
            </>
          )}
        </p>
      )}
      {line === undefined ? null : <p className={line.ok ? css.ok : css.failed} role="status">{line.text}</p>}
    </div>
  )
}
