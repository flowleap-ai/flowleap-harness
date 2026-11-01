// @vitest-environment jsdom
/** Models-owned next step in a chat row whose Turn failed with `MISSING_CREDENTIAL`. */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ManagedModelNotice } from '../src/client/MissingCredentialAction.tsx'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

describe('missing-credential chat action', () => {
  it('tells a managed deployment\'s user to ask the administrator and offers no control', () => {
    const view = render(<ManagedModelNotice t={key => en[key]} />)
    expect(view.container.textContent).toBe('Ask your administrator to set up a model.')
    expect(view.queryByRole('button')).toBeNull()
  })

  it('states the administrator step in the active locale', () => {
    const view = render(<ManagedModelNotice t={key => zh[key]} />)
    expect(view.container.textContent).toBe('请联系管理员设置模型。')
  })
})
