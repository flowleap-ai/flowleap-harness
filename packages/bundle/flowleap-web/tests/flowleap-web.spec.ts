/** The FlowLeap Web bundle's data-file constants name shipped files that its bundle patch resolves. */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BRAND_FILE, PROMPT_FILE } from '../src/index.ts'

const root = fileURLToPath(new URL('..', import.meta.url))

describe('dsh-flowleap-web data files', () => {
  it.each([
    ['persona', PROMPT_FILE, 'FLOWLEAP_PROMPT_PATH'],
    ['brand', BRAND_FILE, 'FLOWLEAP_BRAND_PATH'],
  ])('ships the default %s file and resolves it in the bundle patch unless the environment replaces it', (_name, file, variable) => {
    expect(existsSync(resolve(root, file))).toBe(true)
    const patch = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain(`process.env.${variable} ?? `)
    expect(patch).toContain(`.resolve('@deepseek-ai/dsh-flowleap-web/${file}')`)
  })
})
