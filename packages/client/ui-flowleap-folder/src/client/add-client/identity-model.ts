/**
 * The state of the Firm identity section of Settings: the firm identity that the Host has, the person's draft of it,
 * and the state of the firm docket. The section loads when it opens; Save sends the whole draft, and the Host then reads
 * the docket again. Only a firm administrator may save; for any other person the section is read-only. While the docket
 * is read, the section asks the Host for its state again each {@link POLL_MS}.
 * @module
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { DocketAnswer, DocketReadRequest, FirmIdentity } from '../../add-client/wire.ts'
import type { FirmIdentityApi, HostFailure } from './api.ts'
import { POLL_MS } from './model.ts'

/** The three lists of the firm identity, in the order of the section. */
export const IDENTITY_LISTS = ['names', 'addresses', 'representatives'] as const

/** One list of the firm identity. */
export type IdentityList = (typeof IDENTITY_LISTS)[number]

/** An act of the section that failed: the save, or a new read of the docket with its slices. */
export type IdentityFailure =
  | { readonly act: 'save'; readonly error: HostFailure }
  | { readonly act: 'read'; readonly slices: DocketReadRequest['slices']; readonly error: HostFailure }

/** The state of the section. */
export type IdentityState =
  | { readonly status: 'loading' }
  /** The Host did not give the identity; nothing shows but the failure and Try again. */
  | { readonly status: 'failed'; readonly error: HostFailure }
  | {
    readonly status: 'ready'
    /** The identity that the Host has. */
    readonly saved: FirmIdentity
    /** The person's draft; its entries can be blank until a save. It stays the saved identity while `canSave` is false. */
    readonly draft: FirmIdentity
    readonly docket: DocketAnswer
    /** Whether this person may save: true only for a firm administrator, as the Host answers. */
    readonly canSave: boolean
    /** The act that runs now. */
    readonly busy: 'save' | 'read' | null
    readonly failure: IdentityFailure | null
  }

/**
 * The identity as the Host keeps it, as far as the browser can tell: each entry trimmed, without blank and repeated
 * entries. The Host also drops an entry that has no word, such as `-`.
 * @param identity - the draft.
 * @returns the identity that a save sends.
 */
export function cleanIdentity(identity: FirmIdentity): FirmIdentity {
  const clean = (entries: readonly string[]) => [...new Set(entries.map(entry => entry.trim()).filter(entry => entry !== ''))]
  return { names: clean(identity.names), addresses: clean(identity.addresses), representatives: clean(identity.representatives) }
}

/**
 * Whether Save has a change to send.
 * @param state - the ready state.
 * @returns true when the clean draft differs from the saved identity.
 */
export function changed(state: Extract<IdentityState, { status: 'ready' }>): boolean {
  const draft = cleanIdentity(state.draft)
  return IDENTITY_LISTS.some(list => JSON.stringify(draft[list]) !== JSON.stringify(state.saved[list]))
}

/** Whether a docket answer is a read that runs. */
function reading(docket: DocketAnswer): boolean {
  return docket.status === 'docket' && docket.docket.state === 'reading'
}

/** A copy of an identity that the draft can change. */
function copy(identity: FirmIdentity): FirmIdentity {
  return { names: [...identity.names], addresses: [...identity.addresses], representatives: [...identity.representatives] }
}

/**
 * The act of Try again (`R`) now: load again after a failed load, repeat a failed act, or read the failed slices of a
 * docket that is `partial` or `failed`.
 * @param model - the section model.
 * @returns the act, or undefined when nothing can be tried again, such as while an act runs.
 */
export function retryOf(model: FirmIdentityModel): (() => void) | undefined {
  const state = model.state
  if (state.status === 'failed') return () => { void model.load() }
  if (state.status !== 'ready' || state.busy !== null) return undefined
  const { failure, docket } = state
  if (failure?.act === 'save' && state.canSave) return () => { void model.save() }
  if (failure?.act === 'read') return () => { void model.readAgain(failure.slices) }
  const failed = docket.status === 'docket' && (docket.docket.state === 'partial' || docket.docket.state === 'failed')
  return failed ? () => { void model.readAgain('failed') } : undefined
}

/** The Firm identity section's state and acts. */
export class FirmIdentityModel {
  /** The section state. */
  readonly store: SnapshotStore<IdentityState> = createSnapshotStore<IdentityState>({ status: 'loading' }, { flush: 'sync' })
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private open = false
  private disposed = false

  /**
   * @param api - the Host routes.
   */
  constructor(private readonly api: FirmIdentityApi) {}

  /** The state now. */
  get state(): IdentityState {
    return this.store.getSnapshot()
  }

