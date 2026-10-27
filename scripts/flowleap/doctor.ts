/**
 * FlowLeap harness doctor: one plain-text (or JSON) report a firm's IT can send
 * to FlowLeap support without reading it for secrets first.
 *
 * The report covers the harness version and commit, Node and pnpm, the profile
 * and the FlowLeap rows of `--dump-config` (with the `PATCH_FILES` overlays the
 * image entrypoint applies), the keys the runtime uses (connector presence and
 * reference names with the store that supplies each, never a value: the stores
 * are the ones the composed `credentials` row names, read with the provider's
 * precedence), `flowleap mcp --check`, the vendored
 * connector library pin, the brand, disk free under `DSH_HOME`, and the last
 * error lines of a harness log when a path is given. Every line passes the
 * scrub before it is printed; `--scrub` applies the same scrub to stdin for the
 * support log bundle.
 *
 *   pnpm run flowleap:doctor                       # text report
 *   pnpm run flowleap:doctor -- --json             # the same as JSON
 *   pnpm run flowleap:doctor -- --log harness.log  # plus the last 50 error lines
 *   pnpm run flowleap:doctor -- --url https://harness-alice.tailnet.ts.net/ --token <launch token>
 *                                                  # plus the reachability check of a running instance
 *   doctor --scrub [--config] < file               # scrub stdin (--config also blanks apiKey/token/secret values)
 *
 * Inside the Docker image the same script runs as `harness-doctor` with
 * `HARNESS_ROOT=/opt/harness`.
 * @module
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, statfsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { text } from 'node:stream/consumers'
import { parseArgs } from 'node:util'
import { load as loadYaml } from 'js-yaml'

/** The four connectors and the record fields each one stores, as `packages/host/flowleap-connectors/src/types.ts` declares them. */
const CONNECTOR_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'epo-ops': ['consumerKey', 'consumerSecret'],
  'uspto-odp': ['apiKey'],
  'semantic-scholar': ['apiKey'],
  mistral: ['apiKey'],
}

/** The record scope the host plugin writes under. */
const CREDENTIAL_SCOPE = 'flowleap-connectors'

/** The `--dump-config` row ids the FlowLeap layer owns or patches. */
const FLOWLEAP_ROW_IDS = [
  'mcp-flowleap',
  'flowleap-connectors',
  'ui-settings-flowleap-connectors',
  'ui-brand-flowleap',
  'flowleap-prompt',
  'skill-filesystem',
  'agent-preset-registry',
  'agent-default-model',
  'llm-pi-ai',
  'system-prompt',
] as const

/** Lines of a harness log that count as errors. */
const ERROR_LINE = /\b(error|exception|fatal|unhandled|refused|failed)\b/i

/**
 * Redact secrets from one text. The patterns are the support contract: FlowLeap
 * personal tokens, OpenAI-style keys, bearer headers, `token=` query values,
 * hex strings of 32 or more digits, and base64-looking runs longer than 24
 * characters. The base64 rule asks for a digit, an upper-case and a lower-case
 * letter so that package names, session directory names and long words stay
 * readable; a classic padded base64 run (ending in `=`) is redacted outright.
 * @param text - any text, one or many lines.
 * @returns the text with every match replaced by a `[redacted…]` marker.
 */
