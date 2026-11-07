/**
 * The search of Find a matter (sheet 00 section 6, mockup `5-dossier` state `search`): `GET search` as the person
 * types, after a short pause, with the read of an older query stopped. The Records API applies the walls, so only
 * matters of the person's teams come back.
 */

import { useEffect, useState } from 'react'
import type { RecordsApi, RecordsError, SearchAnswer, SearchMatter } from './api.ts'

/** How long the search waits after the last key before it reads. */
export const SEARCH_PAUSE_MS = 150

/** The longest query that the Records API takes. */
export const MAX_QUERY = 100

/** Where one search is. */
export type FindSearch =
  | { readonly phase: 'idle' }
  | { readonly phase: 'searching'; readonly last: SearchAnswer | null }
  | { readonly phase: 'ready'; readonly answer: SearchAnswer }
  | { readonly phase: 'failed'; readonly error: RecordsError }

/**
 * Search the matters for a query while it is shown: nothing for an empty query, else one read after the pause. A new
 * query stops the read of the old one, and the last answer stays on screen while the next one loads.
 * @param search - the search read of the Records API.
 * @param query - the text in the input.
 * @returns where the search is.
 */
export function useMatterSearch(search: RecordsApi['search'], query: string): FindSearch {
  const [state, setState] = useState<FindSearch>({ phase: 'idle' })
  const text = query.trim()
  useEffect(() => {
    if (text === '') {
      setState({ phase: 'idle' })
      return undefined
    }
    setState(previous => ({ phase: 'searching', last: previous.phase === 'ready' ? previous.answer : previous.phase === 'searching' ? previous.last : null }))
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void search(text, controller.signal).then((result) => {
        if (controller.signal.aborted) return
        setState(result.ok ? { phase: 'ready', answer: result.value } : { phase: 'failed', error: result.error })
      })
    }, SEARCH_PAUSE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [search, text])
  return state
}

/**
 * What a found matter's second line adds to its client: the matched application number or person, which the title
 * line does not show.
 * @param matter - the found matter.
 * @returns the matched values to show, in the answer's order.
 */
export function extraMatches(matter: SearchMatter): readonly string[] {
  return matter.matched.flatMap(match => match.field === 'applicationNumber' || match.field === 'person' ? [match.value] : [])
}
