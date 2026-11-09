import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  ABOUT_FILE, REFERENCE_FILE, buildClientFolder, familyName, publicationBody, referenceBody, registerBody, spacedPublication, spacedWo,
  widenBuild, type BuildInput, type BuildPlan,
} from '../src/add-client/build.ts'
import type { BuildJob } from '../src/add-client/jobs.ts'
import type { BuildStepId } from '../src/add-client/wire.ts'
import { ClientFolder, FolderError } from '../src/folder.ts'
import { folderNameOf } from '../src/route.ts'
import { isSource, sourceStore } from '../src/sources.ts'
import { FakePatentData, app, pub, row, wo } from './patent-data.host.ts'

const CLIENT = '0b7c3c3e-0000-4000-8000-000000000001'
const TEMPLATE = { client: ['00 Client'], matter: ['Client', 'Office'], publicData: 'Office' }
const OURS = { name: 'Becker, Anna', address: [] }

let base: string
let clientsRoot: string
let logs: string[]
let workspaces: Map<string, string>

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'flowleap-add-client-build-'))
  clientsRoot = path.join(base, 'Clients')
  logs = []
  workspaces = new Map()
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

/** A job that keeps what the build reports. */
function recordingJob(signal = new AbortController().signal) {
  const steps = new Map<BuildStepId, { total: number; done: number; failed: string[]; state: string }>()
  const notes: Record<string, unknown> = {}
  const job: BuildJob = {
    signal,
    start: async (step, total) => { steps.set(step, { total, done: 0, failed: [], state: 'running' }) },
    advance: async (step) => { steps.get(step)!.done += 1 },
    fail: async (step, item) => { steps.get(step)!.failed.push(item) },
    finish: async (step) => { const current = steps.get(step)!; current.state = current.failed.length > 0 ? 'failed' : 'done' },
    note: async (facts) => { Object.assign(notes, facts) },
  }
  return { job, steps, notes }
}

function rows() {
  return [
    row({ applicationNumber: 'EP23171862', publicationNumber: pub('EP4292805'), title: 'Method and apparatus for producing a packaging element', applicants: ['Syntegon Technology GmbH'], representatives: [OURS], representativeSince: '2024-07-24', status: 'Examination is in progress', filed: '2023-05-05', published: '2023-12-20' }),
    row({ applicationNumber: 'EP24817871', publicationNumber: pub('EP4820737'), title: 'Apparatus for dishes', applicants: ['Syntegon Technology GmbH'], representatives: [OURS] }),
    row({ applicationNumber: 'EP24817872', title: 'Air sampling device', applicants: ['Syntegon Technology GmbH'], representatives: [OURS], opponents: [{ name: 'Rival AG', address: [], filedOn: '2025-01-08' }, { name: 'Other AG', address: [] }] }),
    row({ applicationNumber: 'EP19794879', title: 'Weighing | containers', applicants: ['Syntegon Technology GmbH'], representatives: [{ name: 'Other', address: ['70173 Stuttgart'] }], filed: '2019-09-18' }),
    row({ applicationNumber: 'EP19794880', applicants: ['Syntegon Technology GmbH'] }),
  ]
}

function input(fields: Partial<BuildInput> = {}): BuildInput {
  return { clientId: CLIENT, name: 'Syntegon', names: ['Syntegon Technology GmbH'], applications: [app('EP23171862'), app('EP24817871'), app('EP24817872')], ...fields }
}

function plan(data: FakePatentData | undefined, fields: Partial<BuildPlan> = {}, at = '2026-11-08T14:02:00.000Z'): BuildPlan {
  return {
    request: input(), data, clientsRoot, template: TEMPLATE, maxRows: 1000, sources: sourceStore(path.join(base, 'state')),
    createWorkspace: async (folder) => {
      const id = workspaces.get(folder) ?? `ws-${workspaces.size + 1}`
      workspaces.set(folder, id)
      return { id }
    },
    now: () => new Date(at), log: (message) => { logs.push(message) }, ...fields,
  }
}