export function scrub(text: string): string {
  return text
    .replaceAll(/fl_pat_[A-Za-z0-9_-]+/g, 'fl_pat_[redacted]')
    .replaceAll(/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-[redacted]')
    .replaceAll(/\bBearer\s+\S+/g, 'Bearer [redacted]')
    .replaceAll(/\btoken=[^&\s"'<>]+/g, 'token=[redacted]')
    .replaceAll(/(?<![A-Za-z0-9])[0-9a-fA-F]{32,}(?![A-Za-z0-9])/g, '[redacted:hex]')
    .replaceAll(/(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/]{24,}={1,2}(?![A-Za-z0-9+/=_-])/g, '[redacted:base64]')
    .replaceAll(/(?<![A-Za-z0-9+/=_.-])[A-Za-z0-9+=_-]{25,}(?![A-Za-z0-9+/=_.-])/g, match =>
      /[A-Z]/.test(match) && /[a-z]/.test(match) && /\d/.test(match) ? '[redacted:base64]' : match)
}

/**
 * Blank the value of every key that starts with `apiKey`, contains `secret`, or
 * is or ends in `token` (`accessToken`, `refresh_token`; not `maxOutputTokens`)
 * in a YAML or `key: value` text, whatever the value was.
 * @param text - the `--dump-config` output or any YAML.
 * @returns the text with those values replaced by `'[redacted]'`.
 */
export function redactConfigValues(text: string): string {
  return text.replaceAll(
    /^(?<prefix>\s*(?:-\s+)?(?:apiKey[\w.-]*|[\w.-]*secret[\w.-]*|[\w.-]*token)\s*:\s*)(?<value>\S.*)$/gim,
    "$<prefix>'[redacted]'",
  )
}

/** One line of the text report; `null` detail means a heading. */
interface ReportLine {
  section: string
  key: string
  value: string
}

/** Options the command line sets. */
interface DoctorOptions {
  json: boolean
  profile: string
  dshHome: string
  root: string
  /** Overlay files applied to `--dump-config`, as the image entrypoint applies `PATCH_FILES`. */
  patches: string[]
  logPath?: string
  url?: string
  token?: string
}

/** The two credential stores of `dsh-credentials-local`, in precedence order. */
type StoreRole = 'read-only' | 'managed'

/** One credential store the composed `credentials` row names. */
interface StoreState {
  role: StoreRole
  path: string
  state: 'read' | 'absent' | 'unreadable'
}

/** One connector's presence: never a value. */
interface ConnectorPresence {
  configured: boolean
  /** The store whose record the runtime uses; absent while not configured. */
  source?: StoreRole
  fields: readonly string[]
  missingFields: string[]
}

/** The machine-readable report; the text report is rendered from it. */
interface DoctorReport {
  generatedAt: string
  harness: { version: string; commit: string; root: string; builtAt?: string }
  runtime: { node: string; pnpm: string; platform: string }
  profile: { name: string; dshHome: string; rows: Record<string, 'present' | 'absent'>; dumpConfigError?: string }
  keys: {
    stores: StoreState[]
    connectors: Record<string, ConnectorPresence>
    /** Every stored reference name with the store that supplies it. */
    refs: Record<string, StoreRole>
  }
  flowleapCli: { version: string; mcpCheck: string }
  vendoredLibrary: { backendCommit: string; contentHash: string; upstreamVersion: string; syncedAt: string } | { error: string }
  brand: { productName: string; path: string } | { error: string }
  disk: { path: string; freeBytes: number; totalBytes: number } | { error: string }
  log?: { path: string; errorLines: string[]; error?: string }
  instance?: { url: string; reachable: boolean; detail: string }
}

/**
 * Read one JSON file as a record.
 * @param path - absolute path.
 * @returns the parsed object, or `undefined` when it is missing or not an object.
 */
function readJsonRecord(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/**
 * Read a string member of a record.
 * @param record - the record, possibly undefined.
 * @param key - the member name.
 * @returns the string, or `unknown` when absent or not a string.
 */
function stringOf(record: Record<string, unknown> | undefined, key: string): string {
  const value = record?.[key]
  return typeof value === 'string' && value !== '' ? value : 'unknown'
}

/**
 * Run a command and return its combined output, never throwing.
 * @param command - executable.
 * @param args - arguments.
 * @param options - cwd, timeout and extra environment.
 * @returns stdout followed by stderr, trimmed, or an `unavailable (…)` line.
 */
function runQuiet(command: string, args: string[], options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): string {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 60_000,
    env: { ...process.env, ...options.env },
  })
  if (result.error !== undefined) return `unavailable (${result.error.message})`
  const output = `${result.stdout}${result.stderr}`.trim()
  if (result.status !== 0) return `${output}\n(exit status ${String(result.status)})`.trim()
  return output
}

/**
 * Find the harness root: `HARNESS_ROOT`, else the repository this script sits in.
 * @returns an absolute directory.
 */
function defaultRoot(): string {
  const fromEnv = process.env.HARNESS_ROOT?.trim()
  if (fromEnv !== undefined && fromEnv !== '') return resolve(fromEnv)
  return resolve(import.meta.dirname, '..', '..')
}

/**
 * The first existing path among candidates.
 * @param candidates - absolute paths in preference order.
 * @returns the first that exists, or undefined.
 */
function firstExisting(candidates: string[]): string | undefined {
  return candidates.find(candidate => existsSync(candidate))
}

/**
 * Version and commit of this harness: the deployed `BUILD_INFO.json` when the
 * image wrote one, else the root manifest and `git rev-parse`.
 * @param root - the harness root.
 * @returns version, commit and (in the image) the build date.
 */
function harnessIdentity(root: string): DoctorReport['harness'] {
  const buildInfo = readJsonRecord(join(root, 'BUILD_INFO.json'))
  const manifest = readJsonRecord(join(root, 'package.json'))
  const version = stringOf(buildInfo, 'version') !== 'unknown' ? stringOf(buildInfo, 'version') : stringOf(manifest, 'version')
  let commit = stringOf(buildInfo, 'commit')
  if (commit === 'unknown') {
    try {
      commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    } catch {
      commit = 'unknown (no git checkout)'
    }
  }
  const builtAt = stringOf(buildInfo, 'builtAt')
  return { version, commit, root, ...builtAt === 'unknown' ? {} : { builtAt } }
}

/**
 * The `dsh` entry point to run `--dump-config` with: `DSH_BIN`, the deployed
 * `lib/bin.js`, the built CLI, else the source entry through tsx.
 * @param root - the harness root.
 * @returns command and leading arguments.
 */
function dshCommand(root: string): [command: string, args: string[]] {
  const fromEnv = process.env.DSH_BIN?.trim()
  if (fromEnv !== undefined && fromEnv !== '') return [process.execPath, [fromEnv]]
  const built = firstExisting([
    join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    join(root, 'apps', 'cli', 'lib', 'bin.js'),
  ])
  if (built !== undefined) return [process.execPath, [built]]
  return [process.execPath, ['--import', 'tsx/esm', join(root, 'apps', 'cli', 'src', 'bin.ts')]]
}

/**
 * Resolve a file of a workspace package through the dsh installation, the way
 * the profile layer itself does (`createRequire(installAnchor)`): works in the
 * source tree and inside a deployed closure, whatever pnpm's layout.
 * @param root - the harness root.
 * @param specifier - a package subpath such as `@deepseek-ai/dsh-flowleap-web/brand/brand.json`.
 * @returns the absolute path, or undefined when it is not resolvable.
 */
function resolveThroughDsh(root: string, specifier: string): string | undefined {
  const [, [entry]] = dshCommand(root)
  const anchor = entry === undefined || entry.startsWith('--') ? join(root, 'apps', 'cli', 'package.json') : entry
  try {
    // The real path: in a pnpm closure the dsh package is a link into `.pnpm/`, and its
    // dependencies sit beside the link's target, not beside the link.
    return createRequire(realpathSync(anchor)).resolve(specifier)
  } catch {
    return undefined
  }
}

/**
 * Which FlowLeap rows the composed profile tree contains.
 * @param root - the harness root.
 * @param profile - the profile name.
 * @param dshHome - the harness home the dump reads and initializes.
 * @param patches - overlay files, applied in order after the profile.
 * @returns per-row presence, with the dump's error when it failed, and the dump text.
 */
function profileRows(root: string, profile: string, dshHome: string, patches: readonly string[]): { profile: DoctorReport['profile']; dump: string } {
  const [command, args] = dshCommand(root)
  const result = spawnSync(command, [...args, ...patches.flatMap(patch => ['--patch', patch]), '--profile', profile, '--dump-config'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, DSH_HOME: dshHome },
  })
  const rows: Record<string, 'present' | 'absent'> = {}
  const ids = new Set([...result.stdout.matchAll(/^\s*-\s+id:\s*([\w.-]+)\s*$/gm)].map(match => match[1] ?? ''))
  for (const id of FLOWLEAP_ROW_IDS) rows[id] = ids.has(id) ? 'present' : 'absent'
  const failure = result.error === undefined
    ? result.status === 0 ? undefined : (result.stderr.trim() === '' ? `exit status ${String(result.status)}` : result.stderr.trim())
    : result.error.message
  return {
    profile: {
      name: profile,
      dshHome,
      rows,
      ...failure === undefined ? {} : { dumpConfigError: failure },
    },
    dump: result.stdout,
  }
}

/**
 * The config of the composed `credentials` row, cut out of the `--dump-config`
 * text: the entry's own block, parsed alone because other rows may carry
 * `!!js` tags a plain YAML reader refuses.
 * @param dump - the `--dump-config` output.
 * @returns the row's `path` and `readOnlyPath` when they are plain strings.
 */
function credentialsRowConfig(dump: string): { path?: string; readOnlyPath?: string } {
  const lines = dump.split('\n')
  const start = lines.findIndex(line => /^\s*- id: credentials\s*$/.test(line))
  if (start === -1) return {}
  const indent = (lines[start] ?? '').indexOf('-')
  const block = [lines[start] ?? '']
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== '' && !line.trim().startsWith('#') && line.search(/\S/) <= indent) break
    block.push(line)
  }
  try {
    const parsed: unknown = loadYaml(block.map(line => line.slice(indent)).join('\n'))
    const config = Array.isArray(parsed) ? (parsed[0] as { config?: unknown } | undefined)?.config : undefined
    if (typeof config !== 'object' || config === null) return {}
    const { path, readOnlyPath } = config as Record<string, unknown>
    return {
      ...typeof path === 'string' ? { path } : {},
      ...typeof readOnlyPath === 'string' ? { readOnlyPath } : {},
    }
  } catch {
    return {}
  }
}

