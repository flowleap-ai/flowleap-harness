/** References only the deployment supplies: `lockedRefs` refuses writes and ignores a managed value. */
import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { createLaunchEnvironmentSnapshot, DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import { LocalCredentialProvider } from '../src/index.ts'

const MODEL = credentialRef('DSH_CRED_MODEL')
const DOTENV = credentialRef('DSH_CRED_DOTENV')
const UNSET = credentialRef('DSH_CRED_UNSET')
const OWN = credentialRef('DSH_CRED_OWN')
const MANAGED = 'version: 1\nrefs:\n  DSH_CRED_MODEL: typed-in-browser\n  DSH_CRED_OWN: own-value\n'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

async function boot(lockedRefs: string[]): Promise<{ ctx: Context; managed: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-credentials-locked-'))
  const managed = join(dir, 'credentials.yaml')
  await writeFile(managed, MANAGED, { mode: 0o600 })
  const ctx = new Context()
  ctx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, createLaunchEnvironmentSnapshot([
    { source: 'process', values: { DSH_CRED_MODEL: 'deployment-value' } },
    { source: 'project-env', values: { DSH_CRED_DOTENV: 'dotenv-value' } },
  ]))
  const fiber = ctx.plugin(LocalCredentialProvider, { path: managed, lockedRefs, watch: false })
  cleanups.push(async () => {
    await fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  })
  await fiber
  return { ctx, managed }
}

it('resolves a locked reference from the deployment only and refuses to change it', async () => {
  const { ctx, managed } = await boot(['DSH_CRED_MODEL', 'DSH_CRED_DOTENV', 'DSH_CRED_UNSET'])

  expect(await ctx.credentials.resolve(MODEL)).toEqual({ value: 'deployment-value', source: 'env' })
  expect(await ctx.credentials.describe(MODEL)).toEqual({ configured: true, source: 'env', writable: false })
  expect(await ctx.credentials.describe(DOTENV)).toEqual({ configured: true, source: 'project-env', writable: false })
  expect(await ctx.credentials.describe(UNSET)).toEqual({ configured: false, writable: false })
  await expect(ctx.credentials.set(MODEL, 'own-key')).rejects.toThrow('"DSH_CRED_MODEL" is supplied by this deployment')
  await expect(ctx.credentials.unset(UNSET)).rejects.toThrow('"DSH_CRED_UNSET" is supplied by this deployment')
  expect(await readFile(managed, 'utf8')).toBe(MANAGED)

  await ctx.credentials.set(OWN, 'rotated')
  expect(await ctx.credentials.resolve(OWN)).toEqual({ value: 'rotated', source: 'file' })
})

it('leaves every reference writable without lockedRefs', async () => {
  const { ctx } = await boot([])
  expect(await ctx.credentials.resolve(MODEL)).toEqual({ value: 'typed-in-browser', source: 'file' })
  expect(await ctx.credentials.describe(MODEL)).toEqual({ configured: true, source: 'file', writable: true })
})
