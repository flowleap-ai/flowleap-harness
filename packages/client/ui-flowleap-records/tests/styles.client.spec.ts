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

  it('keeps the header row at 44px in every language: why the person may decide fits at its right or takes a second line under the question', () => {
    expect(declarations(css, '.head')).toEqual(expect.arrayContaining(['box-sizing: border-box', 'min-height: 44px', 'padding: 0 16px']))
    expect(declarations(css, '.head').join(';')).not.toMatch(/border-bottom/)
    expect(declarations(css, '.headAvatar')).toEqual(expect.arrayContaining(['align-items: center', 'height: 44px']))
    expect(declarations(css, '.headText')).toEqual(expect.arrayContaining(['flex-wrap: wrap', 'justify-content: space-between', 'padding: 12px 0']))
    expect(declarations(css, '.why')).not.toContain('margin-left: auto')
    expect(declarations(css, '.parts')).toContain('border-top: 0.5px solid var(--dsw-alias-border-l2)')
  })

  it('moves the secondary acts into the overflow menu while the acts do not fit on one row', () => {
    expect(declarations(css, '.foot[data-crowded] .secondary')).toEqual(['display: none'])
    expect(declarations(css, '.foot[data-crowded] .more')).toEqual(['display: inline-flex'])
  })

  it('in a view 700px high or less, hides the note, puts each part on one row and keeps the footer to its row of acts', () => {
    const short = atRule(css, '@media (max-height: 700px) and (min-width: 721px)')
    expect(declarations(short, '.note')).toEqual(['display: none'])
    expect(declarations(short, '.partText')).toEqual(expect.arrayContaining(['display: flex', 'flex-wrap: wrap']))
    expect(declarations(short, '.foot')).toEqual(['padding: 8px 16px'])
  })

  it('lets the bar grow on a phone while a failure shows, so every part stays in view beside the notice', () => {
    expect(declarations(atRule(css, '@media (max-width: 720px)'), '.bar:has(> .failure)')).toEqual(['max-height: max(60dvh, 200px)'])
  })

  it('wraps why the person may decide and each part\'s evidence state at 390px instead of cutting them, and keeps the note beside the acts on a wide bar', () => {
    const narrow = atRule(css, '@media (max-width: 720px)')
    expect(narrow).not.toMatch(/text-overflow|white-space: nowrap/)
    expect(declarations(narrow, '.partIcon')).toEqual(['display: none'])
    expect(declarations(narrow, '.partDetail')).toEqual(['display: block'])
    expect(declarations(narrow, '.why')).toEqual(['flex: 1 1 100%'])
    expect(declarations(narrow, '.question')).toEqual(['white-space: normal'])
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

  it('keeps every column grid in the CSS, where the design checks read it', () => {
    for (const grid of ['mattersColumns', 'deadlinesColumns', 'waitsColumns', 'documentsColumns', 'relatedColumns']) {
      expect(declarations(css, `.${grid}`).map(line => line.split(':')[0])).toEqual(['--detail-columns', '--detail-columns-narrow'])
    }
    // The days left are a key fact and never truncate (R17): their column takes the width of its longest value.
    expect(declarations(css, '.deadlinesColumns')[0]).toBe('--detail-columns: max-content max-content max-content max-content minmax(0, 1fr)')
    expect(declarations(css, '.relatedColumns')).toEqual([
      '--detail-columns: max-content max-content minmax(0, 1fr) max-content 16px', '--detail-columns-narrow: max-content minmax(0, 1fr) max-content',
    ])
  })

  it('sizes each status column to its longest word in every language: the rows share the table\'s columns', () => {
    // The longest status word of the 8 languages is "Eingegebenes Datum vorgeschlagen", 243px with its icon at 13px
    // in the client font, and "Actualizado" is 66px at 12px: no fixed column holds every language.
    const tables = ['deadlinesColumns', 'waitsColumns', 'relatedColumns']
    for (const grid of tables) expect(declarations(css, `.${grid}`)[0]).toMatch(/^--detail-columns: max-content /)
    expect(declarations(css, '.waitsColumns')[0]).toBe('--detail-columns: max-content minmax(0, 1fr) max-content max-content')
    expect(declarations(css, tables.map(grid => `.${grid}`).join(',\n'))).toEqual(['grid-template-columns: var(--detail-columns)', 'column-gap: 16px'])
    const shared = `:is(${tables.map(grid => `.${grid}`).join(', ')})`
    expect(declarations(css, `${shared} > [role='rowgroup'],\n${shared} :is(.thead, .row)`)).toEqual(['display: grid', 'grid-column: 1 / -1', 'grid-template-columns: subgrid'])
    expect(declarations(atRule(css, '@media (max-width: 720px)'), tables.map(grid => `.${grid}`).join(',\n'))).toEqual(['grid-template-columns: var(--detail-columns-narrow)'])
  })
})

