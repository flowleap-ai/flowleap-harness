/**
 * The word-level difference of claim texts as tracked-change paragraphs. The difference is computed here, never by the
 * model or the engine: `diffWordsWithSpace` of the maintained `diff` package splits the texts at word and space
 * boundaries, so an amendment marks only the words that change.
 * @module
 */

import { diffWordsWithSpace } from 'diff'
import type { RedlineParagraph, RedlineSegment, SegmentKind } from './types.ts'

/** One claim before and after an amendment. */
export interface ClaimChange {
  /** The claim number as the claims show it, for example `1`. */
  readonly number: string
  /** The claim text before the amendment, without the number; absent for a new claim. */
  readonly before?: string | undefined
  /** The claim text after the amendment, without the number; absent for a deleted claim. */
  readonly after?: string | undefined
}

/** What an amendment does to one claim. */
export type ClaimOutcome = 'amended' | 'added' | 'deleted' | 'unchanged'

/**
 * Join adjacent segments of the same kind and drop empty ones.
 * @param segments - segments in reading order.
 * @returns the joined segments.
 */
export function joinSegments(segments: readonly RedlineSegment[]): RedlineSegment[] {
  const joined: RedlineSegment[] = []
  for (const segment of segments) {
    if (segment.text === '') continue
    const last = joined.at(-1)
    if (last?.kind === segment.kind) joined[joined.length - 1] = { kind: last.kind, text: last.text + segment.text }
    else joined.push(segment)
  }
  return joined
}

/**
 * What an amendment does to one claim.
 * @param claim - the claim before and after.
 * @returns the outcome.
 */
export function claimOutcome(claim: ClaimChange): ClaimOutcome {
  if (claim.before === undefined) return 'added'
  if (claim.after === undefined) return 'deleted'
  return claim.before === claim.after ? 'unchanged' : 'amended'
}

/**
 * The tracked-change paragraph of one claim. The `"<number>. "` prefix is unchanged text of an amended claim and part of
 * the inserted or deleted text of a new or deleted claim.
 * @param claim - the claim before and after; at least one text is present.
 * @returns the paragraph.
 */
export function redlineParagraph(claim: ClaimChange): RedlineParagraph {
  const prefix = `${claim.number}. `
  if (claim.before === undefined) return { mark: 'ins', segments: [{ kind: 'ins', text: prefix + (claim.after ?? '') }] }
  if (claim.after === undefined) return { mark: 'del', segments: [{ kind: 'del', text: prefix + claim.before }] }
  const changes = diffWordsWithSpace(claim.before, claim.after)
  const kind = (change: { added: boolean; removed: boolean }): SegmentKind => change.added ? 'ins' : change.removed ? 'del' : 'same'
  return {
    mark: 'same',
    segments: joinSegments([{ kind: 'same', text: prefix }, ...changes.map(change => ({ kind: kind(change), text: change.value }))]),
  }
}
