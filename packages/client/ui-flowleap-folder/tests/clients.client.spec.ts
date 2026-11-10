import { describe, expect, it } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { FolderResult } from '../src/client/api.ts'
import { followClientFolders } from '../src/client/clients.ts'
import type { ClientFoldersAnswer } from '../src/route.ts'

const workspace = (id: string, title: string, path: string): WorkspaceView => ({
  workspaceId: id as WorkspaceId, title, path, sessionIds: [], createdAt: '', updatedAt: '',
})

const DEFAULT = workspace('default-workspace', 'Default workspace', '/home/firm/.dsh/workspace')
const SYNTEGON = workspace('ws-syntegon', 'Syntegon', '/home/firm/.dsh/clients/Syntegon')
const SCHUBERT = workspace('ws-schubert', 'Gerhard Schubert', '/home/firm/.dsh/clients/Gerhard Schubert')

/** The Host's answers, one for each question, released by the test. */
function host() {
  const questions: ((result: FolderResult<ClientFoldersAnswer>) => void)[] = []
  const read = () => new Promise<FolderResult<ClientFoldersAnswer>>((resolve) => { questions.push(resolve) })
  const names = (...ids: string[]): FolderResult<ClientFoldersAnswer> => ({ ok: true, value: { workspaces: ids as WorkspaceId[] } })
  return { questions, read, names }
}

const settle = async () => { for (let i = 0; i < 3; i++) await Promise.resolve() }

function follow(items: readonly WorkspaceView[]) {
  const workspaces = createSnapshotStore<{ readonly items: readonly WorkspaceView[] }>({ items }, { flush: 'sync' })
  const clients = createSnapshotStore<readonly WorkspaceView[]>([], { flush: 'sync' })
  const answers = host()
  const stop = followClientFolders(workspaces, answers.read, clients)
  const titles = () => clients.getSnapshot().map(item => item.title)
  return { workspaces, clients, stop, titles, ...answers }
}

describe('followClientFolders', () => {
  it('shows only the workspaces that the Host names as client folders, so the default workspace stays out', async () => {
    const s = follow([DEFAULT, SYNTEGON])
    expect(s.titles()).toEqual([])
    s.questions[0]!(s.names('ws-syntegon'))
    await settle()
    expect(s.titles()).toEqual(['Syntegon'])
  })

  it('asks again when the set of workspaces changes, and not when only a workspace changes', async () => {
    const s = follow([DEFAULT, SYNTEGON])
    s.questions[0]!(s.names('ws-syntegon'))
    await settle()
    s.workspaces.set({ items: [DEFAULT, { ...SYNTEGON, title: 'Syntegon GmbH' }] })
    expect([s.questions.length, s.titles()]).toEqual([1, ['Syntegon GmbH']])
    s.workspaces.set({ items: [DEFAULT, SYNTEGON, SCHUBERT] })
    expect([s.questions.length, s.titles()]).toEqual([2, ['Syntegon']])
    s.questions[1]!(s.names('ws-syntegon', 'ws-schubert'))
    await settle()
    expect(s.titles()).toEqual(['Syntegon', 'Gerhard Schubert'])
    s.workspaces.set({ items: [SCHUBERT] })
    expect(s.titles()).toEqual(['Gerhard Schubert'])
  })

  it('applies only the answer of the last question', async () => {
    const s = follow([DEFAULT, SYNTEGON])
    s.workspaces.set({ items: [DEFAULT, SYNTEGON, SCHUBERT] })
    s.questions[1]!(s.names('ws-syntegon', 'ws-schubert'))
    await settle()
    s.questions[0]!(s.names('ws-syntegon'))
    await settle()
    expect(s.titles()).toEqual(['Syntegon', 'Gerhard Schubert'])
  })

  it('keeps the client folders known before when a question fails, and asks again at the next change', async () => {
    const s = follow([DEFAULT, SYNTEGON])
    s.questions[0]!(s.names('ws-syntegon'))
    await settle()
    s.workspaces.set({ items: [DEFAULT, SYNTEGON, SCHUBERT] })
    s.questions[1]!({ ok: false, error: 'network' })
    await settle()
    expect(s.titles()).toEqual(['Syntegon'])
    s.workspaces.set({ items: [DEFAULT, SYNTEGON, { ...SCHUBERT, title: 'Schubert' }] })
    expect(s.questions.length).toBe(3)
  })

  it('changes nothing after it stops', async () => {
    const s = follow([DEFAULT, SYNTEGON])
    s.stop()
    s.questions[0]!(s.names('ws-syntegon'))
    await settle()
    s.workspaces.set({ items: [DEFAULT, SYNTEGON, SCHUBERT] })
    expect([s.titles(), s.questions.length]).toEqual([[], 1])
  })
})
