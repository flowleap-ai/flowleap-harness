/**
 * The client folder build of Add client: the client folder and its workspace, a family folder and a matter folder for
 * each EP application with the firm's template folders, the public data as dated files with their source, and the
 * reference list. Every write goes through `ClientFolder`, inside `clientsRoot`, and never replaces a file or a folder.
 * A second build of the same client finds its family and matter folders by their source records, keeps them, and adds
 * only what is missing: a new dated file only where the data differs from the last dated file.
 * @module
 */

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { EpApplicationNumber, PatentData, PublicationText, RegisterRow } from '@deepseek-ai/dsh-flowleap-connectors'
import { ClientFolder, FolderError, checkName, freeName } from '../folder.ts'
import { isTrashPath, type AddClientOrigin, type FolderSource } from '../route.ts'
import type { RecordStore } from '../sources.ts'
import type { BuildJob } from './jobs.ts'
import { townOf } from './identity.ts'
import { readGroup } from './review.ts'
import type { BuildRequest } from './wire.ts'

/** The folders that Add client makes in each client folder and each matter folder. */
export interface FolderTemplate {
  /** The folders at the client folder root, such as `00 Client`. */
  client: string[]
  /** The folders of each matter folder. */
  matter: string[]
  /** The matter folder that takes the dated files of public data; one of `matter`. */
  publicData: string
}

/** A checked build request: its application numbers are EP application numbers. */
export interface BuildInput extends Omit<BuildRequest, 'applications'> {
  readonly applications: readonly EpApplicationNumber[]
}

/** What one build needs. */
export interface BuildPlan {
  readonly request: BuildInput
  /** The patent data Service; undefined when no data plugin is in the runtime: the folder has the template only. */
  readonly data: PatentData | undefined
  /** The folder that holds the client folders. */
  readonly clientsRoot: string
  readonly template: FolderTemplate
  /** The row cap of one register query. */
  readonly maxRows: number
  readonly sources: RecordStore<FolderSource>
  /** Make the client folder a workspace; a second call for the same path gives the same workspace. */
  readonly createWorkspace: (folder: string, title: string) => Promise<{ readonly id: string }>
  readonly now: () => Date
  /** Logs why one item failed; the step names the item, and Try again runs it again. */
  readonly log: (message: string) => void
}

/** The file at the client folder root that says what the folder is. */
export const ABOUT_FILE = 'About this folder.md'

/** The base name of the dated EP Register files. */
export const REGISTER_FILE = 'EP Register'

/** The base name of the dated reference list. */
export const REFERENCE_FILE = 'Reference - at other firms'

/** The longest folder name in UTF-8 bytes. */
const MAX_NAME_BYTES = 255

/** The name of each source in a dated file. */
const SOURCE_NAME: Readonly<Record<Exclude<AddClientOrigin, 'template'>, string>> = {
  'ep-register': 'the EP Register',
  'epo-publication': 'the EPO publication server',
}

/**
 * An EP application number as people read it.
 * @param application - `EP` and 8 digits.
 * @returns such as `EP 23 171 862`.
 */
export function spacedApplication(application: string): string {
  return `EP ${application.slice(2, 4)} ${application.slice(4, 7)} ${application.slice(7)}`
}

/**
 * An EP publication number as people read it.
 * @param publication - `EP`, digits and an optional kind.
 * @returns such as `EP 4 292 805 A1`.
 */
export function spacedPublication(publication: string): string {
  const match = /^EP(\d)(\d{3})(\d{3})([A-Z]\d?)?$/u.exec(publication)
  if (match === null) return publication
  return `EP ${match[1]} ${match[2]} ${match[3]}${match[4] === undefined ? '' : ` ${match[4]}`}`
}

/** A text as a folder name: no separators or NUL, no space at the ends, at most 255 UTF-8 bytes. */
function folderName(text: string): string {
  let name = text.replace(/[/\\\0]/gu, '-').replace(/\s+/gu, ' ').trim()
  while (Buffer.byteLength(name, 'utf8') > MAX_NAME_BYTES) name = name.slice(0, -1).trimEnd()
  return name
}

/**
 * The name of a family folder: the title, and the earliest priority when there is one.
 * @param title - the title of the family's first matter.
 * @param priority - the earliest priority.
 * @param fallback - the name when there is no title.
 * @returns the folder name.
 */