/** The two sections of one credentials document; values are kept only long enough to test emptiness. */
interface StoreSections {
  refs: Record<string, unknown>
  records: Record<string, unknown>
}

/**
 * Read one credentials document.
 * @param path - the document.
 * @returns its state and, when read, its two sections.
 */
function readStore(path: string): { state: StoreState['state']; sections?: StoreSections } {
  if (!existsSync(path)) return { state: 'absent' }
  try {
    const document: unknown = loadYaml(readFileSync(path, 'utf8'))
    const fields = typeof document === 'object' && document !== null ? document as Record<string, unknown> : {}
    const section = (name: string): Record<string, unknown> => {
      const value = fields[name]
      return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
    }
    return { state: 'read', sections: { refs: section('refs'), records: section('records') } }
  } catch {
    return { state: 'unreadable' }
  }
}

/**
 * The fields of one connector record that are missing or empty.
 * @param record - the stored record, of any type.
 * @param fields - the fields the connector needs.
 * @returns the missing fields, or `undefined` when the value is no `grant` record at all.
 */
function missingConnectorFields(record: unknown, fields: readonly string[]): string[] | undefined {
  if (typeof record !== 'object' || record === null) return undefined
  const { kind, payload } = record as { kind?: unknown; payload?: unknown }
  if (kind !== 'grant' || typeof payload !== 'object' || payload === null) return undefined
  const values = payload as Record<string, unknown>
  return fields.filter((field) => {
    const value = values[field]
    return typeof value !== 'string' || value.trim() === ''
  })
}

