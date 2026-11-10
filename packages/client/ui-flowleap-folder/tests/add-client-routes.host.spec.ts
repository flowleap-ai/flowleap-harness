import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import * as adminLink from '@deepseek-ai/dsh-client-ui-flowleap-admin-link'
import { PatentDataError } from '@deepseek-ai/dsh-flowleap-connectors'
import {
  ADD_CLIENT_ROUTES, apply, checkConfig, Config, inject, type ClientFolderAnswer, type ConflictCheckAnswer, type DocketAnswer,
  type FindAnswer, type FirmIdentityAnswer, type MattersAnswer, type OpponentIndexAnswer, type OthersAnswer,
} from '../src/index.ts'
import { AddClientError, codeOf } from '../src/add-client/routes.ts'
import { FolderError } from '../src/folder.ts'
import { FakePatentData, hold, pub, row } from './patent-data.host.ts'

const CLIENT = '0b7c3c3e-0000-4000-8000-000000000001'

const starter = generateKeyPairSync('ed25519')
const other = generateKeyPairSync('ed25519')

/** An `X-Flowleap-Admin` header as the starter signs it, expiring `inSeconds` from now. */
function adminHeader(inSeconds = 60, privateKey: KeyObject = starter.privateKey): Record<string, string> {
  const expiry = String(Math.floor(Date.now() / 1000) + inSeconds)
  const signature = sign(null, Buffer.from(`flowleap-admin-link.v1.${expiry}`, 'ascii'), privateKey).toString('base64url')
  return { 'x-flowleap-admin': `v1.${expiry}.${signature}` }
}

let base: string
let routes: Map<string, ConnectionFetchRoute>
let ctx: Context
let warnings: string[]
let created: string[]
let admin: Fiber

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
  // The admin-link row of the bundle, with a test key pair: it provides `flowleapAdmin`.
  const publicKeyFile = path.join(base, 'admin-link.pub')
  await writeFile(publicKeyFile, starter.publicKey.export({ type: 'spki', format: 'pem' }).toString())
  admin = ctx.plugin({ inject: adminLink.inject, Config: adminLink.Config, apply: adminLink.apply }, { publicKeyFile, consoleHref: 'admin/' })
  await admin.await()
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

