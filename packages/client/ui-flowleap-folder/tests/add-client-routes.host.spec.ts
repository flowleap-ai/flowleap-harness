import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import { PatentDataError } from '@deepseek-ai/dsh-flowleap-connectors'
import { ADD_CLIENT_ROUTES, apply, checkConfig, Config, inject, type BuildStatus, type DocketAnswer, type FindAnswer, type ReviewAnswer, type StatusAnswer } from '../src/index.ts'
import { AddClientError, codeOf } from '../src/add-client/routes.ts'
import { FolderError } from '../src/folder.ts'
import { FakePatentData, pub, row } from './patent-data.host.ts'

const CLIENT = '0b7c3c3e-0000-4000-8000-000000000001'

let base: string
let routes: Map<string, ConnectionFetchRoute>
let ctx: Context
let warnings: string[]
let created: string[]

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'flowleap-add-client-routes-'))
  routes = new Map()
  warnings = []
  created = []
  ctx = new Context()
  ctx.provide('connection', { fetch: { register: (route: ConnectionFetchRoute) => { routes.set(route.path, route); return async () => { routes.delete(route.path) } } } } as never)
  ctx.logger.exporter({ export: (message) => { if (message.type === 'warn') warnings.push(message.args.map((arg: unknown) => String(arg)).join(' ')) } })
  ctx.provide('workspaceRegistry', {
    get: () => undefined,
    create: async (folder: string) => { created.push(folder); return { id: 'ws-1', path: folder } },
  } as never)
  ctx.provide('flowleapPatentData')
})

afterEach(async () => {
  await ctx.fiber.dispose()
  await rm(base, { recursive: true, force: true })
})

async function load(fields: Partial<Config> = {}) {
  const fiber = ctx.plugin({ inject, Config, apply }, Config({
    stateDir: path.join(base, 'state'), clientsRoot: path.join(base, 'Clients'),
    firmIdentity: { names: [], addresses: [], representatives: ['Anna Becker'] }, ...fields,
  } as Config))
  await fiber.await()
  return fiber
}

function call(route: string, init: RequestInit & { query?: Record<string, string> } = {}) {
  const query = init.query === undefined ? '' : `?${new URLSearchParams(init.query)}`
  return routes.get(route)!.fetch(new Request(`http://runtime.test${route}${query}`, init))
}

function post(route: string, body: unknown) {
  return call(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })
}

function data() {
  return new FakePatentData([
    row({ applicationNumber: 'EP23171862', publicationNumber: pub('EP4292805'), title: 'Packaging', applicants: ['Syntegon Technology GmbH'], representatives: [{ name: 'Becker, Anna', address: [] }] }),
    row({ applicationNumber: 'EP19794879', applicants: ['Syntegon Technology GmbH'] }),
  ])
}

async function settled(): Promise<BuildStatus> {
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const answer = await (await call(ADD_CLIENT_ROUTES.status)).json() as StatusAnswer
    const [build] = answer.builds
    if (build !== undefined && build.state !== 'running') return build
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('the build did not end')
}

