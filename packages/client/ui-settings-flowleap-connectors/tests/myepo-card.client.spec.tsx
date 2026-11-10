// @vitest-environment jsdom
/** The MyEPO card as the approved mockup draws it: each mode, the rows that open with a click, and the acts. */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MyEpoCard, MYEPO_GUIDE_URL, formatTested, type MyEpoCardProps } from '../src/client/MyEpoCard.tsx'
import { en } from '../src/client/locales.ts'
import type { MyEpoState } from '../src/client/myepo-store.ts'

afterEach(() => {
  cleanup()
  document.documentElement.lang = ''
})

const t = (key: keyof typeof en) => en[key]
const LINKED = { state: 'linked' as const, writable: true, testedAt: '2026-11-09T12:00:00.000Z', portfolios: 6, mailbox: true }
const PORTFOLIOS = [
  { name: 'Applicant Portfolio 1', type: 'applicant' as const, fullAccess: true },
  { name: 'Representative Portfolio 2', type: 'representative' as const, fullAccess: false },
  { name: 'Association Portfolio 1', type: 'association' as const, fullAccess: true },
  { name: 'Licensee', type: 'other' as const, fullAccess: false },
]
const PASSED = { kind: 'passed' as const, testedAt: '2026-11-09T13:00:00.000Z', portfolios: PORTFOLIOS, mailbox: true }

function renderCard(overrides: Partial<MyEpoState> = {}) {
  const state: MyEpoState = {
    status: 'ready', link: { state: 'not-linked', writable: true }, draft: { clientId: '', clientSecret: '' }, busy: 'idle', replacing: false, ...overrides,
  }
  const acts = { edit: vi.fn(), link: vi.fn(), test: vi.fn(), unlink: vi.fn(), replace: vi.fn() } satisfies Omit<MyEpoCardProps, 'state' | 't'>
  render(<MyEpoCard state={state} t={t} {...acts} />)
  return acts
}

const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name })

