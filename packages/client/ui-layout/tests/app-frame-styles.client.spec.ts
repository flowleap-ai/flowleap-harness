/**
 * The browser drawer's top row as CSS text. jsdom has no layout and no `:has()` matching, so these read the
 * declarations that let a global panel's own top row hold the sidebar opener.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/AppFrame.module.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')

/**
 * The declarations of the rule whose selector is exactly `selector`.
 * @param selector - the selector.
 * @returns the declarations.
 */
function declarations(selector: string): string[] {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`no \`${selector}\` rule`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  return body.split(';').map(part => part.trim()).filter(Boolean)
}

describe('the browser drawer top row', () => {
  const browser = ':global(html:not([data-platform])) .frame[data-sidebar-drawer]'

  it('pads a global panel by one row for the seat, unless the panel\'s own top row takes the seat', () => {
    expect(declarations('.frame[data-sidebar-drawer] .mainPanel[data-global-panel]')).toEqual(['padding-top: max(0px, calc(48px - var(--dsh-frame-top-clearance, 0px)))'])
    expect(declarations(`${browser} .mainPanel[data-global-panel]:has([data-frame-top-row])`)).toEqual(['padding-top: 0'])
  })

  it('centres the 28px opener on that 44px row and starts the row after the seat', () => {
    expect(declarations(`${browser}:has(.mainPanel [data-frame-top-row]) .leadingSeat`)).toEqual(['top: 8px'])
    expect(declarations(`${browser} .mainPanel [data-frame-top-row]`)).toEqual(['padding-inline-start: var(--dsh-frame-leading-clearance)'])
    expect(declarations(browser)).toEqual(['--dsh-frame-leading-clearance: 48px'])
  })
})
