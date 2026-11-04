/** OfficeCLI argv and batch JSON: the only forms the provider can write, and the values it refuses. */
import { describe, expect, it } from 'vitest'
import { FlowleapOfficeError } from '../src/error.ts'
import {
  argvOf, chartItems, cleanClaimsItems, cleanText, columnName, letterItems, markedClaimsItems, refuseUrls, rowPoints, serializeBatch,
  wordText, xmlAttribute, type OfficeCommand,
} from '../src/officecli/index.ts'

const look = { featureColumnWidth: 10, textColumnWidth: 40, headerFill: '1F3A5F', headerFontColor: 'FFFFFF' }

function refusal(run: () => unknown): FlowleapOfficeError {
  try {
    run()
  } catch (error: unknown) {
    if (error instanceof FlowleapOfficeError) return error
    throw error
  }
  throw new Error('no refusal')
}

describe('argvOf', () => {
  it('builds each command from its row, with --json on every call but --version', () => {
    const commands: OfficeCommand[] = [
      { kind: 'version' },
      { kind: 'create', file: 'a.docx' },
      { kind: 'merge', template: 't.docx', output: 'o.docx', data: 'f.json' },
      { kind: 'batch', file: 'a.docx', input: 'b.json' },
      { kind: 'validate', file: 'a.docx' },
      { kind: 'view', file: 'a.docx', mode: 'text' },
      { kind: 'view', file: 'a.docx', mode: 'outline' },
      { kind: 'query', file: 'a.docx', selector: 'revision' },
      { kind: 'query', file: 'a.docx', selector: 'cell' },
    ]
    expect(commands.map(argvOf)).toEqual([
      ['--version'],
      ['create', 'a.docx', '--json'],
      ['merge', 't.docx', 'o.docx', '--data', 'f.json', '--json'],
      ['batch', 'a.docx', '--input', 'b.json', '--json'],
      ['validate', 'a.docx', '--json'],
      ['view', 'a.docx', 'text', '--json'],
      ['view', 'a.docx', 'outline', '--json'],
      ['query', 'a.docx', 'revision', '--json'],
      ['query', 'a.docx', 'cell', '--json'],
    ])
    const verbs = new Set(commands.map(argvOf).map(argv => argv[0]))
    for (const forbidden of ['install', 'skills', 'mcp', 'plugins', 'watch', 'open', 'close', 'refresh', 'dump', 'import']) {
      expect(verbs.has(forbidden)).toBe(false)
    }
  })

  it('refuses an argument that is a web address', () => {
    expect(refusal(() => argvOf({ kind: 'create', file: 'https://example.com/a.docx' })).code).toBe('url_refused')
  })
})

describe('refuseUrls', () => {
  it('refuses http and https values at any depth, after trimming and in any case', () => {
    for (const value of ['http://x', ' HTTPS://x', { a: ['ok', { b: 'Http://x' }] }, { 'https://key': 'v' }]) {
      expect(refusal(() => { refuseUrls(value) }).code).toBe('url_refused')
    }
  })

  it('passes text that only names a web address later, and non-string values', () => {
    expect(() => { refuseUrls({ text: 'siehe https://example.com', n: 1, b: true, z: null }) }).not.toThrow()
  })
})

