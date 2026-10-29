/**
 * The Find Better helpers on sparse or malformed input: a Baseline from a
 * file that misses fields, rows with one side, examiner's best art without a
 * category, refusals for each incomplete input, and the report sections when
 * the Baseline, the tracks or a side are absent.
 */

import { describe, expect, it } from 'vitest'
import type { PatentEvidenceSource, PatentExecutionSnapshot } from '../src/ledger/types.ts'
import type { PatentCandidateReview } from '../src/report/candidate-review.ts'
import {
  claimComparisons, claimResultSentence, distinctDocuments, examinerArtHeader, examinerArtLabel, findBetterErrors, flattenSides, gapCount,
  incompleteSearch, renderBaseline, renderTracks, sideStatus, type ExaminerBaseline,
} from '../src/report/find-better.ts'

type Row = NonNullable<PatentCandidateReview['coverage']>[number]

const EMPTY: PatentExecutionSnapshot = { executions: [], limitation: 'Synthetic fixture; no live search.' }

function row(feature: string, extra: Partial<Row> = {}): Row {
  return { feature, importance: 'essential', status: 'unresolved', gap: '', ...extra }
}

function claimSource(anchor: string, publicationNumber: string): PatentEvidenceSource {
  return { anchor, text: 'A clamp.', reference: { publicationNumber, section: 'claims', claimNumber: '1' }, retrieval: 'returned', review: 'unknown', completeness: 'unknown' }
}

/** A Baseline of the shape the writer checks, citing US1000001 as X. */
const BASELINE: ExaminerBaseline = {
  publication: 'EP2000000B1',
  offices: ['EP'],
  documents: [{ document: 'US1000001', cells: { EP: { text: 'X', citations: [{ citedBy: 'examiner', category: 'X' }] } } }],
  gaps: [],
}

describe('flattenSides', () => {
  it('keeps a review without rows, and projects a one-sided row onto one row with no anchors and no gap', () => {
    const empty: PatentCandidateReview = {}
    expect({
      empty: flattenSides(empty) === empty,
      found: flattenSides({ coverage: [row('Claim 1 — a band', { claimNumber: '1', found: { status: 'supported', gap: '' } })] }).coverage,
    }).toEqual({
      empty: true,
      found: [{
        feature: 'Claim 1 — a band — best art found', kind: undefined, importance: 'essential', claimNumber: '1', status: 'supported',
        sourceAnchors: [], gap: '', evidence: undefined, elements: undefined,
      }],
    })
  })
})

describe('Baseline documents', () => {
  it('names an NPL row and a kind-coded spelling once each, keeping the fullest spelling', () => {
    expect(distinctDocuments(['NPL: Smith 2001', 'npl: smith 2001', 'EP1162102', 'EP1162102A2'])).toEqual(['NPL: Smith 2001', 'EP1162102A2'])
  })

  it('ranks the examiner\'s best art by its basis, naming each basis that is not X or Y', () => {
    const baseline: ExaminerBaseline = {
      documents: [
        { document: 'US1000001', cells: { EP: { text: 'Y cl. 1' } } },
        { document: 'US1000002', cells: { EP: { text: 'A', citations: [{ citedBy: 'examiner', category: 'A' }] } } },
        { document: 'US1000003', cells: { US: { citations: [{ source: 'uspto_enriched' }] } } },
        { document: 'US1000004' },
        { document: 'US1000005', cells: { EP: { text: 'see the search report' } } },
      ],
    }
    expect({
      ranked: examinerArtHeader({ baseline }, ['US1000005', 'US1000004', 'US1000003', 'US1000002', 'US1000001', 'US9000000']),
      noBaseline: examinerArtHeader({}, ['US2', 'US1']),
    }).toEqual({
      ranked: ['US1000001', 'US1000002 (category A)', 'US1000003 (US office-action rejection, no category)', 'US1000005', 'US1000004', 'US9000000'],
      noBaseline: ['US2', 'US1'],
    })
  })
})

