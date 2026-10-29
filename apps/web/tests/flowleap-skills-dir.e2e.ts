/**
 * The flowleap-web skill pack folder (flowleap-harness#63): FLOWLEAP_SKILLS_DIR names it, the release image's pack is
 * the default, and a set folder that does not exist fails the row at load with a named error.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import { FiberState } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'

const BUNDLE = fileURLToPath(new URL('../../../packages/bundle/flowleap-web', import.meta.url))

/** Boot flowleap-web with FLOWLEAP_SKILLS_DIR set to `skills`; the paid MCP server is an external input and stays off. */
async function launch(root: string, skills: string): Promise<WebScaffold> {
  const previous = process.env.FLOWLEAP_SKILLS_DIR
  process.env.FLOWLEAP_SKILLS_DIR = skills
  onTestFinished(() => {
    if (previous === undefined) Reflect.deleteProperty(process.env, 'FLOWLEAP_SKILLS_DIR')
    else process.env.FLOWLEAP_SKILLS_DIR = previous
  })
  const fixtureBundle = join(root, 'fixture-bundle')
  await mkdir(fixtureBundle, { recursive: true })
  await writeFile(join(fixtureBundle, 'package.json'), JSON.stringify({
    name: 'flowleap-skills-dir-fixture', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } },
  }))
  await writeFile(join(fixtureBundle, 'cordis.patch.yml'), '- id: mcp-flowleap\n  disabled: true\n')
  return await launchWebScaffold({
    profile: { packages: [{ dir: BUNDLE, enabled: true }, { dir: fixtureBundle, enabled: true }] },
    harnessHome: join(root, 'home'),
    keepBundleSkillRow: true,
  })
}

it('loads the skill pack that FLOWLEAP_SKILLS_DIR names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-flowleap-skills-'))
  const resources: { scaffold?: WebScaffold } = {}
  onTestFinished(async () => {
    try { await resources.scaffold?.close() } finally { await rm(root, { recursive: true, force: true }) }
  })
  const pack = join(root, 'pack')
  await mkdir(join(pack, 'prior-art-search'), { recursive: true })
  await writeFile(join(pack, 'prior-art-search', 'SKILL.md'),
    '---\nname: prior-art-search\ndescription: Find prior art for an invention.\n---\n\nSearch the offices.\n')
  resources.scaffold = await launch(root, pack)
  const skills = await resources.scaffold.ctx.skills.list({ cwd: resources.scaffold.workspaceCwd })
  expect(skills.find(skill => skill.name === 'prior-art-search')).toMatchObject({ description: 'Find prior art for an invention.' })
}, 120_000)

it('fails the skill pack row at load when FLOWLEAP_SKILLS_DIR names a folder that does not exist', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-flowleap-skills-missing-'))
  const resources: { scaffold?: WebScaffold } = {}
  onTestFinished(async () => {
    try { await resources.scaffold?.close() } finally { await rm(root, { recursive: true, force: true }) }
  })
  const missing = join(root, 'no-such-pack')
  resources.scaffold = await launch(root, missing)
  const entry = [...resources.scaffold.ctx.loader.entries()].find(item => item.options.id === 'skill-filesystem')
  expect(entry?.fiber?.state).toBe(FiberState.FAILED)
  await expect(entry?.fiber?.await()).rejects.toThrow(`custom skill directory "${missing}" does not exist`)
}, 120_000)
