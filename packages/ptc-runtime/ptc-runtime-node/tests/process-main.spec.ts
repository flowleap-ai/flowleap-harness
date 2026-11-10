import type { PtcProgramFormat } from '@deepseek-ai/dsh-ptc-runtime'
import { Duplex, PassThrough, Writable } from 'node:stream'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { expect, it, onTestFinished, vi } from 'vitest'
import { createProcessRpc } from '../src/rpc.ts'
import { runNodeMain, type ProgramProcess } from '../src/process.ts'
import type { HostMethods, ProgramBootData, ProgramMethods } from '../src/protocol.ts'
import { decodePtcJsonWire, encodePtcJsonWire } from '../src/json-wire.ts'

function endpoints() {
  const first = new PassThrough()
  const second = new PassThrough()
  const child = Duplex.from({ readable: first, writable: second })
  const host = Duplex.from({ readable: second, writable: first })
  child.on('error', () => {})
  host.on('error', () => {})
  onTestFinished(() => { child.destroy(); host.destroy() })
  return { child, host }
}
function processState(): ProgramProcess { return { env: { FIXTURE_SECRET: 'test' }, stdout: { write: () => true }, stderr: { write: () => true }, exitCode: undefined, chdir: () => {} } }

async function setup(limit = 4096, namespaces: ProgramBootData['namespaces'] = [{ global: 'tools', names: ['echo'] }]) {
  const { child, host } = endpoints()
  const state = processState()
  const nativeEnvironment = state.env
  Object.assign(nativeEnvironment, { SystemRoot: 'C:\\Windows', PATH: '/native/bin', TMP: 'C:\\sandbox-temp', TEMP: 'C:\\sandbox-temp' })
  const ready = Promise.withResolvers<undefined>()
  const logs: string[] = []
  const methods: HostMethods = {
    ready: () => { ready.resolve(undefined) },
    invoke: async () => encodePtcJsonWire(42),
    log: (text) => { logs.push(text) },
    outputLimit: () => {},
  }
  const peer = createProcessRpc<ProgramMethods, HostMethods>(host, limit, methods, [], () => {})
  const main = runNodeMain(child, limit, state)
  onTestFinished(async () => { peer.$close(); child.destroy(); await main })
  await ready.promise
  const run = (code: string, maxOutputBytes = 1024, programFormat?: PtcProgramFormat) => peer.run('/', {
    code, ...programFormat === undefined ? {} : { programFormat },
    namespaces, maxOutputBytes, retainsState: false,
  })
  return { child, host, state, nativeEnvironment, methods, peer, main, logs, run }
}

it('clears the environment and returns a binding result after captured output', async () => {
  const h = await setup()
  h.methods.invoke = async (_global, _name, wire) => {
    const args = decodePtcJsonWire(wire) as { n: number }
    return encodePtcJsonWire(args.n * 2)
  }
  const result = await h.run('const doubled = await tools.echo({ n: 21 }); console.log("got", doubled); return { doubled };')
  expect(decodePtcJsonWire(result.value)).toEqual({ doubled: 42 })
  expect(h.logs).toEqual(['got 42'])
  expect(h.state.env).toEqual({})
  expect(h.state.env).not.toBe(h.nativeEnvironment)
  expect(Object.getPrototypeOf(h.state.env)).toBeNull()
  expect(h.nativeEnvironment).toEqual({ SystemRoot: 'C:\\Windows', PATH: '/native/bin', TMP: 'C:\\sandbox-temp', TEMP: 'C:\\sandbox-temp' })
  h.peer.$close()
  await h.main
  expect(h.state.exitCode).toBeUndefined()
})

