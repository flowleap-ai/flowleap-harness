/**
 * Fetch the skill pack the selected product pins and stage it for packaging: `<target>/skill-pack/skills`
 * holds the pack's skills folder at the pinned commit, and `pack.json` records the repository, the commit and
 * the manifest version. A stage that already holds the pinned commit is kept. A product without a skill pack
 * removes the stage.
 */

import { execFile } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { readDesktopProduct, resolveDesktopProductName } from './desktop-product.mjs'

const run = promisify(execFile)

/**
 * Read the staged `pack.json`, or undefined when the stage holds another commit or none.
 * @param {string} destination - The stage directory.
 * @param {string} commit - The pinned commit.
 * @returns {{ repository: string, commit: string, version: string } | undefined} The staged record.
 */
export function readStagedSkillPack(destination, commit) {
  const path = join(destination, 'pack.json')
  if (!existsSync(path) || !existsSync(join(destination, 'skills'))) return undefined
  const record = JSON.parse(readFileSync(path, 'utf8'))
  return record.commit === commit ? record : undefined
}

/**
 * Stage one pinned skill pack.
 * @param {import('./desktop-product.d.mts').DesktopSkillPackRecord} spec - The product's skill pack record.
 * @param {string} destination - The stage directory; replaced unless it already holds `spec.commit`.
 * @returns {Promise<{ repository: string, commit: string, version: string }>} The staged record.
 */
export async function prepareDesktopSkillPack(spec, destination) {
  const staged = readStagedSkillPack(destination, spec.commit)
  if (staged !== undefined) return staged
  mkdirSync(dirname(destination), { recursive: true })
  const scratch = mkdtempSync(join(dirname(destination), '.skill-pack-'))
  try {
    const repository = join(scratch, 'repository')
    await run('git', ['init', '-q', repository])
    await run('git', ['-C', repository, 'fetch', '-q', '--depth', '1', spec.repository, spec.commit])
    await run('git', ['-C', repository, 'checkout', '-q', 'FETCH_HEAD'])
    const { stdout } = await run('git', ['-C', repository, 'rev-parse', 'HEAD'])
    if (stdout.trim() !== spec.commit) throw new Error(`desktop skill pack: ${spec.repository} fetched ${stdout.trim()}, not ${spec.commit}`)
    const skills = join(repository, spec.skills)
    if (!existsSync(skills)) throw new Error(`desktop skill pack: ${spec.skills} does not exist at ${spec.commit}`)
    const version = JSON.parse(readFileSync(join(repository, spec.manifest), 'utf8')).version
    if (typeof version !== 'string' || version === '') throw new Error(`desktop skill pack: ${spec.manifest} has no version at ${spec.commit}`)
    const stage = join(scratch, 'stage')
    cpSync(skills, join(stage, 'skills'), { recursive: true })
    const record = { repository: spec.repository, commit: spec.commit, version }
    writeFileSync(join(stage, 'pack.json'), `${JSON.stringify(record, null, 2)}\n`)
    rmSync(destination, { recursive: true, force: true })
    renameSync(stage, destination)
    return record
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  const product = readDesktopProduct(resolveDesktopProductName())
  const destination = resolveDesktopTargetBuildPaths().skillPack
  if (product.skillPack === null) {
    rmSync(destination, { recursive: true, force: true })
  } else {
    const record = await prepareDesktopSkillPack(product.skillPack, destination)
    console.info(`desktop skill pack: ${record.repository} ${record.commit} (version ${record.version}) in ${destination}`)
  }
}
