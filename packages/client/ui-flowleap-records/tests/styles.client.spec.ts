/**
 * The layout declarations of the list as CSS text. jsdom has no layout, so the rendering specs cannot show whether a
 * header sticks at its own height; these read the declarations that the live measurements of the R1 screens depend on.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/client/parts/${name}`, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')

/**
 * The declarations of the first rule whose selector list is exactly `selector`.
 * @param source - the CSS text.
 * @param selector - the selector list, such as `.partIcon,\n  .partDetail`.
 * @returns the declarations.
 */
function declarations(source: string, selector: string): string[] {
  const rule = new RegExp(`(?:^|[{}])\\s*${selector.replace(/[.[\]():*+^$\\>]/g, '\\$&').replace(/\s+/g, '\\s*')}\\s*\\{([^{}]*)\\}`).exec(source)
  if (rule === null) throw new Error(`no \`${selector}\` rule`)
  return (rule[1] ?? '').split(';').map(part => part.trim()).filter(Boolean)
}

describe('the list', () => {
  const css = read('List.module.css')

  it('keeps the column header at 32px in a long list and sticks the group headers under it at the same height', () => {
    expect(declarations(css, '.pane')).toContain('--records-header-height: 32px')
    expect(declarations(css, '.header')).toEqual(expect.arrayContaining(['position: sticky', 'top: 0', 'flex: none', 'height: var(--records-header-height)']))
    expect(declarations(css, '.groupHeader')).toEqual(expect.arrayContaining(['position: sticky', 'top: var(--records-header-height)']))
  })
})
