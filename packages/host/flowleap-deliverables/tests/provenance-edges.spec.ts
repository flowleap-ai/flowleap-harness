/**
 * The generated provenance sections on less usual report bodies and execution
 * records: ragged tables with a total row, tables without header text, long
 * lists of untraced figures, dates and quotations, and records that hold no
 * tool name, request or count.
 */

import { describe, expect, it } from 'vitest'
import {
  dateProvenance, dateSentence, extractClaimQuotations, extractDates, figureProvenance, figureSentence, ftoProvenanceResult, quotationProvenance,
  quotationSentence, renderFtoAppendix, renderLandscapeAppendix, type ProvenanceSnapshot, type QuotedClaim,
} from '../src/report/provenance.ts'

const CITATION = 'flowleap://flowleap.patent-ai/patent?publication=EP1000000A1&section=claims&claim=1'

describe('figures computed from a ragged table', () => {
  it('sums a column above its total row and with it, names a column without header text by its position, and leaves a wrong share untraced', () => {
    const content = [
      '| Office | | Note |',
      '| --- | --- | --- |',
      '| EP | 70 | n/a | 12 |',
      '| DE | unknown | n/a |',
      '| US | 30 | n/a | 15 |',
      '| Total | 100 |',
      '',
      '| Applicant | Families | Share |',
      '| --- | --- | --- |',
      '| Acme | 34 | 99% |',
      '| Globex | 103 | 75% |',
    ].join('\n')
    const provenance = figureProvenance(['100', '200', '27', '75%', '99%'], { executions: [] }, content)
    expect({ provenance, sentence: figureSentence(provenance), traced: figureSentence({ ...provenance, unmatched: [] }) }).toEqual({
      provenance: {
        matched: [],
        derived: [
          { figure: '100', basis: "column sum of 'column 2'" },
          { figure: '200', basis: "column sum of 'column 2'" },
          { figure: '27', basis: "column sum of 'column 4'" },
          { figure: '75%', basis: 'share' },
        ],
        unmatched: ['99%'],
      },
      sentence: '5 figures checked against recorded tool outputs; 0 found, 4 computed from figures that were found, 1 not found: 99%.',
      traced: '4 figures checked against recorded tool outputs; 0 found, 4 computed from figures that were found, 0 not found.',
    })
  })
})

describe('landscape appendix', () => {
  it('lists the first twelve untraced figures, the computed ones, the unnamed table, and an analytics call with nothing recorded', () => {
    const figures = Array.from({ length: 13 }, (_, index) => String(1001 + (index * 2)))
    const content = [
      `Counts ${figures.join(', ')}.`,
      '',
      '| | |',
      '| --- | --- |',
      '| 30 | 45 |',
      '| 20 | 15 |',
      '',
      'The two rows add up to 50 and 60.',
    ].join('\n')
    const lines = renderLandscapeAppendix(content, { executions: [{ kind: 'analytics', status: 'succeeded' }] }).split('\n')
    expect({
      checked: lines[2],
      derived: lines[3],
      unnamed: lines[4],
      call: lines.at(-1),
    }).toEqual({
      checked: `19 figures checked against recorded tool outputs; 0 found, 2 computed from figures that were found, 17 not found: ${figures.slice(0, 12).join(', ')}, and 5 more.`,
      derived: "2 figures are totals or shares computed from recorded figures: 50 (column sum of 'column 1'), 60 (column sum of 'column 2'). Check each stated period and label against the column named here.",
      unnamed: 'Tables without a stated counting basis: unnamed table. Families, applications and publications are different units; state which one each table counts.',
      call: '- unknown tool — request not recorded — unknown rows — data edition not recorded',
    })
  })
})

describe('date provenance', () => {
  it('skips an impossible or repeated date in the body, and finds no written form of a value that is not a date', () => {
    expect({
      extracted: extractDates('Filed 2024-13-01, granted 2024-01-10, and lapsed 2024-01-10.'),
      provenance: dateProvenance(['someday', '2024-13-01'], { executions: [] }),
    }).toEqual({ extracted: ['2024-01-10'], provenance: { matched: [], unmatched: ['someday', '2024-13-01'] } })
  })

  it('lists the first eight dates not found and counts the rest, or says none was missing', () => {
    const unmatched = Array.from({ length: 9 }, (_, index) => `2024-01-${String(index + 10)}`)
    expect([dateSentence({ matched: [], unmatched }), dateSentence({ matched: ['2024-01-10'], unmatched: [] })]).toEqual([
      `9 dates checked against recorded tool outputs; 0 found, 9 not found: ${unmatched.slice(0, 8).join(', ')}, and 1 more.`,
      '1 dates checked against recorded tool outputs; 1 found, 0 not found.',
    ])
  })
})