describe('Add client routes', () => {
  it('says that no data plugin is there, and builds the folder with the template only', async () => {
    await load()
    expect(await (await call(ADD_CLIENT_ROUTES.find, { query: { name: 'Syntegon' } })).json()).toEqual({ status: 'no-plugin' })
    expect(await (await post(ADD_CLIENT_ROUTES.review, { names: ['Syntegon'], clients: [] })).json()).toEqual({ status: 'no-plugin' })
    const started = await post(ADD_CLIENT_ROUTES.build, { clientId: CLIENT, name: 'Syntegon', names: [], applications: [] })
    expect(started.status).toBe(202)
    expect(started.headers.get('cache-control')).toBe('no-store')
    expect(await settled()).toMatchObject({ clientId: CLIENT, state: 'done', workspace: 'ws-1', folder: 'Syntegon' })
    expect(created).toEqual([path.join(base, 'Clients', 'Syntegon')])
    expect((await readdir(path.join(base, 'Clients', 'Syntegon'))).sort()).toEqual(['00 Client', 'About this folder.md'])
  })

  it('finds the names, reviews the group and builds its matters with the data plugin', async () => {
    const fake = data()
    ctx.set('flowleapPatentData', fake)
    await load()
    const found = await (await call(ADD_CLIENT_ROUTES.find, { query: { name: 'Syntegon' } })).json() as FindAnswer
    expect(found).toMatchObject({ status: 'found', source: 'ep-register', names: [{ name: 'Syntegon', applications: 2 }], truncated: false })
    expect(found).not.toHaveProperty('edition')
    const reviewed = await (await post(ADD_CLIENT_ROUTES.review, { names: ['Syntegon Technology GmbH'], clients: [{ clientId: 'c-9', names: ['Rival'] }] })).json() as ReviewAnswer
    expect(reviewed).toMatchObject({ status: 'reviewed', total: 2, identity: 'set', atFirm: [{ applicationNumber: 'EP23171862' }], atOtherFirms: [{ applicationNumber: 'EP19794879' }] })
    await post(ADD_CLIENT_ROUTES.build, { clientId: CLIENT, name: 'Syntegon', names: ['Syntegon Technology GmbH'], applications: ['EP 23 171 862'] })
    expect(await settled()).toMatchObject({ state: 'done', matters: 1, families: 1 })
    expect(fake.queries.filter(query => query.startsWith('find:'))).toEqual(['find:Syntegon:500'])
  })

  it('answers the edition of a PATSTAT source', async () => {
    const fake = data()
    fake.findApplicantNames = async () => ({ source: 'patstat', edition: '2026 Spring', names: [], truncated: true }) as never
    ctx.set('flowleapPatentData', fake)
    await load()
    expect(await (await call(ADD_CLIENT_ROUTES.find, { query: { name: 'Syntegon' } })).json()).toMatchObject({ source: 'patstat', edition: '2026 Spring', truncated: true })
  })

  it('refuses a request that is not well formed', async () => {
    await load()
    const refused = async (response: Promise<Response>): Promise<[number, unknown]> => {
      const answer = await response
      const body: unknown = await answer.json()
      return [answer.status, body]
    }
    expect(await refused(call(ADD_CLIENT_ROUTES.find))).toEqual([400, { error: 'bad-request' }])
    expect(await refused(post(ADD_CLIENT_ROUTES.review, '{'))).toEqual([400, { error: 'bad-request' }])
    expect(await refused(post(ADD_CLIENT_ROUTES.review, []))).toEqual([400, { error: 'bad-request' }])
    expect(await refused(post(ADD_CLIENT_ROUTES.review, { names: 'x', clients: [] }))).toEqual([400, { error: 'bad-request' }])
    expect(await refused(post(ADD_CLIENT_ROUTES.review, { names: ['x'], clients: 'x' }))).toEqual([400, { error: 'bad-request' }])
    expect(await refused(post(ADD_CLIENT_ROUTES.review, { names: ['x'], clients: [null] }))).toEqual([400, { error: 'bad-request' }])
    expect(await refused(post(ADD_CLIENT_ROUTES.review, { names: ['x'], clients: [{ clientId: '', names: [] }] }))).toEqual([400, { error: 'bad-request' }])
    expect(await refused(post(ADD_CLIENT_ROUTES.build, { clientId: CLIENT.toUpperCase(), name: 'x', names: [], applications: [] }))).toEqual([400, { error: 'bad-request' }])
    expect(await refused(post(ADD_CLIENT_ROUTES.build, { clientId: CLIENT, name: 'CON', names: [], applications: [] }))).toEqual([422, { error: 'invalid-name' }])
    expect(await refused(post(ADD_CLIENT_ROUTES.build, { clientId: CLIENT, name: 'x', names: [], applications: ['US 17/123,456'] }))).toEqual([400, { error: 'bad-request' }])
  })

  it('words a missing key, a register that does not answer, and a fault of its own', async () => {
    const fake = data()
    ctx.set('flowleapPatentData', fake)
    await load()
    fake.findApplicantNames = async () => { throw new PatentDataError('no-key', 'no EPO OPS key') }
    expect((await call(ADD_CLIENT_ROUTES.find, { query: { name: 'x' } })).status).toBe(424)
    fake.failing.add('pa="x"')
    const unreachable = await post(ADD_CLIENT_ROUTES.review, { names: ['x'], clients: [] })
    expect([unreachable.status, await unreachable.json()]).toEqual([502, { error: 'unreachable' }])
    fake.findApplicantNames = async () => { throw new Error('a bug') }
    expect((await call(ADD_CLIENT_ROUTES.find, { query: { name: 'x' } })).status).toBe(500)
    fake.findApplicantNames = async () => { throw 'not an error object' }
    expect((await call(ADD_CLIENT_ROUTES.find, { query: { name: 'x' } })).status).toBe(500)
    expect(warnings.slice(2)).toEqual(['ui-flowleap-folder: Add client: a bug', 'ui-flowleap-folder: Add client: not an error object'])
    expect(warnings.slice(0, 2).map(line => line.startsWith('ui-flowleap-folder: Add client: '))).toEqual([true, true])
    expect(warnings[0]).toContain('no EPO OPS key')
    expect(codeOf(new PatentDataError('malformed', 'x'))).toBe('unreachable')
    expect(codeOf(new FolderError('invalid-name', 'x'))).toBe('invalid-name')
    expect(codeOf(new FolderError('exists', 'x'))).toBe('internal')
    expect(codeOf(new AddClientError('stopped', 'x'))).toBe('stopped')
  })

  it('builds the folder of a client name with a separator under its safe folder name', async () => {
    await load()
    const started = await post(ADD_CLIENT_ROUTES.build, { clientId: CLIENT, name: 'Novo Nordisk A/S', names: [], applications: [] })
    expect(started.status).toBe(202)
    expect(await settled()).toMatchObject({ name: 'Novo Nordisk A/S', state: 'done', folder: 'Novo Nordisk A-S' })
    expect(created).toEqual([path.join(base, 'Clients', 'Novo Nordisk A-S')])
  })

  it('builds the applications of a request that came while the build ran, after the first run', async () => {
    const fake = data()
    let release = () => {}
    const held = new Promise<void>((resolve) => { release = resolve })
    const family = fake.family.bind(fake)
    fake.family = async (application) => { await held; return family(application) }
    ctx.set('flowleapPatentData', fake)
    await load()
    await post(ADD_CLIENT_ROUTES.build, { clientId: CLIENT, name: 'Syntegon', names: ['Syntegon Technology GmbH'], applications: ['EP23171862'] })
    const again = await post(ADD_CLIENT_ROUTES.build, { clientId: CLIENT, name: 'Syntegon', names: ['Syntegon Technology GmbH'], applications: ['EP19794879'] })
    expect((await again.json() as BuildStatus).state).toBe('running')
    release()
    expect(await settled()).toMatchObject({ state: 'done', matters: 2 })
  })

  it('answers internal and runs no build when the first build status cannot be written', async () => {
    await load({ stateDir: path.join(base, 'state-file') })
    await import('node:fs/promises').then(fs => fs.writeFile(path.join(base, 'state-file'), 'a file where the folder should be'))
    const response = await post(ADD_CLIENT_ROUTES.build, { clientId: CLIENT, name: 'Syntegon', names: [], applications: [] })
    expect([response.status, await response.json()]).toEqual([500, { error: 'internal' }])
    expect(warnings.filter(line => line.includes('Add client'))).toHaveLength(1)
  })

  it('answers stopped after the plugin stopped', async () => {
    const fiber = await load()
    const build = routes.get(ADD_CLIENT_ROUTES.build)!
    await fiber.dispose()
    const response = await build.fetch(new Request(`http://runtime.test${ADD_CLIENT_ROUTES.build}`, {
      method: 'POST', body: JSON.stringify({ clientId: CLIENT, name: 'x', names: [], applications: [] }),
    }))
    expect([response.status, await response.json()]).toEqual([503, { error: 'stopped' }])
  })

  it('refuses a config that would write outside its folder or lose the public data', () => {
    const config = (fields: Partial<Config>) => Config({ stateDir: '/state', clientsRoot: '/clients', ...fields } as Config)
    expect(() => { checkConfig(config({})) }).not.toThrow()
    expect(() => { checkConfig(config({ clientsRoot: 'clients' })) }).toThrow('clientsRoot must be an absolute path')
    expect(() => { checkConfig(config({ folderTemplate: { client: ['a/b'], matter: ['Office'], publicData: 'Office' } })) }).toThrow('folderTemplate.client has the invalid folder name "a/b"')
    expect(() => { checkConfig(config({ folderTemplate: { client: [], matter: ['Office', 'Office'], publicData: 'Office' } })) }).toThrow('folderTemplate.matter repeats a folder name')
    expect(() => { checkConfig(config({ folderTemplate: { client: [], matter: ['Search'], publicData: 'Office' } })) }).toThrow('folderTemplate.publicData "Office" is not a matter folder')
    expect(() => config({ maxRegisterRows: 10001 })).toThrow()
    expect(() => config({ registerSliceRows: 2001 })).toThrow()
    expect(() => config({ opsRequestsPerMinute: 0 })).toThrow()
    expect(() => config({ docketRefreshAge: 0 })).toThrow()
  })
})

