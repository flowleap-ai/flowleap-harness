/**
 * The client folder build of Add client: the client folder and its workspace, a family folder and a matter folder for
 * each EP application with the firm's template folders, the public data as dated files with their source, and the
 * reference list. Every write goes through `ClientFolder`, inside `clientsRoot`, and never replaces a file or a folder.
 * A second build of the same client finds its family and matter folders by their source records, keeps them, and adds
 * only what is missing: a new dated file only where the data differs from the last dated file.
 * @module
 */

import { lstat, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { EpApplicationNumber, PatentData, PublicationText, RegisterRow } from '@deepseek-ai/dsh-flowleap-connectors'
import { ClientFolder, FolderError, freeName } from '../folder.ts'
import { folderNameOf, isTrashPath, type AddClientOrigin, type FolderSource } from '../route.ts'
import type { RecordStore } from '../sources.ts'
import { messageOf, type BuildJob } from './jobs.ts'
import { townOf } from './identity.ts'
import { readGroup } from './review.ts'
import { clientFolderName, type BuildRequest } from './wire.ts'

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

/**
 * One build request that does the work of two: the request of a running build and a request that came while it ran.
 * @param running - the request of the running build.
 * @param next - the later request.
 * @returns the later request with the names and the applications of both, each once.
 */
export function widenBuild(running: BuildInput, next: BuildInput): BuildInput {
  return {
    ...next,
    names: [...new Set([...running.names, ...next.names])],
    applications: [...new Set([...running.applications, ...next.applications])],
  }
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

/** The most characters of the title in a family folder name, so the family folders stay apart in a narrow tree. */
const FAMILY_TITLE_CHARS = 40

/** The words that do not end a cut title, each after a space, and the punctuation before a cut. */
const WEAK_ENDS = / (?:a|an|and|for|in|of|on|or|the|to|with)$|[,;:.]+$/iu

/**
 * A title in sentence case: the EP Register writes many titles in capitals.
 * @param title - the title as the register writes it.
 * @returns the title; a title in capitals has a capital first letter only.
 */
function sentenceCase(title: string): string {
  if (title !== title.toUpperCase()) return title
  const lower = title.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/**
 * A WO publication number as people read it.
 * @param publication - `WO`, the year, six digits and a kind code.
 * @returns such as `WO 2025/119775 A1`.
 */
export function spacedWo(publication: string): string {
  const match = /^WO(\d{4})(\d{6})([A-Z]\d?)$/u.exec(publication)
  return match === null ? publication : `WO ${match[1]}/${match[2]} ${match[3]}`
}

/**
 * The name of a family folder: the application number of its first matter and a short title in sentence case, such
 * as `EP 23 171 862 Method and apparatus for producing…`.
 * @param application - the first matter's application number as people read it.
 * @param title - the title of the family's first matter.
 * @returns the folder name.
 */
export function familyName(application: string, title: string | undefined): string {
  const full = sentenceCase((title ?? '').trim().replace(/\s+/gu, ' '))
  const chars = Array.from(new Intl.Segmenter().segment(full), item => item.segment)
  if (chars.length <= FAMILY_TITLE_CHARS) return folderNameOf(full === '' ? application : `${application} ${full}`)
  const head = chars.slice(0, FAMILY_TITLE_CHARS + 1).join('')
  const space = head.lastIndexOf(' ')
  // A first word longer than the limit is cut inside the word.
  let short = space > 0 ? head.slice(0, space) : chars.slice(0, FAMILY_TITLE_CHARS).join('')
  while (WEAK_ENDS.test(short)) short = short.replace(WEAK_ENDS, '')
  return folderNameOf(`${application} ${short}…`)
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
  if (text.textFrom !== undefined) {
    parts.push(`The EPO holds no abstract and no claims of this Euro-PCT publication. The abstract and the claims are those of ${spacedWo(text.textFrom)}, the international publication of the same application.`)
  }
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

  /** The family and matter folders and the dated files that this build made. */
  readonly added = { client: false, families: 0, matters: 0, files: 0 }

  /** Record the source of an entry that this build wrote. */
  async record(entry: string, source: Omit<Extract<FolderSource, { kind: 'add-client' }>, 'kind' | 'at'>): Promise<void> {
    await this.plan.sources.record(this.workspace, entry, { kind: 'add-client', at: this.plan.now().toISOString(), ...source })
  }

  /**
   * Check a family or matter folder that an earlier build made and its source record names.
   * @param relative - the folder relative to the client folder.
   * @returns the folder.
   * @throws FolderError `outside` when it is a link or leads out of the client folder, `not-directory` for a file.
   */
  async found(relative: string): Promise<string> {
    if (!(await this.folder.entry(relative)).isDirectory) throw new FolderError('not-directory', `${relative} is not a folder`)
    return relative
  }

  /** Make or use a folder; record it when this build made it. */
  async ensureFolder(parent: string, name: string, source: Omit<Extract<FolderSource, { kind: 'add-client' }>, 'kind' | 'at'>): Promise<string> {
    const made = await this.folder.ensure(parent, name)
    if (made.made) {
      await this.record(made.path, source)
      if (source.role === 'family') this.added.families += 1
      if (source.role === 'matter') this.added.matters += 1
    }
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
    this.added.files += 1
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
 * The family and matter folders that earlier builds made, by their key. A family folder in Trash is left out, so a new
 * matter of that family gets a new family folder. A matter folder in Trash stays: the person moved that matter away.
 * @param records - the source records of the client folder.
 * @param role - the folder role.
 * @returns the folder paths by key.
 */
function recorded(records: ReadonlyMap<string, FolderSource>, role: 'family' | 'matter'): Map<string, string> {
  const out = new Map<string, string>()
  for (const [entry, source] of records) {
    if (role === 'family' && isTrashPath(entry)) continue
    if (source.kind === 'add-client' && source.role === role && source.key !== undefined) out.set(source.key, entry)
  }
  return out
}

/**
 * Make the client folder in `clientsRoot`, or use the folder that has its name.
 * @param clientsRoot - the folder of the client folders.
 * @param name - the client name.
 * @returns the client folder's path, and true when this call made it.
 * @throws FolderError `invalid-name` when no folder can have the name, `outside` when a link or a file has the name.
 */
async function clientFolderAt(clientsRoot: string, name: string): Promise<{ readonly root: string; readonly made: boolean }> {
  const folder = clientFolderName(name)
  if (folder === undefined) throw new FolderError('invalid-name', `the client name ${JSON.stringify(name)} cannot be a folder name`)
  const root = path.join(clientsRoot, folder)
  const made = await mkdir(root, { recursive: true }) !== undefined
  // The folder name has no separator, so a real folder (not a link) at this path is inside clientsRoot.
  if (!(await lstat(root)).isDirectory()) throw new FolderError('outside', `${root} is a link or a file, not a client folder`)
  return { root, made }
}

/**
 * Build or complete a client folder.
 * @param job - the job that reports each step.
 * @param plan - the build plan.
 * @returns once the build ended; a failed item shows in its step.
 * @throws FolderError when the client folder cannot be made, or a link or a file has its name; the job then says
 *   `failed`.
 */
export async function buildClientFolder(job: BuildJob, plan: BuildPlan): Promise<void> {
  const { request, data, template } = plan
  const stopped = () => { if (job.signal.aborted) throw new Error('the build was stopped') }

  await job.start('folder', 1)
  const { root, made } = await clientFolderAt(plan.clientsRoot, request.name)
  const workspace = await plan.createWorkspace(root, request.name)
  const writer = new FolderWriter(await ClientFolder.at(root), workspace.id, plan)
  writer.added.client = made
  await writer.template('', template.client)
  if (!(await writer.folder.fileNames('')).includes(ABOUT_FILE)) {
    const about = await writer.folder.writeNew('', ABOUT_FILE, aboutMarkdown(request, plan.now()))
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
    plan.log(`ui-flowleap-folder: Add client ${step} ${item}: ${messageOf(error)}`)
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
          // The family read can lack the family id; the earliest priority then groups the family's matters.
          const key = read.familyId ?? read.priorities[0]?.number ?? application
          const earlier = families.get(key)
          family = earlier === undefined
            ? await writer.ensureFolder('', familyName(spacedApplication(application), row.title), { from: 'ep-register', role: 'family', key })
            : await writer.found(earlier)
          families.set(key, family)
          matter = await writer.ensureFolder(family, spacedApplication(application), { from: 'ep-register', role: 'matter', key: application })
          matters.set(application, matter)
        } else {
          await writer.found(matter)
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
  // A matter that a person moved to Trash stays there: it counts as no matter and gets no new data.
  const live = built.filter(item => !isTrashPath(item.path))
  await job.note({ matters: live.length, families: new Set(live.map(item => item.family)).size, added: { ...writer.added } })
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
  await job.note({ added: { ...writer.added } })
}

/** The Markdown of the About file in the client folder; file content, written in English like the dated files. */
function aboutMarkdown(request: BuildInput, at: Date): string {
  return `# ${request.name}\n\nAdd client made this client folder on ${at.toISOString().slice(0, 10)}. It has a family folder for each EP family and a matter folder for each EP application of the client at your firm, each with the firm's template folders.\n\nEach file of public data is a dated copy: its first line says when FlowLeap read it and from which source. A copy does not change when the source changes. Check for new matters reads the sources again and writes a new dated file only where the data changed.\n\nApplicant names of the client group: ${request.names.length === 0 ? 'none' : request.names.join('; ')}.\n`
}
