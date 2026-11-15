/** The applications and the data of the Applications specs, in the form of the recorded sandbox answers. */
import type { MyEpoApplicationDetailView, MyEpoApplicationsView, MyEpoApplicationView } from '@deepseek-ai/dsh-api-remotes/client'
import type { Answer } from '../src/client/applications/docket.ts'

const application = (fields: Partial<MyEpoApplicationView>): MyEpoApplicationView => ({
  procedure: 'EPC', number: 'EP00000001', numberWithCheckDigit: 'EP00000001.8', filingDate: '2024-06-06', fileReference: 'B-ref',
  portfolioId: 'p1', portfolioName: 'Portfolio one', ...fields,
})

/** One number as a European patent and as a unitary patent, an application with no reference, and an older one. */
export const APPLICATIONS: MyEpoApplicationView[] = [
  application({}),
  application({ procedure: 'UPP', filingDate: '2024-05-10', fileReference: 'A-ref' }),
  application({ number: 'EP00000002', numberWithCheckDigit: 'EP00000002.6', filingDate: '2023-06-06', fileReference: null, portfolioId: 'p2', portfolioName: 'Portfolio two' }),
  application({ number: 'EP00000003', numberWithCheckDigit: 'EP00000003.4', filingDate: '2022-06-06', fileReference: 'C-ref', portfolioId: 'p2', portfolioName: 'Portfolio two' }),
]

export const KEYS = ['EPC:EP00000001', 'UPP:EP00000001', 'EPC:EP00000002', 'EPC:EP00000003'] as const

export const LIST: Extract<MyEpoApplicationsView, { kind: 'read' }> = {
  kind: 'read', readAt: '2026-11-15T09:00:00.000Z', applications: APPLICATIONS, total: APPLICATIONS.length,
}

/** The day of the specs: one due date of {@link DETAIL} is before it and one is after it. */
export const TODAY = '2026-11-15'

export const DETAIL: Extract<MyEpoApplicationDetailView, { kind: 'read' }> = {
  kind: 'read',
  titles: { EN: 'Scale', DE: 'Maßstab' },
  applicants: ['Renishaw plc, Wotton-under-Edge, GB'],
  inventors: ['One, A', 'Two, B', 'Three, C', 'Four, D', 'Five, E'],
  representatives: ['Dunn, Paul Edward, GB'],
  publications: [{ office: 'EP', number: '4584557', kind: 'A1', date: '2025-07-16' }],
  priorities: [{ office: 'EP', number: '22275123', filingDate: '2022-09-08' }],
  ipc: ['G01D 5/244'],
  cpc: [],
  dueDates: [
    { termKey: 'DUE_TERM_11', description: { en: 'Reply to communication', fr: 'Répondre à la notification', de: 'Bescheid erwidern' }, dueDate: '2027-01-29', actor: 'Representative' },
    { termKey: 'DUE_TERM_NEW', description: null, dueDate: '2025-01-13', actor: 'Applicant' },
  ],
  fees: [
    { feeCode: '033', amount: 1915, currency: 'EUR', dueDate: '2026-11-30' },
    { feeCode: '007', amount: 123, currency: null, dueDate: '2027-01-29' },
  ],
}

/** A Remote answer that succeeded. */
export function ok<T>(value: T): Answer<T> {
  return { ok: true, value }
}

/** A Remote answer that failed. */
export function failed(message: string): Answer<never> {
  return { ok: false, error: { message } }
}
