/**
 * The Fallback Ladder checks on less usual charts and records: a claim cycle,
 * a chart without a challenged patent, empty query fields, description
 * fallbacks without a usable basis, repeated saves out of order, web sources,
 * and open points that tie on claim order.
 */

import { describe, expect, it } from 'vitest'
import type { PatentEvidenceSource, PatentExecution, PatentExecutionSnapshot } from '../src/ledger/types.ts'
import type { PatentCandidateReview } from '../src/report/candidate-review.ts'
import {
  deriveFallbackLadder, fallbackCoverage, fallbackLadderErrors, roundAnswerErrors, roundLedgerStatus, roundOrderErrors, rowOpenPoints,
  rowReferences, shortPhrase, webSourceOpenPoints,
} from '../src/report/fallback-ladder.ts'

type Row = NonNullable<PatentCandidateReview['coverage']>[number]

const PUBLICATION = 'EP3000001B1'

function source(anchor: string, publicationNumber: string, section: 'claims' | 'description', extra: Partial<PatentEvidenceSource> = {}): PatentEvidenceSource {
  return { anchor, reference: { publicationNumber, section }, retrieval: 'returned', review: 'unknown', completeness: 'unknown', ...extra }
}

function claims(texts: readonly string[]): PatentExecution {
  return {
    id: 'details', recordedAt: '2026-10-17T01:00:00Z', kind: 'details', status: 'succeeded', publicationIds: [PUBLICATION],
    sources: texts.map((text, index) => ({
      ...source(`${PUBLICATION}:claims:${String(index + 1)}:en`, PUBLICATION, 'claims'),
      text,
      reference: { publicationNumber: PUBLICATION, section: 'claims', claimNumber: String(index + 1) },
    })),
  }
}

function snapshotOf(...executions: PatentExecution[]): PatentExecutionSnapshot {
  return { executions, limitation: 'Synthetic fixture; no live search.' }
}

function row(feature: string, extra: Partial<Row> = {}): Row {
  return { feature, importance: 'essential', status: 'supported', gap: '', ...extra }
}

const LADDER = claims([
  '1. A pipe clamp comprising a band and a screw.',
  '2. The clamp according to claim 1, wherein the band is steel.',
  '3. The clamp according to claim 1, wherein the screw is captive.',
])

describe('deriveFallbackLadder', () => {
  it('gives no rung to claims that refer only to each other', () => {
    const derivation = deriveFallbackLadder(snapshotOf(claims([
      '1. A pipe clamp comprising a band.',
      '2. The clamp according to claim 3, wherein the band is steel.',
      '3. The clamp according to claim 2, wherein the band is lined.',
    ])), PUBLICATION)
    expect(derivation.kind === 'ladder' ? derivation.ladders.map(ladder => [ladder.claimNumber, ladder.rungs.length]) : derivation).toEqual([['1', 0]])
  })

  it('finds nothing for a chart that names no challenged patent', () => {
    expect([deriveFallbackLadder(snapshotOf(LADDER), undefined), deriveFallbackLadder(snapshotOf(LADDER), '  ')]).toEqual([{ kind: 'missing' }, { kind: 'missing' }])
  })
})