it('keeps unfinished temporary calls pending and suppresses later logs while awaiting host shutdown', async () => {
  const h = await setup()
  const release = Promise.withResolvers<ReturnType<typeof encodePtcJsonWire>>()
  h.methods.invoke = () => release.promise
  try {
    expect(decodePtcJsonWire((await h.run('void tools.echo({}).catch(() => {}); void tools.echo({}).catch(() => console.log("late rejection")); setImmediate(() => console.log("late timer")); return 42;')).value)).toBe(42)
    await nextTurn()
    expect(h.child.destroyed).toBe(false)
    release.resolve(encodePtcJsonWire(42))
    await nextTurn()
    expect(h.logs).toEqual([])
  } finally { release.resolve(encodePtcJsonWire(null)) }
})

it('rejects a binding call that the host fails during the run', async () => {
  const h = await setup()
  h.methods.invoke = async () => { throw new Error('denied by host') }
  const result = await h.run('try { await tools.echo({}) } catch (error) { return error.message }')
  expect(decodePtcJsonWire(result.value)).toBe('denied by host')
})

it.each(['function-body', 'repl', 'script'] as const)('leaves an unawaited call pending when a temporary %s process closes after the result', async (format) => {
  const h = await setup()
  const pending = Promise.withResolvers<ReturnType<typeof encodePtcJsonWire>>()
  onTestFinished(() => { pending.resolve(encodePtcJsonWire(null)) })
  h.methods.invoke = () => pending.promise
  const code = format === 'function-body' ? 'void tools.echo({}).catch(() => {}); return 42' : 'void tools.echo({}).catch(() => {}); 42'
  expect(decodePtcJsonWire((await h.run(code, 1024, format)).value)).toBe(42)
  h.peer.$close()
  await h.main
  await nextTurn()
  expect(h.state.exitCode).toBeUndefined()
})

it.each([4, 64])('reports exhausted output accounting during the run with a %s-byte limit', async (maxOutputBytes) => {
  const h = await setup()
  const limited = vi.fn()
  h.methods.outputLimit = limited
  expect(await h.run('console.log("x".repeat(100)); return null', maxOutputBytes))
    .toEqual({ error: { kind: 'output-limit', message: `outer output exceeded ${maxOutputBytes} bytes` } })
  if (maxOutputBytes === 4) expect(h.logs).toEqual([])
  await vi.waitFor(() => { expect(limited).toHaveBeenCalledOnce() })
})

it.each([
  ['throw new Error("boom")', 'boom'],
  ['throw "raw-throw"', 'raw-throw'],
  ['const e = new Error("bare"); e.stack = undefined; throw e', 'bare'],
])('returns bounded program exceptions for %s', async (code, message) => {
  const h = await setup(65_536)
  const result = await h.run(code, 65_536)
  expect(result.error?.kind).toBe('exception')
  expect(result.error?.message).toContain(message)
  expect(result.value).toBeUndefined()
})

it.each(['throw "x".repeat(1_000_000)', 'throw new Error("x".repeat(1_000_000))'])('bounds large diagnostics for %s', async (code) => {
  const h = await setup()
  expect(await h.run(code, 64)).toEqual({ error: { kind: 'output-limit', message: 'outer output exceeded 64 bytes' } })
})

it.each([
  ['tools', 'ToolCallError', 'toolName'],
  ['helpers', 'HelperCallError', 'helperName'],
])('injects the declared rejection class for %s', async (global, name, memberNameProperty) => {
  const h = await setup(4096, [{ global, names: ['x'], errorClass: { name, memberNameProperty } }])
  h.methods.invoke = async () => { throw new Error('denied by host') }
  const result = await h.run(`try { await ${global}.x({}) } catch (error) { return { caught: error instanceof ${name}, name: error.name, member: error.${memberNameProperty}, message: error.message } }`)
  expect(decodePtcJsonWire(result.value)).toEqual({ caught: true, name, member: 'x', message: 'denied by host' })
})

it('sends no binding calls or output notifications after returning its result', async () => {
  const h = await setup()
  const invoked = vi.fn(async () => encodePtcJsonWire(1))
  const limited = vi.fn()
  h.methods.invoke = invoked
  h.methods.outputLimit = limited
  const result = await h.run('setImmediate(() => { void tools.echo({}).catch(() => {}); console.log("x".repeat(2000)) }); return 1', 64)
  expect(decodePtcJsonWire(result.value)).toBe(1)
  await nextTurn()
  await nextTurn()
  expect(invoked).not.toHaveBeenCalled()
  expect(limited).not.toHaveBeenCalled()
  expect(h.logs).toEqual([])
})

