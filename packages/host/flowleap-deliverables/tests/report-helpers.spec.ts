/**
 * The small report helpers: HTML escaping of a table cell, the patent document
 * reference a source names, the plural refusal for unfilled header cells, the
 * confirmed markets a disposed Session forgets, the receipt that a malformed
 * writer call or result does not carry, and the find-better report header.
 */

import { describe, expect, it } from 'vitest'
import { parsePatentDocumentReference, patentDocumentTarget } from '../src/report/document-reference.ts'
import { unfilledHeaderCellsRefusal } from '../src/report/header-cells.ts'
import { ConfirmedMarkets } from '../src/report/markets.ts'
import { finalizesStructuredReport, parseReceipt, RECEIPT_PREFIX, WRITER_TOOL_NAME } from '../src/report/receipt.ts'
import { buildPatentReport } from '../src/report/templates.ts'
import { escape } from '../src/report/text.ts'

describe('escape', () => {
  it('escapes the characters that start HTML and keeps the rest', () => {
    expect(escape('a <b> & "c"')).toBe('a &lt;b&gt; &amp; "c"')
  })
})

describe('patent document reference', () => {
  it('accepts a section or a claim of a section `claims`, and refuses every other value', () => {
    expect({
      claim: parsePatentDocumentReference({ publicationNumber: 'EP1234567B1', section: 'claims', claimNumber: '3' }),
      section: parsePatentDocumentReference({ publicationNumber: 'US7722129B2', section: 'abstract' }),
      refused: [
        null,
        'EP1234567B1',
        { section: 'claims' },
        { publicationNumber: 'ep1234567', section: 'claims' },
        { publicationNumber: 'EP1234567B1', section: 'drawings' },
        { publicationNumber: 'EP1234567B1', section: 'abstract', claimNumber: '3' },
        { publicationNumber: 'EP1234567B1', section: 'claims', claimNumber: 3 },
        { publicationNumber: 'EP1234567B1', section: 'claims', claimNumber: '0' },
      ].map(parsePatentDocumentReference),
    }).toEqual({
      claim: { publicationNumber: 'EP1234567B1', section: 'claims', claimNumber: '3' },
      section: { publicationNumber: 'US7722129B2', section: 'abstract' },
      refused: Array.from({ length: 8 }, () => undefined),
    })
  })

  it('names a claim as `claim-N` and any other target as its section', () => {
    expect([
      patentDocumentTarget({ publicationNumber: 'EP1234567B1', section: 'claims', claimNumber: '3' }),
      patentDocumentTarget({ publicationNumber: 'EP1234567B1', section: 'description' }),
    ]).toEqual(['claim-3', 'description'])
  })
})

describe('unfilled header cells refusal', () => {
  it('names each cell and asks for the fields, plural, when two cells are unfilled', () => {
    const cell = { label: 'Jurisdiction(s)', input: 'jurisdictions', hint: 'the markets' } as const
    expect(unfilledHeaderCellsRefusal('fto-memo', [cell, { ...cell, label: 'Markets' }])).toBe(
      'Report was not saved. The fto-memo header cell `Jurisdiction(s)` is still `_(to be completed)_`. Set `jurisdictions` to the markets.'
      + ' The fto-memo header cell `Markets` is still `_(to be completed)_`. Set `jurisdictions` to the markets.'
      + ' Retry with the same content and the fields set.',
    )
  })
})

describe('confirmed markets', () => {
  it('forgets every report of a disposed Session and keeps the other Sessions', () => {
    const markets = new ConfirmedMarkets()
    markets.set('s1', 'outputs/a.md', 'DE')
    markets.set('s1', 'outputs/b.md', 'FR')
    markets.set('s2', 'outputs/a.md', 'US')
    markets.forget('s1')
    expect([markets.get('s1', 'outputs/a.md'), markets.get('s1', 'outputs/b.md'), markets.get('s2', 'outputs/a.md')]).toEqual([undefined, undefined, 'US'])
  })
})

describe('receipt of a structured save', () => {
  it('does not take a writer call whose arguments are not a JSON object as a structured save', () => {
    expect(['3', 'null', '{', '{"template":"prior-art-report"}'].map(args => finalizesStructuredReport({ id: 'c1', name: WRITER_TOOL_NAME, arguments: args })))
      .toEqual([false, false, false, true])
  })

  it('reads no receipt from a receipt line that is not a JSON object or misses a field', () => {
    const position = { roundIndex: 0, callIndex: 0 }
    const complete = { reportUri: 'outputs/r.md', reportDigest: 'a', evidenceUri: 'outputs/r.evidence.json', evidenceDigest: 'b' }
    expect([
      parseReceipt(`${RECEIPT_PREFIX}3`, position),
      parseReceipt(`${RECEIPT_PREFIX}${JSON.stringify({ ...complete, evidenceDigest: '' })}`, position),
      parseReceipt(`${RECEIPT_PREFIX}${JSON.stringify(complete)}`, position),
    ]).toEqual([undefined, undefined, { ...complete, ...position }])
  })
})

describe('find-better report template', () => {
  it('opens with the target patent header for a structured body and for an empty body', () => {
    const header = ['# Find Better Report', '', '| Field | Details |']
    const structured = buildPatentReport('## Coverage\n\nRows.', 'find-better-report', { challengedPublication: 'EP1234567B1' }, undefined, true).split('\n')
    const empty = buildPatentReport('', 'find-better-report').split('\n')
    expect({ structured: structured.slice(0, 3), target: structured.find(line => line.startsWith('| Target patent')), empty: empty.slice(0, 3), placeholder: empty.find(line => line.startsWith('| Target patent')) })
      .toEqual({ structured: header, target: '| Target patent | EP1234567B1 |', empty: header, placeholder: '| Target patent | _(to be completed)_ |' })
  })
})