/**
 * The keys the runtime uses, with the precedence of `dsh-credentials-local`:
 * the read-only document (`readOnlyPath`) wins over the managed one (`path`,
 * else `.credentials.yaml` under the harness home). A connector is configured
 * the way the host plugin's `describe()` decides it: a `grant` record under
 * `flowleap-connectors/<id>` whose payload carries every declared field
 * non-empty. Values are read to test emptiness and dropped at once; nothing
 * but names and booleans leaves this function.
 * @param dump - the `--dump-config` output of the composed profile.
 * @param dshHome - the harness home, for the managed document's default path.
 * @returns the stores, one presence per connector, and the reference names.
 */
function keysInUse(dump: string, dshHome: string): DoctorReport['keys'] {
  const config = credentialsRowConfig(dump)
  const candidates: Array<{ role: StoreRole; path: string }> = [
    ...config.readOnlyPath === undefined ? [] : [{ role: 'read-only' as const, path: resolve(config.readOnlyPath) }],
    { role: 'managed', path: resolve(config.path ?? join(dshHome, '.credentials.yaml')) },
  ]
  const stores = candidates.map(store => ({ ...store, ...readStore(store.path) }))
  const connectors: Record<string, ConnectorPresence> = {}
  for (const [id, fields] of Object.entries(CONNECTOR_FIELDS)) {
    // The first store holding the record supplies it, complete or not, as in the provider.
    const store = stores.find(candidate => candidate.sections?.records[`${CREDENTIAL_SCOPE}/${id}`] !== undefined)
    const missing = store === undefined
      ? undefined
      : missingConnectorFields(store.sections?.records[`${CREDENTIAL_SCOPE}/${id}`], fields)
    connectors[id] = missing === undefined || store === undefined
      ? { configured: false, fields, missingFields: [...fields] }
      : { configured: missing.length === 0, ...missing.length === 0 ? { source: store.role } : {}, fields, missingFields: missing }
  }
  const refs: Record<string, StoreRole> = {}
  for (const store of [...stores].reverse()) {
    for (const [name, value] of Object.entries(store.sections?.refs ?? {})) {
      if (typeof value === 'string' && value !== '') refs[name] = store.role
    }
  }
  return {
    stores: stores.map(({ role, path, state }) => ({ role, path, state })),
    connectors,
    refs: Object.fromEntries(Object.entries(refs).sort(([left], [right]) => left.localeCompare(right))),
  }
}