it.each([0, -1, 1.5])('rejects an invalid control message limit %s', async (limit) => {
  const { child } = endpoints()
  await expect(runNodeMain(child, limit, processState())).rejects.toThrow('invalid control message limit')
})

it('records malformed host traffic before evaluation as failure', async () => {
  const h = await setup()
  h.host.write(Buffer.from('null\n'))
  await h.main
  expect(h.state.exitCode).toBe(1)
})

it('accepts host shutdown before the first evaluation', async () => {
  const h = await setup()
  h.peer.$close()
  await h.main
  expect(h.state.exitCode).toBeUndefined()
})

it.each([
  'console.log("x".repeat(2000));',
  'return "x".repeat(2000)',
])('closes on control output overflow: %s', async (code) => {
  const h = await setup(1024)
  await expect(h.run(code, 8000)).rejects.toThrow()
  await h.main
  expect(h.state.exitCode).toBe(1)
})

it('records malformed host traffic after completion', async () => {
  const h = await setup()
  await h.run('return 42')
  h.host.write(Buffer.from([0xff, 10]))
  await h.main
  expect(h.state.exitCode).toBe(1)
})

/** A program endpoint whose writes reach the host at once but complete only when released, as Windows pipe writes do. */
async function deferredWriteSetup() {
  const toHost = new PassThrough()
  const held: (() => void)[] = []
  const writes: { line: string; at: number }[] = []
  const child = new Duplex({
    read() {},
    write(chunk: Buffer, _encoding, callback) {
      writes.push({ line: chunk.toString('utf8'), at: Date.now() })
      toHost.write(chunk)
      held.push(() => { callback() })
    },
  })
  const toChild = new Writable({ write(chunk: Buffer, _encoding, callback) { child.push(chunk); callback() } })
  const host = Duplex.from({ readable: toHost, writable: toChild })
  child.on('error', () => {})
  host.on('error', () => {})
  const ready = Promise.withResolvers<undefined>()
  const peer = createProcessRpc<ProgramMethods, HostMethods>(host, 4096, {
    ready: () => { ready.resolve(undefined) },
    invoke: async () => encodePtcJsonWire(null),
    log: () => {},
    outputLimit: () => {},
  }, [], () => {})
  const state = processState()
  const chdir = vi.fn()
  state.chdir = chdir
  const main = runNodeMain(child, 4096, state)
  onTestFinished(async () => { peer.$close(); child.destroy(); host.destroy(); await main })
  await ready.promise
  const run = (code: string) => peer.run('/', { code, namespaces: [{ global: 'tools', names: ['echo'] }], maxOutputBytes: 1024, retainsState: false })
  const releaseWrites = (): void => { for (const complete of held.splice(0)) complete() }
  return { child, writes, chdir, run, releaseWrites }
}

it('sends the first frame of an evaluation before a synchronous loop when an earlier write is still completing', async () => {
  const h = await deferredWriteSetup()
  const pending = h.run('void tools.echo({}); const end = Date.now() + 100; while (Date.now() < end) {} return end')
  const pump = setInterval(h.releaseWrites, 1)
  onTestFinished(() => { clearInterval(pump) })
  const loopEnd = decodePtcJsonWire((await pending).value) as number
  const call = h.writes.find(write => write.line.includes('"m":"invoke"'))
  expect(call?.at).toBeLessThan(loopEnd)
})

it('does not start the program when the channel closes while an earlier write is still completing', async () => {
  const h = await deferredWriteSetup()
  void h.run('return 1').catch(() => {})
  await nextTurn()
  h.child.destroy()
  await nextTurn()
  expect(h.chdir).not.toHaveBeenCalled()
})
