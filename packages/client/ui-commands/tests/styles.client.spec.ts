/**
 * The command menu's declarations as CSS text: jsdom does not resolve `::placeholder`, so the search field's
 * placeholder colour is read from the module.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/CommandMenu.module.css', import.meta.url)), 'utf8')

it('draws the search placeholder in the secondary label colour, not the browser grey', () => {
  const rule = /\.search::placeholder\s*\{([^}]*)\}/.exec(css)
  expect(rule?.[1]?.trim()).toBe('color: var(--dsw-alias-label-secondary);')
})
