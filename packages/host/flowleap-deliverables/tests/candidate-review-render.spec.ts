/**
 * The rendered candidate review, invalidity chart, find-better report and
 * working record on sparse reviews and records: no coverage, rows without
 * anchors or elements, searches without a query or counts, fallback rows the
 * ladder cannot place, Search Rounds without targets or counts, and the model
 * fields the wording review reads.
 */

import { describe, expect, it } from 'vitest'
import type { PatentEvidenceSource, PatentExecution, PatentExecutionSnapshot } from '../src/ledger/types.ts'
import {
  candidateWordingReview, challengedClaims, referenceRoles, renderCandidateReview, renderWorkingRecord, type PatentCandidateReview,
} from '../src/report/candidate-review.ts'

type Row = NonNullable<PatentCandidateReview['coverage']>[number]

const CHALLENGED = 'EP3000001B1'

function source(anchor: string, publicationNumber: string, section: 'claims' | 'description', extra: Partial<PatentEvidenceSource> = {}): PatentEvidenceSource {
  return { anchor, reference: { publicationNumber, section }, retrieval: 'returned', review: 'unknown', completeness: 'unknown', ...extra }
}

function snapshotOf(...executions: PatentExecution[]): PatentExecutionSnapshot {
  return { executions, limitation: 'Synthetic fixture; no live search.' }
}

function row(feature: string, extra: Partial<Row> = {}): Row {
  return { feature, kind: 'feature', importance: 'essential', status: 'unresolved', gap: 'Not found.', ...extra }
}

/** The lines of `text` from the line `from` up to, not including, the next line that starts with `##`. */
function section(text: string, from: string): string[] {
  const lines = text.split('\n')
  const start = lines.indexOf(from)
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  return lines.slice(start, end < 0 ? undefined : end).filter(line => line.trim())
}

const REVIEW_FIELDS = { scope: 'Description.', qualifiers: 'As written.', quantityBasis: 'No quantity.' }

describe('prior-art review on sparse records', () => {
  const web = (publication: string) => source(`${publication}:description`, publication, 'description', {
    text: 'A band of spring steel <img src="f1.png"> holds the pipe.', textSource: 'web', url: `https://patents.example.com/${publication}`,
  })
  const snapshot = snapshotOf(
    { id: 'empty', recordedAt: '2026-10-17T01:00:00Z', kind: 'details', status: 'succeeded', publicationIds: ['EP4000000A1'] },
    { id: 'web', recordedAt: '2026-10-17T02:00:00Z', kind: 'details', status: 'succeeded', sources: [web('US1000001'), web('US1000002'), source('EP5000000A1:claims:1:en', 'EP5000000A1', 'claims')] },
    { id: 'search', recordedAt: '2026-10-17T03:00:00Z', kind: 'search', status: 'succeeded' },
  )
  const webRow = (publication: string): Row => row(`Band of ${publication}`, {
    status: 'supported', gap: '', sourceAnchors: [`${publication}:description`],
    evidence: [{ anchor: `${publication}:description`, quote: 'A band of spring steel <img src="f1.png"> holds the pipe.', ...REVIEW_FIELDS }],
  })

  it('lists an empty retrieval, the web rows, an unquoted search and the image notice', () => {
    const rendered = renderCandidateReview({ coverage: [webRow('US1000001'), webRow('US1000002'), row('Combination', { kind: 'combination' })] }, snapshot, 'r.working-record.md')
    const lines = rendered.split('\n')
    expect({
      uncited: section(rendered, '## Retrieved but not cited in coverage').find(line => line.startsWith('| EP4000000A1')),
      search: section(rendered, '## Search sets')[3],
      web: lines.find(line => line.includes('rest on web page text, not official full text')),
      keywords: lines.includes('- No classification-code (CPC/IPC) query was recorded; the search relied on keywords only.'),
      image: lines.filter(line => line.startsWith('Formula/image placeholders were replaced')).length,
      stop: section(rendered, '## Search stopping rationale'),
      limitations: section(rendered, '## Limitations')[0],
    }).toEqual({
      uncited: '| EP4000000A1 | Unknown | Unknown | none recorded | unrecorded | — |',
      search: '| search_patents | unknown | not filtered | unknown | — |',
      web: '- 2 rows rest on web page text, not official full text: US1000001, US1000002. Confirm each against the official full text or a certified copy before use.',
      keywords: true,
      image: 2,
      stop: ['## Search stopping rationale'],
      limitations: '## Limitations',
    })
  })

  it('renders a review without coverage, and a supported row without elements or anchors', () => {
    const empty = renderCandidateReview({}, snapshot, 'r.working-record.md')
    const bare = renderCandidateReview({ coverage: [{ ...row('Band', { status: 'partial' }) }] }, snapshot, 'r.working-record.md')
    expect({
      empty: section(empty, '## Coverage and remaining search tracks'),
      bare: section(bare, '## Coverage and remaining search tracks').slice(0, 3),
    }).toEqual({
      empty: ['## Coverage and remaining search tracks'],
      bare: ['## Coverage and remaining search tracks', '### Band', '**feature · essential · partial**'],
    })
  })

  it('states a working record search without query or counts, and no open points for an invalidity chart without claims', () => {
    const record = renderWorkingRecord({}, snapshot, 'r.md', 'r.md.evidence.json', undefined, undefined, 'invalidity').split('\n')
    expect({
      search: record.some(line => line.startsWith('| succeeded | unknown (effective query unknown) | unknown | unknown | unknown |')),
      points: record.includes('No open points.'),
      ladder: record.some(line => line.startsWith('## Fallback coverage')),
    }).toEqual({
      search: true,
      points: true,
      ladder: false,
    })
  })
})

