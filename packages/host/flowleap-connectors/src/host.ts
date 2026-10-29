/**
 * The `ConnectorHost` of this process: global `fetch`, the stored connector
 * records as credentials, an in-memory LRU cache with TTL, the plugin logger,
 * `Date.now`, and the caller's cancellation signal carried through
 * `AsyncLocalStorage` so one shared library instance (one OPS token cache, one
 * throttle) serves every tool call and connection test. No `onOutcome` (nothing
 * to account for in the attorney's own process) and no `ocr` capability: the
 * library's own Mistral client runs on the stored `mistral` record instead
 * (`resolveOcr` falls through to it), so `ocr`, `read_pdf` and
 * `read_application_document` all spend the firm's key.
 * @module
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import type { ConnectorCache, ConnectorHost, ConnectorLogger } from '@flowleap/connectors'
import { lookupCredentials, type ConnectorCredentialStore } from './credentials.ts'

/** What the host needs from the plugin. */
export interface ConnectorHostOptions {
  /** The connector records. */
  store: ConnectorCredentialStore
  /** The plugin logger; the library logs request lines at info level. */
  logger: ConnectorLogger
  /** Maximum cached entries before the least recently used one is evicted. */
  cacheEntries: number
  /** The clock, epoch ms; defaults to `Date.now`. */
  now?: () => number
  /** The network; defaults to the global `fetch`. Specs pass a recorder. */
  fetch?: ConnectorHost['fetch']
}

/** One cached value and its expiry (epoch ms). */
interface CacheEntry {
  value: unknown
  expiresAt: number
}

/**
 * Bounded read-through cache: at most `maxEntries` live entries, least recently
 * read evicted first, each entry expiring at its own TTL. Values are stored by
 * reference; the library treats them as immutable JSON.
 */
export class LruCache implements ConnectorCache {
  private readonly entries = new Map<string, CacheEntry>()

  /**
   * @param maxEntries - capacity; at least 1.
   * @param now - the clock, epoch ms.
   */
  constructor(private readonly maxEntries: number, private readonly now: () => number = Date.now) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new TypeError(`LruCache: maxEntries must be a positive integer, got ${String(maxEntries)}`)
    }
  }

  /** Live entries, after dropping the expired ones the next read would drop anyway. */
  get size(): number {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= this.now()) this.entries.delete(key)
    }
    return this.entries.size
  }

  /**
   * Read one value and mark it most recently used.
   * @param key - cache key.
   * @returns the value, or `undefined` when absent or expired.
   */
  get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key)
    if (entry === undefined) return Promise.resolve(undefined)
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key)
      return Promise.resolve(undefined)
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    return Promise.resolve(entry.value as T)
  }

  /**
   * Store one value; a non-positive TTL stores nothing.
   * @param key - cache key.
   * @param value - the value, kept by reference.
   * @param ttlSeconds - lifetime in seconds.
   */
  set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!(ttlSeconds > 0)) return Promise.resolve()
    this.entries.delete(key)
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 })
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) break
      this.entries.delete(oldest)
    }
    return Promise.resolve()
  }
}

/** The host plus the signal carrier a tool call or connection test binds around its work. */
export interface BoundConnectorHost {
  /** The host handed to `createConnectors`. */
  host: ConnectorHost
  /** The cache behind `host.cache`, for inspection. */
  cache: LruCache
  /**
   * Run `work` with `signal` as the caller signal the library observes.
   * @param signal - the caller's cancellation.
   * @param work - the library calls to make on the caller's behalf.
   * @returns whatever `work` returns.
   */
  withSignal<T>(signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T>
}

/**
 * Build the host over the dsh seams.
 * @param options - the records, logger, cache size, and clock.
 * @returns the host and its signal carrier.
 */
export function createConnectorHost(options: ConnectorHostOptions): BoundConnectorHost {
  const now = options.now ?? Date.now
  const cache = new LruCache(options.cacheEntries, now)
  const callerSignal = new AsyncLocalStorage<AbortSignal>()
  const network = options.fetch ?? ((input, init) => fetch(input, init))
  const host: ConnectorHost = {
    fetch: (input, init) => network(input, init),
    credentials: provider => lookupCredentials(options.store, provider),
    cache,
    logger: options.logger,
    now,
    signal: () => callerSignal.getStore(),
  }
  return {
    host,
    cache,
    withSignal(signal, work) {
      return signal === undefined ? work() : callerSignal.run(signal, work)
    },
  }
}
