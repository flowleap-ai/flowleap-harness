// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ISessions, SessionListState, SessionSnapshot, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
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
  it.each([
    { name: 'settles while a blank history opens', session: { openState: 'loading', blank: true }, phase: 'settling' },
    { name: 'is active while history with events opens', session: { openState: 'loading', blank: false }, phase: 'active' },
    { name: 'is active once open', session: { openState: 'open', blank: true }, phase: 'active' },
  ] as const)('$name', ({ session, phase }) => {
    const snapshot = session as Partial<SessionSnapshot> as SessionSnapshot
    const renderFactorySlot = vi.fn(() => null)
    const useSession = <S,>(select: (value: SessionSnapshot) => S) => select(snapshot)
    const props: Partial<RunConversationProps> = { useSession, renderFactorySlot }
    render(<RunConversation {...(props as RunConversationProps)} />)
    const views = { slots: { views: RunChatView } }
    expect(renderFactorySlot).toHaveBeenCalledWith('conversation.content', { variant: 'embedded', phase, hero: false }, views)
  })

  it('shows the chat view of the Session', () => {
    const renderSlot = vi.fn(() => null)
    const views: Partial<ConversationViewsProps> = { renderSlot }
    render(<RunChatView {...(views as ConversationViewsProps)} />)
    expect(renderSlot).toHaveBeenCalledWith('conversation.session', { view: 'chat' })
  })
})
