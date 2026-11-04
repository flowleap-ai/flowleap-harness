// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ISessions, SessionListState, SessionSnapshot, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConversationSnapshot, ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { runSessionAddress, runSessionProvider, type RunSession } from '../src/client/agent-run.ts'
import type { RunSessionId } from '../src/client/api.ts'
import { RunChatView, RunConversation, type RunConversationProps } from '../src/client/RunConversation.tsx'
import { fakeReference } from './agent-fakes.client.tsx'

afterEach(() => { cleanup() })

/** Let the stream reach its next wait. */
const settle = () => new Promise((resolve) => { setTimeout(resolve, 0) })

const ID = 'ses_r71work' as SessionId
const list = (phase: SessionListState['phase'], ids: readonly SessionId[]) => {
  const byId = Object.fromEntries(ids.map(id => [id, { id } as SessionSummary]))
  const state: Partial<SessionListState> = { ids: [...ids], byId, phase, projectionsBySession: {} }
  return state as SessionListState
}

/**
 * A Sessions service whose list the test sets and whose references the test counts.
 * @param initial - the first list.
 * @returns the service, the list and the retain and release spies.
 */
function fakeSessions(initial: SessionListState) {
  let current = initial
  const listeners = new Set<() => void>()
  const store = {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: (next: SessionListState) => {
      current = next
      for (const listener of [...listeners]) listener()
    },
  }
  const release = vi.fn()
  const retain = vi.fn((id: SessionId) => ({ ...fakeReference(id), release }))
  const sessions = { list: store, retain } as Partial<ISessions> as ISessions
  return { sessions, store, retain, release }
}

const RUN = runSessionAddress(ID as string as RunSessionId)

/**
 * Open the run Session resource and read it one frame at a time.
 * @param sessions - the Sessions service.
 * @param signal - stops the stream.
 * @param address - the resource address.
 * @returns a reader of the next frame's value, or `done` when the stream ended.
 */
function open(sessions: ISessions, signal: AbortSignal, address = RUN) {
  const stream = runSessionProvider(sessions).open(address, { signal })[Symbol.asyncIterator]()
  return async (): Promise<RunSession | 'done'> => {
    const frame = await stream.next()
    if (frame.done === true) return 'done'
    const result: RemoteResult<RunSession> = frame.value
    return result.ok ? result.value : 'done'
  }
}

describe('the run Session resource', () => {
  it('holds a reference to a listed Session while the panel reads it', async () => {
    const { sessions, retain, release } = fakeSessions(list('ready', [ID]))
    const controller = new AbortController()
    const next = open(sessions, controller.signal)
    expect(await next()).toMatchObject({ kind: 'ready', reference: { sessionId: ID } })
    expect(retain).toHaveBeenCalledWith(ID, { source: 'recordsRun', signal: controller.signal })
    const end = next()
    controller.abort()
    expect(await end).toBe('done')
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('waits for the Session list, says missing once, and holds the Session when the list gets it', async () => {
    const { sessions, store, retain } = fakeSessions(list('pending', []))
    const controller = new AbortController()
    const next = open(sessions, controller.signal)
    const first = next()
    store.set(list('ready', []))
    expect(await first).toEqual({ kind: 'missing' })
    const second = next()
    await settle()
    store.set(list('ready', ['ses_other' as SessionId]))
    await settle()
    store.set(list('ready', [ID]))
    expect(await second).toMatchObject({ kind: 'ready' })
    expect(retain).toHaveBeenCalledTimes(1)
    controller.abort()
    expect(await next()).toBe('done')
  })

  it('ends when the panel stopped reading before the list changed', async () => {
    const { sessions, store, retain } = fakeSessions(list('pending', []))
    const controller = new AbortController()
    const next = open(sessions, controller.signal)
    const first = next()
    store.set(list('ready', []))
    await first
    controller.abort()
    expect(await next()).toBe('done')
    expect(retain).not.toHaveBeenCalled()
  })

  it('ends without a reference when the panel stops reading first', async () => {
    const { sessions, retain } = fakeSessions(list('pending', []))
    const controller = new AbortController()
    const pending = open(sessions, controller.signal)()
    controller.abort()
    expect(await pending).toBe('done')
    expect(retain).not.toHaveBeenCalled()
  })

  it.each(['dsh-resource://recordsrun/other/x', 'dsh-resource://recordsrun/session/', 'dsh-resource://recordsrun/session/%E0%A4%A'])(
    'reads %s as a missing Session',
    async (address) => {
      const next = open(fakeSessions(list('ready', [])).sessions, new AbortController().signal, address)
      expect(await next()).toEqual({ kind: 'missing' })
      expect(await next()).toBe('done')
    },
  )
})

describe('the run conversation', () => {
  const props = (session: Partial<SessionSnapshot>, active: number, summaryBlank: boolean | undefined) => {
    const base: Partial<SessionSnapshot> = { blank: true, awaitingFirstTurn: true, running: false, promptAttempted: false, openState: 'open' }
    const snapshot = { ...base, ...session } as SessionSnapshot
    const targets: Partial<ConversationSnapshot> = { activeTargets: new Set(Array.from({ length: active }, (_, i) => String(i))) }
    const conversation = targets as ConversationSnapshot
    const listed: Partial<SessionListState> = { ...list('ready', [ID]), byId: { [ID]: { blank: summaryBlank } as SessionSummary } }
    const sessions = listed as SessionListState
    const renderFactorySlot = vi.fn(() => null)
    const all = {
      sessionId: ID,
      useSession: <S,>(select: (value: SessionSnapshot) => S) => select(snapshot),
      useConversation: <S,>(select: (value: ConversationSnapshot) => S) => select(conversation),
      useSessions: <S,>(select: (value: SessionListState) => S) => select(sessions),
      renderFactorySlot,
    } as Partial<RunConversationProps> as RunConversationProps
    return { all, renderFactorySlot }
  }

  const ACTIVE = { phase: 'active', hero: false } as const
  const HERO = { phase: 'hero', hero: true } as const
  it.each([
    { name: 'active with a target', session: {}, active: 1, summaryBlank: false, expected: ACTIVE },
    { name: 'active with a turn', session: { blank: false, awaitingFirstTurn: false }, active: 0, summaryBlank: false, expected: ACTIVE },
    { name: 'running', session: { running: true }, active: 0, summaryBlank: false, expected: ACTIVE },
    { name: 'engaging', session: { promptAttempted: true }, active: 0, summaryBlank: false, expected: ACTIVE },
    { name: 'blank and open', session: {}, active: 0, summaryBlank: undefined, expected: HERO },
    { name: 'blank while loading', session: { openState: 'loading' }, active: 0, summaryBlank: undefined, expected: { phase: 'settling', hero: false } },
    { name: 'blank in the list while loading', session: { openState: 'loading' }, active: 0, summaryBlank: true, expected: HERO },
  ] as const)('renders the embedded content $name', ({ session, active, summaryBlank, expected }) => {
    const { all, renderFactorySlot } = props(session, active, summaryBlank)
    render(<RunConversation {...all} />)
    const views = { slots: { views: RunChatView } }
    expect(renderFactorySlot).toHaveBeenCalledWith('conversation.content', { variant: 'embedded', ...expected }, views)
  })

  it('shows the chat view of the Session', () => {
    const renderSlot = vi.fn(() => null)
    const views: Partial<ConversationViewsProps> = { renderSlot }
    render(<RunChatView {...(views as ConversationViewsProps)} />)
    expect(renderSlot).toHaveBeenCalledWith('conversation.session', { view: 'chat' })
  })
})
