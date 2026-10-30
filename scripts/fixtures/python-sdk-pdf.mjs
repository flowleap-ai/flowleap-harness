/** Read a PDF through the packaged agent builder, so a pdfjs-dist file the executable leaves out fails the smoke. */
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

export const name = 'python-sdk-pdf-smoke'

/** A two-page PDF: one Helvetica text line on page 1, no text layer on page 2. */
function twoPagePdf(line) {
  const text = `BT /F1 12 Tf 72 720 Td (${line}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((body, index) => {
    const offset = pdf.length
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
    return offset
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

export async function apply(ctx, config) {
  // The executable entry is the packaged bootstrap; the agent builder is a dependency of `@deepseek-ai/dsh`.
  const dsh = createRequire(process.argv[1]).resolve('@deepseek-ai/dsh/package.json')
  const entry = createRequire(dsh).resolve('@deepseek-ai/dsh-flowleap-agent-builder')
  const { parseFile } = await import(pathToFileURL(entry).href)
  const result = await parseFile({ name: 'input.pdf', bytes: twoPagePdf('python runtime pdf smoke'), maxPages: 10 })
  const scannedPdf = result.scannedPdf === undefined ? '' : new TextDecoder().decode(result.scannedPdf.subarray(0, 5))
  await writeFile(config.result, JSON.stringify({ ...result, scannedPdf }))
}
