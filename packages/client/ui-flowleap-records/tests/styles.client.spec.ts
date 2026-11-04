/**
 * The layout declarations of the decision bar and the list as CSS text. jsdom has no layout, so the rendering specs
 * cannot show whether a bar fits a 390px phone or a header sticks at its own height; these read the declarations
 * that the live measurements of the R1 screens depend on.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/client/parts/${name}`, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')

/**
 * The body of the first at-rule whose prelude starts with `prelude`.
 * @param source - the CSS text.
 * @param prelude - such as `@media (max-width: 720px)`.
 * @returns the text between its braces.
 */
function atRule(source: string, prelude: string): string {
  const start = source.indexOf(`${prelude} {`)
  if (start === -1) throw new Error(`no \`${prelude}\` block`)
  let depth = 0
  for (let index = source.indexOf('{', start); index < source.length; index++) {
    if (source[index] === '{') depth++
    if (source[index] === '}' && --depth === 0) return source.slice(source.indexOf('{', start) + 1, index)
  }
  throw new Error(`\`${prelude}\` is not closed`)
}

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

describe('the decision bar', () => {
  const css = read('Decision.module.css')

  it('takes at most 40% of the view: the part rows scroll, and the header, a failure and the footer keep their height', () => {
    expect(declarations(css, '.bar')).toEqual(expect.arrayContaining(['display: flex', 'flex-direction: column', 'max-height: max(40dvh, 200px)', 'overflow: hidden']))
    expect(declarations(css, '.head, .failure, .foot, .reason')).toEqual(['flex: none'])
    expect(declarations(css, '.parts')).toEqual(expect.arrayContaining(['flex: 0 1 auto', 'min-height: 0', 'overflow-y: auto']))
  })

  it('keeps each part to its title and its control at 390px, and keeps the note beside the acts on a wide bar', () => {
    const narrow = atRule(css, '@media (max-width: 720px)')
    expect(declarations(narrow, '.partIcon, .partDetail')).toEqual(['display: none'])
    expect(declarations(narrow, '.part')).toEqual(expect.arrayContaining(['display: flex', 'flex-wrap: wrap']))
    expect(declarations(narrow, '.partControl')).toEqual(['margin-left: auto'])
    expect(declarations(atRule(css, '@container decision (max-width: 800px)'), '.partHint')).toEqual(['display: none'])
    expect(declarations(css, '.bar')).toContain('container: decision / inline-size')
    expect(declarations(css, '.foot > .note, .foot > .decider, .foot > .blocked')).toEqual(['flex: 1 1 240px', 'min-width: 0'])
  })
})

describe('the list', () => {
  const css = read('List.module.css')

  it('keeps the column header at 32px in a long list and sticks the group headers under it at the same height', () => {
    expect(declarations(css, '.pane')).toContain('--records-header-height: 32px')
    expect(declarations(css, '.header')).toEqual(expect.arrayContaining(['position: sticky', 'top: 0', 'flex: none', 'height: var(--records-header-height)']))
    expect(declarations(css, '.groupHeader')).toEqual(expect.arrayContaining(['position: sticky', 'top: var(--records-header-height)']))
  })
})