export function familyName(
  title: string | undefined, priority: { readonly number: string; readonly date?: string } | undefined, fallback: string,
): string {
  const suffix = priority === undefined ? '' : ` (priority ${priority.number}${priority.date === undefined ? '' : `, ${priority.date}`})`
  const head = folderName(title ?? fallback)
  const room = MAX_NAME_BYTES - Buffer.byteLength(suffix, 'utf8')
  let cut = head
  while (Buffer.byteLength(cut, 'utf8') > room) cut = cut.slice(0, -1).trimEnd()
  return folderName(`${cut}${suffix}`)
}

/** A Markdown table cell. */
function cell(text: string): string {
  return text.replaceAll('|', '\\|').replace(/\s+/gu, ' ')
}

/** A Markdown table of field and value rows; an empty value is left out. */
function table(rows: readonly (readonly [string, string | undefined])[]): string {
  return ['| Field | Value |', '|---|---|', ...rows.filter((row): row is readonly [string, string] => row[1] !== undefined && row[1] !== '').map(([field, value]) => `| ${cell(field)} | ${cell(value)} |`)].join('\n')
}

/**
 * The body of the EP Register file of one matter: the register fields without any address.
 * @param row - the register row.
 * @returns the Markdown body.
 */
export function registerBody(row: RegisterRow): string {
  return `# ${spacedApplication(row.applicationNumber)}\n\n${table([
    ['Application', spacedApplication(row.applicationNumber)],
    ['Publication', row.publicationNumber === undefined ? undefined : spacedPublication(row.publicationNumber)],
    ['Title', row.title],
    ['Applicants', row.applicants.join('; ')],
    ['Representatives of record', row.representatives.map(party => party.name).join('; ')],
    ['Representative since', row.representativeSince],
    ['Opponents', row.opponents.map(party => party.filedOn === undefined ? party.name : `${party.name} (filed ${party.filedOn})`).join('; ')],
    ['Status', row.status],
    ['Filing date', row.filed],
    ['Publication date', row.published],
  ])}\n`
}

/**
 * The body of the publication file of one matter.
 * @param text - the publication's text.
 * @returns the Markdown body.
 */
export function publicationBody(text: PublicationText): string {
  const parts = [`# ${spacedPublication(text.publicationNumber)}`]
  if (text.title !== undefined) parts.push(`**${text.title}**`)
  if (text.abstract !== undefined) parts.push(`## Abstract\n\n${text.abstract}`)
  if (text.claims !== undefined) parts.push(`## Claims\n\n${text.claims}`)
  return `${parts.join('\n\n')}\n`
}

/**
 * The body of the reference list: the group's applications at other firms, with the town of the representative.
 * @param rows - the rows at other firms.
 * @returns the Markdown body.
 */
export function referenceBody(rows: readonly RegisterRow[]): string {
  const lines = rows.map((row) => {
    const [representative] = row.representatives
    const town = representative === undefined ? '' : townOf(representative) ?? ''
    return `| ${spacedApplication(row.applicationNumber)} | ${cell(row.title ?? '')} | ${cell(town)} | ${row.filed ?? ''} |`
  })
  return `# Applications at other firms\n\nThese EP applications of the group name another representative. FlowLeap does not add them to the client folder. The list names the town of the representative, not the firm.\n\n| Application | Title | Representative in | Filed |\n|---|---|---|---|\n${lines.join('\n')}\n`
}

/** The first line of a dated file. */
function asOfLine(at: Date, from: Exclude<AddClientOrigin, 'template'>): string {
  const iso = at.toISOString()
  return `As of ${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC, from ${SOURCE_NAME[from]}. A dated copy: it does not change when the source changes.`
}

/** The body of a dated file, after its first line and the blank line. */
function bodyOf(text: string): string {
  const cut = text.indexOf('\n\n')
  return cut === -1 ? '' : text.slice(cut + 2)
}

/** The date and the copy count of a dated file name of a base, or undefined for another name. */
function datedOf(base: string, name: string): readonly [string, number] | undefined {
  if (!name.startsWith(`${base} `) || !name.endsWith('.md')) return undefined
  const match = /^(\d{4}-\d{2}-\d{2})(?: (\d+))?$/u.exec(name.slice(base.length + 1, -3))
  return match?.[1] === undefined ? undefined : [match[1], Number(match[2] ?? 1)]
}

