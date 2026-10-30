import { describe, expect, it, vi } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkPageId, WorkPageReviewRequest, WorkPageSummary, WorkPageView } from '@deepseek-ai/dsh-flowleap-deliverables/work-pages'
import { createBoard, daysUntil, needsReviewCount, reviewState, type BoardDependencies } from '../src/client/board.ts'
import { CHAT, FILE, ok, OTHER, OTHER_ID, PAGE_ID, reviewed, SUMMARY, TWIN, TWIN_ID, VIEW } from './fixture.client.ts'

function failed<T>(): RemoteResult<T> {
  return { ok: false, error: new RemoteError('gateway/internal', 'Unavailable', {}) }
}

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function harness(overrides: Partial<BoardDependencies> = {}) {
  const changed = new Set<(view: WorkPageView) => void>()
  const reset = new Set<() => void>()
  const deps: BoardDependencies = {
    list: vi.fn(async () => ok<WorkPageSummary[]>([SUMMARY, OTHER])),
    read: vi.fn(async (id: WorkPageId) => ok<WorkPageView>(id === PAGE_ID ? VIEW : { ...VIEW, summary: OTHER })),
    review: vi.fn(async ({ id: _id, objection, ...fields }: WorkPageReviewRequest) => ok(reviewed(objection, fields))),
    send: vi.fn(async () => ok({ accepted: true })),
    openSession: vi.fn(),
    draftChat: vi.fn(),
    planMessage: view => `plan ${view.summary.path}`,
    analysisMessage: application => `analyse ${application}`,
    subscribeChanged: (listener) => { changed.add(listener); return () => { changed.delete(listener) } },
    subscribeReset: (listener) => { reset.add(listener); return () => { reset.delete(listener) } },
    ...overrides,
  }
  const board = createBoard(deps)
  const snapshot = () => board.hooks.board.getSnapshot()
  const settled = () => vi.waitFor(() => { expect(snapshot().status).not.toBe('loading') })
  return { board, deps, snapshot, settled, changed, reset }
}

describe('review state and helpers', () => {
  it('reads menu ids and fails loud on an unknown one', () => {
    expect(reviewState('not_relevant')).toBe('not_relevant')
    expect(() => reviewState('argue')).toThrow('unknown review state "argue"')
  })

  it('counts the objections that need review over all pages', () => {
    expect(needsReviewCount([SUMMARY, OTHER])).toBe(4)
    expect(needsReviewCount([])).toBe(0)
  })

  it('counts whole UTC days to the time limit', () => {
    const now = Date.parse('2026-10-29T12:00:00.000Z')
    expect(daysUntil('2026-12-09', now)).toBe(41)
    expect(daysUntil('2026-10-29', now)).toBe(0)
    expect(daysUntil('2026-10-27', now)).toBe(-2)
  })
})

