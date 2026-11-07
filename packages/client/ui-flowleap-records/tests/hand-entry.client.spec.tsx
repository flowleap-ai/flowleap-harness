// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IntakeDocument, IsoDate } from '../src/client/api.ts'
import { en } from '../src/client/locales.ts'
import { handCommand } from '../src/client/screens/IntakeLetter.tsx'
import { createFixtureApi, fixtures } from './fixtures.client.ts'
import { flush, mountPanel } from './screen-harness.client.tsx'

let mounted: Awaited<ReturnType<typeof mountPanel>> | null = null
beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })))
  vi.setSystemTime(Date.parse('2026-11-04T15:00:00Z'))
})
afterEach(() => {
  mounted?.dispose()
  mounted = null
  cleanup()
  vi.unstubAllGlobals()
})

/** A scan with no reading, as `GET intake/documents/<sha256>` answers it with the codes of the hand entry. */
const scan: IntakeDocument = {
  ...fixtures.intakeDocument,
  status: { machine: 'intake', state: 'unreadable' },
  code: null, documentDate: null, applicationNumber: null, fields: {}, proposed: null, candidates: 0, filed: null, officeEvent: null,
  mayDecide: { allowed: true },
  entry: { codes: [{ code: 'EPO:R71(3)', form: '2004C', title: { en: 'Rule 71(3) communication', de: 'Mitteilung nach Regel 71(3)' } }] },
}

/**
 * Mount the letter page of the scan.
 * @param letter - the card.
 * @returns the mounted panel and the acts it sent.
 */
async function mountScan(letter: IntakeDocument) {
  const { api, acts } = createFixtureApi()
  vi.spyOn(api, 'intakeDocument').mockResolvedValue({ ok: true, value: letter })
  mounted = await mountPanel(api, { view: 'letter', document: letter.document }, 'en', 'my-work')
  return acts
}

const enter = () => screen.getByRole('button', { name: /^Enter office event/u })

describe('the hand entry of a scan with no reading', () => {
  it('builds the filing act only when the matter, the application number, the office event and the date are set', () => {
    const values = { fileNumber: 'FL-2026-0001', applicationNumber: ' 24 123 456.7 ', code: 'EPO:R71(3)', documentDate: '2026-10-30' }
    expect(handCommand(scan, values)).toEqual({
      kind: 'intake.file', document: scan.document, fileNumber: 'FL-2026-0001', code: 'EPO:R71(3)', documentDate: '2026-10-30',
      applicationNumber: '24 123 456.7',
    })
    for (const missing of [{ fileNumber: 'FL-9999-0000' }, { applicationNumber: ' ' }, { code: '' }, { documentDate: '30.10.2026' }]) {
      expect(handCommand(scan, { ...values, ...missing })).toBeNull()
    }
  })

  it('files the scan and records its office event in one act from the decision bar', async () => {
    const acts = await mountScan(scan)
    expect(screen.getByText(en['letter.hand.incomplete'])).toBeTruthy()
    expect(enter().hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getByRole('combobox', { name: en['prop.matter'] }), { target: { value: 'FL-2026-0001' } })
    fireEvent.change(screen.getByRole('textbox', { name: en['prop.application'] }), { target: { value: '24 123 456.7' } })
    fireEvent.change(screen.getByLabelText(new RegExp(`^${en['letter.hand.date']}`, 'u')), { target: { value: '2026-10-30' } })
    expect(screen.getByRole('combobox', { name: en['letter.hand.event'] }).textContent).toBe('Rule 71(3) communication')
    expect(screen.queryByText(en['letter.hand.incomplete'])).toBeNull()
    fireEvent.click(enter())
    await flush()
    expect(acts.map(act => act.command)).toEqual([{
      kind: 'intake.file', document: scan.document, fileNumber: 'FL-2026-0001', code: 'EPO:R71(3)', documentDate: '2026-10-30',
      applicationNumber: '24 123 456.7',
    }])
  })

  it('blocks the act as not available when the record offers no hand entry', async () => {
    await mountScan({ ...scan, entry: null })
    expect(screen.getByText(en['letter.hand.unavailable'])).toBeTruthy()
    expect(enter().hasAttribute('disabled')).toBe(true)
  })

  it('never calls the entered office event of a filed scan a reading of FlowLeap', async () => {
    const unreadable = { ...fixtures.intakeDocument.activity[0]!, seq: 200, type: 'document/unreadable' }
    await mountScan({
      ...scan, status: { machine: 'deadline', state: 'engine_refused' }, code: 'EPO:A97(1)', documentDate: '2025-10-23' as IsoDate,
      applicationNumber: '21755382.5', entry: null, activity: [unreadable],
    })
    expect(screen.queryByRole('region', { name: en['letter.read'] })).toBeNull()
    expect(screen.queryByText(/FlowLeap read the letter as/u)).toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en['code.epoGrant'])
  })
})
