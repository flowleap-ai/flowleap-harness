import { describe, expect, it } from 'vitest'
import type { Span } from '../src/client/api.ts'
import { letterLines } from '../src/client/letter-text.ts'

/**
 * A span of `page` with up to 160 characters of the page around it, as the os sends it.
 * @param page - the page text.
 * @param quote - the quote; the first time it stands on the page.
 * @returns the span.
 */
function spanOf(page: string, quote: string): Span {
  const start = page.indexOf(quote)
  const end = start + quote.length
  return { page: 1, start, end, quote, excerpt: { before: page.slice(Math.max(0, start - 160), start), after: page.slice(end, end + 160) } }
}

/**
 * The lines as text: the cells joined by " | ", each read value in brackets.
 * @param spans - the spans.
 * @returns the lines.
 */
const text = (spans: readonly Span[]) => letterLines(spans).map(line => line.cells.map(cell => cell.map(run => run.read ? `[${run.text}]` : run.text).join('')).join(' | '))

describe('the words of a letter drawing', () => {
  it('gives each label of a header table before its value, and a single line as its cells, in the page order', () => {
    const page = 'Office\n  Application No.     Ref.        Date\n  24 123 456.7 - 1203     FL-1     30.10.2026\n\nEPO Form 2004C 12.07'
    expect(text(['2004C', '30.10.2026', 'FL-1', '24 123 456.7'].map(quote => spanOf(page, quote)))).toEqual([
      'Application No. | [24 123 456.7] - 1203', 'Ref. | [FL-1]', 'Date | [30.10.2026]', 'EPO Form [2004C] 12.07',
    ])
    expect(letterLines([spanOf(page, 'FL-1')]).map(line => line.key)).toEqual([`1:${page.indexOf('  Application')}:0`, `1:${page.indexOf('  Application')}:1`, `1:${page.indexOf('  Application')}:2`])
  })

  it('takes the line above from the page start, and leaves out a blank line above and a line above that the excerpt cuts', () => {
    expect(text([spanOf('Ref.\nFL-1', 'FL-1')])).toEqual(['Ref. | [FL-1]'])
    expect(text([spanOf('Intro\n\nFL-1', 'FL-1')])).toEqual(['[FL-1]'])
    const long = `${'x'.repeat(200)}\nRef. FL-1`
    expect(text([spanOf(long, 'FL-1')])).toEqual(['Ref. [FL-1]'])
  })

  it('keeps page lines with different cells apart, and shows a value with no page text as its quote alone', () => {
    const page = 'Date\n24 123 456.7     30.10.2026'
    expect(text([spanOf(page, '30.10.2026')])).toEqual(['Date', '24 123 456.7 | [30.10.2026]'])
    expect(text([{ page: 2, start: 9, end: 13, quote: 'FL-1', excerpt: null }, spanOf('Ref. FL-2', 'FL-2')])).toEqual(['Ref. [FL-2]', '[FL-1]'])
  })

  it('takes the longest view of a line that two excerpts cut at different places, and marks an overlapping span once', () => {
    const page = `A FL-1 ${'y'.repeat(170)} B`
    const first = spanOf(page, 'FL-1')
    const both = spanOf(page, 'FL-1 y')
    expect(text([{ ...first, excerpt: { before: first.excerpt!.before, after: ' yy' } }, first])).toEqual([`A [FL-1] ${'y'.repeat(159)}`])
    expect(text([both, first])).toEqual([`A [FL-1 y]${'y'.repeat(160)}`])
  })
})