describe('serializeBatch', () => {
  it('writes tracked runs with author and date, and a paragraph mark through raw-set with escaped XML', () => {
    const revision = { type: 'del', author: 'Dr. Weiß & <Co> "A"', date: '2026-11-03T10:00:00.000Z' } as const
    expect(serializeBatch([
      { kind: 'paragraph' },
      { kind: 'run', text: 'gestrichen', revision },
      { kind: 'paragraphMark', id: 1, revision },
    ])).toEqual([
      { command: 'add', parent: '/body', type: 'paragraph', props: {} },
      { command: 'add', parent: '/body/p[last()]', type: 'run', props: { text: 'gestrichen', 'revision.type': 'del', 'revision.author': 'Dr. Weiß & <Co> "A"', 'revision.date': '2026-11-03T10:00:00.000Z' } },
      {
        command: 'raw-set', part: '/document', xpath: '/w:document/w:body/w:p[last()]/w:pPr', action: 'append',
        xml: '<w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:del w:id="1" w:author="Dr. Weiß &amp; &lt;Co&gt; &quot;A&quot;" w:date="2026-11-03T10:00:00.000Z"/></w:rPr>',
      },
    ])
  })

  it('refuses a web address in any item value', () => {
    expect(refusal(() => serializeBatch([{ kind: 'paragraph', text: 'https://evil.example/x.png' }])).code).toBe('url_refused')
    expect(refusal(() => serializeBatch([{ kind: 'sheetCell', sheet: 'S', ref: 'A1', value: 'http://x' }])).code).toBe('url_refused')
  })

  it('writes review, sheet, and table items', () => {
    expect(serializeBatch([
      { kind: 'review', selector: '/revision', action: 'reject' },
      { kind: 'table', rows: 2, cols: 3, style: '' },
      { kind: 'tableCell', row: 1, col: 2, text: 'x', strong: false },
      { kind: 'renameSheet', from: 'Sheet1', to: 'Claim 1' },
    ])).toEqual([
      { command: 'set', path: '/revision', props: { 'revision.action': 'reject' } },
      { command: 'add', parent: '/body', type: 'table', props: { rows: '2', cols: '3' } },
      { command: 'set', path: '/body/tbl[last()]/tr[1]/tc[2]', props: { text: 'x' } },
      { command: 'set', path: '/Sheet1', props: { name: 'Claim 1' } },
    ])
  })
})

describe('letterItems', () => {
  it('writes headings with Word heading styles and tables cell by cell, never through the CSV data prop', () => {
    const items = letterItems([
      { kind: 'heading', level: 1, text: 'Erwiderung' },
      { kind: 'heading', level: 2, text: '1. Änderungen' },
      { kind: 'paragraph', text: 'Zeile 1\nZeile 2' },
      { kind: 'table', header: ['Merkmal', 'D1'], rows: [['1.3 Lamellenabstand 1,5–3,0 mm', 'nicht offenbart']] },
    ], 'FirmTable')
    const json = serializeBatch(items)
    expect(json).toEqual([
      { command: 'add', parent: '/body', type: 'paragraph', props: { style: 'Heading1', text: 'Erwiderung' } },
      { command: 'add', parent: '/body', type: 'paragraph', props: { style: 'Heading2', text: '1. Änderungen' } },
      { command: 'add', parent: '/body', type: 'paragraph', props: { text: 'Zeile 1\vZeile 2' } },
      { command: 'add', parent: '/body', type: 'table', props: { rows: '2', cols: '2', style: 'FirmTable' } },
      { command: 'set', path: '/body/tbl[last()]/tr[1]/tc[1]', props: { text: 'Merkmal', bold: 'true' } },
      { command: 'set', path: '/body/tbl[last()]/tr[1]/tc[2]', props: { text: 'D1', bold: 'true' } },
      { command: 'set', path: '/body/tbl[last()]/tr[2]/tc[1]', props: { text: '1.3 Lamellenabstand 1,5–3,0 mm' } },
      { command: 'set', path: '/body/tbl[last()]/tr[2]/tc[2]', props: { text: 'nicht offenbart' } },
      { command: 'set', path: '/body/tbl[last()]/tr[1]', props: { header: 'true' } },
    ])
    expect(JSON.stringify(json)).not.toContain('"data"')
  })
})

describe('claims items', () => {
  const paragraphs = [
    { mark: 'same', segments: [{ kind: 'same', text: '1. A' }, { kind: 'ins', text: ' B' }, { kind: 'del', text: '' }] },
    { mark: 'ins', segments: [{ kind: 'ins', text: '2. New' }] },
    { mark: 'del', segments: [{ kind: 'del', text: '3. Old' }] },
  ] as const
  const date = '2026-11-03T10:00:00.000Z'

  it('writes runs before the paragraph mark of a new or deleted claim, with mark ids from 1', () => {
    const items = markedClaimsItems('Claims', paragraphs, 'FlowLeap', date, 1)
    const revision = (type: 'ins' | 'del') => ({ type, author: 'FlowLeap', date })
    expect(items).toEqual([
      { kind: 'paragraph', style: 'Heading1', text: 'Claims' },
      { kind: 'paragraph' },
      { kind: 'run', text: '1. A' },
      { kind: 'run', text: ' B', revision: revision('ins') },
      { kind: 'paragraph' },
      { kind: 'run', text: '2. New', revision: revision('ins') },
      { kind: 'paragraphMark', id: 1, revision: revision('ins') },
      { kind: 'paragraph' },
      { kind: 'run', text: '3. Old', revision: revision('del') },
      { kind: 'paragraphMark', id: 2, revision: revision('del') },
    ])
  })

  it('writes the clean copy from the texts after the changes, without the deleted claim', () => {
    expect(cleanClaimsItems(undefined, paragraphs)).toEqual([{ kind: 'paragraph', text: '1. A B' }, { kind: 'paragraph', text: '2. New' }])
    expect(markedClaimsItems(undefined, [], 'X', date, 1)).toEqual([])
    expect(cleanClaimsItems('H', [])).toEqual([{ kind: 'paragraph', style: 'Heading1', text: 'H' }])
    expect(cleanText(paragraphs[2])).toBeUndefined()
  })
})

