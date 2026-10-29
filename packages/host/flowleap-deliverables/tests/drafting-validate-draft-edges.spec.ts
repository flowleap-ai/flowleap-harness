/** validateDraft inputs that the IDE-ported validateDraft spec does not exercise. */

import { describe, expect, it } from 'vitest'
import { validateDraft } from '../src/drafting/validate-draft.ts'

describe('Application Drafting validateDraft edges', () => {
  it('validates a draft without a figures file the same as with an empty one', () => {
    const input = { office: 'US' as const, draft: '---\noffice: US\n---\n# Abstract\n\n<!-- src: template -->\nA hinge.\n', claims: '1. A hinge.' }
    expect(validateDraft(input)).toEqual(validateDraft({ ...input, figures: '' }))
  })
})
