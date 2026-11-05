/**
 * The layout declarations of the decision bar and the list as CSS text. jsdom has no layout, so the rendering specs
 * cannot show whether a bar fits a 390px phone or a header sticks at its own height; these read the declarations
 * that the live measurements of the R1 screens depend on.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (name: string, folder = 'parts'): string =>
  readFileSync(fileURLToPath(new URL(`../src/client/${folder}/${name}`, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')

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

  it('keeps why the person may decide and each part\'s evidence state on one line at 390px, and the note beside the acts on a wide bar', () => {
    const narrow = atRule(css, '@media (max-width: 720px)')
    const oneLine = ['overflow: hidden', 'text-overflow: ellipsis', 'white-space: nowrap']
    expect(declarations(narrow, '.partIcon')).toEqual(['display: none'])
    expect(declarations(narrow, '.partDetail')).toEqual(['display: block', ...oneLine])
    expect(declarations(narrow, '.why')).toEqual(['flex: 1 1 100%', 'min-width: 0', 'margin-left: 0', ...oneLine])
    expect(declarations(narrow, '.note, .secondary')).toEqual(['display: none'])
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

  it('fades a row only on a pointer hover, so a key that opens or checks a row changes it at once', () => {
    const hover = atRule(css, '@media (hover: hover) and (prefers-reduced-motion: no-preference)')
    expect(declarations(hover, '.row:not([data-open], [data-checked]):hover')).toEqual(['transition: background-color var(--ds-transition-duration-fast) ease'])
    const outside = css.replace(`@media (hover: hover) and (prefers-reduced-motion: no-preference) {${hover}}`, '')
    expect(outside).not.toContain('transition')
  })
})

describe('the board card', () => {
  const css = read('Board.module.css')
  const status = read('Status.module.css')

  it('cuts no label, status word or matter key: a chip that does not fit puts its status on a second line', () => {
    expect(declarations(css, '.fact')).toEqual(expect.arrayContaining(['box-sizing: border-box', 'min-height: 24px', 'padding: 0 8px', 'border-radius: var(--dsw-radius-sm)']))
    expect(declarations(status, '.fact')).toEqual(expect.arrayContaining(['flex-wrap: wrap', 'max-width: 100%']))
    expect(declarations(status, '.factStatus')).toEqual(['min-width: 0', 'white-space: normal'])
    expect(status.indexOf('.factStatus {')).toBeGreaterThan(status.indexOf('.status {'))
    expect(css).not.toMatch(/text-overflow|line-clamp: 1/)
  })

  it('keeps the matter key whole: a narrow card hides the column\'s icon, and a large team moves onto its own line', () => {
    expect(declarations(css, '.card')).toContain('container: card / inline-size')
    expect(declarations(css, '.key')).toEqual(['flex: none', 'white-space: nowrap'])
    expect(declarations(css, '.top')).toContain('flex-wrap: wrap')
    expect(declarations(atRule(css, '@container card (width < 176px)'), '.top > :first-child')).toEqual(['display: none'])
  })
})

describe('the bulk bar', () => {
  const css = read('Selection.module.css')

  it('keeps each act on one line, moving an act that does not fit onto the line above the primary', () => {
    expect(declarations(css, '.bulkActs > *')).toEqual(['flex-shrink: 0'])
    expect(declarations(css.slice(css.indexOf('.bulkActs > *')), '.bulkActs')).toEqual(['flex-wrap: wrap', 'justify-content: flex-end'])
    expect(declarations(atRule(css, '@media (max-width: 720px)'), '.bulkDock')).toEqual(['padding: 8px'])
  })
})

describe('the detail tables', () => {
  const css = read('Detail.module.css', 'screens')

  it('keeps every column grid in the CSS, where the design checks read it, with the Related status wide enough for its label', () => {
    for (const grid of ['mattersColumns', 'deadlinesColumns', 'workColumns', 'officeEventsColumns', 'documentsColumns', 'relatedColumns']) {
      expect(declarations(css, `.${grid}`).map(line => line.split(':')[0])).toEqual(['--detail-columns', '--detail-columns-narrow'])
    }
    // The days left are a key fact and never truncate (R17): their column takes the width of its longest value.
    expect(declarations(css, '.deadlinesColumns')[0]).toBe('--detail-columns: max-content max-content max-content minmax(0, 1fr)')
    expect(declarations(css, '.relatedColumns')).toEqual(['--detail-columns: 200px 176px minmax(0, 1fr) auto 16px', '--detail-columns-narrow: 136px minmax(0, 1fr) auto'])
  })

  it('sizes each status column to its longest word in every language: the rows share the table\'s columns', () => {
    // The longest status word of the 8 languages is "Eingegebenes Datum vorgeschlagen", 243px with its icon at 13px
    // in the client font, and "Actualizado" is 66px at 12px: no fixed column holds every language.
    const tables = ['deadlinesColumns', 'workColumns', 'officeEventsColumns']
    for (const grid of tables) expect(declarations(css, `.${grid}`)[0]).toMatch(/^--detail-columns: max-content /)
    expect(declarations(css, '.workColumns')[0]).toBe('--detail-columns: max-content minmax(0, 1fr) 20px max-content')
    expect(declarations(css, tables.map(grid => `.${grid}`).join(',\n'))).toEqual(['grid-template-columns: var(--detail-columns)', 'column-gap: 16px'])
    const shared = `:is(${tables.map(grid => `.${grid}`).join(', ')})`
    expect(declarations(css, `${shared} > [role='rowgroup'],\n${shared} :is(.thead, .row)`)).toEqual(['display: grid', 'grid-column: 1 / -1', 'grid-template-columns: subgrid'])
    expect(declarations(atRule(css, '@media (max-width: 720px)'), tables.map(grid => `.${grid}`).join(',\n'))).toEqual(['grid-template-columns: var(--detail-columns-narrow)'])
  })
})

describe('the letter drawing', () => {
  it('never breaks a read value such as the application number', () => {
    expect(declarations(read('Intake.module.css', 'screens'), '.hl')).toContain('white-space: nowrap')
  })
})

describe('the list grids', () => {
  it('keeps the column grid of each list in the screen\'s CSS, where the design checks read it', () => {
    // The Received column holds its longest header of the 8 languages, "Eingegangen", 74px at 12px in the client font.
    expect(declarations(read('Intake.module.css', 'screens'), '.intakeColumns')).toEqual(['--records-columns: 14px minmax(0, 1fr) 92px 20px 80px'])
    expect(declarations(atRule(read('Intake.module.css', 'screens'), '@media (max-width: 720px)'), '.intakeColumns')).toEqual(['--records-columns: 14px minmax(0, 1fr) 72px'])
    expect(declarations(read('BoardScreen.module.css', 'screens'), '.listColumns')).toEqual(['--records-columns: 14px minmax(0, 1fr) 92px 64px 120px'])
    expect(declarations(read('List.module.css'), '.pane')).not.toContainEqual(expect.stringContaining('--records-columns'))
  })
})