describe('findBetterErrors', () => {
  it('refuses a missing Baseline by each field the writer reads', () => {
    expect(findBetterErrors({}, new Map())).toEqual([
      'baseline.offices must be the array of office codes the Baseline prints as matrix columns.',
      'baseline.documents must be the array of cited documents, each with its document key and per-office cells.',
      'baseline.gaps must be present: an empty array when every member returned a citation record, so a missing record is never read as "nothing cited".',
    ])
  })

  it('refuses a truncated Baseline that names no count or publication, and one whose counted reads lack citations', () => {
    const rerun = 'Re-run the examiner_baseline tool (it writes the full JSON to references/<publication>.examiner-baseline.json), or the CLI (flowleap --json patent examiner-baseline <publication> > references/<publication>.examiner-baseline.json), and pass that file unedited as baselinePath.'
    const short: ExaminerBaseline = {
      ...BASELINE,
      publication: ' ',
      membersWalked: [
        { publications: [{ publication: 'EP1', status: 'read', citedCount: 2 }] },
        { office: 'US' },
        { office: 'EP', publications: [{ publication: 'EP2', status: 'not_found' }] },
      ],
      documents: [
        { document: 'US1', cells: { EP: { citations: [{ citing: 'EP1' }, {}] } } },
        { document: 'US2' },
        { document: 'US3', cells: { EP: { text: 'X' } } },
      ],
    }
    expect({
      truncated: findBetterErrors({ baseline: { _truncation: {} } }, new Map()),
      short: findBetterErrors({ baseline: short }, new Map()),
    }).toEqual({
      truncated: [`The Examiner Baseline carries _truncation: a tool cut it at its character budget. A truncated Baseline is not the Baseline, and the report would state fewer cited documents than the offices cited. ${rerun}`],
      short: [`The Examiner Baseline is incomplete: membersWalked counts more citations than documents[] holds (EP1 (?) cited 2, documents[] holds 1 citation(s) from it, 1 missing). A Baseline cut by a character budget or edited by hand loses rows this way. ${rerun}`],
    })
  })

  it('accepts a Baseline with nothing to compare, and refuses incomplete best art, rows and tracks', () => {
    const sources = new Map([['US1000001:claims:1:en', claimSource('US1000001:claims:1:en', 'US1000001A')]])
    const review: PatentCandidateReview = {
      baseline: BASELINE,
      examinerBestArt: [{ claimNumber: '1', publications: ['US1000001'] }, { claimNumber: ' ', publications: [] }, { claimNumber: '3', publications: ['US1000001'] }],
      coverage: [
        row('no claim'),
        row('Claim 1 — a band', {
          claimNumber: '1', kind: 'feature',
          examiner: {
            status: 'supported', gap: '', evidence: [{ anchor: 'US1000001:claims:1:en', scope: '', qualifiers: '', quantityBasis: '' }],
            elements: [{ element: 'a band', anchor: 'EP9:claims:1:en' }, { element: 'a screw' }],
          },
        }),
        row('Claim 2 as a whole', { claimNumber: '2', kind: 'combination', examiner: { status: 'unresolved', gap: '' }, found: { status: 'unresolved', gap: '' } }),
      ],
      tracks: [{ name: ' ', queries: [{ query: ' ' }] }, { name: 'Classification co-occurrence' }],
    }
    expect({ none: findBetterErrors({ baseline: BASELINE }, new Map()), errors: findBetterErrors(review, sources) }).toEqual({
      none: [],
      errors: [
        'Every examinerBestArt entry needs a claimNumber and at least one publication.',
        'Row "no claim" names no claimNumber. Every find-better row is an element of one independent claim.',
        'Row "Claim 1 — a band" needs both sides: examiner (the examiner\'s best art on this element) and found (the best art found on this element). A side with nothing disclosed is status unresolved, not absent.',
        'Claim 2 has rows but no examinerBestArt entry. Name the examiner\'s best art for every claim the report compares.',
        'Claim 2 has no element rows (kind feature); the comparison counts disclosed elements, so list each element of the claim.',
        'examinerBestArt names claim 3, but no coverage row charts it. Chart its elements or remove the entry.',
        'Every track needs a name.',
        'Track " " lists a query with no text.',
      ],
    })
  })
})

describe('claim comparison and result sentence', () => {
  const comparison = { claim: '1', examinerArt: [], elements: 2, examinerDisclosed: 0, foundDisclosed: 1 }

  it('compares nothing without rows, and names no best art for a claim without an examinerBestArt entry', () => {
    expect([claimComparisons({}), claimComparisons({ coverage: [row('unnumbered'), row('Claim 1 — a band', { claimNumber: '1', kind: 'feature' })] })]).toEqual([
      [],
      [{ claim: '1', examinerArt: [], elements: 1, examinerDisclosed: 0, foundDisclosed: 0 }],
    ])
  })

  it('says when no examiner-side row cites the examiner\'s best art and when no publication was found', () => {
    expect([claimResultSentence(comparison, [], [], []), claimResultSentence({ ...comparison, foundDisclosed: 0 }, [], [], [])]).toEqual([
      'For claim 1, the best art found (no publication) discloses 1 of 2 elements; no examiner-side row cites the examiner\'s best art.',
      'No better art found for claim 1; no examiner-side row cites the examiner\'s best art (disclosed 0 of 2).',
    ])
  })
})

describe('incompleteSearch', () => {
  it('names an unnamed track without queries and the missing tracks, and takes the first track as Track 1 when none says backward', () => {
    expect([
      incompleteSearch({}),
      incompleteSearch({ tracks: [{ name: 'Classification co-occurrence', queries: [{ query: 'cpc=F16B2/18' }] }, { name: ' ' }] }),
      incompleteSearch({ tracks: [{ name: 'Classification co-occurrence', queries: [{ query: 'cpc=F16B2/18', hop: 2 }] }] }),
    ]).toEqual([
      ['only 0 of the 3 mandatory tracks is logged'],
      ['track (unnamed) ran no query', 'only 2 of the 3 mandatory tracks is logged', 'Track 1 has no second-hop entry'],
      ['only 1 of the 3 mandatory tracks is logged'],
    ])
  })
})

