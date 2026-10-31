/** The resolved `flowleap-web` profile mounts the Firm admin row with no key; the upstream `web` profile does not mount it. */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { composeEntries, loadProfile } from '@deepseek-ai/dsh-app-boot'

const installAnchor = fileURLToPath(new URL('../package.json', import.meta.url))

function rows(profileName: string) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-flowleap-admin-link-'))
  try {
    const profile = loadProfile('dsh', profileName, installAnchor, home)
    return composeEntries([...profile.layers.map(layer => layer.patches), profile.patches], () => {})
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

const PACKAGE = '@deepseek-ai/dsh-client-ui-flowleap-admin-link'

it('flowleap-web mounts flowleap-admin-link with no public key file and the admin/ console path', () => {
  const row = rows('flowleap-web').find(entry => entry.id === 'flowleap-admin-link')
  expect(row).toMatchObject({ name: PACKAGE, config: { publicKeyFile: '', consoleHref: 'admin/' } })
  expect(row?.disabled).toBeFalsy()
})

it('the web profile does not mount the admin link', () => {
  const web = rows('web')
  expect(web.some(entry => entry.id === 'ui-sidebar')).toBe(true)
  expect(web.filter(entry => entry.id === 'flowleap-admin-link' || entry.name === PACKAGE)).toEqual([])
})
