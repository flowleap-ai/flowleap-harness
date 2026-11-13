import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { askInNewChat, latestWorkspace } from '../src/client/new-chat.ts'

const workspace = (workspaceId: string, createdAt: string, sessionIds: string[] = []) => ({ workspaceId, createdAt, sessionIds })

function services(items: ReturnType<typeof workspace>[], byId: Record<string, { updatedAt: number }> = {}) {
  const sent: { sessionId: string; content: unknown; mode: string }[] = []
  const opened: string[] = []
  const drafted: unknown[][] = []
  let prompt: (sessionId: string) => Promise<unknown> = () => Promise.resolve({ ok: true })
  const sessions = {
    list: createSnapshotStore({ byId }),
    binding: (sessionId: string) => sessionId === 'unbound' ? undefined : {
      session: {
        prompt: (content: unknown, mode: string) => {
          sent.push({ sessionId, content, mode })
          return prompt(sessionId)
        },
      },
    },
  }
  let newSession = 'ses-new'
  const uiWorkspace = {
    startSession: (...args: unknown[]) => { drafted.push(args) },
    openWorkspace: (workspaceId: string, beforeOpen: (sessionId: string) => void) => {
      opened.push(workspaceId)
      try {
        beforeOpen(newSession)
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)))
      }
      return Promise.resolve()
    },
  }
  const given = { uiWorkspace, sessions, workspaces: { list: createSnapshotStore({ items }) } } as never
  return {
    given, sent, opened, drafted,
    failPrompt: () => { prompt = () => Promise.reject(new Error('host gone')) },
    unbound: () => { newSession = 'unbound' },
  }
}

describe('the new chat of the agent panel', () => {
  it('picks the Workspace with the latest Session activity, else the newest Workspace', () => {
    const rows = (items: ReturnType<typeof workspace>[]) => ({ list: createSnapshotStore({ items }) }) as never
    const catalog = (byId: Record<string, { updatedAt: number }>) => ({ list: createSnapshotStore({ byId }) }) as never
    const items = [workspace('ws-old', '2026-01-01T00:00:00Z', ['s1']), workspace('ws-new', '2026-06-01T00:00:00Z')]
    expect(latestWorkspace(rows(items), catalog({ s1: { updatedAt: Date.parse('2026-11-01T00:00:00Z') } }))).toBe('ws-old')
    expect(latestWorkspace(rows(items), catalog({}))).toBe('ws-new')
    expect(latestWorkspace(rows([]), catalog({}))).toBeUndefined()
  })

  it('opens the new chat in that Workspace and sends the question in it, once', () => {
    const run = services([workspace('ws-1', '2026-01-01T00:00:00Z')])
    askInNewChat(run.given, 'About matter SF-2024-0007: Which documents?')
    expect(run.opened).toEqual(['ws-1'])
    expect(run.sent).toEqual([{ sessionId: 'ses-new', content: [{ type: 'text', text: 'About matter SF-2024-0007: Which documents?' }], mode: 'queue' }])
    expect(run.drafted).toEqual([])
  })

  it('drafts the question through New Session when there is no Workspace, so its notice asks for one', () => {
    const run = services([])
    askInNewChat(run.given, 'Which documents?')
    expect(run.drafted).toEqual([[undefined, { prompt: 'Which documents?', whenDraftExists: 'append' }]])
    expect(run.sent).toEqual([])
  })

  it('reports a chat that did not open and a question that was not sent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unbound = services([workspace('ws-1', '2026-01-01T00:00:00Z')])
    unbound.unbound()
    askInNewChat(unbound.given, 'Which documents?')
    const failing = services([workspace('ws-1', '2026-01-01T00:00:00Z')])
    failing.failPrompt()
    askInNewChat(failing.given, 'Which documents?')
    await vi.waitFor(() => { expect(warn).toHaveBeenCalledTimes(2) })
    expect(warn.mock.calls.map(call => String(call[0]))).toEqual(['ui-flowleap-records: the new chat did not open:', 'ui-flowleap-records: the question was not sent:'])
    expect(unbound.sent).toEqual([])
    warn.mockRestore()
  })
})