describe('the MyEPO card', () => {
  it('shows the short intro, the two collapsed rows and the empty fields while not linked', () => {
    const acts = renderCard()
    expect(screen.getByText(en.myEpoNotLinked)).toBeTruthy()
    expect(screen.getByText(en.myEpoIntro)).toBeTruthy()
    for (const source of [en.myEpoApplications, en.myEpoLetters, en.myEpoDueDates, en.myEpoFees]) {
      expect(screen.getByText(source)).toBeTruthy()
    }
    expect(screen.getByText(en.myEpoReadOnly)).toBeTruthy()
    expect(screen.getByText(en.myEpoReadFlag)).toBeTruthy()
    expect(screen.queryByText(en.myEpoStep1)).toBeNull()
    expect(screen.queryByText(en.myEpoApplicationsDetail)).toBeNull()
    for (const label of [en.myEpoClientId, en.myEpoClientSecret]) {
      const input = screen.getByLabelText(label)
      expect(input).toHaveProperty('type', 'password')
      expect(input.getAttribute('autocomplete')).toBe('new-password')
    }
    expect(button(en.myEpoSaveTest).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(en.myEpoClientId), { target: { value: 'id' } })
    expect(acts.edit).toHaveBeenCalledWith('clientId', 'id')
  })

  it('opens the details and the setup with one click each, with the rights table and the EPO guide', () => {
    renderCard()
    const setup = screen.getByRole('button', { name: new RegExp(en.myEpoSetupTitle) })
    expect(setup.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(setup)
    expect(setup.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(en.myEpoStep1)).toBeTruthy()
    expect(screen.getByText(en.myEpoRightMailbox)).toBeTruthy()
    expect(screen.getByText(en.myEpoWhySending)).toBeTruthy()
    expect(screen.getByRole('link', { name: en.myEpoGuide }).getAttribute('href')).toBe(MYEPO_GUIDE_URL)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.myEpoDetailsTitle) }))
    expect(screen.getByText(en.myEpoLettersDetail)).toBeTruthy()
    expect(screen.getByText(en.myEpoSecretStays)).toBeTruthy()
    fireEvent.click(setup)
    expect(screen.queryByText(en.myEpoStep1)).toBeNull()
  })

  it('enables Save and test for a complete draft, and offers Cancel while replacing a stored link', () => {
    const acts = renderCard({ draft: { clientId: 'id', clientSecret: 'secret' }, link: LINKED, replacing: true })
    expect(screen.queryByText(en.myEpoIntro)).toBeNull()
    expect(screen.queryByRole('button', { name: new RegExp(en.myEpoDetailsTitle) })).toBeNull()
    fireEvent.click(button(en.myEpoSaveTest))
    expect(acts.link).toHaveBeenCalledTimes(1)
    fireEvent.click(button(en.myEpoCancel))
    expect(acts.replace).toHaveBeenCalledWith(false)
  })

  it('shows the test steps and a disabled button while a test runs', () => {
    renderCard({ busy: 'linking', draft: { clientId: 'id', clientSecret: 'secret' } })
    expect(screen.getByText(en.myEpoTesting)).toBeTruthy()
    for (const step of [en.myEpoStepToken, en.myEpoStepPortfolios, en.myEpoStepMailbox]) expect(screen.getByText(step)).toBeTruthy()
    expect(button(en.myEpoTestingButton).disabled).toBe(true)
    expect(screen.getByLabelText<HTMLInputElement>(en.myEpoClientSecret).disabled).toBe(true)
  })

  it('shows a passed test: the portfolio count as the key fact, each portfolio with type and access, and the checks', () => {
    document.documentElement.lang = 'en-GB'
    renderCard({ outcome: PASSED, link: { ...LINKED, portfolios: 4 } })
    expect(screen.getByText(en.myEpoLinked)).toBeTruthy()
    expect(screen.getByText(`4 ${en.myEpoPortfolioMany}`)).toBeTruthy()
    expect(screen.getByText(`${en.myEpoTested} ${formatTested(PASSED.testedAt)}`)).toBeTruthy()
    const rows = screen.getAllByRole('row').map(row => row.textContent)
    expect(rows).toEqual([
      `${en.myEpoPortfolioColumn}${en.myEpoTypeColumn}${en.myEpoAccessColumn}`,
      `Applicant Portfolio 1${en.myEpoTypeApplicant}${en.myEpoAccessFull}`,
      `Representative Portfolio 2${en.myEpoTypeRepresentative}${en.myEpoAccessLimited}`,
      `Association Portfolio 1${en.myEpoTypeAssociation}${en.myEpoAccessFull}`,
      `Licensee${en.myEpoTypeOther}${en.myEpoAccessLimited}`,
    ])
    expect(screen.getByText(en.myEpoCheckMailbox)).toBeTruthy()
    expect(screen.getByText(en.myEpoReadFlag)).toBeTruthy()
  })

  it('offers Test and the menu with Replace credentials and Unlink on a linked card', async () => {
    const acts = renderCard({ link: LINKED })
    expect(screen.getByText(`6 ${en.myEpoPortfolioMany}`)).toBeTruthy()
    expect(screen.getByText(new RegExp(`^${en.myEpoLastTest} `))).toBeTruthy()
    expect(screen.queryByRole('button', { name: new RegExp(en.myEpoDetailsTitle) })).toBeNull()
    expect(screen.getByRole('button', { name: new RegExp(en.myEpoSetupTitle) })).toBeTruthy()
    fireEvent.click(button(en.myEpoTest))
    expect(acts.test).toHaveBeenCalledTimes(1)
    fireEvent.click(button(en.myEpoMore))
    fireEvent.click(await screen.findByRole('menuitem', { name: en.myEpoReplace }))
    expect(acts.replace).toHaveBeenCalledWith(true)
    fireEvent.click(button(en.myEpoMore))
    fireEvent.click(await screen.findByRole('menuitem', { name: en.myEpoUnlink }))
    expect(acts.unlink).toHaveBeenCalledTimes(1)
    fireEvent.click(button(en.myEpoMore))
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
  })

  it('shows a linked account with no portfolio as waiting for permission, and one portfolio in the singular', () => {
    renderCard({ link: { ...LINKED, portfolios: 0 } })
    expect(screen.getByText(en.myEpoNoPortfolio)).toBeTruthy()
    cleanup()
    renderCard({ link: { ...LINKED, portfolios: 1, mailbox: false }, busy: 'unlinking' })
    expect(screen.getByText(en.myEpoLinked)).toBeTruthy()
    expect(screen.getByText(`1 ${en.myEpoPortfolioOne}`)).toBeTruthy()
    expect(screen.getByText(en.myEpoCheckNoMailbox)).toBeTruthy()
    expect(button(en.myEpoTest).disabled).toBe(true)
    expect(button(en.myEpoMore).disabled).toBe(true)
  })

  it('shows an empty portfolio list as waiting for permission, with Test again', () => {
    const acts = renderCard({ outcome: { ...PASSED, portfolios: [], mailbox: false }, link: { ...LINKED, portfolios: 0, mailbox: false } })
    expect(screen.getByText(en.myEpoNoPortfolio)).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain(en.myEpoEmptyLead)
    expect(screen.getByText(en.myEpoCheckNoPortfolio)).toBeTruthy()
    fireEvent.click(button(en.myEpoTestAgain))
    fireEvent.click(button(en.myEpoReplace))
    fireEvent.click(button(en.myEpoUnlink))
    expect(acts.test).toHaveBeenCalledTimes(1)
    expect(acts.replace).toHaveBeenCalledWith(true)
    expect(acts.unlink).toHaveBeenCalledTimes(1)
  })

  it('shows a refused test with the empty fields for a new entry', () => {
    renderCard({ outcome: { kind: 'refused' } })
    expect(screen.getByText(en.myEpoFailed)).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(en.myEpoRefusedLead)
    expect(button(en.myEpoSaveTest).disabled).toBe(true)
  })

  it('shows an unreachable EPO on a linked card with the last passed test and Try again on the stored link', () => {
    const acts = renderCard({ outcome: { kind: 'unreachable' }, link: LINKED })
    expect(screen.getByRole('alert').textContent).toContain(en.myEpoOfflineBody)
    expect(screen.getByText(new RegExp(`^${en.myEpoLastPassed} `))).toBeTruthy()
    fireEvent.click(button(en.myEpoTryAgain))
    fireEvent.click(button(en.myEpoReplace))
    expect(acts.test).toHaveBeenCalledTimes(1)
    expect(acts.replace).toHaveBeenCalledWith(true)
  })

  it('shows an unreachable EPO before the first link with the kept draft and Try again on the draft', () => {
    const acts = renderCard({ outcome: { kind: 'unreachable' }, draft: { clientId: 'id', clientSecret: 'secret' } })
    expect(screen.getByRole('alert').textContent).toContain(en.myEpoOfflineBodyNew)
    fireEvent.click(button(en.myEpoTryAgain))
    expect(acts.link).toHaveBeenCalledTimes(1)
  })

  it('shows another EPO refusal with its message, and Save and test once the draft is gone', () => {
    renderCard({ outcome: { kind: 'failed', message: 'the EPO refused the read: 400 ERR_30 Invalid procedure' } })
    expect(screen.getByRole('alert').textContent).toContain('ERR_30 Invalid procedure')
    expect(button(en.myEpoSaveTest).disabled).toBe(true)
  })

  it('shows a refused call and disables the fields of a read-only store', () => {
    renderCard({ error: 'flowleap-connectors/rejected', link: { state: 'not-linked', writable: false }, draft: { clientId: 'a', clientSecret: 'b' } })
    expect(screen.getByRole('alert').textContent).toBe('flowleap-connectors/rejected')
    expect(screen.getByLabelText<HTMLInputElement>(en.myEpoClientId).disabled).toBe(true)
    expect(button(en.myEpoSaveTest).disabled).toBe(true)
  })

  it('formats the time of a test in the page language, or the browser language without one', () => {
    document.documentElement.lang = 'de-DE'
    expect(formatTested('2026-11-09T12:00:00.000Z')).toContain('2026')
    document.documentElement.lang = ''
    expect(formatTested('2026-11-09T12:00:00.000Z')).toContain('2026')
  })
})
