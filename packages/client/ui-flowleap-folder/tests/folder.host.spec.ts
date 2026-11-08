import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmod, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { checkName, ClientFolder, FolderError, freeName, partsOf, UPLOAD_PREFIX } from '../src/folder.ts'
import type { FolderEntry } from '../src/route.ts'

let base: string
let root: string
let outside: string

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'flowleap-folder-'))
  root = path.join(base, 'Syntegon')
  outside = path.join(base, 'Other client')
  await mkdir(path.join(root, 'EP 23 171 862', 'Office'), { recursive: true })
  await mkdir(path.join(root, 'EP 23 171 862', 'Search'), { recursive: true })
  await mkdir(outside)
  await writeFile(path.join(root, 'EP 23 171 862', 'Office', 'EP-Register.md'), '# Register\n')
  await writeFile(path.join(outside, 'secret.md'), 'secret\n')
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

/** The code of a refused act. */
async function refusal(act: Promise<unknown>): Promise<string> {
  try {
    await act
  } catch (error: unknown) {
    if (error instanceof FolderError) return error.code
    throw error
  }
  throw new Error('the act was not refused')
}

async function* chunks(...parts: string[]): AsyncIterable<Uint8Array> {
  for (const part of parts) yield new TextEncoder().encode(part)
}

describe('checkName', () => {
  it('accepts the names that a person gives files and folders', () => {
    for (const name of ['Office', 'EP 4 292 805 A1.pdf', 'Prüfung', '2026-11-06 SAMPLE client mail.eml', '.hidden', 'a'.repeat(255)]) {
      expect(checkName(name)).toBe(name)
    }
  })

  it('refuses a name that leaves its folder, hides a part, or that a file system refuses', () => {
    for (const name of ['', '.', '..', 'a/b', 'a\\b', ' Office', 'Office ', 'a\0b', 'a'.repeat(256), 'ä'.repeat(128), 'CON', 'con.txt', 'LPT1', 'com9.pdf']) {
      expect(() => checkName(name), JSON.stringify(name)).toThrow(FolderError)
    }
  })
})

describe('partsOf', () => {
  it('splits a plain relative path and refuses any other path', () => {
    expect(partsOf('')).toEqual([])
    expect(partsOf('EP 23 171 862/Office')).toEqual(['EP 23 171 862', 'Office'])
    for (const relative of ['/etc', 'a/../b', '..', 'a//b', 'a/', 'a\\b', './a', 'a\0']) {
      expect(() => partsOf(relative), relative).toThrow(FolderError)
    }
  })
})

