/*---------------------------------------------------------------------------------------------
 *  Facade cache visibility — the `cached` flag on the /v1/tools success
 *  envelope (PRD 0013 T01, #269).
 *
 *  Tool handlers are plain async functions over the lib tier; only the lib's
 *  read-through spine (cachedProviderRead) knows whether a read was a cache
 *  hit. This module carries that knowledge to the route layer without touching
 *  handler signatures: the route runs the handler inside a request-scoped
 *  AsyncLocalStorage collector, and every unwrap of a ProviderReadResult
 *  records its `cached` bit.
 *
 *  Honesty rule (the ticket's): the envelope says `cached: true` only when
 *  EVERY recorded read was a cache hit, `cached: false` when at least one read
 *  went upstream, and OMITS the field entirely when no read reported
 *  visibility (pure tools, ODP-backed tools whose lib results carry no cached
 *  bit) — omit rather than lie.
 *--------------------------------------------------------------------------------------------*/

import { AsyncLocalStorage } from 'node:async_hooks';

interface CacheVisibilityStore {
	reads: boolean[];
}

const storage = new AsyncLocalStorage<CacheVisibilityStore>();

/**
 * Run `fn` with a fresh cache-visibility collector and report the collapsed
 * verdict: `undefined` when nothing was recorded, otherwise the AND of every
 * recorded read.
 */
export async function runWithCacheVisibility<T>(
	fn: () => Promise<T>,
): Promise<{ result: T; cached: boolean | undefined }> {
	const store: CacheVisibilityStore = { reads: [] };
	const result = await storage.run(store, fn);
	return {
		result,
		cached: store.reads.length === 0 ? undefined : store.reads.every(Boolean),
	};
}

/**
 * Record one provider read's cache verdict. No-op outside a
 * runWithCacheVisibility scope (legacy routes report `cached` their own way).
 */
export function recordCacheRead(cached: boolean): void {
	storage.getStore()?.reads.push(cached);
}
