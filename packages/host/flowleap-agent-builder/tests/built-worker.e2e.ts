/**
 * Built-artifact guard: plain `node` runs the published `lib/index.js`, whose parse spawns the bundled `lib/worker.cjs`
 * with pdfjs-dist and mammoth resolved from the package. Skips until a build produces both artifacts.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'
import { makePdf } from './pdf.ts'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const built = ['lib/index.js', 'lib/worker.cjs'].every(path => existsSync(join(packageRoot, path)))

describe.skipIf(!built)('built file parsing (plain node)', () => {
  it('reads a PDF and a text file through the bundled Worker', async () => {
    const pdf = Buffer.from(makePdf([['Inventive step'], null])).toString('base64')
    const { exitCode, stdout, stderr } = await execa(process.execPath, ['--input-type=module', '-e', `
      import { parseInWorker } from './lib/index.js'
      const limits = { timeoutMs: 30000, memoryMb: 256, maxPages: 10 }
      const signal = new AbortController().signal
      const pdf = await parseInWorker({ name: 'a.pdf', bytes: Buffer.from(${JSON.stringify(pdf)}, 'base64') }, limits, signal)
      const txt = await parseInWorker({ name: 'a.txt', bytes: new TextEncoder().encode('Notes') }, limits, signal)
      console.log(JSON.stringify({ pdf: { ...pdf, scannedPdf: undefined }, txt }))
    `], {
      cwd: packageRoot, env: { NODE_PATH: undefined, NODE_OPTIONS: undefined },
      stdin: 'ignore', timeout: 30_000, killSignal: 'SIGKILL', reject: false,
    })
    expect(exitCode, `stderr:\n${stderr}`).toBe(0)
    expect(JSON.parse(stdout.trim())).toEqual({
      pdf: { kind: 'text', unit: 'page', locations: [{ at: 1, text: 'Inventive step' }], count: 2, scanned: [1] },
      txt: { kind: 'text', unit: 'page', locations: [{ at: 1, text: 'Notes' }], count: 1, scanned: [] },
    })
  })
})