describe('ClientFolder', () => {
  it('lists a folder with each entry kind, size and modified time, and leaves out hidden entries and links', async () => {
    await writeFile(path.join(root, '.DS_Store'), 'x')
    await writeFile(path.join(root, `${UPLOAD_PREFIX}partial`), 'x')
    await symlink(outside, path.join(root, 'link to other client'))
    const folder = await ClientFolder.at(root)
    const listing = await folder.list('', 100, new Map([['EP 23 171 862', { kind: 'folder', at: '2026-11-08T10:00:00.000Z' }]]))
    expect(listing.path).toBe('')
    expect(listing.truncated).toBe(false)
    const timed = (entries: readonly FolderEntry[]) =>
      entries.map(({ modifiedAt, ...rest }) => ({ ...rest, dated: !Number.isNaN(Date.parse(modifiedAt)) }))
    expect(timed(listing.entries)).toEqual([
      { name: 'EP 23 171 862', kind: 'directory', dated: true, source: { kind: 'folder', at: '2026-11-08T10:00:00.000Z' } },
    ])
    const office = await folder.list('EP 23 171 862/Office', 100, new Map())
    expect(timed(office.entries)).toEqual([{ name: 'EP-Register.md', kind: 'file', size: 11, dated: true }])
  })

  it('cuts a listing at the entry cap and says so', async () => {
    const folder = await ClientFolder.at(root)
    const listing = await folder.list('EP 23 171 862', 1, new Map())
    expect(listing.entries).toHaveLength(1)
    expect(listing.truncated).toBe(true)
  })

  it('refuses a folder that a link leads out of the client folder, and a path that does not exist', async () => {
    await symlink(outside, path.join(root, 'link to other client'))
    const folder = await ClientFolder.at(root)
    expect(await refusal(folder.list('link to other client', 100, new Map()))).toBe('outside')
    expect(await refusal(folder.list('../Other client', 100, new Map()))).toBe('outside')
    expect(await refusal(folder.list('Missing', 100, new Map()))).toBe('not-found')
    expect(await refusal(folder.list('EP 23 171 862/Office/EP-Register.md', 100, new Map()))).toBe('not-directory')
    expect(await refusal(ClientFolder.at(path.join(base, 'gone')))).toBe('not-found')
  })

  it('makes a folder and refuses a name that is taken or invalid', async () => {
    const folder = await ClientFolder.at(root)
    expect(await folder.mkdir('EP 23 171 862', 'Examination')).toBe('EP 23 171 862/Examination')
    expect(await readdir(path.join(root, 'EP 23 171 862'))).toContain('Examination')
    expect(await refusal(folder.mkdir('EP 23 171 862', 'Office'))).toBe('exists')
    expect(await refusal(folder.mkdir('EP 23 171 862', '../Other'))).toBe('invalid-name')
    expect(await refusal(folder.mkdir('link', 'x'))).toBe('not-found')
  })

  it('renames an entry, allows a change of case, and never replaces another entry', async () => {
    const folder = await ClientFolder.at(root)
    const office = path.join(root, 'EP 23 171 862', 'Office')
    await writeFile(path.join(office, 'A1 claims.md'), 'claims\n')
    expect(await folder.rename('EP 23 171 862/Office/A1 claims.md', 'Claims as published.md')).toBe('EP 23 171 862/Office/Claims as published.md')
    expect(await folder.rename('EP 23 171 862/Office/Claims as published.md', 'claims as published.md')).toBe('EP 23 171 862/Office/claims as published.md')
    expect(await refusal(folder.rename('EP 23 171 862/Office/claims as published.md', 'EP-Register.md'))).toBe('exists')
    expect(await readFile(path.join(office, 'EP-Register.md'), 'utf8')).toBe('# Register\n')
    expect(await refusal(folder.rename('', 'Renamed'))).toBe('bad-request')
    expect(await refusal(folder.rename('EP 23 171 862/Missing.md', 'x.md'))).toBe('not-found')
  })

  it('refuses to rename or move a link', async () => {
    await symlink(path.join(outside, 'secret.md'), path.join(root, 'secret link.md'))
    const folder = await ClientFolder.at(root)
    expect(await refusal(folder.rename('secret link.md', 'x.md'))).toBe('outside')
    expect(await refusal(folder.move('secret link.md', 'EP 23 171 862'))).toBe('outside')
  })

  it('moves an entry into another folder of the client folder, keeping its name', async () => {
    const folder = await ClientFolder.at(root)
    expect(await folder.move('EP 23 171 862/Office/EP-Register.md', 'EP 23 171 862/Search')).toBe('EP 23 171 862/Search/EP-Register.md')
    expect(await readdir(path.join(root, 'EP 23 171 862', 'Search'))).toEqual(['EP-Register.md'])
    expect(await folder.move('EP 23 171 862/Search/EP-Register.md', 'EP 23 171 862/Search')).toBe('EP 23 171 862/Search/EP-Register.md')
  })

  it('refuses a move into the folder itself, onto a taken name, or out of the client folder', async () => {
    await symlink(outside, path.join(root, 'link to other client'))
    await writeFile(path.join(root, 'EP 23 171 862', 'Search', 'EP-Register.md'), 'other\n')
    const folder = await ClientFolder.at(root)
    expect(await refusal(folder.move('EP 23 171 862', 'EP 23 171 862/Office'))).toBe('into-itself')
    expect(await refusal(folder.move('EP 23 171 862', 'EP 23 171 862'))).toBe('into-itself')
    expect(await refusal(folder.move('EP 23 171 862/Office/EP-Register.md', 'EP 23 171 862/Search'))).toBe('exists')
    expect(await readFile(path.join(root, 'EP 23 171 862', 'Search', 'EP-Register.md'), 'utf8')).toBe('other\n')
    expect(await refusal(folder.move('EP 23 171 862/Office/EP-Register.md', 'link to other client'))).toBe('outside')
    expect(await readdir(outside)).toEqual(['secret.md'])
  })

  it('writes an upload under its name and leaves no hidden file', async () => {
    const folder = await ClientFolder.at(root)
    expect(await folder.upload('EP 23 171 862/Search', 'D1.pdf', chunks('%PDF-', '1.7'), { maxBytes: 100 })).toBe('EP 23 171 862/Search/D1.pdf')
    expect(await readFile(path.join(root, 'EP 23 171 862', 'Search', 'D1.pdf'), 'utf8')).toBe('%PDF-1.7')
    expect(await readdir(path.join(root, 'EP 23 171 862', 'Search'))).toEqual(['D1.pdf'])
  })

  it('never replaces a file with an upload, and keeps the existing bytes', async () => {
    const folder = await ClientFolder.at(root)
    expect(await refusal(folder.upload('EP 23 171 862/Office', 'EP-Register.md', chunks('new'), { maxBytes: 100 }))).toBe('exists')
    expect(await readFile(path.join(root, 'EP 23 171 862', 'Office', 'EP-Register.md'), 'utf8')).toBe('# Register\n')
    expect(await readdir(path.join(root, 'EP 23 171 862', 'Office'))).toEqual(['EP-Register.md'])
  })

  it('refuses an upload above the byte cap and leaves no file', async () => {
    const folder = await ClientFolder.at(root)
    expect(await refusal(folder.upload('EP 23 171 862/Search', 'big.pdf', chunks('12345', '6'), { maxBytes: 5 }))).toBe('too-large')
    expect(await folder.upload('EP 23 171 862/Search', 'exact.pdf', chunks('12345'), { maxBytes: 5 })).toBe('EP 23 171 862/Search/exact.pdf')
    expect(await readdir(path.join(root, 'EP 23 171 862', 'Search'))).toEqual(['exact.pdf'])
  })

  it('refuses an upload with an invalid name or into a folder outside the client folder', async () => {
    await symlink(outside, path.join(root, 'link to other client'))
    const folder = await ClientFolder.at(root)
    expect(await refusal(folder.upload('', '../x.pdf', chunks('x'), { maxBytes: 5 }))).toBe('invalid-name')
    expect(await refusal(folder.upload('link to other client', 'x.pdf', chunks('x'), { maxBytes: 5 }))).toBe('outside')
    expect(await readdir(outside)).toEqual(['secret.md'])
  })

  it('keeps a client folder at the file system root inside itself', async () => {
    const real = await realpath(root)
    const folder = await ClientFolder.at(path.parse(real).root)
    expect(await folder.folder(real.slice(path.parse(real).root.length).split(path.sep).join('/'))).toBe(real)
  })

  it('passes on a disk fault that is not a refusal, and leaves the existing entries as they were', async () => {
    await symlink('loop', path.join(root, 'EP 23 171 862', 'Office', 'loop'))
    const folder = await ClientFolder.at(root)
    const office = 'EP 23 171 862/Office'
    const fault = await folder.rename(`${office}/EP-Register.md`, 'loop').then(() => undefined, (error: unknown) => error)
    expect((fault as NodeJS.ErrnoException).code).toBe('ELOOP')
    expect((await readdir(path.join(root, 'EP 23 171 862', 'Office'))).sort()).toEqual(['EP-Register.md', 'loop'])
  })

  it('passes on the fault of an upload whose name the disk cannot hold, and leaves no hidden file', async () => {
    const real = await realpath(root)
    const limit = process.platform === 'darwin' ? 1024 : 4096
    const parts: string[] = []
    let length = real.length
    while (length < limit - 100) {
      const part = 'd'.repeat(Math.min(200, limit - 100 - length - 1))
      parts.push(part)
      length += part.length + 1
    }
    await mkdir(path.join(real, ...parts), { recursive: true })
    const folder = await ClientFolder.at(root)
    const name = `${'x'.repeat(200)}.pdf`
    const fault = await folder.upload(parts.join('/'), name, chunks('%PDF'), { maxBytes: 100 }).then(() => undefined, (error: unknown) => error)
    expect((fault as NodeJS.ErrnoException).code).toBe('ENAMETOOLONG')
    expect(await readdir(path.join(real, ...parts))).toEqual([])
    const made = await folder.mkdir(parts.join('/'), name).then(() => undefined, (error: unknown) => error)
    expect((made as NodeJS.ErrnoException).code).toBe('ENAMETOOLONG')
  })

  it.skipIf(process.getuid?.() === 0 || process.platform === 'win32')('leaves out an entry it cannot read the facts of', async () => {
    const locked = path.join(root, 'EP 23 171 862', 'Office')
    await chmod(locked, 0o444)
    try {
      const folder = await ClientFolder.at(root)
      expect((await folder.list('EP 23 171 862/Office', 100, new Map())).entries).toEqual([])
    } finally {
      await chmod(locked, 0o755)
    }
  })

  it('shows where each entry of Trash came from when the listing gets the Trash records', async () => {
    await mkdir(path.join(root, 'Trash'))
    await writeFile(path.join(root, 'Trash', 'D1.pdf'), '%PDF')
    await writeFile(path.join(root, 'Trash', 'Note.md'), 'x')
    const folder = await ClientFolder.at(root)
    const listing = await folder.list('Trash', 100, new Map(), new Map([['Trash/D1.pdf', { from: 'EP 23 171 862/Search/D1.pdf' }]]))
    expect(listing.entries.map(entry => [entry.name, entry.trashedFrom]).sort()).toEqual([['D1.pdf', 'EP 23 171 862/Search/D1.pdf'], ['Note.md', undefined]])
  })
})