describe('fallbackLadderErrors', () => {
  it('accepts a chart without coverage rows or rounds', () => {
    expect({
      errors: fallbackLadderErrors({ challengedPublication: PUBLICATION }, snapshotOf(LADDER), new Map()),
      coverage: fallbackCoverage({}, { kind: 'missing' }),
      web: webSourceOpenPoints({}, new Map()),
    }).toEqual({ errors: [], coverage: [], web: [] })
  })

  it('asks for the challenged patent when the chart names none', () => {
    expect(fallbackLadderErrors({}, snapshotOf(LADDER), new Map())).toEqual([
      'No claims of the challenged patent are recorded this session: fetch the challenged patent\'s claims with get_claims first, and name it in challengedPublication. The writer builds the Fallback Ladder from that call.',
    ])
  })

  it('refuses description fallbacks without a basis, with an unrecorded anchor, or with no recorded text', () => {
    const sources = new Map([[`${PUBLICATION}:description:en`, source(`${PUBLICATION}:description:en`, PUBLICATION, 'description')]])
    const review: PatentCandidateReview = {
      challengedPublication: PUBLICATION,
      coverage: [
        row('band and screw', { kind: 'feature', claimNumber: '1' }),
        row('steel band', { kind: 'fallback', claimNumber: '2', fallbackOf: '1' }),
        row('captive screw', { kind: 'fallback', claimNumber: '3', fallbackOf: '1' }),
        row('no basis', { kind: 'fallback', fallbackOf: '1' }),
        row('unknown anchor', { kind: 'fallback', fallbackOf: '1', basis: { anchor: 'EP9:description:en', quote: 'a band' } }),
        row('older record', { kind: 'fallback', fallbackOf: '1', basis: { anchor: `${PUBLICATION}:description:en`, quote: 'a band' } }),
      ],
    }
    expect(fallbackLadderErrors(review, snapshotOf(LADDER), sources)).toEqual([
      'Description fallback "no basis" needs basis.anchor (a description anchor of the challenged patent) and basis.quote (the verbatim passage that supports the fallback), or a claimNumber naming a dependent claim.',
      'Description fallback "unknown anchor" cites basis.anchor EP9:description:en, which is not a recorded source. Copy the anchor that get_description printed for the challenged patent\'s description.',
      `No recorded text for ${PUBLICATION}:description:en (older record): retrieve it once with get_claims or get_description so the basis quote of "older record" can be checked.`,
    ])
  })

  it('refuses a fallback of a claim without rungs, a doubly charted rung, an incomplete not-charted entry and an empty round query', () => {
    const review: PatentCandidateReview = {
      challengedPublication: PUBLICATION,
      coverage: [
        row('band and screw', { kind: 'feature', claimNumber: '1' }),
        row('steel band', { kind: 'feature', claimNumber: '2' }),
        row('no claim number', { kind: 'feature' }),
        row('steel band again', { kind: 'fallback', claimNumber: '2', fallbackOf: '1' }),
        row('steel band twice', { kind: 'fallback', claimNumber: '2', fallbackOf: '1' }),
        row('captive screw', { kind: 'fallback', claimNumber: '3', fallbackOf: '2' }),
      ],
      fallbacksNotCharted: [{ claimNumber: '3', reason: ' ' }],
      rounds: [{ round: 1, targets: ['3'], queries: [{ tool: '', query: 'captive screw' }], outcome: 'none' }],
    }
    expect(fallbackLadderErrors(review, snapshotOf(LADDER, { id: 'save', recordedAt: '2026-10-17T02:00:00Z', kind: 'save', status: 'succeeded' }), new Map())).toEqual([
      'Fallback row "captive screw" charts claim 3, which is not a rung of claim 2\'s Fallback Ladder (claim 2 has no dependent claims). Name the independent claim claim 3 depends on in fallbackOf, or chart a rung of claim 2.',
      'Every fallbacksNotCharted entry needs the claimNumber of the rung and the reason it is not charted.',
      'Claim 2 is charted 2 time(s) under claim 1 and named 0 time(s) in fallbacksNotCharted. Give each rung exactly one fallback row or one fallbacksNotCharted entry.',
      'Claim 3 (chain 1 → 3) is a rung of claim 1\'s Fallback Ladder but has no fallback row and no fallbacksNotCharted entry. Chart the limitation it adds in one row (kind fallback, claimNumber 3, fallbackOf 1), or name it in fallbacksNotCharted with the reason.',
      'Search Round 1 lists a query without its tool or its text. Name the tool and copy the query exactly as it ran.',
      'Round 1 has no query the ledger can confirm; include at least one search_patents, search_register or web_fetch query exactly as run.',
    ])
  })
})

describe('Search Round checks on a re-save', () => {
  const search = (recordedAt: string, query: string): PatentExecution => ({ id: query, recordedAt, kind: 'search', status: 'succeeded', query })
  const save = (recordedAt: string, extra: Partial<PatentExecution> = {}): PatentExecution => ({ id: recordedAt, recordedAt, kind: 'save', status: 'succeeded', request: 'chart.md', ...extra })
  const round = { round: 1, targets: ['3'], queries: [{ tool: 'search_patents', query: 'captive screw' }, { tool: 'search_patents', query: 'never run' }], outcome: 'none' }

  it('reads the previous save as the latest one recorded, whatever the record order', () => {
    const snapshot = snapshotOf(search('2026-10-17T01:00:00Z', 'captive screw'), save('2026-10-17T03:00:00Z', { openPoints: ['rung-3'] }), save('2026-10-17T02:00:00Z'))
    expect({
      order: roundOrderErrors({ rounds: [round] }, snapshot, 'chart.md'),
      answers: roundAnswerErrors({ rounds: [round] }, snapshot, 'chart.md'),
    }).toEqual({
      order: ['Round 1 lists only queries that ran before the previous save of this chart (2026-10-17T03:00:00Z); a Search Round is a new search after the receipt. Run at least one new query aimed at the not-covered limitations and record it in the round, or save without the round.'],
      answers: ['Round 1 answers no open point of the previous receipt. A Search Round runs only on the expert\'s answer to the Round Report. In answers, give the ids of the open points the expert chose (the previous receipt listed rung-3). If the expert has not answered yet, save without the new round, write the Round Report and wait.'],
    })
  })

  it('confirms a round query through a named recorded tool', () => {
    const snapshot = snapshotOf({ id: 'status', recordedAt: '2026-10-17T01:00:00Z', kind: 'status', status: 'succeeded', tool: 'get_legal_status', request: 'EP3000001' })
    const review: PatentCandidateReview = { rounds: [{ round: 1, targets: ['3'], queries: [{ tool: 'get_legal_status', query: 'EP3000001' }], outcome: 'none' }] }
    expect(roundLedgerStatus(review, snapshot)).toEqual([{ round: 1, queries: ['matched'] }])
  })

  it('checks nothing for a chart without rounds, and reports none for the ledger', () => {
    const snapshot = snapshotOf(save('2026-10-17T02:00:00Z', { openPoints: ['rung-3'] }))
    expect([roundOrderErrors({}, snapshot, 'chart.md'), roundAnswerErrors({}, snapshot, 'chart.md'), roundLedgerStatus({}, snapshot)]).toEqual([[], [], []])
  })
})

