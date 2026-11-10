/**
 * Run serial browser owners before one bounded snapshot pool.
 *
 * `DSH_WEB_SNAPSHOT_SHARD=<index>/<count>` runs one Vitest shard of the pool;
 * shard 1 also owns the serial files. Unset, one process runs every file.
 */
import { spawn } from 'node:child_process'
import { pnpmInvocation } from './pnpm-invocation.ts'

const serialFiles = [
  'apps/web/tests/hmr-live.e2e.ts',
  'apps/web/tests/client-plugin-live.e2e.ts',
  // Recorded SVG streaming retains live heartbeat assertions; reserve its browser CPU budget.
  'apps/web/tests/present-svg.e2e.ts',
]
const workerRaw = process.env.DSH_WEB_SNAPSHOT_WORKERS
const workers = Number.parseInt(workerRaw ?? '', 10)
if (!Number.isSafeInteger(workers) || workers < 1 || String(workers) !== workerRaw) {
  throw new Error(`DSH_WEB_SNAPSHOT_WORKERS must be a positive integer, got ${JSON.stringify(workerRaw)}.`)
}
const shardRaw = process.env.DSH_WEB_SNAPSHOT_SHARD
const shard = shardRaw === undefined || shardRaw === '' ? undefined : parseShard(shardRaw)
const invocation = pnpmInvocation(['exec', 'vitest', 'run', '--config', 'vitest.web.config.ts'])
let serialStatus = 0
for (const file of shard === undefined || shard.index === 1 ? serialFiles : []) {
  serialStatus = await run(invocation.command, [...invocation.args, file])
  if (serialStatus !== 0) break
}
if (serialStatus === 0) {
  process.exitCode = await run(invocation.command, [
    ...invocation.args,
    ...serialFiles.map(file => `--exclude=${file}`),
    ...shard === undefined ? [] : [`--shard=${String(shard.index)}/${String(shard.count)}`],
    '--fileParallelism',
    `--maxWorkers=${String(workers)}`,
  ])
} else {
  process.exitCode = serialStatus
}

function parseShard(raw: string): { index: number; count: number } {
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(raw)
  const index = Number(match?.[1])
  const count = Number(match?.[2])
  if (match === null || index > count) {
    throw new Error(`DSH_WEB_SNAPSHOT_SHARD must be <index>/<count> with 1 <= index <= count, got ${JSON.stringify(raw)}.`)
  }
  return { index, count }
}

function run(command: string, args: string[]): Promise<number> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (exitCode, signalCode) => {
      if (signalCode !== null) {
        console.error(`web snapshots terminated by ${signalCode}`)
        resolveRun(1)
        return
      }
      resolveRun(exitCode ?? 1)
    })
  })
}