describe('freeName', () => {
  it('gives the name itself when it is free, then "name 2.ext", "name 3.ext", … as the macOS file manager names a copy', async () => {
    const office = path.join(root, 'EP 23 171 862', 'Office')
    expect(await freeName(office, 'Letter.pdf')).toBe('Letter.pdf')
    expect(await freeName(office, 'EP-Register.md')).toBe('EP-Register 2.md')
    await writeFile(path.join(office, 'EP-Register 2.md'), 'x')
    expect(await freeName(office, 'EP-Register.md')).toBe('EP-Register 3.md')
    expect(await freeName(root, 'EP 23 171 862')).toBe('EP 23 171 862 2')
    await writeFile(path.join(root, '.env'), 'x')
    expect(await freeName(root, '.env')).toBe('.env 2')
  })

  it('passes on a disk fault that is not a free name', async () => {
    const fault = await freeName(path.join(root, 'EP 23 171 862', 'Office', 'EP-Register.md'), 'x.pdf').then(() => undefined, (error: unknown) => error)
    expect((fault as NodeJS.ErrnoException).code).toBe('ENOTDIR')
  })
})

describe('Move to Trash and Restore', () => {
  it('moves an entry into Trash, which it makes when it is missing, and keeps both on a name that Trash has', async () => {
    const folder = await ClientFolder.at(root)
    expect(await folder.trash('EP 23 171 862/Office/EP-Register.md')).toBe('Trash/EP-Register.md')
    expect(await readdir(path.join(root, 'EP 23 171 862', 'Office'))).toEqual([])
    await writeFile(path.join(root, 'EP 23 171 862', 'Office', 'EP-Register.md'), 'second\n')
    expect(await folder.trash('EP 23 171 862/Office/EP-Register.md')).toBe('Trash/EP-Register 2.md')
    expect(await folder.trash('EP 23 171 862/Search')).toBe('Trash/Search')
    expect((await readdir(path.join(root, 'Trash'))).sort()).toEqual(['EP-Register 2.md', 'EP-Register.md', 'Search'])
    expect(await readFile(path.join(root, 'Trash', 'EP-Register.md'), 'utf8')).toBe('# Register\n')
    expect(await readFile(path.join(root, 'Trash', 'EP-Register 2.md'), 'utf8')).toBe('second\n')
  })

  it('refuses to move Trash or an entry in it to Trash, and refuses the client folder, a link and a missing entry', async () => {
    await mkdir(path.join(root, 'Trash', 'Old'), { recursive: true })
    await symlink(outside, path.join(root, 'link to other client'))
    const folder = await ClientFolder.at(root)
    expect(await refusal(folder.trash('Trash'))).toBe('in-trash')
    expect(await refusal(folder.trash('Trash/Old'))).toBe('in-trash')
    expect(await refusal(folder.trash(''))).toBe('bad-request')
    expect(await refusal(folder.trash('link to other client'))).toBe('outside')
    expect(await refusal(folder.trash('Missing.pdf'))).toBe('not-found')
    expect(await readdir(outside)).toEqual(['secret.md'])
  })

  it('keeps Trash for Move to Trash: no folder, upload or plain move goes into it, and Trash keeps its name and place', async () => {
    await mkdir(path.join(root, 'Trash', 'Old'), { recursive: true })
    const folder = await ClientFolder.at(root)
    expect(await refusal(folder.mkdir('Trash', 'New'))).toBe('in-trash')
    expect(await refusal(folder.mkdir('Trash/Old', 'New'))).toBe('in-trash')
    expect(await refusal(folder.upload('Trash', 'D1.pdf', chunks('x'), { maxBytes: 10 }))).toBe('in-trash')
    expect(await refusal(folder.move('EP 23 171 862/Search', 'Trash'))).toBe('in-trash')
    expect(await refusal(folder.move('EP 23 171 862/Search', 'Trash/Old'))).toBe('in-trash')
    expect(await refusal(folder.rename('Trash', 'Bin'))).toBe('in-trash')
    expect(await refusal(folder.move('Trash', 'EP 23 171 862'))).toBe('in-trash')
    expect(await readdir(path.join(root, 'Trash'))).toEqual(['Old'])
    expect(await folder.move('Trash/Old', '')).toBe('Old')
  })

  it('moves an entry of a folder named Trash below the client folder root into the real Trash', async () => {
    await mkdir(path.join(root, 'EP 23 171 862', 'Trash'))
    await writeFile(path.join(root, 'EP 23 171 862', 'Trash', 'old.md'), 'x')
    const folder = await ClientFolder.at(root)
    expect(await folder.trash('EP 23 171 862/Trash/old.md')).toBe('Trash/old.md')
  })

  it('puts an entry of Trash back where it came from, makes the folders on the way again, and keeps both on a taken name', async () => {
    const folder = await ClientFolder.at(root)
    const trashed = await folder.trash('EP 23 171 862/Office/EP-Register.md')
    await rm(path.join(root, 'EP 23 171 862', 'Office'), { recursive: true })
    expect(await folder.restore(trashed, 'EP 23 171 862/Office/EP-Register.md')).toBe('EP 23 171 862/Office/EP-Register.md')
    expect(await readFile(path.join(root, 'EP 23 171 862', 'Office', 'EP-Register.md'), 'utf8')).toBe('# Register\n')
    const again = await folder.trash('EP 23 171 862/Office/EP-Register.md')
    await writeFile(path.join(root, 'EP 23 171 862', 'Office', 'EP-Register.md'), 'new\n')
    expect(await folder.restore(again, 'EP 23 171 862/Office/EP-Register.md')).toBe('EP 23 171 862/Office/EP-Register 2.md')
    expect(await readFile(path.join(root, 'EP 23 171 862', 'Office', 'EP-Register.md'), 'utf8')).toBe('new\n')
    expect(await readdir(path.join(root, 'Trash'))).toEqual([])
    await writeFile(path.join(root, 'Trash', 'Mandate.pdf'), 'x')
    expect(await folder.restore('Trash/Mandate.pdf', 'Mandate.pdf')).toBe('Mandate.pdf')
  })

  it('refuses to restore an entry that is not in Trash, an empty origin, and an origin outside the client folder', async () => {
    await mkdir(path.join(root, 'Trash'))
    await writeFile(path.join(root, 'Trash', 'D1.pdf'), 'x')
    const folder = await ClientFolder.at(root)
    expect(await refusal(folder.restore('EP 23 171 862/Office/EP-Register.md', 'EP-Register.md'))).toBe('bad-request')
    expect(await refusal(folder.restore('Trash', 'Trash'))).toBe('bad-request')
    expect(await refusal(folder.restore('Trash/D1.pdf', ''))).toBe('bad-request')
    expect(await refusal(folder.restore('Trash/D1.pdf', '../Other client/D1.pdf'))).toBe('outside')
    expect(await refusal(folder.restore('Trash/Missing.pdf', 'Missing.pdf'))).toBe('not-found')
    expect(await readdir(path.join(root, 'Trash'))).toEqual(['D1.pdf'])
  })

  it('refuses to restore into a link that leads out of the client folder, or below a file', async () => {
    await mkdir(path.join(root, 'Trash'))
    await writeFile(path.join(root, 'Trash', 'D1.pdf'), 'x')
    await symlink(outside, path.join(root, 'link to other client'))
    const folder = await ClientFolder.at(root)
    expect(await refusal(folder.restore('Trash/D1.pdf', 'link to other client/D1.pdf'))).toBe('outside')
    expect(await refusal(folder.restore('Trash/D1.pdf', 'EP 23 171 862/Office/EP-Register.md/D1.pdf'))).toBe('not-directory')
    expect(await readdir(outside)).toEqual(['secret.md'])
  })

  it('passes on a disk fault while it makes a folder on the way back', async () => {
    await mkdir(path.join(root, 'Trash'))
    await writeFile(path.join(root, 'Trash', 'D1.pdf'), 'x')
    const folder = await ClientFolder.at(root)
    const fault = await folder.restore('Trash/D1.pdf', `${'f'.repeat(300)}/D1.pdf`).then(() => undefined, (error: unknown) => error)
    expect((fault as NodeJS.ErrnoException).code).toBe('ENAMETOOLONG')
    expect(await readdir(path.join(root, 'Trash'))).toEqual(['D1.pdf'])
  })
})

