import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { probe as probeLandlock } from '@deepseek-ai/node-addon-system/landlock-run'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { bwrapProfileArgs, seatbeltProfileArgs } from '../src/profiles.ts'

/**
 * KEYLESS real-composition proof of `network: deny`: the shipped headless
 * profile through the real Loader, a scripted model, and the real `bash` tool
 * over this provider. One `bash` call writes inside and outside the
 * workspace and connects to a loopback TCP server the test owns; the world
 * (files, accepted connections) and the session log decide the outcome.
 *
 * Self-skips when no runner of this platform can deny the network.
 */

const driver = fileURLToPath(new URL('./fixtures/network/driver.ts', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/network/network.patch.yml', import.meta.url))
const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

const policy = { mode: 'read-only', workspaceRoot: '/' } as const
const runnerUsable = process.platform === 'darwin'
  ? spawnSync('sandbox-exec', [...seatbeltProfileArgs(policy, 'deny'), '--', 'true'], { timeout: 5_000 }).status === 0
  : process.platform === 'linux'
    && (spawnSync('bwrap', [...bwrapProfileArgs(policy, 'deny'), '--', 'true'], { timeout: 5_000 }).status === 0
      || probeLandlock(undefined, { network: 'deny' }) !== 'unusable')

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(cleanup => cleanup()))
})

async function jsonlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const paths = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return jsonlFiles(path)
    return entry.isFile() && entry.name.endsWith('.jsonl') ? [path] : []
  }))
  return paths.flat()
}

async function loopbackServer(): Promise<{ port: number; accepted: () => number }> {
  let accepted = 0
  const server: Server = createServer((socket) => {
    accepted += 1
    socket.destroy()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanups.push(() => new Promise<void>((resolve) => { server.close(() => { resolve() }) }))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('loopback server has no port')
  return { port: address.port, accepted: () => accepted }
}

describe.skipIf(!runnerUsable)('network deny through the production headless profile', () => {
  it('a confined bash call writes inside the workspace only and reaches no IP network, without an approval', async () => {
    const outside = await mkdtemp(join(homedir(), 'dsh-sandbox-network-outside-'))
    cleanups.push(() => rm(outside, { recursive: true, force: true }))
    const server = await loopbackServer()
    const command = [
      'printf inside > inside.txt; echo "inside=$?"',
      `printf outside > ${JSON.stringify(join(outside, 'outside.txt'))}; echo "outside=$?"`,
      `(exec 3<>/dev/tcp/127.0.0.1/${server.port}) 2>/dev/null; echo "tcp=$?"`,
    ].join('; ')

    let events: SessionEvent[] = []
    let inside = ''
    await runLoaderSmoke({
      label: 'sandbox network headless smoke',
      tempDirPrefix: 'sandbox-network-e2e-',
      binScript: driver,
      libBinScript: driver,
      configPath,
      tsconfigPath: repoTsconfig,
      env: { DSH_TEST_SANDBOX_COMMAND: command },
      inspect: async (cwd) => {
        const logs = await jsonlFiles(join(cwd, '.sessions'))
        expect(logs).toHaveLength(1)
        const lines = (await readFile(logs[0] as string, 'utf8')).trimEnd().split('\n')
        events = lines.slice(1).map(line => JSON.parse(line) as SessionEvent)
        inside = existsSync(join(cwd, 'inside.txt')) ? readFileSync(join(cwd, 'inside.txt'), 'utf8') : ''
      },
    })

    const results = events.filter((event): event is SessionEvent<'tool/result'> => event.type === 'tool/result')
    expect(results).toHaveLength(1)
    const output = JSON.stringify(results[0]!.data)
    expect(output).toContain('inside=0')
    expect(output).toContain('outside=1')
    expect(output).toContain('tcp=1')
    expect(inside).toBe('inside')
    expect(existsSync(join(outside, 'outside.txt'))).toBe(false)
    expect(server.accepted()).toBe(0)
    expect(events.find(event => event.type === 'approval/policy')?.data).toEqual({ policy: 'ask' })
    expect(events.some(event => event.type === 'approval/asked')).toBe(false)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