describe('the cells that wrap', () => {
  it('wraps a record\'s name and meta in the Related, What waits, E-file and Deadlines tables, and never the next-step tag', () => {
    const css = read('Detail.module.css', 'screens')
    expect(declarations(css, ':is(.relatedColumns, .waitsColumns, .documentsColumns, .deadlinesColumns) :is(.main, .meta, .open)')).toEqual(['white-space: normal'])
    expect(declarations(css, '.nextTag')).toContain('white-space: nowrap')
  })

  it('puts the task\'s reason in My work under the task\'s name when the two do not fit, and on a phone wraps it', () => {
    const css = read('MyWork.module.css', 'screens')
    expect(declarations(css, '.screen [data-row] > :first-child')).toEqual(['flex-wrap: wrap', 'align-content: center', 'row-gap: 0'])
    expect(declarations(atRule(css, '@media (max-width: 720px)'), '.screen [data-row] > :first-child > [data-source]')).toEqual(['white-space: normal'])
    // The column header is hidden there, so a group header does not stick under it.
    expect(declarations(atRule(css, '@media (max-width: 720px)'), '.screen [data-list]')).toEqual(['--records-header-height: 0px'])
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

describe('the work page header', () => {
  const css = read('Detail.module.css', 'screens')
  const short = atRule(css, '@media (max-height: 700px) and (min-width: 721px)')
  const outside = css.replace(`@media (max-height: 700px) and (min-width: 721px) {${short}}`, '')

  it('in a view 700px high or less, hides the lede and the people line and shows the people in the top bar instead', () => {
    expect(declarations(short, '.lede, .people')).toEqual(['display: none'])
    expect(declarations(short, '.barPeople')).toEqual(['display: inline-flex'])
  })

  it('above 700px, shows the lede and the people line and keeps the people out of the top bar', () => {
    expect(outside).not.toMatch(/\.(lede|people)\s*(,[^{]*)?\{[^}]*display:\s*none/)
    expect(declarations(css, '.people')).toContain('display: flex')
    expect(declarations(css, '.barPeople')).toContain('display: none')
  })
})

describe('the review-3 visual fixes', () => {
  it('keeps a short source such as the office code whole: the title truncates first, a long source takes half the cell', () => {
    const css = read('List.module.css')
    expect(declarations(css, '.title')).toEqual(expect.arrayContaining(['display: flex', 'min-width: 0']))
    expect(declarations(css, '.title')).not.toContain('overflow: hidden')
    expect(declarations(css, '.titleText')).toEqual(['flex: 0 1 auto', 'min-width: 0'])
    expect(declarations(css, '.titleText,\n.source')).toEqual(['overflow: hidden', 'text-overflow: ellipsis'])
    expect(declarations(css, '.source')).toEqual(expect.arrayContaining(['flex: none', 'max-width: 50%']))
  })

  it('gives the avatar of the open or a checked row a fill that stands out from the selected tint', () => {
    expect(declarations(read('List.module.css'), '.row:is([data-open], [data-checked]) span[data-size]')).toEqual([
      'background: var(--dsw-alias-label-secondary)', 'color: var(--dsw-alias-label-primary-foreground)',
    ])
  })

  it('draws the resting filter chips of Intake with the raised edge of the board chip, in both themes', () => {
    expect(declarations(read('Intake.module.css', 'screens'), ".viewbar .chip:not([aria-pressed='true'])")).toEqual(['box-shadow: var(--dsw-elevation-panel)'])
  })

  it('draws the calculation step ring in the icon grey, which has 3:1 in both themes', () => {
    expect(declarations(read('Detail.module.css', 'screens'), '.dot')).toContain('border: 1px solid var(--dsw-alias-label-tertiary)')
  })

  it('sets "Overdue by N days" on the baseline of its words, with the glyph centred on the line', () => {
    const css = read('Due.module.css')
    expect(declarations(css, '.overdue')).toContain('align-items: baseline')
    expect(declarations(css, '.overdue > svg')).toContain('align-self: center')
  })

  it('at 390px aligns the Due header with its right-aligned values and gives a fact chip the cell radius it may wrap into', () => {
    const narrow = atRule(read('Detail.module.css', 'screens'), '@media (max-width: 720px)')
    expect(declarations(narrow, '.endNarrow')).toEqual(['text-align: right'])
    expect(declarations(narrow, '.fact')).toEqual(['min-height: 32px', 'padding: 4px 12px', 'border-radius: var(--dsw-radius-md)'])
  })

  it('at 390px hides the matter name of a card and a work row, where the key names the matter, and wraps the other states', () => {
    const card = atRule(read('Board.module.css'), '@media (max-width: 720px)')
    expect(declarations(card, '.matterName')).toEqual(['display: none'])
    expect(declarations(card, '.matterName + .due::before')).toEqual(['content: none'])
    const board = atRule(read('BoardScreen.module.css', 'screens'), '@media (max-width: 720px)')
    expect(declarations(board, '.screen [data-row] [data-source]')).toEqual(['display: none'])
    expect(declarations(board, '.other')).toEqual(expect.arrayContaining(['display: grid', 'height: auto', 'white-space: normal']))
    expect(declarations(board, '.otherRows')).toEqual(expect.arrayContaining(['grid-template-columns: repeat(2, minmax(0, 1fr))']))
    expect(declarations(read('BoardScreen.module.css', 'screens'), '.board')).toContain('scroll-padding-inline: 16px')
  })

  it('shows the board card as one click target', () => {
    expect(declarations(read('Board.module.css'), '.card')).toContain('cursor: pointer')
  })
})

describe('text fields on a touch screen', () => {
  it('gives every text field of the views 16 px under a coarse pointer, so iOS Safari does not zoom into it', () => {
    const coarse = (name: string, folder: string) => atRule(read(name, folder), '@media (pointer: coarse)')
    const size = 'font-size: var(--dsw-font-base-16-font-size);'
    expect(coarse('FindDialog.module.css', '.')).toMatch(/input\.search\s*\{\s*font-size: var\(--dsw-font-base-16-font-size\);/u)
    expect(coarse('Intake.module.css', 'screens')).toContain(`.fields input,\n  .fields select {\n    ${size}`)
    expect(coarse('Decision.module.css', 'parts')).toContain(`.reasonField input {\n    ${size}`)
    expect(coarse('AgentSummary.module.css', 'parts')).toContain(`.composerField input {\n    ${size}`)
  })
})
