/** A product's pinned skill pack: the build stages the pinned commit, the package carries it, and the shell names it to the Host. */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DESKTOP_PRODUCT, parseDesktopProduct, readDesktopProductFile } from '../src/product.ts'
import { readPackagedSkillPack, skillPackAboutValues, skillPackHostEnvironment } from '../src/skill-pack.ts'
import { prepareDesktopSkillPack } from '../scripts/prepare-skill-pack.mjs'
import { desktopTargetBuildPaths } from '../scripts/desktop-build-paths.mjs'
import { localMacOSPackageEnvironment } from '../scripts/desktop-package-environment.mjs'

const APP_ROOT = resolve(import.meta.dirname, '..')

const temporary: string[] = []
function directory(): string {
  const path = mkdtempSync(join(tmpdir(), 'dsh-skill-pack-'))
  temporary.push(path)
  return path
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, '-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { encoding: 'utf8' }).trim()
}

/** A plugin repository with one skill and a manifest; returns its path and the commit of `version`. */
function pluginRepository(version: string): { path: string; commit: string } {
  const path = directory()
  git(path, 'init', '-q')
  mkdirSync(join(path, 'plugins/flowleap/skills/prior-art'), { recursive: true })
  mkdirSync(join(path, 'plugins/flowleap/.claude-plugin'), { recursive: true })
  writeFileSync(join(path, 'plugins/flowleap/skills/prior-art/SKILL.md'), '---\nname: prior-art\ndescription: Search.\n---\n')
  writeFileSync(join(path, 'plugins/flowleap/.claude-plugin/plugin.json'), JSON.stringify({ version }))
  git(path, 'add', '.')
  git(path, 'commit', '-q', '-m', version)
  return { path, commit: git(path, 'rev-parse', 'HEAD') }
}

const spec = (repository: string, commit: string) => ({
  repository, commit, skills: 'plugins/flowleap/skills', manifest: 'plugins/flowleap/.claude-plugin/plugin.json', environment: 'FLOWLEAP_SKILLS_DIR',
})

afterEach(() => {
  vi.unstubAllEnvs()
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('desktop skill pack', () => {
  it('pins the FlowLeap pack to a commit of flowleap-plugins and ships none upstream', () => {
    expect(readDesktopProductFile(APP_ROOT, 'flowleap').skillPack).toEqual({
      repository: 'https://github.com/flowleap-ai/flowleap-plugins.git',
      commit: expect.stringMatching(/^[0-9a-f]{40}$/u) as string,
      skills: 'plugins/flowleap/skills',
      manifest: 'plugins/flowleap/.claude-plugin/plugin.json',
      environment: 'FLOWLEAP_SKILLS_DIR',
    })
    expect(readDesktopProductFile(APP_ROOT, 'deepseek').skillPack).toBeNull()
  })

  it('rejects a moving ref, an insecure repository, a path that leaves the repository, and a missing field', () => {
    const pinned = spec('https://github.com/flowleap-ai/flowleap-plugins.git', 'a'.repeat(40))
    expect(() => parseDesktopProduct({ ...DEFAULT_DESKTOP_PRODUCT, skillPack: { ...pinned, commit: 'main' } })).toThrow('skillPack.commit')
    expect(() => parseDesktopProduct({ ...DEFAULT_DESKTOP_PRODUCT, skillPack: { ...pinned, commit: 'ed8a8a6' } })).toThrow('skillPack.commit')
    expect(() => parseDesktopProduct({ ...DEFAULT_DESKTOP_PRODUCT, skillPack: { ...pinned, repository: 'http://example.com/p.git' } })).toThrow('HTTPS')
    expect(() => parseDesktopProduct({ ...DEFAULT_DESKTOP_PRODUCT, skillPack: { ...pinned, skills: '../skills' } })).toThrow('skillPack.skills')
    const { skillPack: _omitted, ...withoutPack } = DEFAULT_DESKTOP_PRODUCT
    expect(() => parseDesktopProduct(withoutPack)).toThrow('skillPack')
  })

  it('stages the pinned commit, not the branch head, and the shell hands its skills folder to the Host', async () => {
    const plugins = pluginRepository('2.6.2')
    writeFileSync(join(plugins.path, 'plugins/flowleap/.claude-plugin/plugin.json'), JSON.stringify({ version: '2.7.0' }))
    git(plugins.path, 'commit', '-q', '-am', '2.7.0')
    const resources = directory()
    const stage = join(resources, 'skill-pack')
    const pinned = spec(plugins.path, plugins.commit)

    expect(await prepareDesktopSkillPack(pinned, stage)).toEqual({ repository: plugins.path, commit: plugins.commit, version: '2.6.2' })
    expect(readFileSync(join(stage, 'skills/prior-art/SKILL.md'), 'utf8')).toContain('name: prior-art')

    const pack = readPackagedSkillPack(resources, { ...pinned, repository: 'https://example.com/p.git' })
    expect(pack).toEqual({ skills: join(stage, 'skills'), version: '2.6.2', commit: plugins.commit, environment: 'FLOWLEAP_SKILLS_DIR' })
    expect(skillPackAboutValues(pack)).toEqual({ version: '2.6.2', commit: plugins.commit.slice(0, 7) })
    // The packaged pack wins over a developer value from the login shell.
    expect(skillPackHostEnvironment({ FLOWLEAP_SKILLS_DIR: '/home/dev/pack', PATH: 'bin' }, pack))
      .toEqual({ FLOWLEAP_SKILLS_DIR: join(stage, 'skills'), PATH: 'bin' })
    expect(skillPackHostEnvironment({ PATH: 'bin' }, undefined)).toEqual({ PATH: 'bin' })
  })

  it('fails the packaged launch when the package carries another commit or no pack', async () => {
    const plugins = pluginRepository('2.6.2')
    const resources = directory()
    await prepareDesktopSkillPack(spec(plugins.path, plugins.commit), join(resources, 'skill-pack'))
    expect(() => readPackagedSkillPack(resources, spec('https://example.com/p.git', 'b'.repeat(40)))).toThrow('not the pinned')
    expect(() => readPackagedSkillPack(directory(), spec('https://example.com/p.git', plugins.commit))).toThrow('cannot read')
  })

  it('packages the staged pack as the skill-pack resource of the FlowLeap product only', async () => {
    const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
    const resource = (product: string) => {
      vi.stubEnv('DSH_DESKTOP_PRODUCT', product)
      const env = { ...localMacOSPackageEnvironment({ PATH: 'tools', DSH_DESKTOP_PRODUCT: product }), DSH_DESKTOP_TARGET_PLATFORM: 'darwin', DSH_DESKTOP_TARGET_ARCH: 'arm64' }
      return (createElectronBuilderConfig(env, 'darwin', 'arm64').extraResources as readonly { from: string; to: string }[]).find(entry => entry.to === 'skill-pack')
    }
    expect(resource('flowleap')).toEqual({ from: join(desktopTargetBuildPaths('mac-arm64').root, 'skill-pack'), to: 'skill-pack' })
    expect(resource('deepseek')).toBeUndefined()
  })
})
