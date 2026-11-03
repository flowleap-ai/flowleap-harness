// @vitest-environment jsdom
/** Models-owned next step in a chat row whose Turn failed with `MISSING_CREDENTIAL`. */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ManagedModelNotice, SetUpModelButton } from '../src/client/MissingCredentialAction.tsx'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

describe('missing-credential chat action', () => {
  it('opens the Models page from one set-up button', () => {
    const openModels = vi.fn<() => void>()
    const view = render(<SetUpModelButton t={key => en[key]} openModels={openModels} />)
    fireEvent.click(view.getByRole('button', { name: 'Set up a model' }))
    expect(openModels).toHaveBeenCalledOnce()
  })

  it('tells a managed deployment\'s user to ask the administrator and offers no control', () => {
    const view = render(<ManagedModelNotice t={key => en[key]} />)
    expect(view.container.textContent).toBe('Ask your administrator to set up a model.')
    expect(view.queryByRole('button')).toBeNull()
  })

  it('states each step in the active locale', () => {
    const view = render(<>
      <SetUpModelButton t={key => zh[key]} openModels={() => {}} />
      <ManagedModelNotice t={key => zh[key]} />
    </>)
    expect(view.getByRole('button').textContent).toBe('设置模型')
    expect(view.container.textContent).toContain('请联系管理员设置模型。')
  })
})