describe('board source', () => {
  it('reads only while observed and shows the newest page', async () => {
    const { board, deps, snapshot, settled, changed, reset } = harness()
    expect(deps.list).not.toHaveBeenCalled()
    const stop = board.hooks.board.subscribe(() => {})
    const second = board.hooks.board.subscribe(() => {})
    await settled()
    expect(deps.list).toHaveBeenCalledOnce()
    expect(snapshot()).toMatchObject({ status: 'ready', pages: [SUMMARY, OTHER], page: VIEW, selected: null })
    expect(changed.size).toBe(1)
    expect(reset.size).toBe(1)
    second()
    expect(changed.size).toBe(1)
    stop()
    expect(changed.size).toBe(0)
    expect(reset.size).toBe(0)
  })

  it('applies a changed page without a new read and keeps the open objection while the page still has it', async () => {
    const { board, deps, snapshot, settled, changed, reset } = harness()
    const stop = board.hooks.board.subscribe(() => {})
    await settled()
    board.select('2')
    const emit = (view: WorkPageView) => { for (const listener of changed) listener(view) }
    emit(reviewed('1', { state: 'done' }))
    expect(snapshot()).toMatchObject({ page: { file: { review: { '1': { state: 'done' } } } }, selected: '2' })
    expect(snapshot().pages.map(page => [page.id, page.needsReview])).toEqual([[PAGE_ID, 0], [OTHER_ID, 3]])
    board.select('9')
    emit(reviewed('1', { state: 'relevant' }))
    expect(snapshot().selected).toBeNull()
    const newer = { ...OTHER, savedAt: '2026-10-30T10:00:00.000Z', needsReview: 1 }
    emit({ ...VIEW, summary: newer })
    expect(snapshot().pages.map(page => page.id)).toEqual([OTHER_ID, PAGE_ID])
    expect(snapshot().page?.summary.id).toBe(PAGE_ID)
    expect(deps.list).toHaveBeenCalledOnce()
    expect(deps.read).toHaveBeenCalledOnce()
    for (const listener of reset) listener()
    await vi.waitFor(() => { expect(deps.list).toHaveBeenCalledTimes(2) })
    stop()
  })

  it('shows the first page that a save writes on an empty board', async () => {
    const { board, snapshot, settled, changed } = harness({ list: vi.fn(async () => ok<WorkPageSummary[]>([])) })
    const stop = board.hooks.board.subscribe(() => {})
    await settled()
    expect(snapshot().page).toBeNull()
    for (const listener of changed) listener(VIEW)
    expect(snapshot()).toMatchObject({ status: 'ready', pages: [SUMMARY], page: VIEW })
    stop()
  })

  it('shows a chosen page and drops the open objection', async () => {
    const { board, snapshot, settled } = harness()
    const stop = board.hooks.board.subscribe(() => {})
    await settled()
    board.select('1')
    await board.choose(OTHER_ID)
    expect(snapshot().page?.summary).toEqual(OTHER)
    expect(snapshot().selected).toBeNull()
    await board.retry()
    expect(snapshot().page?.summary).toEqual(OTHER)
    stop()
  })

  it('shows the first page when the page on show is gone, and no page for an empty list', async () => {
    const list = vi.fn(async () => ok<WorkPageSummary[]>([OTHER]))
    const { board, snapshot, settled } = harness({ list })
    const stop = board.hooks.board.subscribe(() => {})
    await settled()
    expect(snapshot().page?.summary).toEqual(OTHER)
    list.mockResolvedValueOnce(ok([]))
    await board.retry()
    expect(snapshot()).toMatchObject({ status: 'ready', pages: [], page: null })
    stop()
  })

  it('reports a failed or rejected list and a failed page read', async () => {
    const list = vi.fn(async () => failed<WorkPageSummary[]>())
    const read = vi.fn(async () => failed<WorkPageView>())
    const { board, snapshot, settled } = harness({ list, read })
    const stop = board.hooks.board.subscribe(() => {})
    await settled()
    expect(snapshot().status).toBe('error')
    list.mockRejectedValueOnce(new Error('transport'))
    await board.retry()
    expect(snapshot().status).toBe('error')
    list.mockResolvedValueOnce(ok([SUMMARY]))
    await board.retry()
    expect(snapshot()).toMatchObject({ status: 'error', pages: [SUMMARY], page: null })
    stop()
  })

  it('discards a list or a page read that a later read or the last unsubscribe superseded', async () => {
    const lists = [deferred<RemoteResult<WorkPageSummary[]>>(), deferred<RemoteResult<WorkPageSummary[]>>()]
    let call = 0
    const list = vi.fn(() => lists[call++]!.promise)
    const { board, snapshot } = harness({ list })
    const stop = board.hooks.board.subscribe(() => {})
    const later = board.retry()
    lists[0]!.resolve(ok([OTHER]))
    lists[1]!.resolve(ok([SUMMARY]))
    await later
    expect(snapshot().page?.summary).toEqual(SUMMARY)
    const reading = deferred<RemoteResult<WorkPageView>>()
    const read = vi.fn(() => reading.promise)
    const second = harness({ read })
    const stopSecond = second.board.hooks.board.subscribe(() => {})
    await vi.waitFor(() => { expect(read).toHaveBeenCalledOnce() })
    stopSecond()
    reading.resolve(ok(VIEW))
    await Promise.resolve()
    expect(second.snapshot().page).toBeNull()
    stop()
  })

  it('keeps the page on show when a save writes another page, and names the newer save until the attorney shows or hides it', async () => {
    const later = { ...TWIN, savedAt: '2026-10-29T15:00:00.000Z' }
    const read = vi.fn(async (id: WorkPageId) => ok<WorkPageView>(id === TWIN_ID ? { ...VIEW, summary: later } : VIEW))
    const { board, deps, snapshot, settled, changed } = harness({ read })
    const stop = board.hooks.board.subscribe(() => {})
    await settled()
    const emit = (view: WorkPageView) => { for (const listener of changed) listener(view) }
    board.select('1')
    emit({ ...VIEW, summary: later })
    expect(snapshot()).toMatchObject({ page: VIEW, selected: '1', newer: later })
    expect(snapshot().pages.map(page => page.id)).toEqual([TWIN_ID, PAGE_ID, OTHER_ID])
    // A review change is no save: it refreshes the newer save, and a review change of another page names nothing.
    emit({ ...VIEW, summary: { ...OTHER, needsReview: 0 } })
    emit({ ...VIEW, summary: { ...later, needsReview: 0 } })
    expect(snapshot().newer).toEqual({ ...later, needsReview: 0 })
    vi.mocked(deps.list).mockResolvedValueOnce(ok([later, SUMMARY, OTHER]))
    await board.choose(TWIN_ID)
    expect(snapshot()).toMatchObject({ page: { summary: later }, newer: null })
    emit({ ...VIEW, summary: { ...SUMMARY, savedAt: '2026-10-29T16:00:00.000Z' } })
    expect(snapshot().newer?.id).toBe(PAGE_ID)
    board.dismissNewer()
    expect(snapshot().newer).toBeNull()
    // A save that is older than the page on show names nothing.
    emit({ ...VIEW, summary: { ...OTHER, savedAt: '2026-10-29T12:00:00.000Z' } })
    expect(snapshot().newer).toBeNull()
    stop()
  })

  it('drops the newer save when a read no longer lists it', async () => {
    const list = vi.fn(async () => ok<WorkPageSummary[]>([SUMMARY, OTHER]))
    const { board, snapshot, settled, changed } = harness({ list })
    const stop = board.hooks.board.subscribe(() => {})
    await settled()
    const later = { ...TWIN, savedAt: '2026-10-29T15:00:00.000Z' }
    for (const listener of changed) listener({ ...VIEW, summary: later })
    list.mockResolvedValueOnce(ok([later, SUMMARY]))
    await board.retry()
    expect(snapshot().newer).toEqual(later)
    await board.retry()
    expect(snapshot()).toMatchObject({ page: VIEW, newer: null })
    stop()
  })

  it('takes no change on the page on show while a chosen page is read', async () => {
    const reading = deferred<RemoteResult<WorkPageView>>()
    const { board, deps, snapshot, settled } = harness()
    const stop = board.hooks.board.subscribe(() => {})
    await settled()
    board.select('2')
    vi.mocked(deps.read).mockReturnValueOnce(reading.promise)
    const choosing = board.choose(OTHER_ID)
    expect(snapshot()).toMatchObject({ opening: OTHER_ID, page: VIEW, selected: null })
    await vi.waitFor(() => { expect(deps.read).toHaveBeenLastCalledWith(OTHER_ID) })
    board.select('1')
    await board.setReview('1', { state: 'done' })
    await board.writePlan()
    board.openChat()
    expect(snapshot().selected).toBeNull()
    expect(deps.review).not.toHaveBeenCalled()
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.openSession).not.toHaveBeenCalled()
    reading.resolve(ok({ ...VIEW, summary: OTHER }))
    await choosing
    expect(snapshot()).toMatchObject({ status: 'ready', opening: null, page: { summary: OTHER } })
    vi.mocked(deps.read).mockResolvedValueOnce(failed())
    await board.choose(PAGE_ID)
    expect(snapshot()).toMatchObject({ status: 'error', opening: null, page: { summary: OTHER } })
    vi.mocked(deps.list).mockResolvedValueOnce(failed())
    await board.choose(PAGE_ID)
    expect(snapshot()).toMatchObject({ status: 'error', opening: null, page: { summary: OTHER } })
    stop()
  })

  it('reads the chosen page again after a reset or a new observation interrupts its read', async () => {
    const listing = deferred<RemoteResult<WorkPageSummary[]>>()
    const { board, deps, snapshot, settled, reset } = harness()
    const stop = board.hooks.board.subscribe(() => {})
    await settled()
    vi.mocked(deps.list).mockReturnValueOnce(listing.promise)
    const choosing = board.choose(OTHER_ID)
    for (const listener of reset) listener()
    await vi.waitFor(() => { expect(snapshot()).toMatchObject({ opening: null, page: { summary: OTHER } }) })
    listing.resolve(ok([SUMMARY]))
    await choosing
    expect(snapshot().page?.summary).toEqual(OTHER)
    const second = deferred<RemoteResult<WorkPageSummary[]>>()
    vi.mocked(deps.list).mockReturnValueOnce(second.promise)
    void board.choose(PAGE_ID)
    stop()
    const again = board.hooks.board.subscribe(() => {})
    await vi.waitFor(() => { expect(snapshot()).toMatchObject({ opening: null, page: VIEW }) })
    again()
  })

  it('changes review fields through the Remote and reports a failure', async () => {
    const { board, deps, snapshot, settled } = harness()
    await board.setReview('1', { state: 'done' })
    expect(deps.review).not.toHaveBeenCalled()
    const stop = board.hooks.board.subscribe(() => {})
    await settled()
    await board.setReview('1', { state: 'done', note: 'Argue.' })
    expect(deps.review).toHaveBeenCalledWith({ id: PAGE_ID, objection: '1', state: 'done', note: 'Argue.' })
    expect(snapshot().page?.file.review['1']).toMatchObject({ state: 'done', owner: '', note: 'Argue.' })
    expect(snapshot().pages.map(page => page.needsReview)).toEqual([0, 3])
    vi.mocked(deps.review).mockResolvedValueOnce(failed())
    await board.setReview('1', { owner: 'M. Keller' })
    expect(snapshot().notice).toBe('saveFailed')
    vi.mocked(deps.review).mockRejectedValueOnce(new Error('transport'))
    board.dismiss()
    await board.setReview('1', { owner: 'M. Keller' })
    expect(snapshot().notice).toBe('saveFailed')
    stop()
  })

  it('drops a review answer when another page is on show', async () => {
    const answer = deferred<RemoteResult<WorkPageView>>()
    const { board, snapshot, settled } = harness({ review: () => answer.promise })
    const stop = board.hooks.board.subscribe(() => {})
    await settled()
    const change = board.setReview('1', { state: 'done' })
    await board.choose(OTHER_ID)
    answer.resolve(ok(reviewed('1', { state: 'done' })))
    await change
    expect(snapshot().page?.summary).toEqual(OTHER)
    stop()
  })

  it('discards a read that a review answer overtakes and ends the loading state', async () => {
    const listing = deferred<RemoteResult<WorkPageSummary[]>>()
    const { board, deps, snapshot, settled } = harness()
    const stop = board.hooks.board.subscribe(() => {})
    await settled()
    vi.mocked(deps.list).mockReturnValueOnce(listing.promise)
    const reading = board.retry()
    expect(snapshot().status).toBe('loading')
    await board.setReview('2', { state: 'done' })
    expect(snapshot()).toMatchObject({ status: 'ready', page: { file: { review: { '2': { state: 'done' } } } } })
    listing.resolve(ok([OTHER]))
    await reading
    expect(snapshot().page?.summary.id).toBe(PAGE_ID)
    stop()
  })

  it('sends the response plan into the chat of the page and shows that chat', async () => {
    const { board, deps, snapshot, settled } = harness()
    await board.writePlan()
    board.openChat()
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.openSession).not.toHaveBeenCalled()
    const stop = board.hooks.board.subscribe(() => {})
    await settled()
    const first = board.writePlan()
    expect(snapshot().sending).toBe(true)
    await board.writePlan()
    await first
    expect(deps.send).toHaveBeenCalledOnce()
    expect(deps.send).toHaveBeenCalledWith(CHAT, `plan ${SUMMARY.path}`)
    expect(deps.openSession).toHaveBeenCalledWith(CHAT)
    expect(snapshot()).toMatchObject({ sending: false, notice: 'sent' })
    vi.mocked(deps.send).mockResolvedValueOnce(failed())
    await board.writePlan()
    expect(snapshot().notice).toBe('sendFailed')
    expect(deps.openSession).toHaveBeenCalledOnce()
    board.openChat()
    expect(deps.openSession).toHaveBeenCalledTimes(2)
    stop()
  })

  it('opens a new chat with the drafted analysis request and closes the form', () => {
    const { board, deps, snapshot } = harness()
    board.setFormOpen(true)
    expect(snapshot().formOpen).toBe(true)
    board.startAnalysis('  EP 4814394 ')
    expect(deps.draftChat).toHaveBeenCalledWith('analyse EP 4814394')
    expect(snapshot().formOpen).toBe(false)
    expect(FILE.findings.objections).toHaveLength(2)
  })
})
