import { describe, expect, it, vi } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkPageId, WorkPageReviewRequest, WorkPageSummary, WorkPageView } from '@deepseek-ai/dsh-flowleap-deliverables/work-pages'
import { createBoard, daysUntil, needsReviewCount, reviewOf, reviewState, type BoardDependencies } from '../src/client/board.ts'
import { CHAT, FILE, ok, OTHER, OTHER_ID, PAGE_ID, reviewed, SUMMARY, VIEW } from './fixture.client.ts'

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
  const changed = new Set<() => void>()
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

  it('reads the review fields of an objection, new ones for an objection the file does not list', () => {
    expect(reviewOf(VIEW, '2')).toEqual({ state: 'relevant', owner: 'A. Novak', note: 'Amend claim 9.' })
    expect(reviewOf(VIEW, '9')).toEqual({ state: 'needs_review', owner: '', note: '' })
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

  it('reads again on a change and keeps the open objection while the page still has it', async () => {
    const { board, deps, snapshot, settled, changed } = harness()
    const stop = board.hooks.board.subscribe(() => {})
    await settled()
    board.select('2')
    for (const listener of changed) listener()
    await vi.waitFor(() => { expect(deps.list).toHaveBeenCalledTimes(2) })
    await settled()
    expect(snapshot().selected).toBe('2')
    board.select('9')
    for (const listener of changed) listener()
    await vi.waitFor(() => { expect(deps.list).toHaveBeenCalledTimes(3) })
    await vi.waitFor(() => { expect(snapshot().selected).toBeNull() })
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

  it('changes review fields through the Remote and reports a failure', async () => {
    const { board, deps, snapshot, settled } = harness()
    await board.setReview('1', { state: 'done' })
    expect(deps.review).not.toHaveBeenCalled()
    const stop = board.hooks.board.subscribe(() => {})
    await settled()
    await board.setReview('1', { state: 'done', note: 'Argue.' })
    expect(deps.review).toHaveBeenCalledWith({ id: PAGE_ID, objection: '1', state: 'done', note: 'Argue.' })
    expect(reviewOf(snapshot().page!, '1')).toEqual({ state: 'done', owner: '', note: 'Argue.' })
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