describe('Fallback Coverage and row references', () => {
  it('leaves a fallback row without fallbackOf out of the coverage, and names an unnumbered feature row by its place', () => {
    const review: PatentCandidateReview = { coverage: [row('band', { kind: 'feature', claimNumber: '1' }), row('loose', { kind: 'fallback' }), row('unnumbered', { kind: 'feature' })] }
    expect({ coverage: fallbackCoverage(review, { kind: 'missing' }), references: rowReferences(review), none: rowReferences({}) }).toEqual({
      coverage: [{ claimNumber: '1', rungs: [], covered: [], partly: [], notCovered: [], notCharted: [] }],
      references: ['1.1', 'd1', 'row3'],
      none: [],
    })
  })

  it('cuts a long phrase to one line with an ellipsis', () => {
    expect(shortPhrase(`${'a band '.repeat(4)}end`, 12)).toBe('a band a ba…')
  })
})

describe('web sources', () => {
  it('opens one point per web document, in publication order, naming each row that rests on it', () => {
    const web = (anchor: string, publication: string, url: string) => source(anchor, publication, 'description', { textSource: 'web', url })
    const sources = new Map([
      ['US2:web', web('US2:web', 'US2', 'https://patents.example.com/US2')],
      ['US1:web', web('US1:web', 'US1', 'https://other.example.org/US1')],
      ['US1:web:2', web('US1:web:2', 'US1', 'https://other.example.org/US1#p2')],
      ['EP1:description:en', source('EP1:description:en', 'EP1', 'description')],
    ])
    const review: PatentCandidateReview = {
      coverage: [
        row('band', { kind: 'feature', claimNumber: '1', sourceAnchors: ['US2:web', 'EP1:description:en'] }),
        row('screw', { kind: 'feature', claimNumber: '1', evidence: [{ anchor: 'US1:web', quote: 'a screw', scope: '', qualifiers: '', quantityBasis: '' }], elements: [{ element: 'screw', anchor: 'US1:web:2' }, { element: 'nut' }] }),
        row('liner', { kind: 'feature', claimNumber: '1', status: 'unresolved', sourceAnchors: ['US1:web'] }),
        row('band again', { kind: 'feature', claimNumber: '1', sourceAnchors: ['US2:web'] }),
      ],
    }
    expect(webSourceOpenPoints(review, sources)).toEqual([
      { id: 'source-US1', text: 'Row(s) 1.2 rest on web page text of US1 (other.example.org), not official full text' },
      { id: 'source-US2', text: 'Row(s) 1.1, 1.4 rest on web page text of US2 (patents.example.com), not official full text' },
    ])
  })
})

describe('rowOpenPoints', () => {
  it('orders rungs and elements by claim, then by row, and names a fallback without its claim or parent', () => {
    const review: PatentCandidateReview = {
      coverage: [
        row('second description fallback', { kind: 'fallback', fallbackOf: '1', status: 'partial' }),
        row('first description fallback', { kind: 'fallback', fallbackOf: '1', status: 'unresolved' }),
        row('orphan', { kind: 'fallback', status: 'unresolved' }),
        row('element of claim 2', { kind: 'feature', claimNumber: '2', status: 'unresolved' }),
        row('unnumbered element', { kind: 'feature', status: 'unresolved' }),
        row('element of claim 1', { kind: 'feature', claimNumber: '1', status: 'unresolved' }),
        row('another element of claim 1', { kind: 'feature', claimNumber: '1', status: 'unresolved' }),
      ],
    }
    expect({ points: rowOpenPoints(review), none: rowOpenPoints({}) }).toEqual({
      points: [
        { id: 'rung-d1', text: 'Description fallback of claim 1 is partly disclosed in the cited art: second description fallback' },
        { id: 'rung-d2', text: 'Description fallback of claim 1 is not found in the cited art: first description fallback' },
        { id: 'rung-d3', text: 'Description fallback of claim ? is not found in the cited art: orphan' },
        { id: 'element-1.1', text: 'Claim 1 element is not found in the cited art: element of claim 1' },
        { id: 'element-1.2', text: 'Claim 1 element is not found in the cited art: another element of claim 1' },
        { id: 'element-2.1', text: 'Claim 2 element is not found in the cited art: element of claim 2' },
        { id: 'element-row5', text: 'Element is not found in the cited art: unnumbered element' },
      ],
      none: [],
    })
  })
})
