/**
 * The candidate-review checks and open points on inputs the IDE specs leave
 * out: every structural refusal of a coverage row, element locators that are
 * missing or point outside the row, drawing elements without an anchor or a
 * recorded page, web text without official text of its document, failed
 * searches retried with a stated purpose, and dates that are not real dates.
 */

import { describe, expect, it } from 'vitest'
import type { PatentEvidenceSource, PatentExecution, PatentExecutionSnapshot } from '../src/ledger/types.ts'
import { chartOpenPoints, searchedJurisdictions, validateCandidateReview, type PatentCandidateReview } from '../src/report/candidate-review.ts'

type Row = NonNullable<PatentCandidateReview['coverage']>[number]

const CLAIM = '1. A pipe clamp comprising a band and a screw.'
const DESCRIPTION = 'The band is made of spring steel and the screw is captive.'

function source(anchor: string, publicationNumber: string, section: 'claims' | 'description' | 'bibliography', extra: Partial<PatentEvidenceSource> = {}): PatentEvidenceSource {
  return { anchor, reference: { publicationNumber, section }, retrieval: 'returned', review: 'unknown', completeness: 'unknown', ...extra }
}

function details(id: string, sources: readonly PatentEvidenceSource[], extra: Partial<PatentExecution> = {}): PatentExecution {
  return { id, recordedAt: '2026-10-17T01:00:00Z', kind: 'details', status: 'succeeded', sources, ...extra }
}

function snapshotOf(...executions: PatentExecution[]): PatentExecutionSnapshot {
  return { executions, limitation: 'Synthetic fixture; no live search.' }
}

function row(feature: string, extra: Partial<Row> = {}): Row {
  return { feature, kind: 'feature', importance: 'essential', status: 'unresolved', sourceAnchors: [], gap: 'Not found.', ...extra }
}

const CLAIM_ANCHOR = 'EP1000000A1:claims:1:en'
const DESCRIPTION_ANCHOR = 'EP1000000A1:description:en'
const FIGURE_ANCHOR = 'EP1000000A1:figure:2'
const SNAPSHOT = snapshotOf(
  details('claims', [
    { ...source(CLAIM_ANCHOR, 'EP1000000A1', 'claims', { text: CLAIM, language: 'en' }), reference: { publicationNumber: 'EP1000000A1', section: 'claims', claimNumber: '1' } },
    source(DESCRIPTION_ANCHOR, 'EP1000000A1', 'description', { text: DESCRIPTION, language: 'en' }),
    source('EP1000000A1:bibliography', 'EP1000000A1', 'bibliography'),
    source('EP2000000A1:description:en', 'EP2000000A1', 'description'),
  ], { publicationIds: ['EP1000000A1'] }),
  { id: 'figures', recordedAt: '2026-10-17T02:00:00Z', kind: 'figures', status: 'succeeded', sources: [source(FIGURE_ANCHOR, 'EP1000000A1', 'bibliography', { figure: { page: 2 } })] },
)
const REVIEW_FIELDS = { scope: 'Claim 1.', qualifiers: 'As written.', quantityBasis: 'No quantity.' }
const COMBINATION = row('Essential combination', { kind: 'combination' })
const BASE: PatentCandidateReview = { limitations: ['Synthetic fixture.'], stopReason: 'Interim review.' }

