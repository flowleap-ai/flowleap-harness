/** The resolved `flowleap-web` skill pack row: FLOWLEAP_SKILLS_DIR, else the release image's pack, and required. */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { interpolate } from '@deepseek-ai/cordis-plugin-loader'
import { composeEntries, loadProfile } from '@deepseek-ai/dsh-app-boot'

const installAnchor = fileURLToPath(new URL('../package.json', import.meta.url))

it('flowleap-web scans FLOWLEAP_SKILLS_DIR, else /opt/flowleap/skills, and requires the folder', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-flowleap-skills-'))
  try {
    const profile = loadProfile('dsh', 'flowleap-web', installAnchor, home)
    const rows = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches], () => {})
    const config = rows.find(row => row.id === 'skill-filesystem')?.config as {
      requireCustomSkillDirs?: boolean
      customSkillDirs?: unknown[]
    } | undefined
    expect(config?.requireCustomSkillDirs).toBe(true)
    // The Loader evaluates the row's expression with the launch environment as `process.env`.
    const resolveWith = (env: Record<string, string>): unknown =>
      (interpolate({ process: { env } }, config?.customSkillDirs) as unknown[])[0]
    expect(resolveWith({})).toBe('/opt/flowleap/skills')
    expect(resolveWith({ FLOWLEAP_SKILLS_DIR: '/srv/pack' })).toBe('/srv/pack')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