describe('examinerArtLabel', () => {
  it('flags art the session recorded as published after the critical date, and leaves unknown art unflagged', () => {
    const snapshot: PatentExecutionSnapshot = {
      ...EMPTY,
      executions: [{ id: 'one', recordedAt: '2026-10-05', kind: 'details', status: 'succeeded', publicationIds: ['US5000000A'], publicationDate: '2005-01-15' }],
    }
    expect([
      examinerArtLabel({ objective: 'Earliest priority date 2004-03-01.' }, 'US5000000', snapshot),
      examinerArtLabel({}, 'US5000000', snapshot),
      examinerArtLabel({ baseline: { documents: [{ document: 'US5000000', cells: { EP: { text: 'A' } } }] } }, 'US5000000', EMPTY),
    ]).toEqual([
      'US5000000 (published after the critical date; not prior art for this claim unless the priority claim fails)',
      'US5000000',
      'US5000000',
    ])
  })
})

describe('renderBaseline', () => {
  it('states an empty Baseline as no cited document and no gap', () => {
    const lines = renderBaseline({})
    expect([lines[1]?.includes('across the family of the target') && lines[1].includes('Rows deduplicated by an unstated key'), ...lines.slice(3)]).toEqual([
      true,
      'Cited documents: 0.',
      '',
      'No office cited any document in the records the Baseline read.',
      '',
      '### Gaps in the offices\' records',
      'A gap is a member or source that returned no citation record. It is not "nothing cited": that office\'s citations for that member are unknown.',
      '- The Baseline reports no gaps.',
      '',
    ])
  })

  it('fills each missing member, read, NPL and gap field with a placeholder', () => {
    const baseline: ExaminerBaseline = {
      membersWalked: [
        { publications: [{ status: 'read' }, {}] },
        { office: 'US', representativePublication: 'US7000000B1', usptoEnriched: { status: 'read' } },
        { office: 'US', representativePublication: 'US7000001B1', usptoEnriched: { applicationNumber: '10100378' } },
        { usptoEnriched: { status: 'read', rows: 3 } },
      ],
      documents: [
        { document: 'NPL1', npl: 'Smith, Clamps, 2001', nplWork: { status: 'matched', work: { doi: '10.1000/clamp' } } },
        { document: 'NPL2', npl: 'Jones, Bands, 2003', nplWork: { status: 'matched', work: { doi: null } } },
        { document: 'US1000001', kinds: [], cells: { US: { text: 'applicant' } } },
      ],
      gaps: [{ message: ' ' }],
    }
    const lines = renderBaseline({ baseline })
    expect(lines.slice(3, 22)).toEqual([
      'Family members walked: 4. Offices: none.',
      '',
      '| Office | Member | Read | Cited (examiner / applicant) |',
      '| --- | --- | --- | --- |',
      '| ? | ? | ?: read | 0 (0 / 0) |',
      '| ? | ? | ?: unknown | — |',
      '| US | US7000000B1 | USPTO enriched, application not resolved: read | 0 rows |',
      '| US | US7000001B1 | USPTO enriched, application 10100378: unknown | — |',
      '| ? | ? | USPTO enriched, application not resolved: read | 3 rows |',
      '',
      'Cited documents: 3.',
      '',
      '| Document |  |',
      '| --- |  |',
      '| NPL: Smith, Clamps, 2001 (DOI 10.1000/clamp) |',
      '| NPL: Jones, Bands, 2003 |',
      '| US1000001 |',
      '',
      '### Gaps in the offices\' records',
    ])
    expect({
      gap: lines.at(-2),
      cell: renderBaseline({ baseline: { offices: ['US'], documents: [{ document: 'US1000001', cells: { US: { text: 'applicant' } } }] } })
        .find(line => line.startsWith('| US1000001')),
    }).toEqual({ gap: '- Gap: no citation record from ? (?)', cell: '| US1000001 | applicant |' })
  })
})

describe('renderTracks, sideStatus and gapCount', () => {
  it('logs no track without tracks, a query without count or tool as not stated, and a missing side as a dash', () => {
    expect({
      none: renderTracks({}, EMPTY).slice(4),
      bare: renderTracks({ tracks: [{ name: 'Classification co-occurrence', queries: [{ query: 'cpc=F16B2/18' }] }] }, EMPTY)[4],
      side: sideStatus(row('Claim 1 — a band'), 'found'),
      gaps: gapCount({}),
    }).toEqual({
      none: [''],
      bare: '| Classification co-occurrence | cpc=F16B2/18 | — | not stated | as reported by the agent; not in the execution record |',
      side: '—',
      gaps: 0,
    })
  })
})
