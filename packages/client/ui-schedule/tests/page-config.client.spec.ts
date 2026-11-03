/** The Host half validates the Automation tasks page switches and embeds them in browser pages. */
import { Context } from '@deepseek-ai/cordis'
import type { IndexInjection, WebServer } from '@deepseek-ai/dsh-host-webserver'
import { expect, it, onTestFinished } from 'vitest'
import { Config, SCHEDULE_PAGE_GLOBAL } from '../src/config.ts'
import * as host from '../src/index.ts'

/** The Peer an index render speaks for; this listener reads no field of it. */
const PAGE_PEER = { principal: { kind: 'owner' } } as Parameters<WebServer['renderIndex']>[1]

it('opens New task without a draft by default and rejects a non-boolean switch', () => {
  expect(host.Config).toBe(Config)
  expect(Config({})).toEqual({ newTaskDraft: false })
  expect(() => Config({ newTaskDraft: 'yes' as never })).toThrow()
})

it('embeds the switches in browser pages and withdraws them on disposal', async () => {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  const config = Config({ newTaskDraft: true })
  const fiber = ctx.plugin(host, config)
  await fiber.await()
  const rows: IndexInjection[] = []
  ctx.emit('webserver/index-inject', rows, PAGE_PEER)
  expect(rows).toEqual([{ kind: 'global', name: SCHEDULE_PAGE_GLOBAL, value: config }])
  await fiber.dispose()
  const after: IndexInjection[] = []
  ctx.emit('webserver/index-inject', after, PAGE_PEER)
  expect(after).toEqual([])
})
