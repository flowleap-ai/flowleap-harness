import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFolderApi, readClientFolders } from '../src/client/api.ts'

const WORKSPACE = '6f1c2a40-0000-4000-8000-000000000001'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Answer every request with `answer`, and record each request's URL and init. */
function serve(answer: () => Promise<Response>) {
  const requests: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    requests.push({ url, init })
    return answer()
  }))
  return requests
}

const json = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status })

/** What an upload progress event tells. */
interface ProgressFacts {
  lengthComputable: boolean
  loaded: number
  total: number
}

/** A request that the browser sends with `XMLHttpRequest`; the test plays the network. */
class FakeRequest {
  static last: FakeRequest | undefined
  method = ''
  url = ''
  withCredentials = false
  body: unknown
  status = 0
  responseText = ''
  readonly upload: { onprogress: ((event: ProgressFacts) => void) | null } = { onprogress: null }
  onerror: (() => void) | null = null
  onload: (() => void) | null = null

  constructor() {
    FakeRequest.last = this
  }

  open(method: string, url: string): void {
    this.method = method
    this.url = url
  }

  send(body: unknown): void {
    this.body = body
  }

  /** The Host answers. */
  answer(status: number, text: string): void {
    this.status = status
    this.responseText = text
    this.onload?.()
  }
}

