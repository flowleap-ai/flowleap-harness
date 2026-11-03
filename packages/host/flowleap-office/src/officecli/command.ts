/**
 * The closed set of OfficeCLI calls this provider makes. A call is a typed {@link OfficeCommand}; {@link argvOf} is
 * the only way to turn it into arguments, through one row per command kind. No row runs `install`, `skills`, `mcp`,
 * `plugins`, `watch`, `open`, `close`, `refresh`, `dump`, `import`, a `view` mode other than `text` or `outline`, or the
 * binary with no arguments. Every argument is checked by {@link refuseUrls}.
 * @module
 */

import { FlowleapOfficeError } from '../error.ts'

/** One OfficeCLI call. File names are relative to the call folder. */
export type OfficeCommand =
  | { readonly kind: 'version' }
  | { readonly kind: 'create'; readonly file: string }
  | { readonly kind: 'merge'; readonly template: string; readonly output: string; readonly data: string }
  | { readonly kind: 'batch'; readonly file: string; readonly input: string }
  | { readonly kind: 'validate'; readonly file: string }
  | { readonly kind: 'view'; readonly file: string; readonly mode: 'text' | 'outline' }
  | { readonly kind: 'query'; readonly file: string; readonly selector: 'revision' | 'cell' }

/** The kind of an OfficeCLI call. */
export type OfficeCommandKind = OfficeCommand['kind']

type ArgvTable = { readonly [K in OfficeCommandKind]: (command: Extract<OfficeCommand, { kind: K }>) => readonly string[] }

/** The argument row of each command kind. `batch` keeps OfficeCLI's default atomic mode: one failed item applies none. */
const ARGV: ArgvTable = {
  version: () => ['--version'],
  create: command => ['create', command.file, '--json'],
  merge: command => ['merge', command.template, command.output, '--data', command.data, '--json'],
  batch: command => ['batch', command.file, '--input', command.input, '--json'],
  validate: command => ['validate', command.file, '--json'],
  view: command => ['view', command.file, command.mode, '--json'],
  query: command => ['query', command.file, command.selector, '--json'],
}

/**
 * The arguments of one call, after the binary path.
 * @param command - the call.
 * @returns the arguments; never empty.
 * @throws {FlowleapOfficeError} `url_refused` when an argument starts with `http://` or `https://`.
 */
export function argvOf(command: OfficeCommand): readonly string[] {
  // The table is keyed by kind; the cast picks the row whose parameter type is this command's member.
  const row = ARGV[command.kind] as (command: OfficeCommand) => readonly string[]
  const argv = row(command)
  refuseUrls(argv)
  return argv
}

/** A value OfficeCLI could fetch: it starts with `http://` or `https://`, after trimming, in any letter case. */
const URL_VALUE = /^\s*https?:\/\//iu

/**
 * Refuse every string in a JSON value that OfficeCLI could read as a remote resource.
 * @param value - argv, a batch item, or field data.
 * @throws {FlowleapOfficeError} `url_refused` naming the first such string.
 */
export function refuseUrls(value: unknown): void {
  if (typeof value === 'string') {
    if (URL_VALUE.test(value)) throw new FlowleapOfficeError('url_refused', `A value starts with a web address, which the Office engine could fetch: "${value.trim().slice(0, 80)}". Write it without http:// or https://.`)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) refuseUrls(item)
    return
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      refuseUrls(key)
      refuseUrls(item)
    }
  }
}