/** The writes of one build inside one client folder, with their source records. */
class FolderWriter {
  /**
   * @param folder - the client folder.
   * @param workspace - its workspace id, the key of its source records.
   * @param plan - the build plan.
   */
  constructor(readonly folder: ClientFolder, private readonly workspace: string, private readonly plan: BuildPlan) {}

  /** Record the source of an entry that this build wrote. */
  async record(entry: string, source: Omit<Extract<FolderSource, { kind: 'add-client' }>, 'kind' | 'at'>): Promise<void> {
    await this.plan.sources.record(this.workspace, entry, { kind: 'add-client', at: this.plan.now().toISOString(), ...source })
  }

  /** Make or use a folder; record it when this build made it. */
  async ensureFolder(parent: string, name: string, source: Omit<Extract<FolderSource, { kind: 'add-client' }>, 'kind' | 'at'>): Promise<string> {
    const made = await this.folder.ensure(parent, name)
    if (made.made) await this.record(made.path, source)
    return made.path
  }

  /** Make or use the template folders in a folder. */
  async template(parent: string, names: readonly string[]): Promise<void> {
    for (const name of names) await this.ensureFolder(parent, name, { from: 'template' })
  }

  /**
   * Write a dated file of public data, unless the last dated file of the same base has the same body.
   * @returns the new file, or undefined when nothing changed.
   */
  async dated(parent: string, base: string, body: string, from: Exclude<AddClientOrigin, 'template'>): Promise<string | undefined> {
    const dated = (await this.folder.fileNames(parent))
      .map(name => ({ name, at: datedOf(base, name) }))
      .filter((item): item is { name: string; at: readonly [string, number] } => item.at !== undefined)
      .sort((a, b) => a.at[0] === b.at[0] ? b.at[1] - a.at[1] : b.at[0].localeCompare(a.at[0]))
    const [latest] = dated
    const prefix = parent === '' ? '' : `${parent}/`
    if (latest !== undefined && bodyOf(await this.folder.readText(`${prefix}${latest.name}`)) === body) return undefined
    const now = this.plan.now()
    const name = await freeName(await this.folder.folder(parent), `${base} ${now.toISOString().slice(0, 10)}.md`)
    const written = await this.folder.writeNew(parent, name, `${asOfLine(now, from)}\n\n${body}`)
    await this.record(written, { from })
    return written
  }
}

/** One matter folder of a build. */
interface BuiltMatter {
  readonly application: string
  readonly path: string
  readonly family: string
  readonly row: RegisterRow
}

/**
 * The family and matter folders that earlier builds made, by their key.
 * @param records - the source records of the client folder.
 * @param role - the folder role.
 * @returns the folder paths by key.
 */
function recorded(records: ReadonlyMap<string, FolderSource>, role: 'family' | 'matter'): Map<string, string> {
  const out = new Map<string, string>()
  for (const [entry, source] of records) {
    if (source.kind === 'add-client' && source.role === role && source.key !== undefined) out.set(source.key, entry)
  }
  return out
}

/**
 * Build or complete a client folder.
 * @param job - the job that reports each step.
 * @param plan - the build plan.
 * @returns once the build ended; a failed item shows in its step.
 * @throws FolderError when the client folder cannot be made; the job then says `failed`.
 */