describe('claim quotation provenance', () => {
  const quote = 'a hinge body carrying a lever that turns about a pin'

  it('takes no quotation after a claims link that names no publication', () => {
    expect(extractClaimQuotations(`See flowleap://flowleap.patent-ai/patent?section=claims "${quote}".`)).toEqual([])
  })

  it('compares only claim passages with text, and finds a quotation from another passage elsewhere', () => {
    const snapshot: ProvenanceSnapshot = {
      executions: [
        { kind: 'details', status: 'succeeded' },
        {
          kind: 'details', status: 'succeeded', sources: [
            { reference: { publicationNumber: 'EP1000000A1', section: 'claims' } },
            { reference: { publicationNumber: 'EP1000000A1', section: 'description' }, text: `In one embodiment ${quote}.` },
          ],
        },
      ],
    }
    const provenance = quotationProvenance([{ publication: 'EP1000000A1', quote }], snapshot)
    expect({ elsewhere: provenance.elsewhere.length, unrecorded: provenance.unrecorded, sentence: quotationSentence(provenance) }).toEqual({
      elsewhere: 1,
      unrecorded: [],
      sentence: '1 claim quotations checked against recorded claim text; 0 found verbatim, 0 found with elisions, 1 found in other recorded tool text'
        + ' (a description, a file-wrapper document or a fetched page, not the cited claims), 0 not found.',
    })
  })

  it('lists the first six quotations not found, cutting a long one, and counts the rest', () => {
    const long = `${'a lever turning about a pin '.repeat(4).trim()}`
    const unmatched: QuotedClaim[] = Array.from({ length: 7 }, (_, index) => ({ publication: `EP${String(index + 1)}`, quote: index === 0 ? long : quote }))
    const sentence = quotationSentence({ matched: [], elided: [], elsewhere: [], unmatched, unrecorded: [] })
    expect(sentence).toBe(
      `7 claim quotations checked against recorded claim text; 0 found verbatim, 0 found with elisions, 7 not found: EP1: "${long.slice(0, 80)}…"; `
      + [2, 3, 4, 5, 6].map(index => `EP${String(index)}: "${quote}"`).join('; ') + '; and 1 more.',
    )
  })
})

describe('FTO appendix and save result', () => {
  it('names each call by its kind, request and counts when the record holds no tool name', () => {
    const snapshot: ProvenanceSnapshot = {
      executions: [
        { kind: 'search', status: 'succeeded', query: 'hinge lever', total: 54 },
        { kind: 'details', status: 'succeeded', publicationIds: ['EP1000000A1'], returned: 1 },
        { kind: 'figures', status: 'succeeded' },
        { kind: 'status', status: 'failed' },
      ],
    }
    expect(renderFtoAppendix('Nothing to check in this body.', snapshot).split('\n').filter(line => line.startsWith('- '))).toEqual([
      '- search_patents — hinge lever — 54 total, unknown returned — succeeded',
      '- get_claims — EP1000000A1 — unknown total, 1 returned — succeeded',
      '- get_patent_figures — request not recorded — count not recorded — succeeded',
      '- unknown tool — request not recorded — count not recorded — failed',
    ])
  })

  it('names the publication whose claims were never retrieved, and asks to source only what was not found', () => {
    const content = `Claim 1 of EP1000000A1 ([claim 1](${CITATION})) reads "${'a hinge body carrying a lever that turns about a pin'}". The fee was 4,321 EUR.`
    const appendix = renderFtoAppendix(content, { executions: [] }).split('\n')
    expect({
      unrecorded: appendix.find(line => line.startsWith('No claim text is recorded')),
      result: ftoProvenanceResult(content, { executions: [] }, 'report'),
      clean: ftoProvenanceResult('Nothing to check in this body.', { executions: [] }),
    }).toEqual({
      clean: '\nFTO provenance: No figures were found in the report body; nothing was checked against recorded tool outputs.'
        + ' No date was found in the report body; nothing was checked against recorded tool outputs.'
        + ' No quotation of 40 characters or more follows a claims citation in this report; nothing was compared with recorded claim text.'
        + ' The memo lists them in its generated provenance sections.',
      unrecorded: 'No claim text is recorded for EP1000000A1; quotations cited to them were compared with nothing. Retrieve the claims with get_claims before relying on the quoted wording.',
      result: '\nProvenance: 1 figures checked against recorded tool outputs; 0 found, 0 computed from figures that were found, 1 not found: 4,321.'
        + ' No date was found in the report body; nothing was checked against recorded tool outputs.'
        + ' 1 claim quotations checked against recorded claim text; 0 found verbatim, 0 found with elisions, 1 not found: EP1000000A1: "a hinge body carrying a lever that turns about a pin".'
        + ' Source each figure, date and quotation that was not found in a follow-up save, or replace it with one a recorded output supports.'
        + ' The report lists them in its generated provenance sections.',
    })
  })
})