describe('chartItems', () => {
  it('writes every cell as text, a filled bold header, widths, a height for each row, the filter, the frozen header, and the print setup', () => {
    const items = chartItems({ sheet: 'Anspruch 1', header: ['Merkmal', 'Text'], rows: [['1.10', 'a'.repeat(81)]] }, look)
    expect(items).toEqual([
      { kind: 'renameSheet', from: 'Sheet1', to: 'Anspruch 1' },
      { kind: 'sheetCell', sheet: 'Anspruch 1', ref: 'A1', value: 'Merkmal', header: { fill: '1F3A5F', fontColor: 'FFFFFF' } },
      { kind: 'sheetCell', sheet: 'Anspruch 1', ref: 'B1', value: 'Text', header: { fill: '1F3A5F', fontColor: 'FFFFFF' } },
      { kind: 'sheetCell', sheet: 'Anspruch 1', ref: 'A2', value: '1.10' },
      { kind: 'sheetCell', sheet: 'Anspruch 1', ref: 'B2', value: 'a'.repeat(81) },
      { kind: 'column', sheet: 'Anspruch 1', column: 'A', width: 10 },
      { kind: 'column', sheet: 'Anspruch 1', column: 'B', width: 40 },
      { kind: 'rowHeight', sheet: 'Anspruch 1', row: 1, points: 18 },
      { kind: 'rowHeight', sheet: 'Anspruch 1', row: 2, points: 48 },
      { kind: 'sheetLayout', sheet: 'Anspruch 1', autoFilter: 'A1:B2', freeze: 'A2' },
    ])
    const json = serializeBatch(items)
    expect(json[3]).toEqual({
      command: 'set', path: '/Anspruch 1/A2',
      props: { value: '1.10', type: 'string', 'border.all': 'thin', 'alignment.wrapText': 'true', 'alignment.vertical': 'top' },
    })
    expect(json[1]).toMatchObject({ props: { 'font.bold': 'true', fill: '1F3A5F', 'font.color': 'FFFFFF' } })
    expect(json.slice(5)).toEqual([
      { command: 'set', path: '/Anspruch 1/col[A]', props: { width: '10' } },
      { command: 'set', path: '/Anspruch 1/col[B]', props: { width: '40' } },
      { command: 'set', path: '/Anspruch 1/row[1]', props: { height: '18pt' } },
      { command: 'set', path: '/Anspruch 1/row[2]', props: { height: '48pt' } },
      {
        command: 'set', path: '/Anspruch 1',
        props: { autoFilter: 'A1:B2', freeze: 'A2', orientation: 'landscape', fitToPage: '1x0', printTitleRows: '1:1' },
      },
    ])
  })

  it('keeps the first sheet name without a rename', () => {
    expect(chartItems({ sheet: 'Sheet1', header: ['F'], rows: [] }, look)[0]).toMatchObject({ kind: 'sheetCell', ref: 'A1' })
  })
})

describe('helpers', () => {
  it('names columns past Z', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA'])
  })

  it('counts wrapped lines per cell and line feeds as lines', () => {
    expect(rowPoints(['x'.repeat(20), 'a\nb\nc'], [10, 40])).toBe(48)
    expect(rowPoints([''], [0.5])).toBe(18)
    expect(rowPoints(['abc'], [])).toBe(48)
  })

  it('escapes XML attributes and turns line feeds into Word line breaks', () => {
    expect(xmlAttribute('a&b<c>d"e\'f')).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f')
    expect(wordText('a\r\nb\rc\nd')).toBe('a\vb\vc\vd')
  })
})
