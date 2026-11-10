/** The client folder page lays out by its own width, which the app sidebar takes from the window. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/Panel.module.css', import.meta.url)), 'utf8')

/** The declarations of the first rule with this exact selector. */
const rule = (selector: string): string => {
  const start = css.indexOf(`\n${selector} {`)
  return css.slice(start, css.indexOf('}', start) + 1)
}

/** The rules inside the first at-rule with this exact prelude. */
const block = (prelude: string): string => {
  const start = css.indexOf(`${prelude} {`)
  return css.slice(start, css.indexOf('\n}', start) + 2)
}

describe('client folder page layout', () => {
  it('takes its layout steps from the page width, never from the window width', () => {
    expect(rule('.panel')).toMatch(/container:\s*folder-page \/ inline-size/)
    expect(css).not.toMatch(/@media[^{]*width/)
    expect(block('@container folder-page (max-width: 720px)')).toMatch(/\.tree \{ display: none; \}/)
  })

  it('keeps the top bar inside the page: the acts give way, and the primary act keeps its label', () => {
    expect(rule('.actions')).toMatch(/flex:\s*0 1 auto;\s*min-width:\s*0;/)
    expect(rule('.actions > *')).toMatch(/flex:\s*none/)
    expect(rule('.actions > .act')).toMatch(/flex:\s*0 1 auto;\s*min-width:\s*36px;\s*overflow:\s*hidden;/)
    expect(rule('.actLabel')).toMatch(/text-overflow:\s*ellipsis/)
    expect(block('@container folder-page (max-width: 1080px)')).toMatch(/\.act \.actLabel \{ max-width: 0; \}/)
  })
})

describe('Add client page layout', () => {
  const addClient = readFileSync(fileURLToPath(new URL('../src/client/add-client/AddClient.module.css', import.meta.url)), 'utf8')

  it('gives the top bar and the decision bar their own height and the scroll area the rest', () => {
    // The page parts are the top bar, the scroll area and, on the review page, the decision bar (`add-client-page.client.spec.tsx`).
    expect(/\n\.work \{[^}]*grid-template-rows:\s*([^;]+);/u.exec(addClient)?.[1]).toBe('auto minmax(0, 1fr) auto')
  })
})
