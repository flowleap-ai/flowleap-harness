/**
 * A fixture `flowleapOffice` provider: each written file is UTF-8 text that names what the request asked for, so the
 * workspace result shows the tracked-change paragraphs, the chart cells, and the review selection. The OfficeCLI row
 * is tested with the real binary in packages/host/flowleap-office/tests/officecli.e2e.ts.
 */

/** Cordis plugin name. */
export const name = 'flowleap-office-fixture'

const encode = text => new TextEncoder().encode(`${text}\n`)
const decode = bytes => new TextDecoder().decode(bytes).trim()
const segments = paragraph => paragraph.segments.map(segment => segment.kind === 'same' ? segment.text : `[${segment.kind}: ${segment.text}]`).join('')

/** Provide the fixture service. */
export function apply(ctx) {
  ctx.provide('flowleapOffice', {
    letter: async request => encode([
      `letter on: ${decode(request.template)}`,
      ...Object.entries(request.fields).map(([key, value]) => `field ${key}: ${value}`),
      ...request.blocks.map(block => block.kind === 'table'
        ? `table: ${[block.header, ...block.rows].map(row => row.join(' | ')).join(' / ')}`
        : `${block.kind}${block.kind === 'heading' ? ` ${block.level}` : ''}: ${block.text}`),
    ].join('\n')),
    amendClaims: async (request) => {
      const marked = [`author: ${request.author}`, `heading: ${request.heading ?? ''}`, ...request.paragraphs.map(paragraph => `mark ${paragraph.mark}: ${segments(paragraph)}`)]
      const clean = request.paragraphs.filter(paragraph => paragraph.mark !== 'del')
        .map(paragraph => paragraph.segments.filter(segment => segment.kind !== 'del').map(segment => segment.text).join(''))
      return request.clean ? { marked: encode(marked.join('\n')), clean: encode(clean.join('\n')) } : { marked: encode(marked.join('\n')) }
    },
    claimChart: async request => encode([`sheet: ${request.sheet}`, ...[request.header, ...request.rows].map(row => row.join(' | '))].join('\n')),
    read: async () => ({
      format: 'docx',
      text: 'Patentansprüche\n1. Wärmeübertrager mit Lamellen, wobei der Abstand 1,5 mm beträgt.',
      headings: [{ level: 1, text: 'Patentansprüche' }],
      revisions: [
        { id: 1048581, type: 'ins', author: 'FlowLeap', date: '2026-11-03T10:00:00.0000000Z', text: ', wobei der Abstand 1,5 mm beträgt' },
        { id: 1048583, type: 'del', author: 'FlowLeap', date: '2026-11-03T10:00:00.0000000Z', text: '3. Gestrichen.' },
      ],
    }),
    reviewChanges: async request => ({
      file: encode(`${request.action} ${JSON.stringify(request.selection)} on: ${decode(request.file)}`),
      changed: 2,
    }),
  })
}