export async function buildClientFolder(job: BuildJob, plan: BuildPlan): Promise<void> {
  const { request, data, template } = plan
  const stopped = () => { if (job.signal.aborted) throw new Error('the build was stopped') }

  await job.start('folder', 1)
  await mkdir(plan.clientsRoot, { recursive: true })
  const root = path.join(plan.clientsRoot, checkName(request.name))
  await mkdir(root, { recursive: true })
  const workspace = await plan.createWorkspace(root, request.name)
  const writer = new FolderWriter(await ClientFolder.at(root), workspace.id, plan)
  await writer.template('', template.client)
  if (!(await writer.folder.fileNames('')).includes(ABOUT_FILE)) {
    const about = await writer.folder.writeNew('', ABOUT_FILE, aboutText(request, plan.now()))
    await writer.record(about, { from: 'template' })
  }
  await job.note({ workspace: workspace.id, folder: path.basename(root) })
  await job.advance('folder')
  await job.finish('folder')

  const records = await plan.sources.read(workspace.id)
  const matters = recorded(records, 'matter')
  const families = recorded(records, 'family')
  const group = data === undefined || request.names.length === 0
    ? []
    : (await readGroup(data, request.names, plan.maxRows, job.signal)).rows
  const rows = new Map<string, RegisterRow>(group.map(row => [row.applicationNumber, row]))
  const built: BuiltMatter[] = []
  const failed = async (step: 'matters' | 'public-data' | 'reference', item: string, error: unknown): Promise<void> => {
    stopped()
    plan.log(`ui-flowleap-folder: Add client ${step} ${item}: ${error instanceof Error ? error.message : String(error)}`)
    await job.fail(step, item)
  }
  await job.start('matters', data === undefined ? 0 : request.applications.length)
  if (data !== undefined) {
    for (const application of request.applications) {
      stopped()
      try {
        const row = rows.get(application) ?? await data.registerRecord(application, job.signal)
        if (row === undefined) throw new FolderError('not-found', `${application} is not in the EP Register`)
        let matter = matters.get(application)
        let family: string
        if (matter === undefined) {
          const read = await data.family(application, job.signal)
          const key = read.familyId ?? application
          family = families.get(key) ?? await writer.ensureFolder('', familyName(row.title, read.priorities[0], spacedApplication(application)), { from: 'ep-register', role: 'family', key })
          families.set(key, family)
          matter = await writer.ensureFolder(family, spacedApplication(application), { from: 'ep-register', role: 'matter', key: application })
          matters.set(application, matter)
        } else {
          family = path.posix.dirname(matter)
        }
        if (!isTrashPath(matter)) await writer.template(matter, template.matter)
        built.push({ application, path: matter, family, row })
        await job.advance('matters')
      } catch (error: unknown) {
        await failed('matters', application, error)
      }
    }
  }
  await job.finish('matters')
  await job.note({ matters: built.length, families: new Set(built.map(item => item.family)).size })

  const live = built.filter(item => !isTrashPath(item.path))
  await job.start('public-data', live.reduce((count, item) => count + (item.row.publicationNumber === undefined ? 1 : 2), 0))
  // A matter is built only with the data plugin, so `live` is empty without it.
  if (data !== undefined) {
    for (const item of live) {
      stopped()
      const dir = `${item.path}/${template.publicData}`
      try {
        await writer.dated(dir, REGISTER_FILE, registerBody(item.row), 'ep-register')
        await job.advance('public-data')
      } catch (error: unknown) {
        await failed('public-data', item.application, error)
      }
      const publication = item.row.publicationNumber
      if (publication === undefined) continue
      try {
        const text = await data.publication(publication, job.signal)
        if (text.title !== undefined || text.abstract !== undefined || text.claims !== undefined) {
          await writer.dated(dir, `Publication ${spacedPublication(publication)}`, publicationBody(text), 'epo-publication')
        }
        await job.advance('public-data')
      } catch (error: unknown) {
        await failed('public-data', publication, error)
      }
    }
  }
  await job.finish('public-data')

  const others = group.filter(row => !request.applications.includes(row.applicationNumber))
  await job.start('reference', others.length === 0 ? 0 : 1)
  if (others.length > 0) {
    try {
      await writer.dated('', REFERENCE_FILE, referenceBody(others), 'ep-register')
      await job.advance('reference')
    } catch (error: unknown) {
      await failed('reference', REFERENCE_FILE, error)
    }
  }
  await job.finish('reference')
}

/** The text of the About file. */
function aboutText(request: BuildInput, at: Date): string {
  return `# ${request.name}\n\nAdd client made this client folder on ${at.toISOString().slice(0, 10)}. It has a family folder for each EP family and a matter folder for each EP application of the client at your firm, each with the firm's template folders.\n\nEach file of public data is a dated copy: its first line says when FlowLeap read it and from which source. A copy does not change when the source changes. Check for new matters reads the sources again and writes a new dated file only where the data changed.\n\nApplicant names of the client group: ${request.names.length === 0 ? 'none' : request.names.join('; ')}.\n`
}
