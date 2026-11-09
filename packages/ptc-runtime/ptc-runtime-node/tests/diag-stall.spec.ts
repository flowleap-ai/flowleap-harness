import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, it } from 'vitest'
import type { PtcBindingFunction, PtcBindingNamespace, PtcRunRequest } from '@deepseek-ai/dsh-ptc-runtime'
import { mountRuntime } from './setup.ts'

const ITERATIONS = Number(process.env.DIAG_N ?? 60)
const WORKERS = Number(process.env.DIAG_WORKERS ?? 6)
const BURNERS = Number(process.env.DIAG_BURNERS ?? 4)

function bindings(functions: Record<string, PtcBindingFunction>): PtcBindingNamespace[] {
  return [{ global: 'tools', functions, errorClass: { name: 'ToolCallError', memberNameProperty: 'toolName' } }]
}

const within = <T>(promise: Promise<T>, ms: number): Promise<T | 'stalled'> =>
  Promise.race([promise, new Promise<'stalled'>((resolve) => { setTimeout(() => { resolve('stalled') }, ms) })])

async function cancelWorker(id: number, report: string[], counts: Record<string, number>): Promise<void> {
  const root = await mkdtemp(join(homedir(), '.dsh-diag-'))
  const cwd = join(root, 'workspace')
  await mkdir(cwd)
  const ctx = new Context()
  try {
    const { runtime } = await mountRuntime(ctx, {}, { mode: 'danger-full-access', workspaceRoot: cwd })
    const run = (request: PtcRunRequest) => runtime.run(runtime.resolve(request))
    for (let i = 0; i < ITERATIONS; i++) {
      const entered = Promise.withResolvers<undefined>()
      const controller = new AbortController()
      const active = run({ timeoutMs: 20_000, program: 'void tools.enter({}); for (;;) {}', signal: controller.signal, bindings: bindings({ enter: async () => { entered.resolve(undefined); return null } }) })
      const first = await within(entered.promise, 10_000)
      controller.abort('stop')
      const result = await within(active, 30_000)
      const key = first === 'stalled' ? 'enter-stalled' : result === 'stalled' ? 'abort-stalled' : `ok:${result.error?.kind}`
      counts[key] = (counts[key] ?? 0) + 1
      if ((key !== 'ok:abort' || (id === 0 && i === 0)) && report.length < 8) {
        report.push(`worker ${id} iteration ${i} ${key}\n${result === 'stalled' ? '(no result)' : JSON.stringify(result.logs, null, 1)}`)
      }
    }
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
}

describe('diagnostic: Windows frame stall before a synchronous loop', () => {
  it('counts stalls under load', async () => {
    const burners: ChildProcess[] = []
    for (let i = 0; i < BURNERS; i++) burners.push(spawn(process.execPath, ['-e', 'for(;;){}'], { stdio: 'ignore' }))
    const report: string[] = []
    const counts: Record<string, number> = {}
    try {
      await Promise.all(Array.from({ length: WORKERS }, (_, id) => cancelWorker(id, report, counts)))
    } finally {
      for (const burner of burners) burner.kill()
    }
    await writeFile(process.env.DIAG_OUT ?? 'diag-report.txt', [`DIAG COUNTS ${JSON.stringify(counts)}`, ...report.map(entry => `DIAG REPORT ${entry}`)].join('\n'))
  }, 3_600_000)
})
