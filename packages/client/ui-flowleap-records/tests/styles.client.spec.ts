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

  it('keeps a one-line header at 44px: its padding counts inside the minimum height', () => {
    expect(declarations(css, '.head')).toEqual(expect.arrayContaining(['box-sizing: border-box', 'min-height: 44px', 'padding: 8px 16px']))
  })

  it('wraps why the person may decide and each part\'s evidence state at 390px instead of cutting them, and keeps the note beside the acts on a wide bar', () => {
    const narrow = atRule(css, '@media (max-width: 720px)')
    expect(narrow).not.toMatch(/text-overflow|white-space: nowrap/)
    expect(declarations(narrow, '.partIcon')).toEqual(['display: none'])
    expect(declarations(narrow, '.partDetail')).toEqual(['display: block'])
    expect(declarations(narrow, '.why')).toEqual(['flex: 1 1 100%', 'min-width: 0', 'margin-left: 0'])
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

  it('draws the end bone of a loading row in an auto column, where its percentage width has no base', () => {
    expect(declarations(css, '.end')).toContain('min-width: 48px')
  })
})

describe('the board card', () => {
  const css = read('Board.module.css')
  const status = read('Status.module.css')

  it('shows each fact as one line of text with no chip box, and lets the column grow to the longest fact instead of cutting it', () => {
    expect(declarations(css, '.facts')).toEqual(['display: grid', 'justify-items: start', 'gap: 4px', 'margin-top: 12px'])
    expect(declarations(css, '.facts > .fact')).toEqual(['flex-wrap: nowrap'])
    expect(declarations(css, '.facts > .fact,\n.facts > .fact > *')).toEqual(['white-space: nowrap'])
    expect(css).not.toMatch(/\}\s*\.fact \{|text-overflow|line-clamp: 1/)
    expect(declarations(status, '.fact')).toEqual(expect.arrayContaining(['flex-wrap: wrap', 'max-width: 100%']))
    const board = read('BoardScreen.module.css', 'screens')
    expect(declarations(board, '.board')).toContain('grid-template-columns: repeat(4, minmax(min-content, 1fr))')
    expect(declarations(atRule(board, '@media (max-width: 720px)'), '.board')).toEqual(['grid-template-columns: repeat(4, min-content)'])
    expect(declarations(atRule(board, '@media (max-width: 720px)'), '.board > *')).toEqual(['box-sizing: border-box', 'min-width: 260px'])
    // A size container has no intrinsic width, so the card itself must not be one, or its facts could not widen it.
    expect(declarations(css, '.card')).not.toContainEqual(expect.stringContaining('container'))
  })

  it('keeps the matter key whole: a narrow card hides the column\'s icon, and a large team moves onto its own line', () => {
    expect(declarations(css, '.top')).toEqual(expect.arrayContaining(['container: card / inline-size', 'flex-wrap: wrap']))
    expect(declarations(css, '.key')).toEqual(['flex: none', 'white-space: nowrap'])
    expect(declarations(atRule(css, '@container card (width < 176px)'), '.top > :first-child')).toEqual(['display: none'])
  })
})

describe('the board screen', () => {
  const css = read('BoardScreen.module.css', 'screens')

  it('shows the other states as one line above the columns, not as a fifth column', () => {
    expect(declarations(css, '.other')).toEqual(expect.arrayContaining(['display: flex', 'flex: none', 'height: 36px', 'overflow-x: auto', 'white-space: nowrap']))
    expect(css).not.toMatch(/\) 200px/)
  })

  it('gives the For me filter at rest the raised edge of the mockup chip, which bg-layer-2 alone does not draw in light', () => {
    expect(declarations(css, ".viewbar .filter:not([aria-pressed='true'])")).toEqual(['box-shadow: var(--dsw-elevation-panel)'])
  })

  it('keeps the status, the title and the due date of a work row at 390px, with the matter key under the title', () => {
    const narrow = atRule(css, '@media (max-width: 720px)')
    expect(declarations(narrow, '.listColumns')).toEqual(['--records-columns: 14px minmax(0, 1fr) auto'])
    expect(declarations(narrow, '.screen [data-row] > :nth-child(3)')).toEqual(expect.arrayContaining(['grid-row: 2', 'grid-column: 2']))
    expect(declarations(narrow, '.screen [data-row] > :nth-child(1),\n  .screen [data-row] > :nth-child(5)')).toEqual(['grid-row: 1 / span 2'])
    expect(narrow).toContain('.screen [data-list] > :first-child > :nth-child(3)')
    expect(narrow).toContain('.screen [data-row] > :nth-child(4)')
  })
})

describe('the agent panel', () => {
  const css = read('AgentSummary.module.css')

  it('never cuts a result\'s file name: it takes the full width of the row under the title and the status, and breaks if it must', () => {
    expect(declarations(css, '.resultFile')).toEqual(expect.arrayContaining(['grid-area: file', 'overflow-wrap: anywhere']))
    expect(declarations(css, '.resultFile')).not.toContainEqual(expect.stringMatching(/text-overflow|nowrap/))
    expect(declarations(css, '.result')).toContain("grid-template-areas:\n    'icon title status'\n    'icon file file'")
  })

  it('draws the composer as one surface, with its placeholder in the secondary label colour', () => {
    expect(declarations(css, '.composer .composerField')).toEqual(['padding: 0', 'border: 0', 'background: transparent'])
    expect(declarations(css, '.composer .composerField input::placeholder')).toEqual(['color: var(--dsw-alias-label-secondary)'])
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
    // The days left are a key fact and never truncate (R17): the column holds the longest of the 8 languages with a
    // four-digit count, measured at 13px weight 500 in the client font ("Просрочено на 1248 дн.", 157px).
    const deadlines = declarations(css, '.deadlinesColumns')[0]!.replace('--detail-columns:', '').trim()
    const [, date, due] = deadlines.split(' ').map(track => Number.parseInt(track, 10))
    expect(due).toBeGreaterThanOrEqual(157)
    expect(date).toBeGreaterThanOrEqual(125)
    expect(declarations(css, '.relatedColumns')).toEqual(['--detail-columns: 200px 176px minmax(0, 1fr) auto 16px', '--detail-columns-narrow: 136px minmax(0, 1fr) auto'])
  })
})

describe('the list grids', () => {
  it('keeps the column grid of each list in the screen\'s CSS, where the design checks read it', () => {
    expect(declarations(read('Intake.module.css', 'screens'), '.intakeColumns')).toEqual(['--records-columns: 14px minmax(0, 1fr) 92px 20px 64px'])
    expect(declarations(atRule(read('Intake.module.css', 'screens'), '@media (max-width: 720px)'), '.intakeColumns')).toEqual(['--records-columns: 14px minmax(0, 1fr) 72px'])
    expect(declarations(read('BoardScreen.module.css', 'screens'), '.listColumns')).toEqual(['--records-columns: 14px minmax(0, 1fr) 92px 64px 120px'])
    expect(declarations(read('List.module.css'), '.pane')).not.toContainEqual(expect.stringContaining('--records-columns'))
  })
})