function post(route: string, body: unknown, headers: Record<string, string> = {}) {
  return call(route, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
}

function data() {
  return new FakePatentData([
    row({ applicationNumber: 'EP23171862', publicationNumber: pub('EP4292805'), title: 'Packaging', applicants: ['Syntegon Technology GmbH'], representatives: [{ name: 'Becker, Anna', address: [] }] }),
    row({ applicationNumber: 'EP19794879', applicants: ['Syntegon Technology GmbH'] }),
  ])
}

/** The source records of the client folder workspace. */
async function sourcesOf(workspace: string): Promise<Record<string, string>> {
  const records = JSON.parse(await readFile(path.join(base, 'state', 'sources', `${workspace}.json`), 'utf8')) as Record<string, { kind: string; from: string }>
  return Object.fromEntries(Object.entries(records).map(([entry, source]) => [entry, `${source.kind} ${source.from}`]))
}

describe('Add client routes', () => {
  it('says that no data plugin is there, and makes the client folder with 00 Client and the About file only', async () => {
    await load()
    expect(await (await call(ADD_CLIENT_ROUTES.find, { query: { name: 'Syntegon' } })).json()).toEqual({ status: 'no-plugin' })
    expect(await (await post(ADD_CLIENT_ROUTES.matters, { names: ['Syntegon'] })).json()).toEqual({ status: 'no-plugin' })
    expect(await (await post(ADD_CLIENT_ROUTES.others, { names: ['Syntegon'] })).json()).toEqual({ status: 'no-plugin' })
    expect(await (await post(ADD_CLIENT_ROUTES.conflictCheck, { names: ['Syntegon'], clients: [] })).json()).toEqual({ status: 'no-plugin' })
    const made = await post(ADD_CLIENT_ROUTES.clientFolder, { clientId: CLIENT, name: 'Syntegon', names: ['Syntegon Technology GmbH', 'Syntegon Packaging Systems AG'] })
    expect(made.status).toBe(200)
    expect(made.headers.get('cache-control')).toBe('no-store')
    expect(await made.json()).toEqual({ workspace: 'ws-1', folder: 'Syntegon', made: true } satisfies ClientFolderAnswer)
    expect(created).toEqual([path.join(base, 'Clients', 'Syntegon')])
    const folder = path.join(base, 'Clients', 'Syntegon')
    expect((await readdir(folder)).sort()).toEqual(['00 Client', 'About this folder.md'])
    expect(await readdir(path.join(folder, '00 Client'))).toEqual([])
    const about = await readFile(path.join(folder, 'About this folder.md'), 'utf8')
    expect(about).toContain('# Syntegon\n')
    expect(about).toContain('FlowLeap copied no public data into this folder.')
    expect(about).toContain('Applicant names of the client group: Syntegon Technology GmbH; Syntegon Packaging Systems AG.')
    expect(await sourcesOf('ws-1')).toEqual({ '00 Client': 'add-client template', 'About this folder.md': 'add-client template' })
  })

  it('makes the client folder once: a second request finds it and changes nothing', async () => {
    await load()
    const body = { clientId: CLIENT, name: 'Syntegon', names: [] }
    await post(ADD_CLIENT_ROUTES.clientFolder, body)
    const folder = path.join(base, 'Clients', 'Syntegon')
    const about = await readFile(path.join(folder, 'About this folder.md'), 'utf8')
    expect(about).toContain('Applicant names of the client group: none.')
    const records = await sourcesOf('ws-1')
    const again = await post(ADD_CLIENT_ROUTES.clientFolder, { ...body, names: ['Syntegon Technology GmbH'] })
    expect(await again.json()).toEqual({ workspace: 'ws-1', folder: 'Syntegon', made: false })
    expect((await readdir(folder)).sort()).toEqual(['00 Client', 'About this folder.md'])
    expect(await readFile(path.join(folder, 'About this folder.md'), 'utf8')).toBe(about)
    expect(await sourcesOf('ws-1')).toEqual(records)
  })

  it('makes the client folder of two requests at the same time once', async () => {
    await load()
    const body = { clientId: CLIENT, name: 'Syntegon', names: [] }
    const answers = await Promise.all([post(ADD_CLIENT_ROUTES.clientFolder, body), post(ADD_CLIENT_ROUTES.clientFolder, body)])
    expect(answers.map(answer => answer.status)).toEqual([200, 200])
    expect((await readdir(path.join(base, 'Clients', 'Syntegon'))).sort()).toEqual(['00 Client', 'About this folder.md'])
  })

  it('answers the batch size of the Firm Record commands', async () => {
    const fiber = await load()
    expect(await (await call(ADD_CLIENT_ROUTES.settings)).json()).toEqual({ recordBatchSize: 100 })
    await fiber.dispose()
    await load({ recordBatchSize: 25 })
    expect(await (await call(ADD_CLIENT_ROUTES.settings)).json()).toEqual({ recordBatchSize: 25 })
  })

  it('answers the conflict check of a group with no possible conflict, complete in both halves', async () => {
    const fake = data()
    ctx.set('flowleapPatentData', fake)
    await load()
    const checked = await (await post(ADD_CLIENT_ROUTES.conflictCheck, { names: ['Syntegon Technology GmbH'], clients: [{ clientId: 'c-9', names: ['Rival'] }] })).json() as ConflictCheckAnswer
    expect(checked).toEqual({
      status: 'checked', asOf: expect.any(String) as string, conflicts: [],
      conflictCheck: { groupOpposedClients: { state: 'complete', asOf: expect.any(String) as string }, clientsOpposedGroup: { state: 'reading' } },
    })
    expect(fake.queries).toContain('op="Syntegon Technology GmbH"|1-100')
    expect(fake.queries.some(query => query.startsWith('pa='))).toBe(false)
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
    expect(await refused(post(ADD_CLIENT_ROUTES.conflictCheck, '{'))).toEqual([400, { error: 'bad-request' }])
    expect(await refused(post(ADD_CLIENT_ROUTES.conflictCheck, []))).toEqual([400, { error: 'bad-request' }])
    expect(await refused(post(ADD_CLIENT_ROUTES.conflictCheck, { names: 'x', clients: [] }))).toEqual([400, { error: 'bad-request' }])
    expect(await refused(post(ADD_CLIENT_ROUTES.conflictCheck, { names: ['x'], clients: 'x' }))).toEqual([400, { error: 'bad-request' }])
    expect(await refused(post(ADD_CLIENT_ROUTES.conflictCheck, { names: ['x'], clients: [null] }))).toEqual([400, { error: 'bad-request' }])
    expect(await refused(post(ADD_CLIENT_ROUTES.conflictCheck, { names: ['x'], clients: [{ clientId: '', names: [] }] }))).toEqual([400, { error: 'bad-request' }])
    for (const route of [ADD_CLIENT_ROUTES.matters, ADD_CLIENT_ROUTES.others]) {
      for (const body of ['{', [], {}, { names: 'x' }, { names: [''] }, { names: [3] }]) {
        expect(await refused(post(route, body))).toEqual([400, { error: 'bad-request' }])
      }
    }
    expect(await refused(post(ADD_CLIENT_ROUTES.clientFolder, { clientId: CLIENT.toUpperCase(), name: 'x', names: [] }))).toEqual([400, { error: 'bad-request' }])
    expect(await refused(post(ADD_CLIENT_ROUTES.clientFolder, { clientId: CLIENT, name: 'CON', names: [] }))).toEqual([422, { error: 'invalid-name' }])
    expect(await refused(post(ADD_CLIENT_ROUTES.clientFolder, { clientId: CLIENT, name: 'x', names: 'x' }))).toEqual([400, { error: 'bad-request' }])
  })

  it('words a missing key, a register that does not answer, and a fault of its own', async () => {
    const fake = data()
    ctx.set('flowleapPatentData', fake)
    await load()
    fake.findApplicantNames = async () => { throw new PatentDataError('no-key', 'no EPO OPS key') }
    expect((await call(ADD_CLIENT_ROUTES.find, { query: { name: 'x' } })).status).toBe(424)
    fake.failing.add('pa="x"')
    const unreachable = await post(ADD_CLIENT_ROUTES.others, { names: ['x'] })
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
    expect(codeOf(new AddClientError('not-admin', 'x'))).toBe('not-admin')
  })

  it('makes the folder of a client name with a separator under its safe folder name', async () => {
    await load()
    const made = await post(ADD_CLIENT_ROUTES.clientFolder, { clientId: CLIENT, name: 'Novo Nordisk A/S', names: [] })
    expect(await made.json()).toMatchObject({ folder: 'Novo Nordisk A-S', made: true })
    expect(created).toEqual([path.join(base, 'Clients', 'Novo Nordisk A-S')])
    const long = await post(ADD_CLIENT_ROUTES.clientFolder, { clientId: CLIENT, name: 'Ü'.repeat(200), names: [] })
    expect(Buffer.byteLength((await long.json() as ClientFolderAnswer).folder, 'utf8')).toBe(254)
  })

  it('refuses a client folder where a file has its name, or a file has the name of a template folder', async () => {
    await load()
    await mkdir(path.join(base, 'Clients'), { recursive: true })
    await writeFile(path.join(base, 'Clients', 'Syntegon'), 'a file where the client folder should be')
    const blocked = await post(ADD_CLIENT_ROUTES.clientFolder, { clientId: CLIENT, name: 'Syntegon', names: [] })
    expect([blocked.status, await blocked.json()]).toEqual([500, { error: 'internal' }])
    await mkdir(path.join(base, 'Clients', 'Schubert'))
    await writeFile(path.join(base, 'Clients', 'Schubert', '00 Client'), 'a file where the template folder should be')
    const file = await post(ADD_CLIENT_ROUTES.clientFolder, { clientId: CLIENT, name: 'Schubert', names: [] })
    expect([file.status, await file.json()]).toEqual([500, { error: 'internal' }])
  })

  it('refuses a config that would write outside its folder or lose the public data', () => {
    const config = (fields: Partial<Config>) => Config({ stateDir: '/state', clientsRoot: '/clients', ...fields } as Config)
    expect(() => { checkConfig(config({})) }).not.toThrow()
    expect(() => { checkConfig(config({ clientsRoot: 'clients' })) }).toThrow('clientsRoot must be an absolute path')
    expect(() => { checkConfig(config({ folderTemplate: { client: ['a/b'], matter: ['Office'], publicData: 'Office' } })) }).toThrow('folderTemplate.client has the invalid folder name "a/b"')
    expect(() => { checkConfig(config({ folderTemplate: { client: [], matter: ['Office', 'Office'], publicData: 'Office' } })) }).toThrow('folderTemplate.matter repeats a folder name')
    expect(() => { checkConfig(config({ folderTemplate: { client: [], matter: ['Search'], publicData: 'Office' } })) }).toThrow('folderTemplate.publicData "Office" is not a matter folder')
    expect(config({}).findSampleRows).toBe(500)
    expect(config({ findSampleRows: 2000 }).findSampleRows).toBe(2000)
    expect(() => config({ findSampleRows: 2001 })).toThrow()
    expect(() => config({ findSampleRows: 0 })).toThrow()
    expect(config({}).findNameLimit).toBe(20)
    expect(() => config({ findNameLimit: 0 })).toThrow()
    expect(() => config({ findNameLimit: 101 })).toThrow()
    expect(() => config({ registerSliceRows: 2001 })).toThrow()
    expect(() => config({ opsRequestsPerMinute: 0 })).toThrow()
    expect(() => config({ docketRefreshAge: 0 })).toThrow()
    expect(config({}).recordBatchSize).toBe(100)
    expect(() => config({ recordBatchSize: 0 })).toThrow()
    expect(() => config({ recordBatchSize: 501 })).toThrow()
  })
})

describe('the find, matters and others routes', () => {
  const BECKER = { name: 'Becker, Anna', address: [] }
  /** A representative of another firm at the firm's address. */
  const SAME_ADDRESS = { name: 'Schmidt, Paul', address: ['Hauptstraße 1', '80331 München'] }
  const IDENTITY = { names: [], addresses: ['Hauptstraße 1, 80331 München'], representatives: ['Anna Becker'] }

  function group() {
    return new FakePatentData([
      row({
        applicationNumber: 'EP23171862', publicationNumber: pub('EP4292805'), title: 'Packaging', applicants: ['Syntegon Technology GmbH'], representatives: [BECKER],
        status: 'Examination is in progress', representativeSince: '2024-07-24',
      }),
      row({ applicationNumber: 'EP23000002', applicants: ['Syntegon Packaging Systems AG', 'Partner AG'], representatives: [BECKER] }),
      row({ applicationNumber: 'EP23000003', applicants: ['SYNTEGON TECHNOLOGY'], representatives: [SAME_ADDRESS] }),
      row({ applicationNumber: 'EP23000004', applicants: ['Robert Bosch GmbH'], representatives: [BECKER] }),
      row({ applicationNumber: 'EP19794879', applicants: ['Syntegon Technology GmbH'] }),
    ])
  }

  /** Load the row with the data plugin, and wait until the firm docket is ready. */
  async function ready(fake: FakePatentData, fields: Partial<Config> = {}) {
    ctx.set('flowleapPatentData', fake)
    await load({ firmIdentity: IDENTITY, ...fields })
    await vi.waitFor(async () => {
      expect(await (await call(ADD_CLIENT_ROUTES.docket)).json()).toMatchObject({ docket: { state: 'ready', rows: 4 } })
    })
    fake.queries.length = 0
  }

  async function find(name: string): Promise<FindAnswer> {
    return await (await call(ADD_CLIENT_ROUTES.find, { query: { name } })).json() as FindAnswer
  }

  /** Let the count queries of `pa=` give a total. */
  function countAs(fake: FakePatentData, total: number): void {
    const read = fake.searchRegister.bind(fake)
    fake.searchRegister = async (query, range, signal) => {
      if (!query.startsWith('pa=')) return read(query, range, signal)
      fake.queries.push(`${query}|${range.begin}-${range.end}`)
      return { total, begin: range.begin, end: range.begin - 1, rows: [] }
    }
  }

  it('find gives the names of the register sample and the names of the firm docket, each company once, with one count query each', async () => {
    const fake = group()
    fake.sample = ['Syntegon Technology GmbH']
    await ready(fake)
    expect(await find('Syntegon')).toEqual({
      status: 'found', source: 'ep-register', asOf: expect.any(String) as string, omitted: 0, sampleRows: 500, truncated: false,
      names: [{ name: 'Syntegon Technology GmbH', matching: 3 }, { name: 'Syntegon Packaging Systems AG', matching: 1 }],
    })
    expect(fake.queries).toEqual(['find:Syntegon:500', 'pa="Syntegon Technology GmbH"|1-1', 'pa="Syntegon Packaging Systems AG"|1-1'])
  })

  it('find counts at most findNameLimit names, says how many it left out, and sorts equal counts by name', async () => {
    const fake = group()
    fake.sample = ['Syntegon Beta', 'Syntegon Alpha', 'Syntegon Technology GmbH']
    await ready(fake, { findNameLimit: 2, findSampleRows: 1000 })
    expect(await find('Syntegon')).toMatchObject({
      names: [{ name: 'Syntegon Alpha', matching: 0 }, { name: 'Syntegon Beta', matching: 0 }], omitted: 2, sampleRows: 1000,
    })
    expect(fake.queries).toEqual(['find:Syntegon:1000', 'pa="Syntegon Beta"|1-1', 'pa="Syntegon Alpha"|1-1'])
  })

  it('find gives a count at the EPO cap as the cap, and a failed count as unreachable', async () => {
    const fake = group()
    await ready(fake)
    countAs(fake, 12_000)
    expect(await find('Robert Bosch')).toMatchObject({ names: [{ name: 'Robert Bosch', matching: 10_000 }] })
    fake.searchRegister = async () => { throw new PatentDataError('unreachable', 'no answer') }
    const failed = await call(ADD_CLIENT_ROUTES.find, { query: { name: 'Syntegon' } })
    expect([failed.status, await failed.json()]).toEqual([502, { error: 'unreachable' }])
  })

  it('find gives the sample names only while the firm docket is read', async () => {
    const fake = group()
    const release = hold(fake, 're=')
    ctx.set('flowleapPatentData', fake)
    await load({ firmIdentity: IDENTITY })
    expect(await find('Syntegon')).toMatchObject({ names: [{ name: 'Syntegon', matching: 4 }] })
    release()
  })

  it('matters gives the docket rows of the names, with the address-only rows marked and left out of the counts', async () => {
    const fake = group()
    await ready(fake)
    const answer = await (await post(ADD_CLIENT_ROUTES.matters, { names: ['Syntegon Technology GmbH', 'SYNTEGON PACKAGING SYSTEMS', 'Nobody', 'GmbH'] })).json() as MattersAnswer
    expect(answer).toEqual({
      status: 'matters', docket: { state: 'ready', rows: 4, asOf: expect.any(String) as string },
      counts: [
        { name: 'Syntegon Technology GmbH', atFirm: 1 }, { name: 'SYNTEGON PACKAGING SYSTEMS', atFirm: 1 }, { name: 'Nobody', atFirm: 0 }, { name: 'GmbH', atFirm: 0 },
      ],
      rows: [
        { applicationNumber: 'EP23000003', applicants: ['SYNTEGON TECHNOLOGY'], addressOnly: true, names: ['Syntegon Technology GmbH'] },
        {
          applicationNumber: 'EP23171862', publicationNumber: 'EP4292805', title: 'Packaging', applicants: ['Syntegon Technology GmbH'], status: 'Examination is in progress',
          representativeSince: '2024-07-24', addressOnly: false, names: ['Syntegon Technology GmbH'],
        },
        { applicationNumber: 'EP23000002', applicants: ['Syntegon Packaging Systems AG', 'Partner AG'], addressOnly: false, names: ['SYNTEGON PACKAGING SYSTEMS'] },
      ],
    })
    expect(fake.queries).toEqual([])
  })

  it('matters gives no row and counts of 0 while the firm docket is read', async () => {
    const fake = group()
    const release = hold(fake, 're=')
    ctx.set('flowleapPatentData', fake)
    await load({ firmIdentity: IDENTITY })
    expect(await (await post(ADD_CLIENT_ROUTES.matters, { names: ['Syntegon Technology GmbH'] })).json()).toEqual({
      status: 'matters', docket: { state: 'reading', progress: expect.any(Object) as object }, counts: [{ name: 'Syntegon Technology GmbH', atFirm: 0 }], rows: [],
    })
    release()
  })

  it('others counts the group with one query for each 4 names, less the firm\'s rows that are not address-only', async () => {
    const fake = group()
    await ready(fake)
    expect(await (await post(ADD_CLIENT_ROUTES.others, { names: ['Syntegon Technology GmbH'] })).json()).toEqual({
      status: 'counted', count: 2, capped: false, atLeast: false, asOf: expect.any(String) as string,
    } satisfies OthersAnswer)
    expect(fake.queries).toEqual(['pa="Syntegon Technology GmbH"|1-1'])
    fake.queries.length = 0
    const five = ['Syntegon Technology GmbH', 'Syntegon Packaging Systems AG', 'Alpha', 'Beta', 'Gamma "Co"']
    expect(await (await post(ADD_CLIENT_ROUTES.others, { names: five })).json()).toMatchObject({ count: 2, capped: false, atLeast: true })
    expect(fake.queries).toEqual([
      'pa="Syntegon Technology GmbH" or pa="Syntegon Packaging Systems AG" or pa="Alpha" or pa="Beta"|1-1', 'pa="Gamma Co"|1-1',
    ])
  })

  it('others says when a count stopped at the cap, and never counts below 0', async () => {
    const fake = group()
    await ready(fake)
    countAs(fake, 10_000)
    expect(await (await post(ADD_CLIENT_ROUTES.others, { names: ['Syntegon Technology GmbH'] })).json()).toMatchObject({ count: 9_999, capped: true })
    countAs(fake, 0)
    expect(await (await post(ADD_CLIENT_ROUTES.others, { names: ['Syntegon Technology GmbH'] })).json()).toMatchObject({ count: 0, capped: false })
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
    expect(await (await post(ADD_CLIENT_ROUTES.docketRead, { slices: 'all' })).json())
      .toMatchObject({ status: 'docket', docket: { state: 'ready', rows: 1, refresh: { state: 'reading' } } })
    await vi.waitFor(async () => {
      const answer = await docketOf()
      expect(answer).toMatchObject({ status: 'docket', docket: { state: 'ready', rows: 1 } })
      expect(answer).not.toHaveProperty('docket.refresh')
    })
    expect(fake.queries).toEqual(['re="Becker, Anna"|1-100', 're="Becker, Anna"|1-100'])
  })

  it('answer no_identity while the firm identity names nothing', async () => {
    ctx.set('flowleapPatentData', data())
    await load({ firmIdentity: { names: [], addresses: [], representatives: [] } })
    expect(await docketOf()).toEqual({ status: 'docket', docket: { state: 'no_identity' } })
  })
})

describe('the firm identity routes', () => {
  async function identityOf(headers: Record<string, string> = {}): Promise<FirmIdentityAnswer> {
    return await (await call(ADD_CLIENT_ROUTES.identity, { headers })).json() as FirmIdentityAnswer
  }

  it('answer the row config identity with the docket state, and without the data plugin say so', async () => {
    await load()
    expect(await identityOf()).toEqual({ identity: { names: [], addresses: [], representatives: ['Anna Becker'] }, docket: { status: 'no-plugin' }, canSave: false })
    const saved = await post(ADD_CLIENT_ROUTES.identitySave, { identity: { names: [' Muster & Partner '], addresses: [], representatives: [] } }, adminHeader())
    expect(saved.headers.get('cache-control')).toBe('no-store')
    expect(await saved.json()).toEqual({ identity: { names: ['Muster & Partner'], addresses: [], representatives: [] }, docket: { status: 'no-plugin' }, canSave: true })
  })

  it('answer canSave true only for a request with a valid header of a firm administrator', async () => {
    await load()
    expect((await identityOf(adminHeader())).canSave).toBe(true)
    for (const headers of [{}, adminHeader(60, other.privateKey), adminHeader(-1)]) {
      expect((await identityOf(headers)).canSave).toBe(false)
    }
  })

  it('refuse a save without a valid header with not-admin before it reads the body, and change nothing', async () => {
    await load()
    const identity = { identity: { names: ['Muster & Partner'], addresses: [], representatives: [] } }
    for (const [body, headers] of [
      [identity, {}], [identity, adminHeader(60, other.privateKey)], [identity, adminHeader(-1)], ['not json', {}],
    ] as const) {
      const refused = await post(ADD_CLIENT_ROUTES.identitySave, body, headers)
      expect([refused.status, await refused.json()]).toEqual([403, { error: 'not-admin' }])
    }
    expect((await identityOf()).identity).toEqual({ names: [], addresses: [], representatives: ['Anna Becker'] })
    await expect(access(path.join(base, 'state', 'identity.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuse every save when the runtime has no flowleapAdmin Service', async () => {
    await admin.dispose()
    await load()
    expect((await identityOf(adminHeader())).canSave).toBe(false)
    const refused = await post(ADD_CLIENT_ROUTES.identitySave, { identity: { names: ['Muster & Partner'], addresses: [], representatives: [] } }, adminHeader())
    expect([refused.status, await refused.json()]).toEqual([403, { error: 'not-admin' }])
  })

  it('save a new identity: the docket drops the old rows and reads again, and the matters come from the new docket', async () => {
    const fake = data()
    ctx.set('flowleapPatentData', fake)
    const fiber = await load()
    await vi.waitFor(async () => { expect(await identityOf()).toMatchObject({ docket: { docket: { state: 'ready', rows: 1 } } }) })
    const identity = { names: ['Beispiel IP'], addresses: [], representatives: [] }
    const answer = await (await post(ADD_CLIENT_ROUTES.identitySave, { identity }, adminHeader())).json() as FirmIdentityAnswer
    expect(answer.identity).toEqual(identity)
    expect(answer.docket).toMatchObject({ status: 'docket', docket: { state: 'reading', progress: { rows: 0 } } })
    await vi.waitFor(async () => { expect(await identityOf()).toMatchObject({ identity, docket: { status: 'docket', docket: { state: 'ready', rows: 0 } } }) })
    expect(fake.queries.at(-1)).toBe('re="Beispiel IP"|1-100')
    const matters = await (await post(ADD_CLIENT_ROUTES.matters, { names: ['Syntegon Technology GmbH'] })).json() as MattersAnswer
    expect(matters).toEqual({
      status: 'matters', docket: { state: 'ready', rows: 0, asOf: expect.any(String) as string }, counts: [{ name: 'Syntegon Technology GmbH', atFirm: 0 }], rows: [],
    })
    await fiber.dispose()
    await load()
    expect((await identityOf()).identity).toEqual(identity)
  })

  it('save an empty identity as no identity', async () => {
    ctx.set('flowleapPatentData', data())
    await load()
    const empty = { names: [''], addresses: ['  '], representatives: [] }
    expect(await (await post(ADD_CLIENT_ROUTES.identitySave, { identity: empty }, adminHeader())).json()).toEqual({
      identity: { names: [], addresses: [], representatives: [] }, docket: { status: 'docket', docket: { state: 'no_identity' } }, canSave: true,
    })
  })

  it('refuse a save that is not well formed, and answer internal when the identity cannot be written', async () => {
    await load()
    const malformed = [
      {}, { identity: [] }, { identity: { names: [], addresses: [] } }, { identity: { names: [1], addresses: [], representatives: [] } },
    ]
    for (const body of malformed) {
      const refused = await post(ADD_CLIENT_ROUTES.identitySave, body, adminHeader())
      expect([refused.status, await refused.json()]).toEqual([400, { error: 'bad-request' }])
    }
    await mkdir(path.join(base, 'state', 'identity.json', 'inside'), { recursive: true })
    const failed = await post(ADD_CLIENT_ROUTES.identitySave, { identity: { names: ['Muster & Partner'], addresses: [], representatives: [] } }, adminHeader())
    expect([failed.status, await failed.json()]).toEqual([500, { error: 'internal' }])
    expect(warnings.some(line => line.startsWith('ui-flowleap-folder: Add client: '))).toBe(true)
    expect((await identityOf()).identity).toEqual({ names: [], addresses: [], representatives: ['Anna Becker'] })
  })
})

describe('the client names route', () => {
  /** An application of a group name that a client of the firm opposed. */
  const OPPOSED = row({
    applicationNumber: 'EP16188888', applicants: ['Gerhard Schubert GmbH'], opponents: [{ name: 'Syntegon Packaging Systems AG', address: [], filedOn: '2025-01-08' }],
  })

  it('keeps the names without the data plugin, and refuses a body that is not a list of names', async () => {
    await load()
    expect(await (await post(ADD_CLIENT_ROUTES.clientNames, { names: ['Syntegon Packaging Systems'] })).json()).toEqual({ status: 'no-plugin' })
    for (const body of [{}, { names: 'Syntegon' }, { names: [''] }, { names: [3] }]) {
      const refused = await post(ADD_CLIENT_ROUTES.clientNames, body)
      expect([refused.status, await refused.json()]).toEqual([400, { error: 'bad-request' }])
    }
  })

  it('reads the opponent index for the names, and the conflict check finds a client that opposed the group in it', async () => {
    const fake = new FakePatentData([OPPOSED])
    ctx.set('flowleapPatentData', fake)
    await load()
    const answer = await (await post(ADD_CLIENT_ROUTES.clientNames, { names: ['Syntegon Packaging Systems'] })).json() as OpponentIndexAnswer
    expect(answer).toMatchObject({ status: 'index', index: { state: 'reading' } })
    await vi.waitFor(async () => {
      const state = await (await post(ADD_CLIENT_ROUTES.clientNames, { names: ['SYNTEGON PACKAGING SYSTEMS AG'] })).json() as OpponentIndexAnswer
      expect(state).toMatchObject({ status: 'index', index: { state: 'ready', rows: 1 } })
    })
    const clients = [{ clientId: 'c-1', names: ['Syntegon Packaging Systems'] }]
    const checked = await (await post(ADD_CLIENT_ROUTES.conflictCheck, { names: ['Gerhard Schubert'], clients })).json() as ConflictCheckAnswer
    expect(checked).toMatchObject({
      status: 'checked',
      conflicts: [{ applicationNumber: 'EP16188888', otherPartyRole: 'patent-owner', existingClientId: 'c-1', opposedOn: '2025-01-08' }],
      conflictCheck: { groupOpposedClients: { state: 'complete' }, clientsOpposedGroup: { state: 'complete' } },
    })
    expect(fake.queries.filter(query => query.startsWith('op='))).toEqual(['op="Syntegon Packaging Systems"|1-100', 'op="Gerhard Schubert"|1-100'])
  })
})
