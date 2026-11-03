/** The OfficeCLI provider row: the binary check at load and the provided service. */
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as row from '../src/officecli/index.ts'
import { FakeSubprocess, succeed } from './fake-officecli.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function setup(printed = '1.0.160\n') {
  const dir = await mkdtemp(join(tmpdir(), 'flowleap-office-row-'))
  const binaryPath = join(dir, 'officecli')
  await writeFile(binaryPath, 'pinned binary')
  const ctx = new Context()
  cleanups.push(async () => {
    await ctx.fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  })
  const fake = new FakeSubprocess((args, cwd) => args[0] === '--version' ? { exitCode: 0, stdout: printed } : succeed(args, cwd))
  ctx.provide('subprocess', fake)
  const config: row.Config = {
    binaryPath,
    version: '1.0.160',
    sha256: createHash('sha256').update('pinned binary').digest('hex'),
    stateDir: join(dir, 'state'),
    timeoutMs: 5_000,
    maxOutputBytes: 1_000_000,
    tableStyle: '',
    chart: { featureColumnWidth: 10, textColumnWidth: 40, headerFill: '1F3A5F', headerFontColor: 'FFFFFF' },
  }
  return { ctx, fake, config, dir }
}

async function load(ctx: Context, config: row.Config): Promise<string | undefined> {
  const failures: unknown[] = []
  ctx.on('internal/error', (error: unknown) => { failures.push(error) })
  const fiber = ctx.plugin(row, config)
  await fiber.await().catch((error: unknown) => { failures.push(error) })
  return failures.length === 0 ? undefined : String(failures[0])
}

describe('the officecli row', () => {
  it('checks the hash and the version, clears stale call folders, and provides flowleapOffice', async () => {
    const { ctx, fake, config } = await setup()
    await mkdir(join(config.stateDir, 'calls', 'call-stale'), { recursive: true })
    await writeFile(join(config.stateDir, 'calls', 'call-stale', 'client.docx'), 'left behind')
    expect(await load(ctx, config)).toBeUndefined()
    expect(fake.calls()).toEqual([['--version']])
    expect(await readdir(join(config.stateDir, 'calls'))).toEqual([])
    expect(await readdir(config.stateDir)).toEqual(['calls', 'home', 'state'])
    expect(ctx.get('flowleapOffice')).toBeInstanceOf(row.OfficeCliProvider)
  })

  it('fails loud on a changed binary, another version, and relative paths', async () => {
    const changed = await setup()
    expect(await load(changed.ctx, Object.assign({}, changed.config, { sha256: '0'.repeat(64) }))).toContain('SHA-256')
    expect(changed.ctx.get('flowleapOffice')).toBeUndefined()
    const other = await setup('1.0.161\n')
    expect(await load(other.ctx, other.config)).toContain('printed "1.0.161"')
    const relativeBinary = await setup()
    expect(await load(relativeBinary.ctx, Object.assign({}, relativeBinary.config, { binaryPath: 'officecli' }))).toContain('binaryPath must be absolute')
    const relativeState = await setup()
    expect(await load(relativeState.ctx, Object.assign({}, relativeState.config, { stateDir: 'state' }))).toContain('stateDir must be absolute')
  })

  it('validates its config', () => {
    expect(() => row.Config({ binaryPath: '/b', version: '1.0', sha256: 'x', stateDir: '/s' })).toThrow()
    expect(row.Config({ binaryPath: '/b', version: '1.0.160', sha256: 'a'.repeat(64), stateDir: '/s', chart: {} })).toMatchObject({
      timeoutMs: 60_000, tableStyle: '', chart: { featureColumnWidth: 10, textColumnWidth: 40, headerFill: '1F3A5F', headerFontColor: 'FFFFFF' },
    })
  })
})