/**
 * The vendored `@flowleap/connectors` pin, shortened so the scrub keeps it.
 * @param root - the harness root.
 * @returns the pin, or the reason it is missing.
 */
function vendoredPin(root: string): DoctorReport['vendoredLibrary'] {
  const path = firstExisting([
    join(root, 'vendor', 'flowleap-connectors', 'SYNC.json'),
    join(root, 'flowleap', 'SYNC.json'),
  ])
  const record = path === undefined ? undefined : readJsonRecord(path)
  if (record === undefined) return { error: `SYNC.json not found under ${root}` }
  return {
    backendCommit: stringOf(record, 'backendCommit').slice(0, 12),
    contentHash: stringOf(record, 'contentHash').slice(0, 12),
    upstreamVersion: stringOf(record, 'upstreamVersion'),
    syncedAt: stringOf(record, 'syncedAt'),
  }
}

/**
 * The brand file's product name: `FLOWLEAP_BRAND_PATH`, the bundle in the
 * source tree, or the bundle inside a deployed `node_modules`.
 * @param root - the harness root.
 * @returns product name and path, or the reason it is missing.
 */
function brand(root: string): DoctorReport['brand'] {
  const fromEnv = process.env.FLOWLEAP_BRAND_PATH?.trim()
  const resolved = resolveThroughDsh(root, '@deepseek-ai/dsh-flowleap-web/brand/brand.json')
  const path = firstExisting([
    ...fromEnv !== undefined && fromEnv !== '' ? [resolve(fromEnv)] : [],
    join(root, 'packages', 'bundle', 'flowleap-web', 'brand', 'brand.json'),
    ...resolved === undefined ? [] : [resolved],
  ])
  const record = path === undefined ? undefined : readJsonRecord(path)
  if (path === undefined || record === undefined) return { error: `brand.json not found under ${root}` }
  return { productName: stringOf(record, 'productName'), path }
}

/**
 * Free and total bytes of the file system holding the harness home.
 * @param dshHome - the harness home.
 * @returns the figures, or the reason they are missing.
 */