  /**
   * The section opened: read the identity and the docket. An unsaved draft stays.
   * @returns once the answer is in the state.
   */
  async load(): Promise<void> {
    this.open = true
    if (this.state.status !== 'ready') this.store.set({ status: 'loading' })
    const answer = await this.api.identity()
    if (this.disposed) return
    if (!answer.ok) {
      if (this.state.status !== 'ready') this.store.set({ status: 'failed', error: answer.error })
      return
    }
    const { identity, docket, canSave } = answer.value
    const before = this.state
    const draft = canSave && before.status === 'ready' && changed(before) ? before.draft : copy(identity)
    // An act that still runs keeps the section busy until its own answer comes.
    const busy = before.status === 'ready' ? before.busy : null
    this.store.set({ status: 'ready', saved: identity, draft, docket, canSave, busy, failure: null })
    this.follow()
  }

  /** The section closed: stop asking for the docket state. */
  close(): void {
    this.open = false
    this.stopPoll()
  }

  /**
   * Change one entry of the draft. The view offers the draft acts only while this person may save.
   * @param list - the list.
   * @param index - the entry; the entry after the last one adds an entry.
   * @param text - the new text.
   */
  edit(list: IdentityList, index: number, text: string): void {
    this.updateDraft((draft) => { draft[list][index] = text })
  }

  /**
   * Add a blank entry at the end of a list.
   * @param list - the list.
   */
  add(list: IdentityList): void {
    this.updateDraft((draft) => { draft[list].push('') })
  }

  /**
   * Remove one entry of the draft.
   * @param list - the list.
   * @param index - the entry.
   */
  remove(list: IdentityList, index: number): void {
    this.updateDraft((draft) => { draft[list].splice(index, 1) })
  }

  /**
   * Save the draft. Nothing happens while an act runs, when the draft has no change, or when this person may not save.
   * A `not-admin` refusal, such as after a role change while the section is open, makes the section read-only and
   * puts the saved identity back in the draft.
   * @returns once the answer is in the state.
   */
  async save(): Promise<void> {
    const state = this.state
    if (state.status !== 'ready' || state.busy !== null || !state.canSave || !changed(state)) return
    this.setReady({ busy: 'save', failure: null })
    const answer = await this.api.save(cleanIdentity(state.draft))
    if (this.disposed) return
    if (!answer.ok) {
      const failure: IdentityFailure = { act: 'save', error: answer.error }
      this.setReady(answer.error === 'not-admin' ? { busy: null, failure, canSave: false, draft: copy(state.saved) } : { busy: null, failure })
      return
    }
    const { identity, docket, canSave } = answer.value
    this.setReady({ busy: null, saved: identity, draft: copy(identity), docket, canSave })
    this.follow()
  }

  /**
   * Read the docket again: every slice (Read again), or only the failed slices (Try again).
   * @param slices - which slices.
   * @returns once the answer is in the state.
   */
  async readAgain(slices: DocketReadRequest['slices']): Promise<void> {
    if (this.state.status !== 'ready' || this.state.busy !== null) return
    this.setReady({ busy: 'read', failure: null })
    const answer = await this.api.readDocket(slices)
    if (this.disposed) return
    if (!answer.ok) {
      this.setReady({ busy: null, failure: { act: 'read', slices, error: answer.error } })
      return
    }
    this.setReady({ busy: null, docket: answer.value })
    this.follow()
  }

  /** Stop for good. */
  dispose(): void {
    this.disposed = true
    this.stopPoll()
  }

  private updateDraft(change: (draft: FirmIdentity) => void): void {
    this.store.update((state) => {
      if (state.status === 'ready') change(state.draft)
    })
  }

  /** Change the ready state; only an act that found the state ready calls it, and a ready state stays ready. */
  private setReady(patch: Partial<Extract<IdentityState, { status: 'ready' }>>): void {
    this.store.update((state) => { Object.assign(state, patch) })
  }

  /** Ask for the docket state again while a read runs and the section is open. */
  private follow(): void {
    const state = this.state
    if (!this.open || this.pollTimer !== null || state.status !== 'ready' || !reading(state.docket)) return
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null
      void this.poll()
    }, POLL_MS)
  }

  private async poll(): Promise<void> {
    const answer = await this.api.docket()
    if (this.disposed || !this.open) return
    // A failed poll keeps the last state, which still reads, so the next poll asks again.
    if (answer.ok) this.setReady({ docket: answer.value })
    this.follow()
  }

  private stopPoll(): void {
    if (this.pollTimer !== null) clearTimeout(this.pollTimer)
    this.pollTimer = null
  }
}
