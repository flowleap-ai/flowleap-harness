/*---------------------------------------------------------------------------------------------
 *  cachedOdpRead — the ODP caching-gap spine (#334).
 *
 *  ODP reads ride the shared read-through cache: repeats never touch the
 *  60 req/min ODP key, failures are never cached, and the provider-reported
 *  error code passes through verbatim (unwrapCachedOdp maps 404/429 to the
 *  facade codes, everything else verbatim — same contract as unwrapOdp).
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi } from 'vitest';
import { createConnectors } from '../index.js';
import { createFakeHost } from '../__tests__/fake-host.js';
import { cachedOdpRead as cachedOdpReadWith, ToolError, type OdpResult, type ToolContext } from './shared.js';

let unique = 0;
const endpoint = () => `test-odp-${Date.now()}-${unique++}`;

// One in-memory cache for the whole file: the entries are keyed per test by `endpoint()`.
const ctx: ToolContext = { connectors: createConnectors(createFakeHost()) };
const cachedOdpRead = <T>(
	endpoint: string,
	params: object,
	ttlSeconds: number,
	fetchFresh: () => Promise<OdpResult<T>>,
) => cachedOdpReadWith(ctx, endpoint, params, ttlSeconds, fetchFresh);

describe('cachedOdpRead', () => {
	it('serves repeats from the cache — fetchFresh runs once', async () => {
		const fetchFresh = vi.fn(
			async (): Promise<OdpResult<{ value: number }>> => ({ ok: true, data: { value: 42 } }),
		);
		const ep = endpoint();

		const first = await cachedOdpRead(ep, { applicationNumberText: '16123456' }, 60, fetchFresh);
		const second = await cachedOdpRead(ep, { applicationNumberText: '16123456' }, 60, fetchFresh);

		expect(first).toEqual({ value: 42 });
		expect(second).toEqual({ value: 42 });
		expect(fetchFresh).toHaveBeenCalledTimes(1);
	});

	it('hands out mutation-safe copies — a mutated result never leaks into later hits', async () => {
		const ep = endpoint();
		const fetchFresh = async (): Promise<OdpResult<{ bag: string[] }>> => ({
			ok: true,
			data: { bag: ['a'] },
		});

		const first = await cachedOdpRead(ep, { n: 1 }, 60, fetchFresh);
		first.bag.push('mutated');
		const second = await cachedOdpRead(ep, { n: 1 }, 60, fetchFresh);

		expect(second.bag).toEqual(['a']);
	});

	it('different params are different cache entries', async () => {
		const fetchFresh = vi.fn(
			async (): Promise<OdpResult<string>> => ({ ok: true, data: 'x' }),
		);
		const ep = endpoint();

		await cachedOdpRead(ep, { applicationNumberText: '111' }, 60, fetchFresh);
		await cachedOdpRead(ep, { applicationNumberText: '222' }, 60, fetchFresh);

		expect(fetchFresh).toHaveBeenCalledTimes(2);
	});

	it('never caches failures, and passes the provider-reported code through verbatim', async () => {
		const ep = endpoint();
		const fetchFresh = vi.fn(
			async (): Promise<OdpResult<string>> => ({
				ok: false,
				error: { status: 400, code: 'odp_upstream_error', message: 'bad request' },
			}),
		);

		await expect(cachedOdpRead(ep, { n: 1 }, 60, fetchFresh)).rejects.toMatchObject({
			status: 400,
			code: 'odp_upstream_error',
		});
		await expect(cachedOdpRead(ep, { n: 1 }, 60, fetchFresh)).rejects.toBeInstanceOf(ToolError);
		expect(fetchFresh).toHaveBeenCalledTimes(2);
	});

	it('maps upstream 404 to the facade NOT_FOUND code', async () => {
		await expect(
			cachedOdpRead(endpoint(), { n: 1 }, 60, async () => ({
				ok: false as const,
				error: { status: 404, code: 'application_not_found', message: 'nope' },
			})),
		).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
	});
});
