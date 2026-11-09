/**
 * The MyEPO card state over the `flowleapConnectors` Remote: the link from `myEpoDescribe()`, the write-only draft of
 * the client ID and the secret, the act that crosses the wire, and the outcome of the last link or test. The card
 * shows one mode at a time, derived by {@link myEpoMode}. Secret values flow in one direction: the draft is sent
 * through `myEpoLink` and dropped; nothing stored is read into the page.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MyEpoLinkView, MyEpoTestOutcome } from '@deepseek-ai/dsh-api-remotes/client'
import { RemotePageStore } from './remote-page-store.ts'

/** The two fields the card asks for. */
export type MyEpoField = 'clientId' | 'clientSecret'

/** What the card renders. */
export interface MyEpoState {
  /** `idle` before the first load; `error` when `myEpoDescribe()` failed. */
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** The stored link; not linked until the first load. */
  link: MyEpoLinkView
  /** Unsaved input; starts blank on every load. */
  draft: Record<MyEpoField, string>
  /** The act crossing the wire, if any. */
  busy: 'idle' | 'linking' | 'testing' | 'unlinking'
  /** Whether the person chose to replace the stored credentials. */
  replacing: boolean
  /** The outcome of the last link or test, kept until the next act. */
  outcome?: MyEpoTestOutcome
  /** The last refused call, verbatim from the Host. */
  error?: string
}

/** The one view the card shows. */
export type MyEpoMode =
  /** The fields: not linked, or replacing the stored credentials. */
  | 'form'
  /** A link or test runs. */
  | 'testing'
  /** A link or test passed and the account may read at least one portfolio. */
  | 'passed'
  /** A link or test passed, but the account may read no portfolio. */
  | 'empty'
  /** The EPO refused the credentials. */
  | 'refused'
  /** The EPO did not answer, or answered with another error, and the stored link did not change. */
  | 'unreachable'
  | 'failed'
  /** The stored link on a later visit. */
  | 'linked'

/**
 * Derive the card's view from its state.
 * @param state - the card state.
 * @returns the mode to render.
 */
export function myEpoMode(state: MyEpoState): MyEpoMode {
  if (state.busy === 'linking' || state.busy === 'testing') return 'testing'
  const outcome = state.outcome
  if (outcome === undefined || outcome.kind === 'not-linked') return state.link.state === 'linked' && !state.replacing ? 'linked' : 'form'
  switch (outcome.kind) {
    case 'passed': return outcome.portfolios.length === 0 ? 'empty' : 'passed'
    case 'refused':
    case 'unreachable':
    case 'failed':
      return outcome.kind
  }
}

/**
 * Whether both fields hold a value.
 * @param state - the card state.
 * @returns true when Save and test can run.
 */
export function myEpoDraftComplete(state: MyEpoState): boolean {
  return state.draft.clientId.trim().length > 0 && state.draft.clientSecret.trim().length > 0
}

function initialState(): MyEpoState {
  return { status: 'idle', link: { state: 'not-linked', writable: true }, draft: { clientId: '', clientSecret: '' }, busy: 'idle', replacing: false }
}

/** Coordinates the MyEPO card with the Host. */
export class MyEpoStore extends RemotePageStore<MyEpoState> {
  /** @param ctx - the page plugin's context, whose `remote.flowleapConnectors` namespace this store calls. */
  constructor(ctx: ClientContext) {
    super(ctx, initialState())
  }

  /**
   * Stage one field.
   * @param field - the client ID or the secret.
   * @param text - the typed value.
   */
  edit(field: MyEpoField, text: string): void {
    this.store.update((state) => {
      state.draft[field] = text
      delete state.error
    })
  }

  /**
   * Show the fields over a stored link, or hide them again; the draft and the last outcome are dropped either way.
   * @param replacing - true to show the fields, false to go back to the linked card.
   */
  replace(replacing: boolean): void {
    this.store.update((state) => {
      state.replacing = replacing
      state.draft = { clientId: '', clientSecret: '' }
      delete state.outcome
      delete state.error
    })
  }

  /**
   * Test the draft and let the Host store it when the test passed. The draft is dropped after a passed or refused
   * test, and kept when the EPO did not answer, so Try again sends it again.
   * @returns the outcome, or `undefined` when nothing ran or the call itself failed.
   */
  async link(): Promise<MyEpoTestOutcome | undefined> {
    const state = this.store.getSnapshot()
    if (!myEpoDraftComplete(state) || state.busy !== 'idle') return undefined
    const values = { clientId: state.draft.clientId.trim(), clientSecret: state.draft.clientSecret.trim() }
    this.begin('linking')
    const result = await this.ctx.remote.flowleapConnectors.myEpoLink(values)
    return this.settle(result, true)
  }

  /**
   * Test the stored link.
   * @returns the outcome, or `undefined` when nothing ran or the call itself failed.
   */
  async test(): Promise<MyEpoTestOutcome | undefined> {
    if (this.store.getSnapshot().busy !== 'idle') return undefined
    this.begin('testing')
    const result = await this.ctx.remote.flowleapConnectors.myEpoTest()
    return this.settle(result, false)
  }

  /**
   * Remove the stored link.
   * @returns true when the Host removed it.
   */
  async unlink(): Promise<boolean> {
    if (this.store.getSnapshot().busy !== 'idle') return false
    this.begin('unlinking')
    const result = await this.ctx.remote.flowleapConnectors.myEpoUnlink()
    this.store.update((state) => {
      state.busy = 'idle'
      if (result.ok) {
        state.link = { state: 'not-linked', writable: state.link.writable }
        state.replacing = false
      } else {
        state.error = result.error.message
      }
    })
    return result.ok
  }

  private begin(busy: MyEpoState['busy']): void {
    this.store.update((state) => {
      state.busy = busy
      delete state.outcome
      delete state.error
    })
  }

  private settle(
    result: { ok: true; value: MyEpoTestOutcome } | { ok: false; error: { message: string } },
    dropDraft: boolean,
  ): MyEpoTestOutcome | undefined {
    this.store.update((state) => {
      state.busy = 'idle'
      if (dropDraft && result.ok && (result.value.kind === 'passed' || result.value.kind === 'refused')) {
        state.draft = { clientId: '', clientSecret: '' }
      }
      if (!result.ok) {
        state.error = result.error.message
        return
      }
      state.outcome = result.value
      if (result.value.kind === 'passed') {
        const { testedAt, portfolios, mailbox } = result.value
        state.link = { state: 'linked', writable: state.link.writable, testedAt, portfolios: portfolios.length, mailbox }
        state.replacing = false
      }
      if (result.value.kind === 'not-linked') state.link = { state: 'not-linked', writable: state.link.writable }
    })
    return result.ok ? result.value : undefined
  }

  protected async read(): Promise<void> {
    this.store.update((state) => { state.status = 'loading'; delete state.error })
    const result = await this.ctx.remote.flowleapConnectors.myEpoDescribe()
    this.store.update((state) => {
      if (!result.ok) {
        state.status = 'error'
        state.error = result.error.message
        return
      }
      state.status = 'ready'
      state.link = result.value
    })
  }
}
