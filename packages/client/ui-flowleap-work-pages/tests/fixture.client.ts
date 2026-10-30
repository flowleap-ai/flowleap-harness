/** Work page values for the board specs: one EP analysis with two objections, as `flowleapWorkPages.read()` gives them. */

import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Objection, WorkPageFile, WorkPageId, WorkPageSummary, WorkPageView } from '@deepseek-ai/dsh-flowleap-deliverables/work-pages'
import { SessionId } from '@deepseek-ai/dsh-session/types'

/** The id of the fixture page. */
export const PAGE_ID = brandString<WorkPageId>('0123456789abcdef')

/** The id of a second page. */
export const OTHER_ID = brandString<WorkPageId>('fedcba9876543210')

/** The chat that saved the fixture page. */
export const CHAT = SessionId('chat-ep')

/**
 * A successful Remote result.
 * @param value - the value.
 * @returns the result.
 */
export function ok<T>(value: T): RemoteResult<T> {
  return { ok: true, value }
}

const novelty: Objection = {
  id: '1',
  title: 'Claims 1-3 lack novelty over D1',
  ground: 'Art. 54 EPC',
  legalBasis: 'Art. 54(1) EPC',
  claims: [1, 2, 3],
  reasoning: 'D1 discloses a heat pump with a battery.',
  source: 'search report categories',
  citations: [
    { document: 'D1 US2016107508A1', role: 'X', passage: '¶[0059]', says: 'a refrigerant-fluid heat exchanger', anchor: 'US2016107508A1:claims:1:en' },
    { document: 'D1 claims', role: '', passage: '', says: 'claim 2', anchor: '' },
  ],
  assessment: 'Disputable.',
  options: [{ label: 'Argue', text: 'D1 is a vehicle system' }, { label: 'Amend', text: '' }],
  replyMustAddress: 'Each ground.',
  confidence: 'Low.',
  sources: 'US2016107508A1:claims:1:en',
}

const clarity: Objection = {
  id: '2',
  title: 'Clarity of claim 9',
  ground: 'Art. 84 EPC',
  legalBasis: '',
  claims: [],
  reasoning: '',
  source: '',
  citations: [],
  assessment: '',
  options: [],
  replyMustAddress: '',
  confidence: '',
  sources: '',
}

/** The fixture file. */
export const FILE: WorkPageFile = {
  schemaVersion: 1,
  kind: 'office-action',
  about: 'about',
  report: '2026-09-30-analysis.md',
  findings: {
    application: 'EP4814394',
    communication: 'EPO, European search report',
    issued: '2026-09-30',
    deadline: '2027-03-30',
    summary: 'Search report only.',
    action: [{ field: 'Application', value: 'EP4814394', source: 'get_bibliography' }],
    documents: [{ label: 'D1', text: 'US2016107508 (A1)' }, { label: '', text: 'family member' }],
    objections: [novelty, clarity],
    comparison: [
      {
        claim: 1, heading: 'Claim 1 against D1', interpretation: '"loop": a closed circuit.',
        rows: [{ element: '1a "a loop"', examiner: 'X', cited: '"a refrigerant loop"', assessment: 'disclosed' }], arrangement: 'In series.',
      },
      { claim: 12, heading: 'Claim 12 against D1', interpretation: '', rows: [], arrangement: '' },
    ],
    dependentClaims: '',
  },
  review: {
    '1': { state: 'needs_review', owner: '', note: '', ground: 'Art. 54 EPC', title: 'Claims 1-3 lack novelty over D1' },
    '2': { state: 'relevant', owner: 'A. Novak', note: 'Amend claim 9.', ground: 'Art. 84 EPC', title: 'Clarity of claim 9' },
  },
}

/** The fixture summary. */
export const SUMMARY: WorkPageSummary = {
  id: PAGE_ID,
  sessionId: CHAT,
  report: 'office-actions/EP4814394/2026-09-30-analysis.md',
  path: 'office-actions/EP4814394/2026-09-30-analysis.md.work.json',
  application: 'EP4814394',
  communication: 'EPO, European search report',
  savedAt: '2026-10-29T10:00:00.000Z',
  objections: 2,
  needsReview: 1,
}

/** The fixture view. */
export const VIEW: WorkPageView = { summary: SUMMARY, file: FILE }

/** A second, older page. */
export const OTHER: WorkPageSummary = {
  ...SUMMARY, id: OTHER_ID, application: 'US 19/043,989', savedAt: '2026-10-20T10:00:00.000Z', needsReview: 3,
}

/**
 * The fixture view with other review fields of one objection.
 * @param id - the objection.
 * @param fields - the new fields.
 * @returns the view.
 */
export function reviewed(id: string, fields: Partial<WorkPageFile['review'][string]>): WorkPageView {
  const review = { ...FILE.review, [id]: { ...FILE.review[id]!, ...fields } }
  const needsReview = Object.values(review).filter(entry => entry.state === 'needs_review').length
  return { summary: { ...SUMMARY, needsReview }, file: { ...FILE, review } }
}