describe('invalidity chart on sparse records', () => {
  const claims = (texts: readonly string[], numbered = true): PatentExecution => ({
    id: 'claims', recordedAt: '2026-10-17T01:00:00Z', kind: 'details', status: 'succeeded', publicationIds: [CHALLENGED],
    sources: texts.map((text, index) => ({
      ...source(`${CHALLENGED}:claims:${String(index + 1)}:en`, CHALLENGED, 'claims', { text }),
      reference: { publicationNumber: CHALLENGED, section: 'claims', ...(numbered ? { claimNumber: String(index + 1) } : {}) },
    })),
  })
  const LADDER = claims([
    '1. A pipe clamp comprising a band and a screw.',
    '2. The clamp according to claim 1, wherein the band is steel.',
    '3. The clamp according to claim 1, wherein the screw is captive.',
    '4. A method of fastening a pipe.',
  ])

  it('renders the rows as a plain list when the challenged claims are not recorded', () => {
    const rendered = renderCandidateReview({ challengedPublication: 'EP9999999B1', coverage: [row('Band', { claimNumber: '1' })] }, snapshotOf(), 'c.working-record.md', 'invalidity')
    expect(rendered.split('\n').filter(line => line.startsWith('#')).slice(2, 4)).toEqual(['## Coverage and remaining search tracks', '### Band'])
  })

  it('charts unnumbered rows, a claim without dependents, an uncharted rung without a reason, and rounds without targets or counts', () => {
    const review: PatentCandidateReview = {
      challengedPublication: CHALLENGED,
      coverage: [
        row('Unnumbered element'),
        row('Band and screw', { claimNumber: '1' }),
        row('Steel band', { kind: 'fallback', claimNumber: '2', fallbackOf: '1' }),
        row('Method step', { claimNumber: '4' }),
        row('Method as a whole', { kind: 'combination', claimNumber: '5' }),
      ],
      rounds: [{ round: 1, targets: [], answers: ['rung-3'], queries: [{ tool: 'search_npl', query: 'captive screw' }], outcome: ' ' }],
    }
    const rendered = renderCandidateReview(review, snapshotOf(LADDER), 'c.working-record.md', 'invalidity')
    const lines = rendered.split('\n')
    expect({
      headings: lines.filter(line => /^## (?:Coverage|Claim|Fallback)/.test(line)),
      claim1: lines.find(line => line.startsWith('Claim 1: ')),
      claim4: lines.find(line => line.startsWith('Claim 4: ')),
      uncharted: lines.find(line => line.startsWith('| Claim 3 (1 → 3)')),
      round: section(rendered, '## Search rounds').slice(2),
      roles: lines.some(line => line === '## Reference roles (generated)'),
    }).toEqual({
      headings: [
        '## Coverage and remaining search tracks',
        '## Claim 1 — elements',
        '## Fallback coverage (generated) — claim 1',
        '## Claim 4 — elements',
        '## Fallback coverage (generated) — claim 4',
        '## Claim 5 — elements',
      ],
      claim1: 'Claim 1: 0 of 1 elements disclosed; fallbacks: 0 of 2 covered (0 partly); not covered: claim 2.',
      claim4: 'Claim 4: 0 of 1 elements disclosed; fallbacks: none (no dependent claim refers to claim 4).',
      uncharted: '| Claim 3 (1 → 3) | 3. The clamp according to claim 1, wherein the screw is captive. | not charted:  | — |',
      round: [
        '### Search Round 1',
        'Targets: none named',
        'Answers open points: rung-3',
        '| Tool | Query | Count | Ledger |',
        '| --- | --- | --- | --- |',
        '| search_npl | captive screw | not stated | not recorded by the ledger |',
        'Outcome (model judgment): none stated',
      ],
      roles: false,
    })
  })

  it('places claim-numbered fallbacks beside unsegmented claims, and a description fallback whose basis is not recorded', () => {
    const review: PatentCandidateReview = {
      challengedPublication: CHALLENGED,
      coverage: [
        row('Band and screw', { claimNumber: '1' }),
        row('Steel band', { kind: 'fallback', claimNumber: '2', fallbackOf: '1' }),
        row('Captive screw', { kind: 'fallback', claimNumber: '3', fallbackOf: '1' }),
        row('Lined band', { kind: 'fallback', fallbackOf: '1', basis: { anchor: `${CHALLENGED}:description:en`, quote: 'The band is lined.' } }),
      ],
    }
    const unsegmented = snapshotOf(claims(['1. A pipe clamp comprising a band and a screw. 2. The clamp of claim 1.'], false))
    const chart = renderCandidateReview(review, unsegmented, 'c.working-record.md', 'invalidity').split('\n')
    expect({
      line: chart.find(line => line.startsWith('Claim 1: ')),
      table: chart.filter(line => line.startsWith('| Claim 2 |') || line.startsWith('| Claim 3 |')),
      details: chart.filter(line => line.startsWith('### Claim 2') || line.startsWith('Basis in the challenged patent')),
    }).toEqual({
      line: 'Claim 1: 0 of 1 elements disclosed; claim numbers could not be established; no Fallback Ladder; fallbacks: 0 of 3 covered (0 partly); not covered: claims 2, 3, description fallback "Lined band".',
      table: [
        '| Claim 2 | claim text not established | not found in the cited art | — |',
        '| Claim 3 | claim text not established | not found in the cited art | — |',
      ],
      details: ['### Claim 2 — fallback of claim 1', `Basis in the challenged patent: ${CHALLENGED}:description:en`],
    })
  })
})

describe('find-better report on sparse rows', () => {
  it('names no art where no side cites a recorded document, and renders an empty comparison without rows', () => {
    const review: PatentCandidateReview = {
      examinerBestArt: [{ claimNumber: '1', publications: ['US5135330A'] }],
      coverage: [row('Claim 1 — a band', { claimNumber: '1', examiner: { status: 'unresolved', gap: 'Not found.' }, found: { status: 'supported', sourceAnchors: ['DE9:claims:1:en'], gap: '' } })],
    }
    const lines = renderCandidateReview(review, snapshotOf(), 'f.working-record.md', 'find-better').split('\n')
    expect({
      header: lines.find(line => line.startsWith('| Element |')),
      empty: renderCandidateReview({}, snapshotOf(), 'f.working-record.md', 'find-better').includes('## Claim-by-claim comparison'),
    }).toEqual({
      header: '| Element | Examiner\'s best art (none cited) | Best art found (none cited) |',
      empty: true,
    })
  })
})

describe('wording review and reference roles', () => {
  it('reads concepts, synonyms and classification meanings, and finds nothing in a review without rows', () => {
    const review: PatentCandidateReview = {
      concepts: [{ concept: 'clamp', synonyms: ['the clamp anticipates claim 1'] }],
      classifications: [{ code: 'F16L3/00', meaning: 'Pipe supports; claim 1 is obvious over D1' }],
    }
    expect({ flagged: candidateWordingReview(review).length > 0, none: candidateWordingReview({}) }).toEqual({ flagged: true, none: [] })
  })

  it('takes no role from a row whose anchors are not recorded, and names no claim without numbered rows', () => {
    const sources = new Map([['US1:claims:1:en', source('US1:claims:1:en', 'US1', 'claims')]])
    expect({
      roles: referenceRoles({ coverage: [row('Band', { sourceAnchors: ['US9:claims:1:en'], elements: [{ element: 'band', anchor: 'US1:claims:1:en' }, { element: 'liner' }] })] }, sources),
      none: referenceRoles({}, sources),
      claims: [challengedClaims({}), challengedClaims({ coverage: [row('Band'), row('Screw', { claimNumber: '2' })] })],
    }).toEqual({ roles: [{ publication: 'US1', rows: ['Band'], alone: false }], none: [], claims: [[], ['2']] })
  })
})
