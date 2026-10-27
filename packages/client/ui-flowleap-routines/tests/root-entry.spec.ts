import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

describe('ui-flowleap-routines node half', () => {
  it('registers nothing on the host', () => {
    expect(() => { apply() }).not.toThrow()
  })
})
