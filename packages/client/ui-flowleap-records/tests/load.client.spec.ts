import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Act, DeadlineId, DocumentId, Fetched, FileNumber, RecordsApi, TicketId } from '../src/client/api.ts'
import { createLoader, shownData, SKELETON_DELAY_MS, SKELETON_MIN_MS, type Load } from '../src/client/load.ts'
import { createRecordsModel, TAB_OF, TAB_ROUTE, type Screen } from '../src/client/model.ts'
import { createFixtureApi, fixtures, FIXTURE_IDS, R71_DOCUMENT } from './fixtures.client.ts'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(Date.parse('2026-11-04T14:16:00Z'))
})
afterEach(() => { vi.useRealTimers() })

/** A read that the test answers by hand. */
function manualRead<T>() {
  const pending: { resolve: (value: Fetched<T>) => void; signal: AbortSignal }[] = []
  const read = (signal: AbortSignal) => new Promise<Fetched<T>>((resolve) => { pending.push({ resolve, signal }) })
  return { read, pending }
}

const phases = <T>(load: Load<T>) => load.phase
const flush = () => vi.advanceTimersByTimeAsync(0)

describe('createLoader', () => {
  it('shows a fast answer with no skeleton', async () => {
    const { read, pending } = manualRead<string>()
    const loader = createLoader(read)
    loader.load()
    expect(phases(loader.source.getSnapshot())).toBe('waiting')
    await vi.advanceTimersByTimeAsync(SKELETON_DELAY_MS - 1)
    pending[0]!.resolve({ ok: true, value: 'rows' })
    await flush()
    expect(loader.source.getSnapshot()).toEqual({ phase: 'ready', data: 'rows', at: Date.now(), refreshing: false })
  })

  it('shows the skeleton after 150 ms and keeps it for at least 300 ms', async () => {
    const { read, pending } = manualRead<string>()
    const loader = createLoader(read)
    loader.load()
    await vi.advanceTimersByTimeAsync(SKELETON_DELAY_MS)
    expect(phases(loader.source.getSnapshot())).toBe('skeleton')
    await vi.advanceTimersByTimeAsync(50)
    pending[0]!.resolve({ ok: true, value: 'rows' })
    await flush()
    expect(phases(loader.source.getSnapshot())).toBe('skeleton')
    await vi.advanceTimersByTimeAsync(SKELETON_MIN_MS - 51)
    expect(phases(loader.source.getSnapshot())).toBe('skeleton')
    await vi.advanceTimersByTimeAsync(1)
    expect(phases(loader.source.getSnapshot())).toBe('ready')
  })

  it('settles at once when the skeleton has shown for 300 ms', async () => {
    const { read, pending } = manualRead<string>()
    const loader = createLoader(read)
    loader.load()
    await vi.advanceTimersByTimeAsync(SKELETON_DELAY_MS + SKELETON_MIN_MS + 10)
    pending[0]!.resolve({ ok: true, value: 'late' })
    await flush()
    expect(phases(loader.source.getSnapshot())).toBe('ready')
  })

  it('keeps the shown data while it loads again, and keeps it with its time on a failure', async () => {
    const { read, pending } = manualRead<string>()
    const loader = createLoader(read)
    loader.load()
    pending[0]!.resolve({ ok: true, value: 'rows' })
    await flush()
    const at = Date.now()
    await vi.advanceTimersByTimeAsync(60_000)
    loader.load()
    expect(loader.source.getSnapshot()).toEqual({ phase: 'ready', data: 'rows', at, refreshing: true })
    await vi.advanceTimersByTimeAsync(SKELETON_DELAY_MS * 4)
    pending[1]!.resolve({ ok: false, error: { kind: 'network' } })
    await flush()
    const failed = loader.source.getSnapshot()
    expect(failed).toEqual({ phase: 'failed', error: { kind: 'network' }, last: { data: 'rows', at }, retrying: false })
    expect(shownData(failed)).toEqual({ data: 'rows', at })
    loader.load()
    expect(loader.source.getSnapshot()).toMatchObject({ phase: 'failed', retrying: true })
  })

  it('shows the skeleton again for a retry with no data', async () => {
    const { read, pending } = manualRead<string>()
    const loader = createLoader(read)
    loader.load()
    pending[0]!.resolve({ ok: false, error: { kind: 'refused', status: 503, code: null, detail: null } })
    await flush()
    expect(shownData(loader.source.getSnapshot())).toBeNull()
    loader.load()
    expect(phases(loader.source.getSnapshot())).toBe('waiting')
    await vi.advanceTimersByTimeAsync(SKELETON_DELAY_MS)
    loader.load()
    expect(phases(loader.source.getSnapshot())).toBe('skeleton')
    expect(shownData(loader.source.getSnapshot())).toBeNull()
  })

  it('drops the answer of a stopped load and does nothing after dispose', async () => {
    const { read, pending } = manualRead<string>()
    const loader = createLoader(read)
    loader.load()
    loader.load()
    expect(pending[0]!.signal.aborted).toBe(true)
    pending[0]!.resolve({ ok: true, value: 'old' })
    pending[1]!.resolve({ ok: false, error: { kind: 'aborted' } })
    await flush()
    expect(phases(loader.source.getSnapshot())).toBe('waiting')
    loader.dispose()
    expect(pending[1]!.signal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(SKELETON_DELAY_MS)
    expect(phases(loader.source.getSnapshot())).toBe('waiting')
    loader.load()
    expect(pending).toHaveLength(2)
  })
})

describe('createRecordsModel', () => {
  const settle = () => vi.advanceTimersByTimeAsync(0)

  it('loads the first route, the person and the waiting count', async () => {
    const { api } = createFixtureApi()
    const model = createRecordsModel(api, TAB_ROUTE.intake)
    expect(model.waitingCount.getSnapshot()).toBeNull()
    await settle()
    const screen = model.screen.getSnapshot()
    expect(screen.view).toBe('intake')
    expect(shownData((screen as Extract<Screen, { view: 'intake' }>).intake)?.data.rows).toHaveLength(22)
    expect(model.waitingCount.getSnapshot()).toBe(22)
    expect(shownData(model.me.getSnapshot())?.data.person.name).toBe('Dr. Anna Becker')
    model.dispose()
  })

  it('builds the screen of every route and keeps a read the next route needs', async () => {
    const { api } = createFixtureApi()
    const intake = vi.spyOn(api, 'intake')
    const model = createRecordsModel(api, { view: 'intake', list: 'waiting', open: null })
    await settle()
    model.navigate({ view: 'intake', list: 'waiting', open: R71_DOCUMENT as DocumentId })
    await settle()
    const open = model.screen.getSnapshot() as Extract<Screen, { view: 'intake' }>
    expect(open.item?.phase).toBe('ready')
    expect(open.intake.phase).toBe('ready')
    model.navigate({ view: 'intake', list: 'filed-today', open: R71_DOCUMENT as DocumentId, step: 'reason' })
    await settle()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'intake', step: 'reason', item: { phase: 'ready' }, intake: { phase: 'ready' } })
    expect(intake.mock.calls.map(([view]) => view)).toEqual(['waiting', 'filed-today'])
    const routes = [
      { view: 'matters' }, { view: 'matter', fileNumber: 'FL-2026-0001' as FileNumber },
      { view: 'deadline', id: FIXTURE_IDS.deadline as DeadlineId }, { view: 'work', id: FIXTURE_IDS.ticket as TicketId }, { view: 'board' },
    ] as const
    const loaded: Record<string, string> = {}
    for (const route of routes) {
      model.navigate(route)
      await settle()
      const screen = model.screen.getSnapshot()
      const load = 'matters' in screen ? screen.matters : 'matter' in screen ? screen.matter : 'deadline' in screen ? screen.deadline
        : 'ticket' in screen ? screen.ticket : 'tickets' in screen ? screen.tickets : null
      loaded[screen.view] = load?.phase ?? 'none'
    }
    expect(loaded).toEqual({ matters: 'ready', matter: 'ready', deadline: 'ready', work: 'ready', board: 'ready' })
    expect(intake).toHaveBeenCalledTimes(2)
    model.dispose()
  })

  it('maps each view to its tab', () => {
    expect(TAB_OF.intake).toBe('intake')
    expect(TAB_OF.board).toBe('work')
    expect(TAB_OF.deadline).toBe('matters')
  })

  it('retries only the failed reads and refreshes every read after an act', async () => {
    const { api, acts } = createFixtureApi()
    let down = true
    const matters = vi.spyOn(api, 'matters').mockImplementation(() => Promise.resolve(down
      ? { ok: false, error: { kind: 'network' } }
      : { ok: true, value: fixtures.matters }))
    const intake = vi.spyOn(api, 'intake')
    const model = createRecordsModel(api, { view: 'matters' })
    await settle()
    expect(model.screen.getSnapshot()).toMatchObject({ matters: { phase: 'failed', last: null } })
    down = false
    model.retry()
    await vi.advanceTimersByTimeAsync(SKELETON_DELAY_MS + SKELETON_MIN_MS)
    expect(model.screen.getSnapshot()).toMatchObject({ matters: { phase: 'ready' } })
    model.retry()
    expect(matters).toHaveBeenCalledTimes(2)
    const act: Act = { command: { kind: 'deadline.confirm', id: FIXTURE_IDS.deadline as DeadlineId, seen: 141 }, key: 'ipms:1' as Act['key'] }
    const result = await model.perform([act])
    expect(result).toEqual({ failed: [] })
    expect(acts).toEqual([act])
    expect(matters).toHaveBeenCalledTimes(3)
    expect(intake).toHaveBeenCalledTimes(2)
    model.dispose()
  })

  it('returns each failed act with its failure and stops after dispose', async () => {
    const { api } = createFixtureApi()
    const refused: RecordsApi['perform'] = () => Promise.resolve({ ok: false, error: { kind: 'refused', status: 409, code: 'not-proposed', detail: null } })
    vi.spyOn(api, 'perform').mockImplementation(refused)
    const model = createRecordsModel(api, { view: 'board' })
    await settle()
    const act: Act = { command: { kind: 'intake.match', document: R71_DOCUMENT as DocumentId, fileNumber: 'FL-2026-0001' as FileNumber }, key: 'ipms:2' as Act['key'] }
    model.dispose()
    const result = await model.perform([act])
    expect(result.failed).toEqual([{ act, error: { kind: 'refused', status: 409, code: 'not-proposed', detail: null } }])
    model.navigate({ view: 'matters' })
    expect(model.screen.getSnapshot().view).toBe('board')
  })
})