describe('search', () => {
  beforeEach(async () => {
    await writeFile(path.join(root, 'EP 23 171 862', 'Search', 'Search report EP.pdf'), 'x')
    await writeFile(path.join(root, 'EP 23 171 862', 'Office', 'Prüfungsbescheid.pdf'), 'x')
    await writeFile(path.join(root, 'EP 23 171 862', 'Office', '.Prüfung hidden.pdf'), 'x')
    await mkdir(path.join(root, 'Trash'))
    await writeFile(path.join(root, 'Trash', 'Search report old.pdf'), 'x')
    await mkdir(path.join(root, 'EP 23 171 862', 'Trash'))
    await writeFile(path.join(root, 'EP 23 171 862', 'Trash', 'Search report kept.pdf'), 'x')
    await symlink(path.join(outside, 'secret.md'), path.join(root, 'Search link.md'))
  })

  it('finds the files and folders whose name holds every word of the query, case and accents aside, in path order', async () => {
    const folder = await ClientFolder.at(root)
    expect(await folder.search('search', 100)).toEqual({
      hits: [
        { path: 'EP 23 171 862/Search', kind: 'directory' },
        { path: 'EP 23 171 862/Search/Search report EP.pdf', kind: 'file' },
        { path: 'EP 23 171 862/Trash/Search report kept.pdf', kind: 'file' },
      ],
      truncated: false,
    })
    expect((await folder.search('  REPORT   ep.PDF  ', 100)).hits.map(hit => hit.path)).toEqual(['EP 23 171 862/Search/Search report EP.pdf'])
    expect((await folder.search('prufung', 100)).hits).toEqual([{ path: 'EP 23 171 862/Office/Prüfungsbescheid.pdf', kind: 'file' }])
    expect((await folder.search('PRÜFUNG', 100)).hits).toHaveLength(1)
    expect((await folder.search('report missing', 100)).hits).toEqual([])
  })

  it('finds nothing for a query with no word', async () => {
    const folder = await ClientFolder.at(root)
    expect(await folder.search('   ', 100)).toEqual({ hits: [], truncated: false })
  })

  it('cuts the hits at the cap and says so, and does not say so when the cap is just reached', async () => {
    const folder = await ClientFolder.at(root)
    expect(await folder.search('search', 2)).toEqual({
      hits: [{ path: 'EP 23 171 862/Search', kind: 'directory' }, { path: 'EP 23 171 862/Search/Search report EP.pdf', kind: 'file' }],
      truncated: true,
    })
    expect(await folder.search('search', 1)).toEqual({ hits: [{ path: 'EP 23 171 862/Search', kind: 'directory' }], truncated: true })
    expect((await folder.search('search', 3)).truncated).toBe(false)
  })
})
