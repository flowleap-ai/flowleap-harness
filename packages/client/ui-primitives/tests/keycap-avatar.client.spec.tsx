// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Avatar, AvatarStack, Keycap, avatarInitial, keycapText } from '@deepseek-ai/dsh-client-ui-primitives'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Keycap', () => {
  it('renders one box for each keycap of a sequence and hides from assistive technology', () => {
    const { container } = render(<Keycap keycaps={[['G'], ['M']]} />)
    const group = container.firstElementChild as HTMLElement
    expect(group.getAttribute('aria-hidden')).toBe('true')
    expect([...group.querySelectorAll('kbd')].map(kbd => kbd.textContent)).toEqual(['G', 'M'])
    expect(group.dataset['tone']).toBe('default')
  })

  it('carries its tone and a placement class', () => {
    const { container } = render(<Keycap keycaps={[['⇧', '⌘', 'Enter']]} tone="primary" className="placed" />)
    const group = container.firstElementChild as HTMLElement
    expect(group.dataset['tone']).toBe('primary')
    expect(group.textContent).toBe('⇧⌘↵')
    expect(group.classList.contains('placed')).toBe(true)
  })

  it('renders nothing for a command with no binding', () => {
    const { container } = render(<Keycap keycaps={[]} />)
    expect(container.firstElementChild).toBeNull()
  })
})

describe('keycapText', () => {
  it.each([
    [['⇧', '⌘', 'Enter'], '⇧⌘↵'],
    [['Shift', 'Command', 'Return'], '⇧⌘↵'],
    [['Ctrl', 'Shift', 'K'], 'Ctrl+Shift+K'],
    [['Ctrl', 'Shift', 'Enter'], 'Ctrl+Shift+↵'],
    [['Enter'], '↵'],
    [['G'], 'G'],
    [['Space'], 'Space'],
  ])('writes %j as %j', (box, text) => {
    expect(keycapText(box)).toBe(text)
  })
})

describe('avatarInitial', () => {
  it.each([
    ['Dr. Anna Becker', 'A'],
    ['Prof. Dr. Lena Hoffmann', 'L'],
    ['jonas weber', 'J'],
    ['Dr.', 'D'],
    ['  ', ''],
    ['Émile Zola', 'É'],
  ])('reads %j as %j', (name, initial) => {
    expect(avatarInitial(name)).toBe(initial)
  })
})

describe('Avatar', () => {
  it('names the person and shows the name on hover', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    render(<Avatar person={{ name: 'Jonas Weber' }} />)
    const avatar = screen.getByRole('img', { name: 'Jonas Weber' })
    expect(avatar.textContent).toBe('J')
    expect(avatar.dataset['size']).toBe('20')
    act(() => { fireEvent.pointerEnter(avatar, { pointerType: 'mouse' }) })
    act(() => { vi.runAllTimers() })
    expect(screen.getByRole('tooltip').textContent).toContain('Jonas Weber')
  })

  it('takes an accessible name with the presence and draws the presence dot', () => {
    render(<Avatar person={{ name: 'Jonas Weber', present: true, label: 'Jonas Weber, viewing now' }} size={24} />)
    const avatar = screen.getByRole('img', { name: 'Jonas Weber, viewing now' })
    expect(avatar.dataset['present']).toBe('true')
    expect(avatar.dataset['size']).toBe('24')
  })

  it('is decorative when the name shows beside it', () => {
    const { container } = render(<Avatar person={{ name: 'Dr. Anna Becker' }} nameShown className="placed" />)
    const avatar = container.firstElementChild as HTMLElement
    expect(avatar.getAttribute('aria-hidden')).toBe('true')
    expect(avatar.getAttribute('role')).toBeNull()
    expect(avatar.textContent).toBe('A')
    expect(avatar.classList.contains('placed')).toBe(true)
    expect(screen.queryByRole('img')).toBeNull()
  })
})

describe('AvatarStack', () => {
  it('renders the team in order, each named', () => {
    render(<AvatarStack people={[{ name: 'Dr. Anna Becker' }, { name: 'Jonas Weber' }, { name: 'Lena Hoffmann' }]} size={24} className="placed" />)
    const avatars = screen.getAllByRole('img')
    expect(avatars.map(avatar => avatar.getAttribute('aria-label'))).toEqual(['Dr. Anna Becker', 'Jonas Weber', 'Lena Hoffmann'])
    expect(avatars.every(avatar => avatar.dataset['size'] === '24')).toBe(true)
    expect(avatars[0]!.parentElement!.classList.contains('placed')).toBe(true)
  })

  it('renders nothing for an empty team', () => {
    const { container } = render(<AvatarStack people={[]} />)
    expect(container.firstElementChild).toBeNull()
  })
})