function data() {
  const fake = new FakePatentData(rows())
  fake.families.set('EP23171862', { familyId: 'F1', priorities: [{ number: 'DE 102022111528', date: '2022-05-09' }], publications: [] })
  fake.families.set('EP24817871', { priorities: [{ number: 'DE 102023133973' }], publications: [] })
  fake.families.set('EP24817872', { priorities: [{ number: 'DE 102023133973' }], publications: [] })
  fake.texts.set('EP4292805', { publicationNumber: pub('EP4292805'), title: 'Method', abstract: 'An element.', claims: '1. A method.' })
  return fake
}

/** Every file and folder under a folder, relative to it. */
async function tree(dir: string): Promise<string[]> {
  return (await readdir(dir, { recursive: true })).map(entry => entry.split(path.sep).join('/')).sort()
}

const ROOT = () => path.join(clientsRoot, 'Syntegon')
const FAMILY_1 = 'EP 23 171 862 Method and apparatus for producing…'
const FAMILY_2 = 'EP 24 817 871 Apparatus for dishes'

describe('Add client folder build', () => {
  it('builds the client folder, its families and matters, the dated files and the reference list', async () => {
    const fake = data()
    const { job, steps, notes } = recordingJob()
    const built = plan(fake)
    await buildClientFolder(job, built)
    expect(await tree(ROOT())).toEqual([
      '00 Client', ABOUT_FILE,
      FAMILY_1, `${FAMILY_1}/EP 23 171 862`, `${FAMILY_1}/EP 23 171 862/Client`, `${FAMILY_1}/EP 23 171 862/Office`,
      `${FAMILY_1}/EP 23 171 862/Office/EP Register 2026-11-08.md`, `${FAMILY_1}/EP 23 171 862/Office/Publication EP 4 292 805 2026-11-08.md`,
      FAMILY_2, `${FAMILY_2}/EP 24 817 871`, `${FAMILY_2}/EP 24 817 871/Client`, `${FAMILY_2}/EP 24 817 871/Office`,
      `${FAMILY_2}/EP 24 817 871/Office/EP Register 2026-11-08.md`, `${FAMILY_2}/EP 24 817 872`, `${FAMILY_2}/EP 24 817 872/Client`,
      `${FAMILY_2}/EP 24 817 872/Office`, `${FAMILY_2}/EP 24 817 872/Office/EP Register 2026-11-08.md`,
      `${REFERENCE_FILE} 2026-11-08.md`,
    ])
    const register = await readFile(path.join(ROOT(), FAMILY_1, 'EP 23 171 862', 'Office', 'EP Register 2026-11-08.md'), 'utf8')
    expect(register.split('\n')[0]).toBe('As of 2026-11-08 14:02 UTC, from the EP Register. A dated copy: it does not change when the source changes.')
    expect(register).toContain('| Representative since | 2024-07-24 |')
    expect(await readFile(path.join(ROOT(), `${REFERENCE_FILE} 2026-11-08.md`), 'utf8')).toContain('| EP 19 794 879 | Weighing \\| containers | Stuttgart | 2019-09-18 |')
    expect(notes).toEqual({ workspace: 'ws-1', folder: 'Syntegon', matters: 3, families: 2, added: { client: true, families: 2, matters: 3, files: 5 } })
    expect(Object.fromEntries(steps)).toEqual({
      'folder': { total: 1, done: 1, failed: [], state: 'done' },
      'matters': { total: 3, done: 3, failed: [], state: 'done' },
      'public-data': { total: 5, done: 5, failed: [], state: 'done' },
      'reference': { total: 1, done: 1, failed: [], state: 'done' },
    })
    const sources = await built.sources.read('ws-1')
    expect(sources.get(`${FAMILY_1}/EP 23 171 862`)).toEqual({ kind: 'add-client', at: '2026-11-08T14:02:00.000Z', from: 'ep-register', role: 'matter', key: 'EP23171862' })
    expect(sources.get(FAMILY_2)).toMatchObject({ role: 'family', key: 'DE 102023133973' })
    expect(sources.get(FAMILY_1)).toMatchObject({ role: 'family', key: 'F1' })
    expect(sources.get('00 Client')).toMatchObject({ from: 'template' })
    expect(sources.get(`${FAMILY_1}/EP 23 171 862/Office/Publication EP 4 292 805 2026-11-08.md`)).toMatchObject({ from: 'epo-publication' })
    expect(fake.queries.join(' ')).not.toMatch(/Becker/u)
  })

  it('adds only what is new on a second run, and a new dated file only where the data changed', async () => {
    const fake = data()
    await buildClientFolder(recordingJob().job, plan(fake))
    const before = await tree(ROOT())
    const again = recordingJob()
    await buildClientFolder(again.job, plan(fake, {}, '2026-11-09T09:00:00.000Z'))
    expect(await tree(ROOT())).toEqual(before)
    expect(again.notes).toMatchObject({ matters: 3, families: 2, added: { client: false, families: 0, matters: 0, files: 0 } })

    fake.rows = fake.rows.map(item => item.applicationNumber === 'EP23171862' ? { ...item, status: 'Grant of patent is intended' } : item)
    const changed = recordingJob()
    await buildClientFolder(changed.job, plan(fake, {}, '2026-11-09T09:00:00.000Z'))
    expect(changed.notes).toMatchObject({ added: { client: false, families: 0, matters: 0, files: 1 } })
    await buildClientFolder(recordingJob().job, plan(fake, {}, '2026-11-09T10:00:00.000Z'))
    fake.rows = fake.rows.map(item => item.applicationNumber === 'EP23171862' ? { ...item, status: 'The patent has been granted' } : item)
    await buildClientFolder(recordingJob().job, plan(fake, {}, '2026-11-09T11:00:00.000Z'))
    const office = path.join(ROOT(), FAMILY_1, 'EP 23 171 862', 'Office')
    expect((await readdir(office)).sort()).toEqual(['EP Register 2026-11-08.md', 'EP Register 2026-11-09 2.md', 'EP Register 2026-11-09.md', 'Publication EP 4 292 805 2026-11-08.md'])
  })

  it('finds a matter again where a person moved it, and skips one in Trash', async () => {
    const fake = data()
    const built = plan(fake)
    await buildClientFolder(recordingJob().job, built)
    await mkdir(path.join(ROOT(), 'Trash'))
    const moved = (from: string, to: string) => built.sources.moved('ws-1', from, to)
    await import('node:fs/promises').then(fs => fs.rename(path.join(ROOT(), FAMILY_2, 'EP 24 817 872'), path.join(ROOT(), 'Trash', 'EP 24 817 872')))
    await moved(`${FAMILY_2}/EP 24 817 872`, 'Trash/EP 24 817 872')
    const { job, steps, notes } = recordingJob()
    await buildClientFolder(job, built)
    expect(await tree(path.join(ROOT(), 'Trash'))).toEqual(['EP 24 817 872', 'EP 24 817 872/Client', 'EP 24 817 872/Office', 'EP 24 817 872/Office/EP Register 2026-11-08.md'])
    expect(steps.get('public-data')).toMatchObject({ total: 4, done: 4 })
    expect(notes).toMatchObject({ matters: 2, families: 2 })
  })

  it('reads only its own dated files, and writes a new one beside a file that a person changed', async () => {
    const fake = data()
    const office = path.join(ROOT(), FAMILY_1, 'EP 23 171 862', 'Office')
    await buildClientFolder(recordingJob().job, plan(fake))
    await writeFile(path.join(office, 'EP Register 2026-11-08.md'), 'As of then.\n\nolder copy')
    await writeFile(path.join(office, 'EP Register notes.md'), 'notes')
    await writeFile(path.join(office, 'EP Register 2026-11-01 3.md'), 'older')
    await writeFile(path.join(office, 'EP Register 2026-11-08 2.md'), 'a person wrote this')
    await buildClientFolder(recordingJob().job, plan(fake))
    expect((await readdir(office)).filter(name => name.startsWith('EP Register')).sort()).toEqual([
      'EP Register 2026-11-01 3.md', 'EP Register 2026-11-08 2.md', 'EP Register 2026-11-08 3.md', 'EP Register 2026-11-08.md', 'EP Register notes.md',
    ])
  })

  it('logs a failure that is not an error object', async () => {
    const fake = data()
    fake.publication = async () => { throw 'no text' }
    await buildClientFolder(recordingJob().job, plan(fake))
    expect(logs).toEqual(['ui-flowleap-folder: Add client public-data EP4292805: no text', 'ui-flowleap-folder: Add client public-data EP4820737: no text'])
  })

  it('names each item that failed and goes on with the rest', async () => {
    const fake = data()
    fake.failing.add('family:EP24817871')
    fake.failing.add('publication:EP4292805')
    const { job, steps } = recordingJob()
    await buildClientFolder(job, plan(fake, { request: input({ applications: [app('EP23171862'), app('EP24817871'), app('EP99999999')] }) }))
    expect(steps.get('matters')).toEqual({ total: 3, done: 1, failed: ['EP24817871', 'EP99999999'], state: 'failed' })
    expect(steps.get('public-data')).toEqual({ total: 2, done: 1, failed: ['EP4292805'], state: 'failed' })
    expect(logs).toEqual([
      'ui-flowleap-folder: Add client matters EP24817871: no answer for family:EP24817871',
      'ui-flowleap-folder: Add client matters EP99999999: EP99999999 is not in the EP Register',
      'ui-flowleap-folder: Add client public-data EP4292805: no answer for publication:EP4292805',
    ])
  })

  it('names a dated file that it could not write', async () => {
    const fake = data()
    const { job, steps } = recordingJob()
    const failingSources = sourceStore(path.join(base, 'state'))
    let records = 0
    const original = failingSources.record.bind(failingSources)
    failingSources.record = async (workspace, entry, value) => {
      records += 1
      if (value.kind === 'add-client' && value.from !== 'template' && value.role === undefined) throw new Error(`no record for ${entry}`)
      return original(workspace, entry, value)
    }
    await buildClientFolder(job, plan(fake, { sources: failingSources }))
    expect(steps.get('public-data')?.failed).toEqual(['EP23171862', 'EP4292805', 'EP24817871', 'EP24817872'])
    expect(steps.get('reference')).toEqual({ total: 1, done: 0, failed: [REFERENCE_FILE], state: 'failed' })
    expect(records).toBeGreaterThan(0)
  })

  it('makes the folder with the template only without the data plugin or names', async () => {
    const { job, steps, notes } = recordingJob()
    await buildClientFolder(job, plan(undefined))
    expect(await tree(ROOT())).toEqual(['00 Client', ABOUT_FILE])
    expect(steps.get('matters')).toEqual({ total: 0, done: 0, failed: [], state: 'done' })
    expect(steps.get('reference')).toEqual({ total: 0, done: 0, failed: [], state: 'done' })
    expect(notes).toMatchObject({ matters: 0, families: 0 })
    const fake = data()
    await buildClientFolder(recordingJob().job, plan(fake, { request: input({ names: [], applications: [app('EP23171862')] }) }))
    expect(await readFile(path.join(ROOT(), ABOUT_FILE), 'utf8')).toContain('Applicant names of the client group: Syntegon Technology GmbH.')
  })

  it('writes no about file twice and says when there are no names', async () => {
    await buildClientFolder(recordingJob().job, plan(undefined, { request: input({ names: [], applications: [] }) }))
    expect(await readFile(path.join(ROOT(), ABOUT_FILE), 'utf8')).toContain('Applicant names of the client group: none.')
  })

  it('stops at the next item when the plugin stops', async () => {
    const stop = new AbortController()
    const fake = data()
    const original = fake.family.bind(fake)
    fake.family = async (application) => { stop.abort(); return original(application) }
    await expect(buildClientFolder(recordingJob(stop.signal).job, plan(fake))).rejects.toThrow('stopped')
    const stopAgain = new AbortController()
    const failing = data()
    failing.family = async () => { stopAgain.abort(); throw new Error('cut') }
    await expect(buildClientFolder(recordingJob(stopAgain.signal).job, plan(failing))).rejects.toThrow('stopped')
  })

  it('names the client folder of a name with a separator safely and keeps the name itself in the About file', async () => {
    const { job, notes } = recordingJob()
    await buildClientFolder(job, plan(undefined, { request: input({ name: 'Novo Nordisk A/S', names: [], applications: [] }) }))
    expect(await readdir(clientsRoot)).toEqual(['Novo Nordisk A-S'])
    expect(await readFile(path.join(clientsRoot, 'Novo Nordisk A-S', ABOUT_FILE), 'utf8')).toMatch(/^# Novo Nordisk A\/S\n/u)
    expect(notes).toMatchObject({ folder: 'Novo Nordisk A-S' })
    expect([...workspaces.keys()]).toEqual([path.join(clientsRoot, 'Novo Nordisk A-S')])
  })

  it('refuses a client name that no folder can have', async () => {
    const refused = await buildClientFolder(recordingJob().job, plan(undefined, { request: input({ name: 'CON' }) })).catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(FolderError)
    expect((refused as FolderError).code).toBe('invalid-name')
  })

  it('refuses a link or a file at the client folder and writes nothing through it', async () => {
    const elsewhere = path.join(base, 'elsewhere')
    await mkdir(elsewhere)
    await mkdir(clientsRoot)
    await symlink(elsewhere, ROOT())
    const linked = await buildClientFolder(recordingJob().job, plan(undefined)).catch((error: unknown) => error)
    expect((linked as FolderError).code).toBe('outside')
    expect(await readdir(elsewhere)).toEqual([])
    expect(workspaces.size).toBe(0)
    await rm(ROOT())
    await writeFile(ROOT(), 'a file')
    await expect(buildClientFolder(recordingJob().job, plan(undefined))).rejects.toThrow()
  })

  it('refuses a link or a file where a folder of the template or an earlier build was', async () => {
    const fake = data()
    await buildClientFolder(recordingJob().job, plan(fake))
    const outside = path.join(base, 'outside')
    const matter = path.join(ROOT(), FAMILY_1, 'EP 23 171 862')
    await rename(matter, outside)
    await symlink(outside, matter)
    await rm(path.join(ROOT(), FAMILY_2, 'EP 24 817 871'), { recursive: true })
    await writeFile(path.join(ROOT(), FAMILY_2, 'EP 24 817 871'), 'a file')
    const { job, steps } = recordingJob()
    await buildClientFolder(job, plan(fake, { request: input({ applications: [app('EP23171862'), app('EP24817871')] }) }))
    expect(steps.get('matters')).toMatchObject({ done: 0, failed: ['EP23171862', 'EP24817871'] })
    expect(logs.join('\n')).toMatch(/EP23171862: .*is a link or a special file/u)
    expect(logs.join('\n')).toMatch(/EP24817871: .*is not a folder/u)
    await rm(path.join(ROOT(), '00 Client'), { recursive: true })
    await symlink(path.join(ROOT(), ABOUT_FILE), path.join(ROOT(), '00 Client'))
    const linked = await buildClientFolder(recordingJob().job, plan(fake)).catch((error: unknown) => error)
    expect((linked as FolderError).code).toBe('outside')
  })

  it('makes a new family folder when the family folder of an earlier build is in Trash', async () => {
    const fake = data()
    const built = plan(fake, { request: input({ applications: [app('EP24817871')] }) })
    await buildClientFolder(recordingJob().job, built)
    await mkdir(path.join(ROOT(), 'Trash'))
    await rename(path.join(ROOT(), FAMILY_2), path.join(ROOT(), 'Trash', FAMILY_2))
    await built.sources.moved('ws-1', FAMILY_2, `Trash/${FAMILY_2}`)
    const { job, steps } = recordingJob()
    await buildClientFolder(job, plan(fake, { request: input({ applications: [app('EP24817871'), app('EP24817872')] }) }))
    expect(steps.get('matters')).toEqual({ total: 2, done: 2, failed: [], state: 'done' })
    const family = 'EP 24 817 872 Air sampling device'
    expect(await readdir(path.join(ROOT(), family))).toEqual(['EP 24 817 872'])
    expect((await built.sources.read('ws-1')).get(family)).toMatchObject({ role: 'family', key: 'DE 102023133973' })
  })

  it('widens a running build request by a later one', () => {
    const later = input({ name: 'Syntegon AG', names: ['Syntegon AG'], applications: [app('EP24817871'), app('EP99999999')] })
    expect(widenBuild(input(), later)).toEqual({
      clientId: CLIENT, name: 'Syntegon AG', names: ['Syntegon Technology GmbH', 'Syntegon AG'],
      applications: [app('EP23171862'), app('EP24817871'), app('EP24817872'), app('EP99999999')],
    })
  })

  it('names folders and files as people read them', () => {
    expect(spacedPublication('EP4292805A1')).toBe('EP 4 292 805 A1')
    expect(spacedPublication('WO2024001')).toBe('WO2024001')
    expect(familyName('EP 23 171 862', undefined)).toBe('EP 23 171 862')
    expect(familyName('EP 23 171 862', '  ')).toBe('EP 23 171 862')
    expect(familyName('EP 23 215 725', 'METHOD FOR SEALING A STACK OF LAYERS OF A FIBRE-BASED PACKAGING MATERIAL')).toBe('EP 23 215 725 Method for sealing a stack of layers…')
    expect(familyName('EP 24 199 601', 'Method and device for joining or forming a fibre-based packing material')).toBe('EP 24 199 601 Method and device for joining or forming…')
    expect(familyName('EP 24 817 872', 'Air sampling device using UV light')).toBe('EP 24 817 872 Air sampling device using UV light')
    expect(familyName('EP 1', 'A / b\\c')).toBe('EP 1 A - b-c')
    expect(familyName('EP 1', 'One two three four five six seven eight nine')).toBe('EP 1 One two three four five six seven eight…')
    expect(familyName('EP 22 203 533', 'METHOD FOR COMPENSATING FOR TOLERANCES, AND HYDRAULIC SYSTEM')).toBe('EP 22 203 533 Method for compensating for tolerances…')
    expect(familyName('EP 1', 'Oneoneoneoneone twotwotwotwotwo in a and of b')).toBe('EP 1 Oneoneoneoneone twotwotwotwotwo…')
    expect(Buffer.byteLength(folderNameOf('Ü'.repeat(200)), 'utf8')).toBe(254)
    expect(familyName('EP 1', 'Ü'.repeat(60))).toBe(`EP 1 Ü${'ü'.repeat(39)}…`)
    expect(familyName('EP 1', `${'x'.repeat(60)} and more`)).toBe(`EP 1 ${'x'.repeat(40)}…`)
    expect(publicationBody({ publicationNumber: pub('EP4292805') })).toBe('# EP 4 292 805\n')
    expect(publicationBody({ publicationNumber: pub('EP4820738A1'), textFrom: wo('WO2025119775A1'), title: 'Air sampling device', abstract: 'A device.', claims: '1. A device.' }))
      .toBe('# EP 4 820 738 A1\n\n**Air sampling device**\n\nThe EPO holds no abstract and no claims of this Euro-PCT publication. The abstract and the claims are those of WO 2025/119775 A1, the international publication of the same application.\n\n## Abstract\n\nA device.\n\n## Claims\n\n1. A device.\n')
    expect(spacedWo('WO2025119775A1')).toBe('WO 2025/119775 A1')
    expect(spacedWo('WO2025')).toBe('WO2025')
    expect(registerBody(row({ applicationNumber: 'EP23171862' }))).toBe('# EP 23 171 862\n\n| Field | Value |\n|---|---|\n| Application | EP 23 171 862 |\n')
    expect(referenceBody([row({ applicationNumber: 'EP19794880' })])).toContain('| EP 19 794 880 |  |  |  |')
  })

  it('keeps the Add client source records apart from damaged ones', () => {
    expect(isSource({ kind: 'add-client', at: 'x', from: 'ep-register', role: 'matter', key: 'EP23171862' })).toBe(true)
    expect(isSource({ kind: 'add-client', at: 'x', from: 'patstat' })).toBe(false)
    expect(isSource({ kind: 'add-client', at: 'x', from: 'template', role: 'client' })).toBe(false)
    expect(isSource({ kind: 'add-client', at: 'x', from: 'template', key: 1 })).toBe(false)
    expect(isSource({ kind: 'upload' })).toBe(false)
    expect(isSource({ kind: 'other', at: 'x' })).toBe(false)
  })
})

describe('ClientFolder writes of Add client', () => {
  it('makes or uses a folder, refuses a file in its place, and writes a new file only', async () => {
    const root = path.join(base, 'Client')
    await mkdir(root)
    const folder = await ClientFolder.at(root)
    expect(await folder.ensure('', 'Office')).toEqual({ path: 'Office', made: true })
    expect(await folder.ensure('', 'Office')).toEqual({ path: 'Office', made: false })
    await writeFile(path.join(root, 'note'), 'x')
    await expect(folder.ensure('', 'note')).rejects.toMatchObject({ code: 'not-directory' })
    await expect(folder.ensure('', 'Trash')).resolves.toMatchObject({ made: true })
    await expect(folder.ensure('Trash', 'x')).rejects.toMatchObject({ code: 'in-trash' })
    expect(await folder.writeNew('Office', 'a.md', 'one')).toBe('Office/a.md')
    await expect(folder.writeNew('Office', 'a.md', 'two')).rejects.toMatchObject({ code: 'exists' })
    await expect(folder.writeNew('Trash', 'a.md', 'two')).rejects.toMatchObject({ code: 'in-trash' })
    expect(await folder.readText('Office/a.md')).toBe('one')
    await writeFile(path.join(root, 'Office', '.hidden'), 'x')
    await mkdir(path.join(root, 'Office', 'Sub'))
    expect(await folder.fileNames('Office')).toEqual(['a.md'])
  })

  it('passes on a disk fault that is not a taken name', async () => {
    const root = path.join(base, 'Client')
    await mkdir(root)
    const folder = await ClientFolder.at(root)
    await rm(root, { recursive: true })
    await expect(folder.ensure('', 'Office')).rejects.toMatchObject({ code: 'not-found' })
    await mkdir(root)
    await mkdir(path.join(root, 'Office'))
    const locked = path.join(root, 'Office')
    await import('node:fs/promises').then(fs => fs.chmod(locked, 0o500))
    await expect(folder.ensure('Office', 'Sub')).rejects.toMatchObject({ code: 'EACCES' })
    await expect(folder.writeNew('Office', 'a.md', 'x')).rejects.toMatchObject({ code: 'EACCES' })
    await import('node:fs/promises').then(fs => fs.chmod(locked, 0o700))
  })
})
