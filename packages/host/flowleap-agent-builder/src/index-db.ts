/**
 * The full-text index of one agent's files in `<agent>/index.sqlite`: table `files` holds one row per file with its
 * index state, and the FTS5 table `pages` holds one row per page or paragraph. The index is derived from `files/`, and
 * each file is read once, when it is uploaded.
 * @module
 */

import { DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import type { Extraction } from './extract.ts'
import type { AgentFileFailure, AgentFileState, AgentFileView, LocationUnit } from './types.ts'

/** Schema version in `PRAGMA user_version`. */
export const AGENT_INDEX_SCHEMA_VERSION = 1

/** One search hit. */
export interface SearchHit {
  /** File name. */
  readonly file: string
  /** 1-based page or paragraph. */
  readonly at: number
  /** What `at` counts. */
  readonly unit: LocationUnit
  /** A passage around the match. */
  readonly passage: string
}

/** One location of a file, as `read` and the context text return it. */
export interface LocationRow {
  /** File name. */
  readonly file: string
  /** 1-based page or paragraph. */
  readonly at: number
  /** What `at` counts. */
  readonly unit: LocationUnit
  /** The full text of the location. */
  readonly text: string
}

type Row = Record<string, SQLOutputValue>

function text(row: Row, key: string): string {
  const value = row[key]
  if (typeof value !== 'string') throw new Error(`agent index: column ${key} is not text`)
  return value
}

function int(row: Row, key: string): number {
  const value = row[key]
  if (typeof value === 'number') return value
  throw new Error(`agent index: column ${key} is not a number`)
}

function unitOf(row: Row): LocationUnit {
  return text(row, 'unit') === 'paragraph' ? 'paragraph' : 'page'
}

const FAILURES: readonly AgentFileFailure[] = ['no-text', 'ocr-unavailable', 'ocr-failed', 'unreadable']

function stateOf(row: Row): AgentFileState {
  const state = text(row, 'state')
  if (state === 'indexed' || state === 'indexing') return { kind: state }
  const reason = FAILURES.find(failure => failure === row['reason']) ?? 'unreadable'
  const message = row['error']
  return { kind: 'failed', reason, message: typeof message === 'string' ? message : '' }
}

function locationOf(row: Row): LocationRow {
  return { file: text(row, 'file'), at: int(row, 'at'), unit: unitOf(row), text: text(row, 'text') }
}

/** Words of a search query: runs of letters and digits in any script. */
const QUERY_WORD = /[\p{L}\p{N}]+/gu

/**
 * Turn caller text into an FTS5 expression: each word as a quoted literal, joined with OR, so query syntax stays data
 * and a passage that holds any word matches; bm25 ranks passages with more of the words first.
 * @param query - caller text.
 * @returns the expression, or undefined when the text holds no word.
 */
export function ftsExpression(query: string): string | undefined {
  const words = query.match(QUERY_WORD)
  if (words === null) return undefined
  return [...new Set(words.map(word => word.toLowerCase()))].map(word => `"${word}"`).join(' OR ')
}

/** One open index. Methods are synchronous: `node:sqlite` runs each statement on the calling thread. */
export class AgentIndex {
  private constructor(private readonly db: DatabaseSync) {}

  /**
   * Open or create the index file.
   * @param path - the `index.sqlite` path, or `:memory:`.
   * @returns the open index.
   * @throws Error when the file has a newer schema.
   */
  static open(path: string): AgentIndex {
    const db = new DatabaseSync(path)
    try {
      /* v8 ignore next -- PRAGMA user_version always yields one row */
      const version = int(db.prepare('PRAGMA user_version').get() ?? {}, 'user_version')
      if (version > AGENT_INDEX_SCHEMA_VERSION) {
        throw new Error(`agent index ${path}: schema ${String(version)} is newer than ${String(AGENT_INDEX_SCHEMA_VERSION)}`)
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS files (
          name TEXT PRIMARY KEY, bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, state TEXT NOT NULL,
          unit TEXT NOT NULL DEFAULT 'page', pages INTEGER NOT NULL DEFAULT 0, chars INTEGER NOT NULL DEFAULT 0,
          reason TEXT, error TEXT
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS pages USING fts5(file UNINDEXED, page UNINDEXED, text, tokenize = 'unicode61 remove_diacritics 2');
        PRAGMA user_version = ${String(AGENT_INDEX_SCHEMA_VERSION)};
      `)
      return new AgentIndex(db)
    } catch (error) {
      db.close()
      throw error
    }
  }

  /** Close the file. */
  close(): void {
    this.db.close()
  }

  /**
   * Every file, by name.
   * @returns one view per file.
   */
  files(): AgentFileView[] {
    return this.db.prepare('SELECT * FROM files ORDER BY name').all().map(row => ({
      name: text(row, 'name'), bytes: int(row, 'bytes'), state: stateOf(row), locations: int(row, 'pages'), unit: unitOf(row),
    }))
  }

  /**
   * The stored hash and state of one file.
   * @param name - file name.
   * @returns the SHA-256 hex and the state kind, or undefined for an unknown file.
   */
  entry(name: string): { readonly sha256: string; readonly state: AgentFileState['kind'] } | undefined {
    const row = this.db.prepare('SELECT sha256, state FROM files WHERE name = ?').get(name)
    return row === undefined ? undefined : { sha256: text(row, 'sha256'), state: stateOf(row).kind }
  }

  /**
   * Start the index lifecycle of one file: its old pages go, and its state is `indexing`.
   * @param name - file name.
   * @param bytes - size.
   * @param sha256 - content hash.
   */
  begin(name: string, bytes: number, sha256: string): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM pages WHERE file = ?').run(name)
      this.db.prepare('INSERT OR REPLACE INTO files (name, bytes, sha256, state) VALUES (?, ?, ?, \'indexing\')').run(name, bytes, sha256)
    })
  }

  /**
   * End the index lifecycle of one file with its extraction.
   * @param name - file name.
   * @param sha256 - the hash the extraction read; a file removed or replaced meanwhile keeps its newer state.
   * @param extraction - the text by location, or the failure.
   * @returns whether the extraction was stored.
   */
  complete(name: string, sha256: string, extraction: Extraction): boolean {
    let stored = false
    this.transaction(() => {
      const known = this.db.prepare('SELECT 1 FROM files WHERE name = ? AND sha256 = ? AND state = \'indexing\'').get(name, sha256)
      if (known === undefined) return
      stored = true
      if (extraction.kind === 'failed') {
        this.db.prepare('UPDATE files SET state = \'failed\', reason = ?, error = ?, pages = 0, chars = 0 WHERE name = ?')
          .run(extraction.reason, extraction.message, name)
        return
      }
      const insert = this.db.prepare('INSERT INTO pages (file, page, text) VALUES (?, ?, ?)')
      let chars = 0
      for (const location of extraction.locations) {
        insert.run(name, location.at, location.text)
        chars += location.text.length
      }
      this.db.prepare('UPDATE files SET state = \'indexed\', unit = ?, pages = ?, chars = ?, reason = NULL, error = NULL WHERE name = ?')
        .run(extraction.unit, extraction.locations.length, chars, name)
    })
    return stored
  }

  /**
   * Remove one file and its pages.
   * @param name - file name.
   */
  remove(name: string): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM pages WHERE file = ?').run(name)
      this.db.prepare('DELETE FROM files WHERE name = ?').run(name)
    })
  }

  /**
   * Characters of all indexed text.
   * @returns the sum over indexed files.
   */
  indexedChars(): number {
    /* v8 ignore next -- an aggregate query always yields one row */
    return int(this.db.prepare('SELECT COALESCE(SUM(chars), 0) AS chars FROM files WHERE state = \'indexed\'').get() ?? {}, 'chars')
  }

  /**
   * Search the indexed pages.
   * @param query - caller text.
   * @param limit - most hits.
   * @returns hits, best first; none when the text holds no word.
   */
  search(query: string, limit: number): SearchHit[] {
    const expression = ftsExpression(query)
    if (expression === undefined) return []
    // The FTS functions run in a subquery: in a join, `pages` would also name the `files.pages` column.
    const rows = this.db.prepare(`
      SELECT hits.file AS file, hits.at AS at, files.unit AS unit, hits.passage AS passage
      FROM (
        SELECT file, page AS at, snippet(pages, 2, '', '', '…', 48) AS passage, bm25(pages) AS rank
        FROM pages WHERE pages MATCH ?
      ) AS hits JOIN files ON files.name = hits.file
      WHERE files.state = 'indexed'
      ORDER BY hits.rank, hits.file, hits.at
      LIMIT ?
    `).all(expression, limit)
    return rows.map(row => ({
      file: text(row, 'file'), at: int(row, 'at'), unit: unitOf(row), passage: text(row, 'passage').replace(/\s+/g, ' ').trim(),
    }))
  }

  /**
   * Read locations of one indexed file.
   * @param file - file name.
   * @param from - first location, 1-based.
   * @param to - last location, inclusive.
   * @returns the locations in the range that hold text, and the count of the file's locations; undefined for an unknown or unindexed file.
   */
  read(file: string, from: number, to: number): { readonly rows: LocationRow[]; readonly total: number } | undefined {
    const known = this.db.prepare('SELECT unit, pages FROM files WHERE name = ? AND state = \'indexed\'').get(file)
    if (known === undefined) return undefined
    const rows = this.db.prepare('SELECT pages.file AS file, pages.page AS at, ? AS unit, pages.text AS text FROM pages WHERE file = ? AND page BETWEEN ? AND ? ORDER BY page')
      .all(unitOf(known), file, from, to)
    return { rows: rows.map(locationOf), total: int(known, 'pages') }
  }

  /**
   * All indexed text in a stable order: file name, then page.
   * @returns every location of every indexed file.
   */
  allText(): LocationRow[] {
    return this.db.prepare(`
      SELECT pages.file AS file, pages.page AS at, files.unit AS unit, pages.text AS text
      FROM pages JOIN files ON files.name = pages.file
      WHERE files.state = 'indexed'
      ORDER BY pages.file COLLATE BINARY, pages.page
    `).all().map(locationOf)
  }

  private transaction(work: () => void): void {
    this.db.exec('BEGIN')
    try {
      work()
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}
