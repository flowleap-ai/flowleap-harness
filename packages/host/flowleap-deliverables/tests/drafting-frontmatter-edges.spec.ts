/** Frontmatter inputs that the IDE-ported frontmatter spec does not exercise. */

import { describe, expect, it } from 'vitest'
import { parseDraftingFrontmatter, writeDraftingFrontmatter } from '../src/drafting/frontmatter.ts'

describe('Application Drafting frontmatter edges', () => {
  it('gives no fields when the YAML block is a list or a scalar', () => {
    expect(parseDraftingFrontmatter('---\n- office\n---\nbody').fields).toEqual({})
    expect(parseDraftingFrontmatter('---\nUS\n---\nbody').fields).toEqual({})
  })

  it('reads a block that ends the text without a final newline', () => {
    expect(parseDraftingFrontmatter('---\noffice: US\n---')).toEqual({ fields: { office: 'US' }, body: '', bodyStartLine: 4 })
  })

  it('writes a list field with its item lines under the field', () => {
    const text = writeDraftingFrontmatter({ office: 'US', models: ['a', 'b'] }, '# Body\n')
    expect(text).toBe('---\noffice: US\nmodels:\n  - a\n  - b\n---\n# Body\n')
  })
})