describe('validateCandidateReview', () => {
  it('refuses content beside coverage for each structured template', () => {
    const content = { ...BASE, content: 'A narrative.', coverage: [COMBINATION] }
    const first = (variant: 'prior-art' | 'invalidity' | 'find-better') => validateCandidateReview(content, SNAPSHOT, '', variant)[0]
    expect([first('prior-art'), first('invalidity'), first('find-better')].map(line => line?.split(',')[0])).toEqual([
      'For prior-art-report',
      'For invalidity-claim-chart with coverage',
      'For find-better-report',
    ])
  })

  it('asks for coverage, an essential row, limitations, a stop reason and a combination row when the review has none', () => {
    expect([validateCandidateReview({}, SNAPSHOT), validateCandidateReview({ coverage: [row('Optional band', { importance: 'optional' })] }, SNAPSHOT)]).toEqual([
      [
        'Supply coverage for essential features and their combination, including unresolved tracks.',
        'Identify at least one essential feature or combination.',
        'Supply the search and evidence limitations.',
        'Supply stopReason: explain synthesis, remaining gaps, or the user-requested boundary.',
        'Include an explicit essential combination row; it may honestly remain unresolved.',
      ],
      [
        'Identify at least one essential feature or combination.',
        'Supply the search and evidence limitations.',
        'Supply stopReason: explain synthesis, remaining gaps, or the user-requested boundary.',
        'Include an explicit essential combination row; it may honestly remain unresolved.',
      ],
    ])
  })

  it('refuses a citation of a section without claim number that no tool recorded', () => {
    const url = 'flowleap://flowleap.patent-ai/patent?publication=EP9000000A1&section=description'
    expect(validateCandidateReview({ ...BASE, coverage: [COMBINATION] }, SNAPSHOT, `See ${url}.`)).toEqual([
      `Unresolved patent reader citation: ${url}. Retrieve the exact section/claim or remove the unsupported citation.`,
    ])
  })

  it('refuses each malformed row: no feature, no anchors, unknown anchors, no kind, a missing gap, and evidence outside the row', () => {
    const { kind: _kind, ...noKind } = row('No kind')
    const coverage: Row[] = [
      row(' '),
      row('Supported without anchors', { status: 'supported', sourceAnchors: [], elements: [{ element: 'band', anchor: CLAIM_ANCHOR, disclosedBy: 'a band' }] }),
      row('Unknown anchor', { sourceAnchors: ['EP9:claims:1:en'] }),
      noKind,
      row('No gap', { gap: ' ' }),
      row('Stray evidence', { evidence: [{ anchor: CLAIM_ANCHOR, quote: CLAIM, ...REVIEW_FIELDS }] }),
      COMBINATION,
    ]
    expect(validateCandidateReview({ ...BASE, coverage }, SNAPSHOT, '', 'invalidity').filter(line => !line.startsWith('No claims of the challenged patent'))).toEqual([
      'Every coverage row needs a feature, importance, and valid status.',
      'Coverage for "Supported without anchors" needs known source anchors or unresolved status.',
      'Element "band" of "Supported without anchors" cites EP1000000A1:claims:1:en, which is not one of that row\'s sourceAnchors. Cite one of: none listed.',
      'Unknown source anchor: EP9:claims:1:en. Recover known IDs with get_claims or get_description for that publication; do not repeat searches or downgrade a conclusion merely to pass validation.',
      'Identify coverage kind (feature, combination or fallback) for "No kind".',
      'Describe the remaining gap for "No gap".',
      'Evidence for "Stray evidence" must use that row\'s sourceAnchors.',
    ])
  })

  it('refuses evidence without recorded text, without a quote, with a partial claim, or without review fields, and an anchor without evidence', () => {
    const coverage: Row[] = [
      row('No evidence', { status: 'partial', sourceAnchors: [CLAIM_ANCHOR], elements: [{ element: 'band', anchor: CLAIM_ANCHOR, disclosedBy: 'a band' }, { element: 'liner' }] }),
      row('Older record', {
        status: 'partial', sourceAnchors: ['EP2000000A1:description:en'], evidence: [{ anchor: 'EP2000000A1:description:en', quote: 'A band.', ...REVIEW_FIELDS }],
        elements: [{ element: 'band', anchor: 'EP2000000A1:description:en', disclosedBy: 'a band' }, { element: 'liner' }],
      }),
      row('No quote', {
        status: 'partial', sourceAnchors: [CLAIM_ANCHOR, DESCRIPTION_ANCHOR],
        evidence: [{ anchor: CLAIM_ANCHOR, ...REVIEW_FIELDS }, { anchor: DESCRIPTION_ANCHOR, quote: ' ', scope: ' ', qualifiers: '', quantityBasis: '' }],
        elements: [{ element: 'band', anchor: DESCRIPTION_ANCHOR, disclosedBy: 'spring steel' }, { element: 'liner' }],
      }),
      COMBINATION,
    ]
    expect(validateCandidateReview({ ...BASE, coverage }, SNAPSHOT)).toEqual([
      'Row "No evidence" lists EP1000000A1:claims:1:en in sourceAnchors (or an element cites it) without an evidence entry. Add an evidence entry for EP1000000A1:claims:1:en with scope, qualifiers and quantityBasis; quote may be omitted for a numbered claim (the writer copies it) and is required verbatim for a description passage.',
      'No recorded text for EP2000000A1:description:en (older record): retrieve it once with get_claims or get_description so the quotation can be checked.',
      'Recorded text for EP2000000A1:description:en is an older record; retrieve once with get_claims or get_description for that publication so the fragment for element "band" can be checked.',
      'Evidence for EP1000000A1:claims:1:en needs a verbatim quote: a description passage must be quoted exactly as returned (only numbered claims may omit quote). Copy it from the get_claims or get_description result.',
      'Quote the complete claim for EP1000000A1:claims:1:en, including dependency language, qualifiers and every constituent; do not extract only a numeric range.',
      'Evidence for EP1000000A1:description:en needs a verbatim quote: a description passage must be quoted exactly as returned (only numbered claims may omit quote). Copy it from the get_claims or get_description result.',
      'Review scope/dependency, qualifiers and original quantity basis for EP1000000A1:description:en. Keep original units and all constituents; do not substitute an unverified percentage conversion.',
    ])
  })

  it('refuses element locators that are incomplete, drawing elements without an anchor or a recorded page, and partial rows with nothing disclosed', () => {
    const evidence = [{ anchor: CLAIM_ANCHOR, quote: CLAIM, ...REVIEW_FIELDS }]
    const coverage: Row[] = [
      row('Locators', {
        status: 'supported', sourceAnchors: [CLAIM_ANCHOR], evidence, gap: '',
        elements: [
          { element: ' ' },
          { element: 'band', anchor: CLAIM_ANCHOR },
          { element: 'screw', disclosedBy: 'a screw' },
          { element: 'cam', basis: 'figure', reading: 'Figure 2 shows a cam.' },
          { element: 'lever', anchor: FIGURE_ANCHOR, basis: 'figure', reading: 'Figure 2 shows a lever.' },
          { element: 'pin', anchor: CLAIM_ANCHOR, basis: 'figure', reading: 'Figure 2 shows a pin.' },
        ],
      }),
      row('Nothing disclosed', { status: 'partial', sourceAnchors: [CLAIM_ANCHOR], evidence, elements: [{ element: 'liner' }] }),
      COMBINATION,
    ]
    expect(validateCandidateReview({ ...BASE, coverage }, SNAPSHOT)).toEqual([
      'Every element of "Locators" needs the constituent it names.',
      'Element "band" of "Locators" cites no literal fragment. Give both the anchor and a literal fragment of its recorded text, or omit both and name the element in the gap.',
      'Element "screw" of "Locators" cites no source anchor. Give both the anchor and a literal fragment of its recorded text, or omit both and name the element in the gap.',
      'Element "cam" of "Locators" rests on a drawing but cites no figure anchor. Give the PUB:figure:N anchor printed by get_patent_figures and a reading of what the drawing clearly shows, or drop basis: figure and cite a literal fragment of recorded text.',
      'Element "lever" of "Locators" cites EP1000000A1:figure:2, which is not one of that row\'s sourceAnchors. Cite one of: EP1000000A1:claims:1:en.',
      'Element "pin" of "Locators" cites EP1000000A1:claims:1:en, which is not a recorded drawing page. Retrieve the drawing once with get_patent_figures(publicationNumber) and cite the PUB:figure:N anchor it prints.',
      'No element of "Nothing disclosed" is disclosed by cited text. Either mark the row unresolved, or keep it partial and give at least one element an anchor and a literal disclosedBy fragment; a partial row needs both a disclosed and an undisclosed element.',
    ])
  })

  it('accepts a supported combination whose elements name no recorded publication, and a web passage of a document with no official text', () => {
    const web = source('US7000000:description', 'US7000000', 'description', { text: DESCRIPTION, textSource: 'web', url: 'https://patents.example.com/US7000000' })
    const snapshot = snapshotOf(...SNAPSHOT.executions, details('web', [web]))
    const combination = row('Essential combination', {
      kind: 'combination', status: 'supported', gap: '', sourceAnchors: ['US7000000:description'],
      evidence: [{ anchor: 'US7000000:description', quote: DESCRIPTION, ...REVIEW_FIELDS }],
      elements: [{ element: 'band', anchor: 'US7000000:description', disclosedBy: 'spring steel' }, { element: 'screw', anchor: 'US7000000:description', disclosedBy: 'the screw is captive' }],
    })
    expect(validateCandidateReview({ ...BASE, coverage: [combination] }, snapshot)).toEqual([])
  })
})