describe('the firm docket routes', () => {
  async function docketOf(): Promise<DocketAnswer> {
    return await (await call(ADD_CLIENT_ROUTES.docket)).json() as DocketAnswer
  }

  it('say that no data plugin is there, and refuse a read request that is not well formed', async () => {
    await load()
    expect(await docketOf()).toEqual({ status: 'no-plugin' })
    expect(await (await post(ADD_CLIENT_ROUTES.docketRead, { slices: 'all' })).json()).toEqual({ status: 'no-plugin' })
    const refused = await post(ADD_CLIENT_ROUTES.docketRead, { slices: 'some' })
    expect([refused.status, await refused.json()]).toEqual([400, { error: 'bad-request' }])
  })

  it('read the firm docket from load on with the firm identity alone, and read it again on request', async () => {
    const fake = data()
    ctx.set('flowleapPatentData', fake)
    await load()
    await vi.waitFor(async () => { expect(await docketOf()).toMatchObject({ status: 'docket', docket: { state: 'ready', rows: 1 } }) })
    expect(fake.queries).toEqual(['re="Becker, Anna"|1-100'])
    expect(await (await post(ADD_CLIENT_ROUTES.docketRead, { slices: 'failed' })).json()).toMatchObject({ status: 'docket', docket: { state: 'ready' } })
    expect(await (await post(ADD_CLIENT_ROUTES.docketRead, { slices: 'all' })).json()).toMatchObject({ status: 'docket', docket: { state: 'reading' } })
    await vi.waitFor(async () => { expect(await docketOf()).toMatchObject({ docket: { state: 'ready' } }) })
    expect(fake.queries).toEqual(['re="Becker, Anna"|1-100', 're="Becker, Anna"|1-100'])
  })

  it('answer no_identity while the firm identity names nothing', async () => {
    ctx.set('flowleapPatentData', data())
    await load({ firmIdentity: { names: [], addresses: [], representatives: [] } })
    expect(await docketOf()).toEqual({ status: 'docket', docket: { state: 'no_identity' } })
  })
})
