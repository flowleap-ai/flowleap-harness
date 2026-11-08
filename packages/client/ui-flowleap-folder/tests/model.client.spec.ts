import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { baseName, childPath, FolderModel, keepBothName, namesIn, parentOf, type FolderModelDeps } from '../src/client/model.ts'
import { dir, file, memoryFolder, MODIFIED } from './memory-folder.client.ts'

const SYNTEGON = 'ws-syntegon' as WorkspaceId
const BOSCH = 'ws-bosch' as WorkspaceId
const SESSION = 'session-syntegon' as SessionId
const NOW = new Date('2026-11-08T10:00:00.000Z')

/** The Syntegon folder: one family folder with an Office folder and a Search folder. */
function syntegon() {
  return memoryFolder({
    '': [dir('EP 23 171 862'), file('Mandate.pdf')],
    'EP 23 171 862': [dir('Office'), dir('Search')],
    'EP 23 171 862/Office': [file('EP-Register.md', 11)],
    'EP 23 171 862/Search': [],
  })
}

/**
 * A model over a fixture folder, with a watch that records the folder it follows and a fixed clock.
 * @param folder - the fixture folder.
 * @param deps - deps that replace the defaults.
 * @param without - the optional deps to leave out.
 */
function modelOf(folder = syntegon(), deps: Partial<FolderModelDeps> = {}, without: readonly ('watch' | 'now')[] = []) {
  const watched: string[] = []
  const stopped: string[] = []
  const changes = new Map<string, () => void>()
  const watch: FolderModelDeps['watch'] = (_session, path, changed) => {
    watched.push(path)
    changes.set(path, changed)
    return () => { stopped.push(path) }
  }
  const model = new FolderModel({
    connect: async () => SESSION,
    apiFor: () => folder.api,
    ...(without.includes('watch') ? {} : { watch }),
    ...(without.includes('now') ? {} : { now: () => NOW }),
    ...deps,
  })
  return { model, folder, watched, stopped, changes }
}

const names = (model: FolderModel, path: string) => model.state.listings[path]?.entries.map(entry => entry.name)

describe('paths', () => {
  it('joins, splits and names entry paths relative to the client folder', () => {
    expect(childPath('', 'Office')).toBe('Office')
    expect(childPath('EP 23 171 862', 'Office')).toBe('EP 23 171 862/Office')
    expect(parentOf('Office')).toBe('')
    expect(parentOf('EP 23 171 862/Office')).toBe('EP 23 171 862')
    expect(baseName('EP 23 171 862/Office')).toBe('Office')
    expect(baseName('Office')).toBe('Office')
  })
})

describe('keepBothName', () => {
  it('numbers a copy before its extension as the macOS file manager does, from 2 to the first free number', () => {
    expect(keepBothName('D1.pdf', new Set(['D1.pdf']))).toBe('D1 2.pdf')
    expect(keepBothName('D1.pdf', new Set(['D1.pdf', 'D1 2.pdf', 'D1 3.pdf']))).toBe('D1 4.pdf')
    expect(keepBothName('Notes', new Set(['Notes']))).toBe('Notes 2')
    expect(keepBothName('.env', new Set(['.env']))).toBe('.env 2')
    expect(keepBothName('EP 4.292.805.pdf', new Set())).toBe('EP 4.292.805 2.pdf')
  })
})

