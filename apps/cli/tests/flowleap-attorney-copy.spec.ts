/**
 * An attorney sees no developer product name in the FlowLeap profiles (flowleap-harness#84). For each mounted row of
 * `flowleap-web` and `flowleap-desktop`, the English entries of the row package's `locale/en.json` metadata and its
 * browser dictionaries (`src/client/**` modules whose file name names a locale) must not name DeepSeek or DSH. Two
 * entries pass: a key that the FlowLeap brand replaces (`brandCopy`, matched by key), and an entry of `UNREACHABLE`
 * whose condition holds in the composed rows. A row counts as mounted unless its `disabled` is the literal `true`.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { composeEntries, loadProfile } from '@deepseek-ai/dsh-app-boot'

const installAnchor = fileURLToPath(new URL('../package.json', import.meta.url))
const DEVELOPER_NAME = /DeepSeek|\bDSH\b|\bdsh-/u
const BRAND = { productName: 'FlowLeap Patent AI', shortName: 'FlowLeap' } as const

type Rows = ReturnType<typeof composeEntries>
const row = (rows: Rows, id: string) => rows.find(entry => entry.id === id)
const off = (rows: Rows, id: string): boolean => row(rows, id)?.disabled === true

/** Entries no attorney reaches, keyed `<package> <key>`, each with the composed-row condition that makes it so. */
const UNREACHABLE: Readonly<Record<string, (rows: Rows) => boolean>> = {
  // The Creator mode guide shows only for the `cordis` preset.
  '@deepseek-ai/dsh-client-ui-agent-preset guideCordisExplanation': rows => off(rows, 'preset-cordis'),
  '@deepseek-ai/dsh-client-ui-agent-preset guideCordisUsage': rows => off(rows, 'preset-cordis'),
  // The Creator drafts of "Create your plugin".
  ...Object.fromEntries(['sidebar', 'conversation', 'rightbar'].map(region => [
    `@deepseek-ai/dsh-client-ui-entry-customization createPrompt.${region}`,
    (rows: Rows) => (row(rows, 'entry-customization')?.config as { createPlugin?: boolean } | undefined)?.createPlugin === false,
  ])),
  // The DeepSeek account model group needs the DeepSeek account route.
  '@deepseek-ai/dsh-client-ui-settings-models deepSeekAccount': rows => off(rows, 'llm-deepseek-account'),
}

/** One dictionary entry that names the developer product. */
interface Hit { readonly packageName: string; readonly key: string; readonly text: string }

/**
 * Collect the developer names in the English entries of one dictionary record.
 * @param packageName - the package that owns the record.
 * @param record - the English dictionary.
 * @param replaced - the keys the brand replaces.
 * @returns one hit per English value that names the developer product and is not replaced.
 */
function developerNames(packageName: string, record: Readonly<Record<string, unknown>>, replaced: ReadonlySet<string>): Hit[] {
  return Object.entries(record).flatMap(([key, text]) =>
    typeof text === 'string' && DEVELOPER_NAME.test(text) && !replaced.has(key) ? [{ packageName, key, text }] : [])
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** English records of one locale module: an `en` export, or an `en` field of an exported record. */
function englishRecords(module: Record<string, unknown>): Record<string, unknown>[] {
  return Object.entries(module).flatMap(([name, value]) => {
    if (name === 'en' && isRecord(value)) return [value]
    if (isRecord(value) && isRecord(value.en)) return [value.en]
    return []
  })
}

async function packageHits(packageName: string, replaced: ReadonlySet<string>): Promise<Hit[]> {
  const root = dirname(createRequire(installAnchor).resolve(`${packageName}/package.json`))
  const hits: Hit[] = []
  const meta = join(root, 'locale', 'en.json')
  if (existsSync(meta)) hits.push(...developerNames(packageName, JSON.parse(readFileSync(meta, 'utf8')) as Record<string, unknown>, replaced))
  const client = join(root, 'src', 'client')
  if (!existsSync(client)) return hits
  const files = readdirSync(client, { recursive: true, withFileTypes: true })
    .filter(file => file.isFile() && /locale/iu.test(file.name) && /\.tsx?$/u.test(file.name))
  for (const file of files) {
    const module = await import(join(file.parentPath, file.name)) as Record<string, unknown>
    for (const record of englishRecords(module)) hits.push(...developerNames(packageName, record, replaced))
  }
  return hits
}

/** The keys the FlowLeap brand replaces, read through the bundle that mounts the brand row. */
async function brandKeys(): Promise<Set<string>> {
  const bundle = createRequire(installAnchor).resolve('@deepseek-ai/dsh-flowleap-web/package.json')
  const locales = createRequire(bundle).resolve('@deepseek-ai/dsh-client-ui-brand-flowleap/src/client/locales.ts')
  const { brandCopy } = await import(locales) as {
    brandCopy: (brand: typeof BRAND, locale: 'en') => readonly { readonly dict: Readonly<Record<string, string>> }[]
  }
  return new Set(brandCopy(BRAND, 'en').flatMap(override => Object.keys(override.dict)))
}

/** Developer names an attorney can see in one profile, as `<package> <key>: <text>`. */
async function visibleDeveloperNames(name: string): Promise<string[]> {
  const home = mkdtempSync(join(tmpdir(), 'dsh-flowleap-copy-'))
  try {
    const profile = loadProfile('dsh', name, installAnchor, home)
    const rows = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches], () => {})
    const packages = [...new Set(rows.filter(entry => entry.disabled !== true)
      .map(entry => entry.name.split('/').slice(0, 2).join('/'))
      .filter(packageName => packageName.startsWith('@deepseek-ai/')))].sort()
    const replaced = await brandKeys()
    const hits = (await Promise.all(packages.map(packageName => packageHits(packageName, replaced)))).flat()
    return hits
      .filter(hit => UNREACHABLE[`${hit.packageName} ${hit.key}`]?.(rows) !== true)
      .map(hit => `${hit.packageName} ${hit.key}: ${hit.text}`)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

describe('attorney-visible copy of the FlowLeap profiles', () => {
  it('rejects an English entry that names DeepSeek or DSH unless the brand replaces its key', () => {
    expect(developerNames('p', { a: 'Open DeepSeek', b: 'DSH Local Build', c: 'FlowLeap', d: 'dsh-foo' }, new Set(['b'])).map(hit => hit.key))
      .toEqual(['a', 'd'])
  })

  it.each(['flowleap-web', 'flowleap-desktop'])('%s: no mounted row shows DeepSeek or DSH to an attorney', async (name) => {
    expect(await visibleDeveloperNames(name)).toEqual([])
  }, 60_000)

  it('the upstream web profile still shows its own names, so the scan reads real dictionaries', async () => {
    expect(await visibleDeveloperNames('web')).toEqual(expect.arrayContaining([
      expect.stringMatching(/^@deepseek-ai\/dsh-client-ui-entry-customization createPrompt\.sidebar: .*DSH/u),
    ]))
  }, 60_000)
})
