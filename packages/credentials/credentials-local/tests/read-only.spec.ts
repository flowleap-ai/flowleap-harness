import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { credentialKey, credentialRef } from '@deepseek-ai/dsh-credentials'
import { createLaunchEnvironmentSnapshot, DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import { LocalCredentialProvider, resolveSpec } from '../src/index.ts'

const FIRM = credentialRef('DSH_CRED_FIRM')
const OWN = credentialRef('DSH_CRED_OWN')
const FIRM_RECORD = credentialKey('flowleap-connectors', 'epo-ops')
const OWN_RECORD = credentialKey('web-auth', 'session')

const READ_ONLY = `version: 1
refs:
  DSH_CRED_FIRM: firm-value
records:
  flowleap-connectors/epo-ops:
    kind: grant
    payload:
      consumerKey: firm-key
      consumerSecret: firm-secret
`

const MANAGED = `version: 1
refs:
  DSH_CRED_FIRM: managed-value
  DSH_CRED_OWN: own-value
records:
  flowleap-connectors/epo-ops:
    kind: grant
    payload:
      consumerKey: browser-key
      consumerSecret: browser-secret
  web-auth/session:
    kind: grant
    payload: own-secret
`

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  vi.unstubAllEnvs()
  while (cleanups.length > 0) await cleanups.pop()!()
})

async function fixture(readOnlyText: string | null = READ_ONLY): Promise<{ managed: string; readOnly: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-credentials-read-only-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const managed = join(dir, 'runtime', 'credentials.yaml')
  const readOnly = join(dir, 'firm', 'credentials.yaml')
  await Promise.all([
    mkdir(join(dir, 'runtime')),
    mkdir(join(dir, 'firm')),
  ])
  await writeFile(managed, MANAGED, { mode: 0o600 })
  if (readOnlyText !== null) await writeFile(readOnly, readOnlyText, { mode: 0o400 })
  return { managed, readOnly }
}

type Config = ConstructorParameters<typeof LocalCredentialProvider>[1]

async function boot(config: Config, ctx = new Context()): Promise<Context> {
  const fiber = ctx.plugin(LocalCredentialProvider, config)
  cleanups.push(async () => {
    await fiber.dispose()
  })
  await fiber
  return ctx
}

function bootFailure(config: Config): Promise<unknown> {
  return new Context().plugin(LocalCredentialProvider, config)
}

describe('the read-only document', () => {
  it('is resolved from readOnlyPath only when configured', () => {
    expect(resolveSpec({ path: '/a.yaml', readOnlyPath: 'firm.yaml' }).readOnlyFilename).toBe(resolve('firm.yaml'))
    expect(resolveSpec({ path: '/a.yaml' })).not.toHaveProperty('readOnlyFilename')
  })

  it('wins over the managed document and the launch environment, and reports itself as not writable', async () => {
    const paths = await fixture()
    const ctx = new Context()
    ctx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, createLaunchEnvironmentSnapshot([
      { source: 'process', values: { DSH_CRED_FIRM: 'env-value' } },
    ]))
    await boot({ path: paths.managed, readOnlyPath: paths.readOnly, watch: false }, ctx)

    expect(await ctx.credentials.resolve(FIRM)).toEqual({ value: 'firm-value', source: 'read-only' })
    expect(await ctx.credentials.describe(FIRM)).toEqual({ configured: true, source: 'read-only', writable: false })
    expect(await ctx.credentials.resolve(OWN)).toEqual({ value: 'own-value', source: 'file' })
    expect(await ctx.credentials.describe(OWN)).toEqual({ configured: true, source: 'file', writable: true })

    expect(await ctx.credentials.readRecord(FIRM_RECORD)).toEqual({
      kind: 'grant', payload: { consumerKey: 'firm-key', consumerSecret: 'firm-secret' },
    })
    expect(await ctx.credentials.describeRecord(FIRM_RECORD)).toEqual({ configured: true, kind: 'grant', writable: false })
    expect(await ctx.credentials.describeRecord(OWN_RECORD)).toEqual({ configured: true, kind: 'grant', writable: true })
    expect(await ctx.credentials.listRecords()).toEqual(expect.arrayContaining([
      { key: FIRM_RECORD, kind: 'grant' },
      { key: OWN_RECORD, kind: 'grant' },
    ]))
    expect(await ctx.credentials.listRecords()).toHaveLength(2)
  })

  it('refuses every write to an entry it holds and leaves the managed document unchanged', async () => {
    const paths = await fixture()
    const ctx = await boot({ path: paths.managed, readOnlyPath: paths.readOnly, watch: false })
    const mutate = vi.fn(() => Promise.resolve({ kind: 'grant' as const, payload: { consumerKey: 'x', consumerSecret: 'y' } }))

    await expect(ctx.credentials.set(FIRM, 'browser-value')).rejects.toThrow(/"DSH_CRED_FIRM" is provided read-only by .*firm/)
    await expect(ctx.credentials.unset(FIRM)).rejects.toThrow(/provided read-only/)
    await expect(ctx.credentials.modifyRecord(FIRM_RECORD, mutate)).rejects.toThrow(/"flowleap-connectors\/epo-ops" is provided read-only/)
    await expect(ctx.credentials.deleteRecord(FIRM_RECORD)).rejects.toThrow(/provided read-only/)
    expect(mutate).not.toHaveBeenCalled()
    expect(await readFile(paths.managed, 'utf8')).toBe(MANAGED)
    expect(await ctx.credentials.resolve(FIRM)).toEqual({ value: 'firm-value', source: 'read-only' })
  })

  it('keeps per-runtime writes in the managed document', async () => {
    const paths = await fixture()
    const ctx = await boot({ path: paths.managed, readOnlyPath: paths.readOnly, watch: false })

    await ctx.credentials.set(OWN, 'rotated')
    await ctx.credentials.modifyRecord(OWN_RECORD, () => Promise.resolve({ kind: 'grant', payload: 'rotated-secret' }))

    expect(await ctx.credentials.resolve(OWN)).toEqual({ value: 'rotated', source: 'file' })
    expect(await ctx.credentials.readRecord(OWN_RECORD)).toEqual({ kind: 'grant', payload: 'rotated-secret' })
    expect(await readFile(paths.readOnly, 'utf8')).toBe(READ_ONLY)
  })

  it('fails activation when the configured file is missing', async () => {
    const paths = await fixture(null)
    await expect(bootFailure({ path: paths.managed, readOnlyPath: paths.readOnly, watch: false }))
      .rejects.toThrow(/read-only credentials document .* does not exist/)
  })

  it('fails activation when the path cannot be read as a file', async () => {
    const paths = await fixture(null)
    await mkdir(paths.readOnly, { mode: 0o700 })
    await expect(bootFailure({ path: paths.managed, readOnlyPath: paths.readOnly, watch: false })).rejects.toThrow(/EISDIR/)
  })

  it('fails activation when the file is invalid', async () => {
    const paths = await fixture('version: 1\nrefs:\n  DSH_CRED_FIRM: ""\n')
    await expect(bootFailure({ path: paths.managed, readOnlyPath: paths.readOnly, watch: false })).rejects.toThrow(/DSH_CRED_FIRM/)
  })

  it.skipIf(process.platform === 'win32')('fails activation when other users can read the file', async () => {
    const paths = await fixture()
    await chmod(paths.readOnly, 0o644)
    await expect(bootFailure({ path: paths.managed, readOnlyPath: paths.readOnly, watch: false }))
      .rejects.toThrow(/readable beyond its owner/)
  })
})
