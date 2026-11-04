/**
 * The status shape palette, the keycap box and the avatar stack as CSS text. CSS Modules resolve to class-name maps in
 * the component suites, so only the stylesheet can show which role colour each shape and part paints.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { STATUS_SHAPES } from '../src/StatusShape.tsx'

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), 'utf8')
const css = read('StatusShape.module.css')

describe('StatusShape.module.css', () => {
  it('colours each shape by its role and idle by the icon grey, never the idle state colour', () => {
    const rule = (selector: string) => new RegExp(`${selector.replace(/[[\]]/g, '\\$&')}[^{]*\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
    expect(rule("svg.glyph[data-shape='wait']")).toContain('--dsw-alias-state-warn-primary')
    expect(rule("svg.glyph[data-shape='ok']")).toContain('--dsw-alias-state-success-primary')
    expect(rule("svg.glyph[data-shape='run']")).toContain('--dsw-alias-state-business-primary')
    expect(rule("svg.glyph[data-shape='stale']")).toContain('--dsw-alias-state-error-primary')
    expect(rule("svg.glyph[data-shape='idle']")).toContain('--dsw-alias-label-tertiary')
    expect(css).not.toContain('--dsw-alias-state-idle-primary)')
  })

  it('keeps the pill word in the primary label colour on every tint', () => {
    for (const shape of STATUS_SHAPES) {
      const block = new RegExp(`\\.pill\\[data-shape='${shape}'\\][^{]*\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
      expect(block).toContain('color: var(--dsw-alias-label-primary)')
    }
  })
})

describe('Keycap.module.css', () => {
  it('draws an 18px box with secondary text and hides on a coarse pointer', () => {
    const keycap = read('Keycap.module.css')
    expect(keycap).toMatch(/\.keycap \{[^}]*height: 18px;[^}]*color: var\(--dsw-alias-label-secondary\)/)
    expect(keycap).toMatch(/@media \(pointer: coarse\) \{\s*\.keys \{\s*display: none;/)
  })
})

describe('Avatar.module.css', () => {
  it('overlaps a stack by 4px with a 2px ring', () => {
    const avatar = read('Avatar.module.css')
    expect(avatar).toMatch(/\.stack \.avatar \+ \.avatar \{\s*margin-left: calc\(-1 \* 4px\);/)
    expect(avatar).toMatch(/\.stack \.avatar \{\s*box-shadow: 0 0 0 2px var\(--dsw-alias-bg-base\);/)
  })
})