describe('FolderModel', () => {
  it('starts on the Clients list and lists nothing before a client folder opens', async () => {
    const { model, folder } = modelOf()
    expect(model.state).toMatchObject({ workspaceId: null, connect: 'idle', folder: '', open: null, listings: {} })
    await model.refresh('')
    await model.commitEdit('x')
    expect(folder.calls).toEqual([])
  })

  it('opens a client folder under its Session, lists the folder and every folder above it, and follows it', async () => {
    const { model, folder, watched } = modelOf()
    const opened = model.openClient(SYNTEGON, 'EP 23 171 862/Office')
    expect(model.state).toMatchObject({ workspaceId: SYNTEGON, connect: 'connecting', session: null })
    await opened
    expect(model.state).toMatchObject({ session: SESSION, connect: 'ready', folder: 'EP 23 171 862/Office', open: null })
    expect(model.state.expanded).toEqual(['EP 23 171 862', 'EP 23 171 862/Office'])
    expect(folder.calls.sort()).toEqual(['list ', 'list EP 23 171 862', 'list EP 23 171 862/Office'])
    expect(model.state.listings['EP 23 171 862/Office']).toEqual({ status: 'loaded', entries: [file('EP-Register.md', 11)], truncated: false, asOf: NOW.toISOString() })
    expect(watched).toEqual(['EP 23 171 862/Office'])
  })

  it('says the folder cannot open when the Host refuses its Session, and opens it on Try again', async () => {
    let refuse = true
    const { model } = modelOf(syntegon(), { connect: async () => { if (refuse) throw new Error('refused'); return SESSION } })
    await model.openClient(SYNTEGON)
    expect(model.state).toMatchObject({ workspaceId: SYNTEGON, connect: 'failed', listings: {} })
    refuse = false
    await model.openClient(SYNTEGON)
    expect(model.state.connect).toBe('ready')
    expect(names(model, '')).toEqual(['EP 23 171 862', 'Mandate.pdf'])
  })

  it('shows only the last client folder a person opened when an earlier one answers late', async () => {
    const answers: { resolve: (session: SessionId) => void; reject: (error: Error) => void }[] = []
    const { model } = modelOf(syntegon(), {
      connect: () => new Promise<SessionId>((resolve, reject) => { answers.push({ resolve, reject }) }),
    })
    const first = model.openClient(SYNTEGON)
    const second = model.openClient(BOSCH)
    answers[0]!.resolve(SESSION)
    await first
    expect(model.state).toMatchObject({ workspaceId: BOSCH, connect: 'connecting', session: null })
    const third = model.openClient(SYNTEGON)
    answers[1]!.reject(new Error('refused'))
    await second
    expect(model.state).toMatchObject({ workspaceId: SYNTEGON, connect: 'connecting' })
    answers[2]!.resolve(SESSION)
    await third
    expect(model.state.connect).toBe('ready')
  })

  it('drops a listing that answers after the person left the client folder', async () => {
    const { model, folder } = modelOf()
    await model.openClient(SYNTEGON)
    const open = folder.hold('list')
    const pending = model.refresh('EP 23 171 862')
    await model.openClient(null)
    open()
    await pending
    expect(model.state).toMatchObject({ workspaceId: null, connect: 'idle', listings: {} })
  })

  it('stops following the old folder when the person goes to another one or closes the client folder', async () => {
    const { model, watched, stopped } = modelOf()
    await model.openClient(SYNTEGON)
    await model.go('EP 23 171 862/Search')
    expect(watched).toEqual(['', 'EP 23 171 862/Search'])
    expect(stopped).toEqual([''])
    await model.openClient(null)
    expect(stopped).toEqual(['', 'EP 23 171 862/Search'])
  })

  it('lists the followed folder again when it changes on disk', async () => {
    const { model, folder, changes } = modelOf()
    await model.openClient(SYNTEGON, 'EP 23 171 862/Search')
    folder.tree.set('EP 23 171 862/Search', [file('D1.pdf')])
    changes.get('EP 23 171 862/Search')!()
    await vi.waitFor(() => { expect(names(model, 'EP 23 171 862/Search')).toEqual(['D1.pdf']) })
  })

  it('follows nothing without a watch', async () => {
    const { model } = modelOf(syntegon(), {}, ['watch'])
    await model.openClient(SYNTEGON)
    model.dispose()
    expect(model.state.connect).toBe('ready')
  })

  it('stamps a listing with the current time when the app gives no clock', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    try {
      const { model } = modelOf(syntegon(), {}, ['now'])
      await model.openClient(SYNTEGON)
      expect(model.state.listings['']?.asOf).toBe(NOW.toISOString())
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops following the folder once the page is gone, and ignores answers that come after', async () => {
    const { model, folder, stopped } = modelOf()
    await model.openClient(SYNTEGON)
    const open = folder.hold('list')
    const pending = model.refresh('')
    model.dispose()
    expect(stopped).toEqual([''])
    folder.tree.set('', [])
    open()
    await pending
    expect(names(model, '')).toEqual(['EP 23 171 862', 'Mandate.pdf'])
  })

  it('opens a file in the middle area, shows its folder open in the tree, and goes back to the list', async () => {
    const { model, watched } = modelOf()
    await model.openClient(SYNTEGON)
    model.check('Mandate.pdf', true)
    model.openFile('EP 23 171 862/Office/EP-Register.md')
    expect(model.state).toMatchObject({ folder: 'EP 23 171 862/Office', open: 'EP 23 171 862/Office/EP-Register.md', checked: [] })
    expect(model.state.expanded).toEqual(['EP 23 171 862', 'EP 23 171 862/Office'])
    expect(watched.at(-1)).toBe('EP 23 171 862/Office')
    model.closeFile()
    expect(model.state).toMatchObject({ folder: 'EP 23 171 862/Office', open: null })
  })

  it('opens and closes a folder in the tree, and lists it only when it has no listing yet', async () => {
    const { model, folder } = modelOf()
    await model.openClient(SYNTEGON)
    await model.toggle('EP 23 171 862', true)
    expect(model.state.expanded).toEqual(['EP 23 171 862'])
    expect(names(model, 'EP 23 171 862')).toEqual(['Office', 'Search'])
    const lists = folder.calls.length
    await model.toggle('EP 23 171 862', false)
    expect(model.state.expanded).toEqual([])
    await model.toggle('EP 23 171 862', true)
    expect(folder.calls).toHaveLength(lists)
  })

  it('keeps the last entries and their time when a listing fails again, and starts empty when the first one fails', async () => {
    const { model, folder } = modelOf()
    folder.failNext('list', 'network')
    await model.openClient(SYNTEGON)
    expect(model.state.listings['']).toEqual({ status: 'failed', entries: [], truncated: false })
    await model.refresh('')
    expect(model.state.listings['']?.status).toBe('loaded')
    folder.failNext('list', 'internal')
    await model.refresh('')
    expect(model.state.listings['']).toEqual({ status: 'failed', entries: [dir('EP 23 171 862'), file('Mandate.pdf')], truncated: false, asOf: NOW.toISOString() })
  })

  it('checks and unchecks rows, once each', async () => {
    const { model } = modelOf()
    await model.openClient(SYNTEGON)
    model.check('Mandate.pdf', true)
    model.check('Mandate.pdf', true)
    model.check('EP 23 171 862', true)
    expect(model.state.checked).toEqual(['Mandate.pdf', 'EP 23 171 862'])
    model.check('Mandate.pdf', false)
    expect(model.state.checked).toEqual(['EP 23 171 862'])
    model.clearChecks()
    expect(model.state.checked).toEqual([])
  })

  it('makes a new folder in the listed folder and lists it there', async () => {
    const { model } = modelOf()
    await model.openClient(SYNTEGON, 'EP 23 171 862')
    model.openFile('EP 23 171 862/Office/EP-Register.md')
    await model.go('EP 23 171 862')
    model.startNewFolder()
    expect(model.state.edit).toEqual({ kind: 'new-folder', parent: 'EP 23 171 862' })
    await model.commitEdit('Examination')
    expect(model.state.edit).toBeNull()
    expect(names(model, 'EP 23 171 862')).toEqual(['Office', 'Search', 'Examination'])
  })

  it('keeps the name field open with the reason when the Host refuses the name', async () => {
    const { model } = modelOf()
    await model.openClient(SYNTEGON)
    model.startNewFolder()
    await model.commitEdit('EP 23 171 862')
    expect(model.state.edit).toEqual({ kind: 'new-folder', parent: '', error: 'exists' })
    model.cancelEdit()
    expect(model.state.edit).toBeNull()
  })

  it('shows no reason when the person closed the name field before the refusal came', async () => {
    const { model, folder } = modelOf()
    await model.openClient(SYNTEGON)
    model.startRename('Mandate.pdf')
    const open = folder.hold('rename')
    const pending = model.commitEdit('EP 23 171 862')
    model.cancelEdit()
    open()
    await pending
    expect(model.state.edit).toBeNull()
  })

  it('renames an entry, and the open file follows its new name', async () => {
    const { model } = modelOf()
    await model.openClient(SYNTEGON)
    model.openFile('EP 23 171 862/Office/EP-Register.md')
    model.startRename('EP 23 171 862/Office/EP-Register.md')
    await model.commitEdit('Register.md')
    expect(model.state.open).toBe('EP 23 171 862/Office/Register.md')
    expect(names(model, 'EP 23 171 862/Office')).toEqual(['Register.md'])
    model.closeFile()
    model.startRename('Mandate.pdf')
    await model.commitEdit('Mandate 2026.pdf')
    expect(model.state.open).toBeNull()
    expect(names(model, '')).toEqual(['EP 23 171 862', 'Mandate 2026.pdf'])
  })

  it('opens no Move to dialog for no entry, and closes it with no change', async () => {
    const { model, folder } = modelOf()
    await model.openClient(SYNTEGON)
    model.startMove([])
    expect(model.state.moving).toBeNull()
    model.startMove(['Mandate.pdf'])
    expect(model.state).toMatchObject({ moving: ['Mandate.pdf'], moveError: null })
    model.cancelMove()
    expect(model.state.moving).toBeNull()
    await model.commitMove('EP 23 171 862')
    expect(folder.calls.some(call => call.startsWith('move'))).toBe(false)
  })

  it('moves the checked entries into a folder, lists both folders again, and the open file follows', async () => {
    const { model } = modelOf()
    await model.openClient(SYNTEGON)
    model.openFile('Mandate.pdf')
    model.check('Mandate.pdf', true)
    model.startMove(['Mandate.pdf'])
    await model.commitMove('EP 23 171 862/Office')
    expect(model.state).toMatchObject({ moving: null, checked: [], open: 'EP 23 171 862/Office/Mandate.pdf' })
    expect(names(model, '')).toEqual(['EP 23 171 862'])
    expect(names(model, 'EP 23 171 862/Office')).toEqual(['EP-Register.md', 'Mandate.pdf'])
  })

  it('keeps the dialog open with the reason when one move fails, and the entries before it stay moved', async () => {
    const { model, folder } = modelOf()
    folder.tree.set('', [...folder.tree.get('')!, file('Letter.pdf')])
    folder.tree.set('EP 23 171 862/Search', [file('Letter.pdf')])
    await model.openClient(SYNTEGON)
    model.startMove(['Mandate.pdf', 'Letter.pdf'])
    await model.commitMove('EP 23 171 862/Search')
    expect(model.state).toMatchObject({ moving: ['Mandate.pdf', 'Letter.pdf'], moveError: 'exists' })
    expect(names(model, 'EP 23 171 862/Search')).toEqual(['Letter.pdf', 'Mandate.pdf'])
    expect(names(model, '')).toEqual(['EP 23 171 862', 'Letter.pdf'])
    model.cancelMove()
    expect(model.state.moveError).toBeNull()
  })

  it('does nothing on Move here or a name before a client folder is open', async () => {
    const { model, folder } = modelOf()
    model.startMove(['Mandate.pdf'])
    await model.commitMove('')
    model.startRename('Mandate.pdf')
    await model.commitEdit('x')
    expect(folder.calls).toEqual([])
    expect(model.state.moving).toEqual(['Mandate.pdf'])
  })

  it('uploads dropped files one after another with their progress, then says how many were added where', async () => {
    const { model, folder } = modelOf()
    await model.openClient(SYNTEGON, 'EP 23 171 862/Search')
    const open = folder.hold('upload')
    const pending = model.upload([new File(['%PDF-1.7'], 'D1.pdf'), new File(['%PDF-1.7'], 'D2.pdf')], 'EP 23 171 862/Search')
    expect(model.state.uploads.map(upload => [upload.name, upload.progress])).toEqual([['D1.pdf', 0], ['D2.pdf', 0]])
    open()
    await pending
    expect(model.state.uploads).toEqual([])
    expect(model.state.notice).toEqual({ kind: 'added', count: 2, folder: 'EP 23 171 862/Search' })
    expect(names(model, 'EP 23 171 862/Search')).toEqual(['D1.pdf', 'D2.pdf'])
    model.dismissNotice()
    expect(model.state.notice).toBeNull()
  })

  it('shows the progress the Host reports while a file goes up', async () => {
    const { model } = modelOf(syntegon(), {
      apiFor: () => ({
        ...syntegon().api,
        upload: async (_dir, _name, _file, progress) => {
          progress(0.25)
          expect(model.state.uploads[0]?.progress).toBe(0.25)
          return { ok: true, value: { path: 'D1.pdf' } }
        },
      }),
    })
    await model.openClient(SYNTEGON)
    await model.upload([new File(['x'], 'D1.pdf')], '')
    expect(model.state.notice).toEqual({ kind: 'added', count: 1, folder: '' })
  })

  it('stops at a name conflict, holds the files after it, and Keep both gives the file the next free name', async () => {
    const { model, folder } = modelOf()
    await model.openClient(SYNTEGON)
    folder.tree.set('', [...folder.tree.get('')!, file('Mandate 2.pdf')])
    await model.upload([new File(['x'], 'Mandate.pdf'), new File(['y'], 'Power of attorney.pdf')], '')
    expect(model.state.conflict).toMatchObject({ dir: '', name: 'Mandate.pdf' })
    expect(model.state.uploads.map(upload => upload.name)).toEqual(['Mandate.pdf', 'Power of attorney.pdf'])
    await model.upload([new File(['z'], 'Fee.pdf')], '')
    expect(model.state.uploads).toHaveLength(3)
    await model.resolveConflict(true)
    expect(model.state.conflict).toBeNull()
    expect(model.state.uploads).toEqual([])
    expect(names(model, '')).toEqual(['EP 23 171 862', 'Mandate.pdf', 'Mandate 2.pdf', 'Mandate 3.pdf', 'Power of attorney.pdf', 'Fee.pdf'])
    expect(model.state.notice).toEqual({ kind: 'added', count: 3, folder: '' })
  })

  it('drops a conflicting file on Skip and uploads the rest', async () => {
    const { model } = modelOf()
    await model.openClient(SYNTEGON)
    await model.upload([new File(['x'], 'Mandate.pdf'), new File(['y'], 'Fee.pdf')], '')
    await model.resolveConflict(false)
    expect(model.state.conflict).toBeNull()
    expect(names(model, '')).toEqual(['EP 23 171 862', 'Mandate.pdf', 'Fee.pdf'])
    expect(model.state.notice).toEqual({ kind: 'added', count: 1, folder: '' })
    await model.resolveConflict(true)
    expect(model.state.notice).toEqual({ kind: 'added', count: 1, folder: '' })
  })

  it('says no file was added when every conflicting file is skipped', async () => {
    const { model } = modelOf()
    await model.openClient(SYNTEGON)
    await model.upload([new File(['x'], 'Mandate.pdf')], '')
    await model.resolveConflict(false)
    expect(model.state.notice).toBeNull()
    expect(model.state.uploads).toEqual([])
  })

  it('gives Keep both a name from the files it knows when the folder has no listing', async () => {
    const { model, folder } = modelOf()
    await model.openClient(SYNTEGON)
    folder.failNext('upload', 'exists')
    folder.failNext('list', 'network')
    folder.tree.delete('Inbox')
    await model.upload([new File(['x'], 'Note.md')], 'Inbox')
    expect(model.state.conflict).toMatchObject({ dir: 'Inbox', name: 'Note.md' })
    folder.tree.set('Inbox', [])
    await model.resolveConflict(true)
    expect(names(model, 'Inbox')).toEqual(['Note 2.md'])
  })

  it('reports a failed upload and does not report the files added after it', async () => {
    const { model, folder } = modelOf()
    await model.openClient(SYNTEGON)
    folder.failNext('upload', 'too-large')
    await model.upload([new File(['x'], 'Big.pdf'), new File(['y'], 'Small.pdf')], '')
    expect(model.state.notice).toEqual({ kind: 'failed', error: 'too-large' })
    expect(model.state.uploads).toEqual([])
    expect(names(model, '')).toEqual(['EP 23 171 862', 'Mandate.pdf', 'Small.pdf'])
  })

  it('holds dropped files while no client folder is open', async () => {
    const { model, folder } = modelOf()
    await model.upload([new File(['x'], 'D1.pdf')], '')
    expect(model.state.uploads.map(upload => upload.name)).toEqual(['D1.pdf'])
    expect(folder.calls).toEqual([])
    await model.openClient(SYNTEGON)
    expect(model.state.uploads).toEqual([])
    expect(model.state.listings['']?.entries.some(entry => entry.modifiedAt === MODIFIED)).toBe(true)
  })

  it('keeps an upload of the client folder the person left out of the next client folder', async () => {
    const bosch = memoryFolder({ '': [] })
    const syntegonFolder = syntegon()
    const { model } = modelOf(syntegonFolder, { apiFor: workspaceId => workspaceId === SYNTEGON ? syntegonFolder.api : bosch.api })
    await model.openClient(SYNTEGON)
    const open = syntegonFolder.hold('upload')
    const pending = model.upload([new File(['x'], 'D1.pdf')], '')
    await model.openClient(BOSCH)
    open()
    await pending
    expect(model.state).toMatchObject({ workspaceId: BOSCH, uploads: [], notice: null })
  })

  it('uploads into a second client folder while an upload of the first one still waits', async () => {
    const bosch = memoryFolder({ '': [] })
    const syntegonFolder = syntegon()
    const { model } = modelOf(syntegonFolder, { apiFor: workspaceId => workspaceId === SYNTEGON ? syntegonFolder.api : bosch.api })
    await model.openClient(SYNTEGON)
    const open = syntegonFolder.hold('upload')
    const pending = model.upload([new File(['x'], 'D1.pdf')], '')
    await model.openClient(BOSCH)
    await model.upload([new File(['y'], 'Brief.pdf')], '')
    open()
    await pending
    expect(model.state).toMatchObject({ workspaceId: BOSCH, uploads: [], notice: { kind: 'added', count: 1, folder: '' } })
    expect(bosch.calls.filter(call => call.startsWith('upload'))).toEqual(['upload Brief.pdf'])
  })

  it('knows no names in a folder that is not listed', async () => {
    const { model } = modelOf()
    await model.openClient(SYNTEGON)
    expect(namesIn(model.state, 'Not listed')).toEqual(new Set())
  })

  it('uploads each dropped file once when a second drop comes while the first file goes up', async () => {
    const { model, folder } = modelOf()
    await model.openClient(SYNTEGON)
    const open = folder.hold('upload')
    const first = model.upload([new File(['x'], 'D1.pdf')], '')
    const second = model.upload([new File(['y'], 'D2.pdf')], '')
    open()
    await Promise.all([first, second])
    await model.resolveConflict(true)
    expect(folder.calls.filter(call => call.startsWith('upload'))).toEqual(['upload D1.pdf', 'upload D2.pdf'])
  })
})
