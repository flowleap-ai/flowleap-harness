/** A PDF builder for tests: Helvetica text lines on each page, or a page without a text layer. */

/**
 * A PDF with one Helvetica text line set per page; a null page has no text layer, like a scanned page.
 * @param pages - the lines of each page.
 * @returns the PDF bytes.
 */
export function makePdf(pages: readonly (readonly string[] | null)[]): Uint8Array {
  const objects: string[] = ['<< /Type /Catalog /Pages 2 0 R >>']
  const kids = pages.map((_, index) => `${String(3 + index * 2)} 0 R`).join(' ')
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${String(pages.length)} >>`)
  const font = 3 + pages.length * 2
  pages.forEach((lines, index) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${String(font)} 0 R >> >> /Contents ${String(4 + index * 2)} 0 R >>`)
    const stream = (lines ?? []).map((line, at) => `BT /F1 12 Tf 72 ${String(720 - at * 16)} Td (${line.replace(/[\\()]/g, m => `\\${m}`)}) Tj ET`).join('\n')
    objects.push(`<< /Length ${String(stream.length)} >>\nstream\n${stream}\nendstream`)
  })
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(out.length)
    out += `${String(index + 1)} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`
  return new TextEncoder().encode(out)
}
