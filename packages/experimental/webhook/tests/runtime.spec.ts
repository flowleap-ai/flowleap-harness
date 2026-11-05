import { Context } from '@deepseek-ai/cordis'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WebhookRuntime, {
  WebhookDeliveryId,
  WebhookRuleId,
  WebhookSourceId,
  type VerifiedWebhookDelivery,
} from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.allSettled(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

/** Construct the runtime directly so callback-only tests need no Agent stack. */
function harness(): { ctx: Context; runtime: WebhookRuntime } {
  const ctx = new Context()
  contexts.push(ctx)
  return { ctx, runtime: new WebhookRuntime(ctx) }
}

/** One valid generic delivery. */
function delivery(id = 'delivery-1'): VerifiedWebhookDelivery<'fixture'> {
  return {
    kind: 'fixture',
    source: WebhookSourceId('fixture-source'),
    deliveryId: WebhookDeliveryId(id),
    event: { value: 1 },
    receivedAt: 1,
  }
}

describe('WebhookRuntime', () => {
  it('dispatches a detached immutable snapshot and returns before the rule settles', async () => {
    const { runtime } = harness()
    const entered = Promise.withResolvers<Readonly<VerifiedWebhookDelivery<'fixture'>>>()
    const release = Promise.withResolvers<boolean>()
    runtime.register({
      id: WebhookRuleId('fixture-rule'),
      kind: 'fixture',
      async run(input) {
        entered.resolve(input)
        await release.promise
        return null
      },
    })
    const original = delivery()
    runtime.dispatch(original)
    ;(original.event as { value: number }).value = 2
    const seen = await entered.promise
    expect(seen).not.toBe(original)
    expect(seen.event).toEqual({ value: 1 })
    expect(Object.isFrozen(seen)).toBe(true)
    expect(Object.isFrozen(seen.event)).toBe(true)
    release.resolve(true)
  })

  it('starts matching siblings independently and contains one failure', async () => {
    const { runtime } = harness()
    const started: string[] = []
    const both = Promise.withResolvers<boolean>()
    const maybeDone = (): void => { if (started.length === 2) both.resolve(true) }
    runtime.register({
      id: WebhookRuleId('throws'),
      kind: 'fixture',
      run() {
        started.push('throws')
        maybeDone()
        throw new Error('fixture failure')
      },
    })
    runtime.register({
      id: WebhookRuleId('succeeds'),
      kind: 'fixture',
      run() {
        started.push('succeeds')
        maybeDone()
        return null
      },
    })
    runtime.register({
      id: WebhookRuleId('other-kind'),
      kind: 'other',
      run: vi.fn(() => null),
    })
    runtime.dispatch(delivery())
    await both.promise
    expect(started).toEqual(['throws', 'succeeds'])
  })

  it('rejects malformed registrations and duplicate ids', async () => {
    const { runtime } = harness()
    expect(() => runtime.register({ id: WebhookRuleId(''), kind: 'fixture', run: () => null }))
      .toThrow(/id must be a non-empty string/)
    expect(() => runtime.register({ id: WebhookRuleId('bad-kind'), kind: '', run: () => null }))
      .toThrow(/kind must be a non-empty string/)
    expect(() => runtime.register({ id: WebhookRuleId('bad-run'), kind: 'fixture', run: 1 as never }))
      .toThrow(/requires run/)
    const dispose = runtime.register({ id: WebhookRuleId('same'), kind: 'fixture', run: () => null })
    expect(() => runtime.register({ id: WebhookRuleId('same'), kind: 'fixture', run: () => null }))
      .toThrow(/already registered/)
    await dispose()
    expect(() => runtime.register({ id: WebhookRuleId('same'), kind: 'fixture', run: () => null }))
      .not.toThrow()
  })

  it('hides, aborts, and drains a registration before disposal resolves', async () => {
    const { ctx, runtime } = harness()
    const warnings = vi.spyOn(ctx.logger, 'warn')
    const entered = Promise.withResolvers<AbortSignal>()
    const finished = Promise.withResolvers<boolean>()
    let calls = 0
    const dispose = runtime.register({
      id: WebhookRuleId('draining'),
      kind: 'fixture',
      async run(_input, signal) {
        calls++
        entered.resolve(signal)
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => { resolve() }, { once: true })
        })
        finished.resolve(true)
        return null
      },
    })
    runtime.dispatch(delivery())
    const signal = await entered.promise
    const draining = dispose()
    expect(signal.aborted).toBe(true)
    runtime.dispatch(delivery('after-dispose'))
    await draining
    await finished.promise
    expect(calls).toBe(1)
    await expect(dispose()).resolves.toBeUndefined()
    expect(warnings).not.toHaveBeenCalled()
  })

  it('aborts active rules and refuses later work when the runtime disposes', async () => {
    const { ctx, runtime } = harness()
    const entered = Promise.withResolvers<AbortSignal>()
    runtime.register({
      id: WebhookRuleId('runtime-disposal'),
      kind: 'fixture',
      async run(_input, signal) {
        entered.resolve(signal)
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => { resolve() }, { once: true })
        })
        return null
      },
    })
    runtime.dispatch(delivery())
    const signal = await entered.promise
    await ctx.fiber.dispose()
    expect(signal.aborted).toBe(true)
    expect(() => { runtime.dispatch(delivery()) }).toThrow(/closing/)
    expect(() => runtime.register({ id: WebhookRuleId('late'), kind: 'fixture', run: () => null }))
      .toThrow(/closing/)
  })

  it.each([
    [{ ...delivery(), kind: '' }, /kind/],
    [{ ...delivery(), source: WebhookSourceId('') }, /source/],
    [{ ...delivery(), deliveryId: WebhookDeliveryId('') }, /delivery id/],
    [{ ...delivery(), receivedAt: -1 }, /receivedAt/],
    [{ ...delivery(), event: { invalid: undefined } }, /lossless JSON/],
  ] as const)('rejects malformed deliveries synchronously', (input, message) => {
    const { runtime } = harness()
    expect(() => { runtime.dispatch(input as never) }).toThrow(message)
  })

  it('intentionally invokes a rule again for a repeated delivery', async () => {
    const { runtime } = harness()
    const calledTwice = Promise.withResolvers<boolean>()
    let calls = 0
    runtime.register({
      id: WebhookRuleId('repeat'),
      kind: 'fixture',
      run() {
        calls++
        if (calls === 2) calledTwice.resolve(true)
        return null
      },
    })
    runtime.dispatch(delivery())
    runtime.dispatch(delivery())
    await calledTwice.promise
    expect(calls).toBe(2)
  })

  it('keeps execution-state, retry, dedupe, and completion machinery out of the runtime', () => {
    const production = [
      '../src/brand.ts',
      '../src/types.ts',
      '../src/session.ts',
      '../src/index.ts',
    ].map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n')
    const forbidden: ReadonlyArray<readonly [string, RegExp]> = [
      ['execution records', /\bWebhook(?:Execution|Status)\b/],
      ['delivery storage domains', /@deepseek-ai\/dsh-storage|\bstorageDomain\b|\bDomainSpec\b/],
      ['retry timers', /\bset(?:Timeout|Interval)\s*\(/],
      ['delivery-id dedupe maps', /new Map<\s*WebhookDeliveryId/],
      ['Agent idle waits', /\.whenIdle\s*\(/],
      ['Agent status listeners', /\.on\(\s*['"]agent\/status/],
      ['turn completion listeners', /\.on\(\s*['"]turn\/end/],
      ['webhook completion events', /['"]webhook\/(?:completion|completed)['"]/],
      ['webhook management Remotes', /@Remote\b|\bRemote\s*\(/],
    ]
    for (const [label, pattern] of forbidden) {
      expect(production, label).not.toMatch(pattern)
    }
  })

  it('logs a started() failure without touching sibling rules', async () => {
    const { ctx, runtime } = harness()
    const warn = vi.spyOn(ctx.logger, 'warn')
    const logged = Promise.withResolvers<boolean>()
    warn.mockImplementation(() => { logged.resolve(true) })
    runtime.register({
      id: WebhookRuleId('no-session'),
      kind: 'fixture',
      run: () => null,
      started: () => { throw new Error('never called without a Session') },
    })
    runtime.register({ id: WebhookRuleId('throws'), kind: 'fixture', run: () => { throw new Error('boom') } })
    runtime.dispatch(delivery())
    await logged.promise
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]?.[0])).toContain('rule="throws"')
  })

  it('reports a run() failure and a failed Session creation to failed(), and logs a throw of failed()', async () => {
    const { ctx, runtime } = harness()
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    const failures: string[] = []
    const allThree = Promise.withResolvers<boolean>()
    const note = (rule: string) => (error: unknown) => {
      failures.push(`${rule}: ${String(error)}`)
      if (failures.length === 3) allThree.resolve(true)
    }
    runtime.register({ id: WebhookRuleId('throws'), kind: 'fixture', run: () => { throw new Error('boom') }, failed: note('throws') })
    runtime.register({
      id: WebhookRuleId('no-session-service'),
      kind: 'fixture',
      run: () => ({ workspacePath: '/w', title: 't', prompt: 'p', agentPreset: 'a', permissionPreset: 'r' }),
      failed: note('no-session-service'),
    })
    runtime.register({ id: WebhookRuleId('null'), kind: 'fixture', run: () => null, failed: note('null') })
    runtime.register({
      id: WebhookRuleId('failed-throws'),
      kind: 'fixture',
      run: () => { throw new Error('boom') },
      failed: (error) => {
        note('failed-throws')(error)
        throw new Error('failed hook broke')
      },
    })
    runtime.dispatch(delivery())
    await allThree.promise
    const threw = () => warn.mock.calls.some(([line]) => /failed\(\) threw: .*failed hook broke/u.test(String(line)))
    await vi.waitFor(() => { expect(threw()).toBe(true) })
    expect(failures.map(line => line.split(':')[0]).sort()).toEqual(['failed-throws', 'no-session-service', 'throws'])
  })

  it('creates one Session per matching repeated delivery, reports each Session to started(), and never calls failed() after a Session', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const followedTwice = Promise.withResolvers<boolean>()
    const startedTwice = Promise.withResolvers<boolean>()
    const messages: unknown[] = []
    const started: Array<{ session: string; delivery: string; followups: number }> = []
    const session = {}
    const attachSession = vi.fn(async () => {})
    const failed = vi.fn()
    ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ provider: 'p', model: 'm' }),
    } as never)
    ctx.provide('permissionPresets', {
      resolve: () => ({}),
      set: () => {},
    } as never)
    ctx.provide('agentPresets', {
      resolve: async (id: string) => ({ id }),
      acquireScope: async () => ({ key: {}, [Symbol.asyncDispose]: async () => {} }),
      mount: async (_agentCtx: unknown, id: string) => ({ id }),
    } as never)
    ctx.provide('workspaceRegistry', {
      create: async () => ({
        path: '/workspace',
        attachSession,
        detachSession: async () => {},
      }),
    } as never)
    ctx.provide('sessionTitle', { rename: () => ({}) } as never)
    ctx.provide('agents', {
      create: async (options: { setup?: (agentCtx: unknown, agent: unknown) => Promise<void> }) => {
        const agent = {
          session,
          followup: (message: unknown) => {
            messages.push(message)
            if (messages.length === 2) followedTwice.resolve(true)
          },
        }
        await options.setup?.({ on: () => () => {} }, agent)
        return {
          agent,
          dispose: async () => {},
        }
      },
    } as never)
    const runtime = new WebhookRuntime(ctx)
    runtime.register({
      id: WebhookRuleId('creates'),
      kind: 'fixture',
      run: () => ({
        workspacePath: '/workspace',
        title: 'Created',
        prompt: 'Work',
        agentPreset: 'standard',
        permissionPreset: 'read-only',
      }),
      started(sessionId, input) {
        started.push({ session: sessionId, delivery: input.deliveryId, followups: messages.length })
        if (started.length === 2) startedTwice.resolve(true)
        if (started.length === 2) throw new Error('the sender refused the report')
      },
      failed,
    })
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    runtime.dispatch(delivery())
    runtime.dispatch(delivery())
    await followedTwice.promise
    await startedTwice.promise
    await vi.waitFor(() => { expect(warn).toHaveBeenCalledOnce() })
    expect(failed).not.toHaveBeenCalled()
    expect(started.map(entry => entry.delivery)).toEqual(['delivery-1', 'delivery-1'])
    expect(started.every(entry => entry.session.startsWith('webhook-') && entry.followups >= 1)).toBe(true)
    expect(new Set(started.map(entry => entry.session)).size).toBe(2)
    expect(attachSession).toHaveBeenCalledTimes(2)
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({
      content: [{ type: 'text', text: 'Work' }],
      source: { kind: 'webhook', ruleId: 'creates' },
    })
  })
})