function diskFree(dshHome: string): DoctorReport['disk'] {
  let probe = dshHome
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe)
  try {
    const stats = statfsSync(probe)
    return { path: probe, freeBytes: stats.bavail * stats.bsize, totalBytes: stats.blocks * stats.bsize }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * The last 50 error lines of a harness log.
 * @param path - the log file.
 * @returns the lines, scrubbed later with the rest of the report.
 */
function logErrors(path: string): NonNullable<DoctorReport['log']> {
  try {
    const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(line => ERROR_LINE.test(line))
    return { path, errorLines: lines.slice(-50) }
  } catch (error) {
    return { path, errorLines: [], error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Reachability of a running instance: the index route must answer the launch
 * token with a 303 and a session cookie, then serve the page to that cookie.
 * The token and cookie are used for the two requests and never reported.
 * @param url - the public root of the instance.
 * @param token - its launch token.
 * @returns whether the exchange worked and a one-line detail.
 */
async function probeInstance(url: string, token: string): Promise<NonNullable<DoctorReport['instance']>> {
  const root = url.endsWith('/') ? url : `${url}/`
  try {
    const exchange = await fetch(`${root}?token=${encodeURIComponent(token)}`, { redirect: 'manual' })
    const cookie = exchange.headers.get('set-cookie')
    if (exchange.status !== 303 || cookie === null) {
      return { url: root, reachable: false, detail: `index answered ${String(exchange.status)} without a session cookie (expected 303 and Set-Cookie)` }
    }
    const page = await fetch(root, { headers: { cookie: cookie.split(';')[0] ?? '' } })
    const html = await page.text()
    const title = /<title>(?<title>[^<]*)<\/title>/i.exec(html)?.groups?.title ?? '(no title)'
    return { url: root, reachable: page.status === 200, detail: `index ${String(page.status)}, title "${title}"` }
  } catch (error) {
    return { url: root, reachable: false, detail: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Assemble the report.
 * @param options - the command line.
 * @returns the report, not yet scrubbed.
 */
async function collect(options: DoctorOptions): Promise<DoctorReport> {
  const { profile, dump } = profileRows(options.root, options.profile, options.dshHome, options.patches)
  const report: DoctorReport = {
    generatedAt: new Date().toISOString(),
    harness: harnessIdentity(options.root),
    runtime: {
      node: process.version,
      pnpm: runQuiet('pnpm', ['--version'], { timeoutMs: 20_000 }).split('\n')[0] ?? 'unavailable',
      platform: `${process.platform} ${process.arch}`,
    },
    profile,
    keys: keysInUse(dump, options.dshHome),
    flowleapCli: {
      version: runQuiet('flowleap', ['--version'], { timeoutMs: 20_000 }),
      mcpCheck: runQuiet('flowleap', ['mcp', '--check'], { timeoutMs: 90_000 }),
    },
    vendoredLibrary: vendoredPin(options.root),
    brand: brand(options.root),
    disk: diskFree(options.dshHome),
  }
  if (options.logPath !== undefined) report.log = logErrors(options.logPath)
  if (options.url !== undefined && options.token !== undefined) report.instance = await probeInstance(options.url, options.token)
  return report
}

/**
 * Format bytes as GiB with one decimal.
 * @param bytes - a byte count.
 * @returns for example `12.3 GiB`.
 */
function gib(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`
}

/**
 * Render the report as aligned plain text.
 * @param report - the assembled report.
 * @returns the text, one `section  key  value` line per fact.
 */
function renderText(report: DoctorReport): string {
  const lines: ReportLine[] = []
  const add = (section: string, key: string, value: string): void => {
    lines.push({ section, key, value })
  }
  add('report', 'generated', report.generatedAt)
  add('harness', 'version', report.harness.version)
  add('harness', 'commit', report.harness.commit)
  add('harness', 'root', report.harness.root)
  if (report.harness.builtAt !== undefined) add('harness', 'built', report.harness.builtAt)
  add('runtime', 'node', report.runtime.node)
  add('runtime', 'pnpm', report.runtime.pnpm)
  add('runtime', 'platform', report.runtime.platform)
  add('profile', 'name', report.profile.name)
  add('profile', 'dsh home', report.profile.dshHome)
  if (report.profile.dumpConfigError !== undefined) add('profile', 'dump-config', `failed: ${report.profile.dumpConfigError.split('\n')[0] ?? ''}`)
  for (const [id, state] of Object.entries(report.profile.rows)) add('profile row', id, state)
  for (const store of report.keys.stores) add('key store', store.role, `${store.path} (${store.state})`)
  for (const [id, presence] of Object.entries(report.keys.connectors)) {
    add('connector', id, presence.configured
      ? `configured: yes (${String(presence.source)} store)`
      : `configured: no (missing ${presence.missingFields.join(', ')})`)
  }
  for (const [name, role] of Object.entries(report.keys.refs)) add('key', name, `${role} store`)
  add('flowleap cli', 'version', report.flowleapCli.version.split('\n')[0] ?? '')
  for (const line of report.flowleapCli.mcpCheck.split('\n')) add('flowleap mcp --check', '', line)
  if ('error' in report.vendoredLibrary) {
    add('vendored library', 'error', report.vendoredLibrary.error)
  } else {
    add('vendored library', 'backend commit', report.vendoredLibrary.backendCommit)
    add('vendored library', 'content hash', report.vendoredLibrary.contentHash)
    add('vendored library', 'upstream version', report.vendoredLibrary.upstreamVersion)
    add('vendored library', 'synced', report.vendoredLibrary.syncedAt)
  }
  if ('error' in report.brand) add('brand', 'error', report.brand.error)
  else add('brand', 'product name', `${report.brand.productName} (${report.brand.path})`)
  if ('error' in report.disk) add('disk', 'error', report.disk.error)
  else add('disk', 'free', `${gib(report.disk.freeBytes)} of ${gib(report.disk.totalBytes)} on ${report.disk.path}`)
  if (report.log !== undefined) {
    add('log', 'path', report.log.path)
    if (report.log.error !== undefined) add('log', 'error', report.log.error)
    add('log', 'error lines', String(report.log.errorLines.length))
    for (const line of report.log.errorLines) add('log line', '', line)
  }
  if (report.instance !== undefined) {
    add('instance', 'url', report.instance.url)
    add('instance', 'reachable', report.instance.reachable ? 'yes' : 'no')
    add('instance', 'detail', report.instance.detail)
  }
  const width = Math.max(...lines.map(line => `${line.section} ${line.key}`.trim().length))
  return lines.map(line => `${`${line.section} ${line.key}`.trim().padEnd(width)}  ${line.value}`).join('\n')
}

/**
 * Parse the command line.
 * @param argv - arguments after the script.
 * @returns the options, or the scrub mode.
 */
function parseCommandLine(argv: string[]): { mode: 'scrub'; config: boolean } | { mode: 'report'; options: DoctorOptions } {
  const { values } = parseArgs({
    args: argv,
    options: {
      json: { type: 'boolean', default: false },
      scrub: { type: 'boolean', default: false },
      config: { type: 'boolean', default: false },
      profile: { type: 'string', default: 'flowleap-web' },
      'dsh-home': { type: 'string' },
      root: { type: 'string' },
      log: { type: 'string' },
      url: { type: 'string' },
      token: { type: 'string' },
    },
    strict: true,
  })
  if (values.scrub) return { mode: 'scrub', config: values.config }
  const dshHome = values['dsh-home'] ?? process.env.DSH_HOME ?? join(process.env.HOME ?? process.env.USERPROFILE ?? '.', '.dsh')
  return {
    mode: 'report',
    options: {
      json: values.json,
      profile: values.profile,
      dshHome: resolve(dshHome),
      patches: (process.env.PATCH_FILES ?? '').split(/\s+/).filter(patch => patch !== ''),
      root: values.root === undefined ? defaultRoot() : resolve(values.root),
      ...values.log === undefined ? {} : { logPath: resolve(values.log) },
      ...values.url === undefined ? {} : { url: values.url },
      ...values.token === undefined ? {} : { token: values.token },
    },
  }
}

/**
 * Entry point.
 * @returns when the report or the scrubbed text is written.
 */
async function main(): Promise<void> {
  const parsed = parseCommandLine(process.argv.slice(2))
  if (parsed.mode === 'scrub') {
    const input = await text(process.stdin)
    process.stdout.write(scrub(parsed.config ? redactConfigValues(input) : input))
    return
  }
  const report = await collect(parsed.options)
  const output = parsed.options.json ? JSON.stringify(report, null, 2) : renderText(report)
  process.stdout.write(`${scrub(output)}\n`)
}

main().catch((error: unknown) => {
  console.error(`flowleap doctor: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
