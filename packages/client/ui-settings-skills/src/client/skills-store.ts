/**
 * The Skills page state over the `skillInventory` Remote: the inventory of
 * the default agent view, and the full text of each skill the user opened.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SkillInventoryValue, SkillRef } from '../types.ts'

/** The inventory read: not started, in flight, failed, or ready. */
export type SkillsInventoryState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly inventory: SkillInventoryValue }

/** One full-text read: in flight, failed, gone from the view, or ready. */
export type SkillTextState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'gone' }
  | { readonly status: 'ready'; readonly content: string }

/** What the section renders. */
export interface SkillsState {
  /** The inventory read. */
  inventory: SkillsInventoryState
  /** Full-text reads by {@link skillKey}; cleared on every inventory load. */
  texts: Record<string, SkillTextState>
}

/**
 * Key of one exact skill candidate.
 * @param ref - name, provider, and source of the candidate.
 * @returns a key unique per candidate identity.
 */
export function skillKey(ref: SkillRef): string {
  return JSON.stringify([ref.provider, ref.source, ref.name])
}

/** Coordinates the page state with the Host. */
export class SkillsStore {
  /** uSES-safe state source of the section. */
  readonly store: SnapshotStore<SkillsState> = createSnapshotStore<SkillsState>({ inventory: { status: 'idle' }, texts: {} })

  private loading: Promise<void> | undefined

  /** @param ctx - the page plugin's context, whose `remote.skillInventory` namespace this store calls. */
  constructor(private readonly ctx: ClientContext) {}

  /**
   * Read the inventory and publish it; full texts read before are dropped. Concurrent callers share one read.
   * @returns settlement after the snapshot is published.
   */
  load(): Promise<void> {
    this.loading ??= this.readInventory().finally(() => { this.loading = undefined })
    return this.loading
  }

  /**
   * Read the full text of one skill once; a failed read is read again on the next call.
   * @param ref - name, provider, and source of the skill.
   * @returns settlement after the text state is published.
   */
  async readText(ref: SkillRef): Promise<void> {
    const key = skillKey(ref)
    const current = this.store.getSnapshot().texts[key]
    if (current !== undefined && current.status !== 'error') return
    this.setText(key, { status: 'loading' })
    const result = await this.ctx.remote.skillInventory.read({ name: ref.name, provider: ref.provider, source: ref.source })
    if (result.ok) this.setText(key, { status: 'ready', content: result.value.content })
    else this.setText(key, { status: result.error.code === 'skill/not-found' ? 'gone' : 'error' })
  }

  private async readInventory(): Promise<void> {
    this.store.update((state) => {
      state.inventory = { status: 'loading' }
      state.texts = {}
    })
    const result = await this.ctx.remote.skillInventory.list()
    this.store.update((state) => {
      state.inventory = result.ok ? { status: 'ready', inventory: result.value } : { status: 'error' }
    })
  }

  private setText(key: string, text: SkillTextState): void {
    this.store.update((state) => { state.texts = { ...state.texts, [key]: text } })
  }
}