describe('chartOpenPoints and jurisdictions', () => {
  it('reads no rows from an empty chart, and keeps a malformed country filter out of the searched jurisdictions', () => {
    const search: PatentExecution = { id: 'search', recordedAt: '2026-10-17T00:00:00Z', kind: 'search', status: 'succeeded', query: 'ta=clamp', countryFilter: ['EP', 'EURO'] }
    expect({ points: chartOpenPoints({}, SNAPSHOT), jurisdictions: searchedJurisdictions(snapshotOf(search)) }).toEqual({ points: [], jurisdictions: ['EP'] })
  })

  it('names a cited document with an impossible date, a row resting fully on a drawing, and a failed search named by its later purpose', () => {
    const failed = (id: string, purpose?: string): PatentExecution => ({ id, recordedAt: '2026-10-17T00:00:00Z', kind: 'search', status: 'failed', query: 'ta=clamp', ...(purpose ? { purpose } : {}) })
    const snapshot = snapshotOf(
      { ...SNAPSHOT.executions[0]!, publicationDate: '2001-02-30' },
      SNAPSHOT.executions[1]!,
      failed('first'),
      failed('second', 'band material'),
      { id: 'unnamed', recordedAt: '2026-10-17T00:00:00Z', kind: 'search', status: 'cancelled' },
    )
    const review: PatentCandidateReview = {
      criticalDate: '2005-03-01',
      coverage: [row('Lever on the drawing', {
        status: 'supported', gap: '', sourceAnchors: [FIGURE_ANCHOR], elements: [{ element: 'lever', anchor: FIGURE_ANCHOR, basis: 'figure', reading: 'Figure 2 shows a lever.' }],
      })],
    }
    expect(chartOpenPoints(review, snapshot)).toEqual([
      { id: 'date-EP1000000A1', text: 'Cited document EP1000000A1 has no recorded publication date, so it was not compared with the critical date 2005-03-01.' },
      { id: 'drawing-row1', text: 'The row rests on a drawing reading, not on quoted text: Lever on the drawing' },
      { id: 'search-1', text: 'A search failed and did not run again: band material (ta=clamp)' },
      { id: 'search-2', text: 'A search failed and did not run again: query not recorded' },
    ])
  })
})