describe('createFolderApi', () => {
  it('lists a folder with the session cookie and no cache, at a path relative to the document', async () => {
    const requests = serve(json({ path: 'EP 23 171 862', entries: [], truncated: false }))
    const controller = new AbortController()
    const api = createFolderApi(WORKSPACE)
    expect(await api.list('EP 23 171 862', controller.signal)).toEqual({ ok: true, value: { path: 'EP 23 171 862', entries: [], truncated: false } })
    expect(await api.list('')).toMatchObject({ ok: true })
    expect(requests[0]!.url).toBe(`api/flowleap/folder/list?workspace=${WORKSPACE}&path=EP+23+171+862`)
    expect(requests[0]!.init).toEqual({ credentials: 'include', cache: 'no-store', signal: controller.signal })
    expect(requests[1]!.init).toEqual({ credentials: 'include', cache: 'no-store' })
  })

  it('posts each write as JSON with the workspace', async () => {
    const requests = serve(json({ path: 'EP 23 171 862/Examination' }))
    const api = createFolderApi(WORKSPACE)
    expect(await api.mkdir('EP 23 171 862', 'Examination')).toEqual({ ok: true, value: { path: 'EP 23 171 862/Examination' } })
    await api.rename('Inbox', 'Incoming')
    await api.move('Incoming/note.md', 'EP 23 171 862')
    await api.trash('Incoming')
    await api.restore('Trash/Incoming')
    const sent = requests.map(({ url, init }): unknown[] => [url, init.method, init.headers, typeof init.body === 'string' ? JSON.parse(init.body) : init.body])
    expect(sent).toEqual([
      ['api/flowleap/folder/mkdir', 'POST', { 'content-type': 'application/json' }, { workspace: WORKSPACE, parent: 'EP 23 171 862', name: 'Examination' }],
      ['api/flowleap/folder/rename', 'POST', { 'content-type': 'application/json' }, { workspace: WORKSPACE, path: 'Inbox', name: 'Incoming' }],
      ['api/flowleap/folder/move', 'POST', { 'content-type': 'application/json' }, { workspace: WORKSPACE, path: 'Incoming/note.md', to: 'EP 23 171 862' }],
      ['api/flowleap/folder/trash', 'POST', { 'content-type': 'application/json' }, { workspace: WORKSPACE, path: 'Incoming' }],
      ['api/flowleap/folder/restore', 'POST', { 'content-type': 'application/json' }, { workspace: WORKSPACE, path: 'Trash/Incoming' }],
    ])
  })

  it('finds entries by name with the session cookie and no cache', async () => {
    const answer = { hits: [{ path: 'EP 23 171 862/Search', kind: 'directory' }], truncated: false }
    const requests = serve(json(answer))
    const controller = new AbortController()
    const api = createFolderApi(WORKSPACE)
    expect(await api.search('search report', controller.signal)).toEqual({ ok: true, value: answer })
    await api.search('Prüfung & Co')
    expect(requests.map(request => request.url)).toEqual([
      `api/flowleap/folder/search?workspace=${WORKSPACE}&q=search+report`,
      `api/flowleap/folder/search?workspace=${WORKSPACE}&q=Pr%C3%BCfung+%26+Co`,
    ])
    expect(requests[0]!.init).toEqual({ credentials: 'include', cache: 'no-store', signal: controller.signal })
    expect(requests[1]!.init).toEqual({ credentials: 'include', cache: 'no-store' })
  })

  it('gives the failure code of a refusal, internal for a refusal with no code or no JSON, and network for no answer', async () => {
    const api = createFolderApi(WORKSPACE)
    serve(json({ error: 'exists' }, 409))
    expect(await api.mkdir('', 'Office')).toEqual({ ok: false, error: 'exists' })
    serve(json({ message: 'gone' }, 500))
    expect(await api.mkdir('', 'Office')).toEqual({ ok: false, error: 'internal' })
    serve(json(null, 500))
    expect(await api.mkdir('', 'Office')).toEqual({ ok: false, error: 'internal' })
    serve(json({ error: 404 }, 404))
    expect(await api.mkdir('', 'Office')).toEqual({ ok: false, error: 'internal' })
    serve(async () => new Response('<html>Bad gateway</html>', { status: 502 }))
    expect(await api.list('')).toEqual({ ok: false, error: 'internal' })
    serve(async () => { throw new TypeError('Failed to fetch') })
    expect(await api.list('')).toEqual({ ok: false, error: 'network' })
  })

  it('uploads a file with its progress and the session cookie, and reads the answer', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeRequest)
    const progress: number[] = []
    const blob = new Blob(['%PDF-1.7'])
    const pending = createFolderApi(WORKSPACE).upload('EP 23 171 862/Search', 'D1.pdf', blob, (fraction) => { progress.push(fraction) })
    const request = FakeRequest.last!
    expect([request.method, request.url, request.withCredentials, request.body]).toEqual([
      'POST', `api/flowleap/folder/upload?workspace=${WORKSPACE}&dir=EP+23+171+862%2FSearch&name=D1.pdf`, true, blob,
    ])
    request.upload.onprogress!({ lengthComputable: false, loaded: 3, total: 0 })
    request.upload.onprogress!({ lengthComputable: true, loaded: 4, total: 8 })
    request.answer(200, JSON.stringify({ path: 'EP 23 171 862/Search/D1.pdf' }))
    expect(await pending).toEqual({ ok: true, value: { path: 'EP 23 171 862/Search/D1.pdf' } })
    expect(progress).toEqual([0.5])
  })

  it('gives the failure code of a refused upload, and network when the upload gets no answer', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeRequest)
    const api = createFolderApi(WORKSPACE)
    const refused = api.upload('', 'Mandate.pdf', new Blob(['x']), () => {})
    FakeRequest.last!.answer(409, JSON.stringify({ error: 'exists' }))
    expect(await refused).toEqual({ ok: false, error: 'exists' })
    const lost = api.upload('', 'Mandate.pdf', new Blob(['x']), () => {})
    FakeRequest.last!.onerror!()
    expect(await lost).toEqual({ ok: false, error: 'network' })
  })
})

describe('readClientFolders', () => {
  it('reads the client folders with the session cookie and no cache, at a path relative to the document', async () => {
    const requests = serve(json({ workspaces: [WORKSPACE] }))
    expect(await readClientFolders()).toEqual({ ok: true, value: { workspaces: [WORKSPACE] } })
    expect(requests).toEqual([{ url: 'api/flowleap/folder/clients', init: { credentials: 'include', cache: 'no-store' } }])
  })

  it('gives internal for an answer that does not name the workspaces as strings, and the failure of a refusal', async () => {
    for (const body of [null, 'text', {}, { workspaces: 'all' }, { workspaces: [7] }]) {
      serve(json(body))
      expect(await readClientFolders()).toEqual({ ok: false, error: 'internal' })
    }
    serve(async () => { throw new TypeError('Failed to fetch') })
    expect(await readClientFolders()).toEqual({ ok: false, error: 'network' })
  })
})
