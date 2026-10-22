/*---------------------------------------------------------------------------------------------
 *  EPO OPS throttle — header parsing, token buckets, per-credential scope (PRD 0001 S3).
 *
 *  The state (token buckets, backoff deadlines, one entry per credential scope) lives on
 *  the connector instance (ADR 0019 C1), so every test builds a fresh context over a fake
 *  host. Fake timers pin both Date.now() and the sleeps; Math.random is pinned because the
 *  Retry-After arming path jitters by 10-30%.
 *
 *  The live header these tests use was captured from ops.epo.org on 2026-09-02, the day of
 *  the incident this slice fixes.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeHost, hostCredentials, userCredentials, type FakeHost } from '../__tests__/fake-host.js';
import { createContext, type ConnectorContext } from '../context.js';
import * as throttle from './throttle.js';

const SEARCH_PATH = '/published-data/search?q=test';

/** Exactly what OPS answered during the 2026-09-02 incident. */
const LIVE_HEADER =
	'overloaded (images=green:50, inpadoc=green:30, other=green:1000, retrieval=green:50, search=green:5)';

/** A budget wide enough that only the module's own caps can refuse a wait. */
const generousBudget = () => ({ deadline: Date.now() + 120_000, maxSingleSleepMs: 120_000 });

let warnSpy: ReturnType<typeof vi.spyOn>;
let host: FakeHost;
let ctx: ConnectorContext;

/** A fresh connector instance over a fake host, so one test's buckets never leak into the next. */
async function freshThrottle() {
	host = createFakeHost({ consoleLogger: true });
	ctx = createContext(host);
	return throttle;
}

/** Run `fn` as a BYOK request: the host answers the user's own EPO credentials. */
async function withUserKeys<T>(fn: () => Promise<T>): Promise<T> {
	host.setCredentials('epoOps', userCredentials<'epoOps'>({ consumerKey: 'user-key', consumerSecret: 'user-secret' }));
	try {
		return await fn();
	} finally {
		host.setCredentials('epoOps', hostCredentials<'epoOps'>({ consumerKey: 'house-key', consumerSecret: 'house-secret' }));
	}
}

/** The `[EPO OPS throttle]` lines written so far, prefix stripped. */
function throttleLogs(): string[] {
	return warnSpy.mock.calls
		.map((call: unknown[]) => String(call[0]))
		.filter((line: string) => line.startsWith('[EPO OPS throttle] '))
		.map((line: string) => line.slice('[EPO OPS throttle] '.length));
}

beforeEach(() => {
	vi.useFakeTimers();
	// Jitter is 10-30% of the Retry-After; pin it to the 10% floor.
	vi.spyOn(Math, 'random').mockReturnValue(0);
	warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('parseThrottlingControl', () => {
	it('reads the live header, an idle header, and refuses what it cannot trust', async () => {
		const { parseThrottlingControl } = await freshThrottle();

		expect({
			live: parseThrottlingControl(LIVE_HEADER),
			idle: parseThrottlingControl('idle'),
			// A known state carrying tokens in no shape we know: the state still applies.
			unknownTokens: parseThrottlingControl('busy idle=500 frobnicate=green:9 search=purple:7'),
			garbage: parseThrottlingControl('not-a-throttling-header'),
			empty: parseThrottlingControl(''),
			missing: parseThrottlingControl(null),
		}).toStrictEqual({
			live: {
				state: 'overloaded',
				// `other=green:1000` is deliberately absent — it maps to no bucket of ours.
				services: {
					images: { color: 'green', perMinute: 50 },
					inpadoc: { color: 'green', perMinute: 30 },
					retrieval: { color: 'green', perMinute: 50 },
					search: { color: 'green', perMinute: 5 },
				},
			},
			idle: { state: 'idle', services: {} },
			unknownTokens: { state: 'busy', services: {} },
			garbage: undefined,
			empty: undefined,
			missing: undefined,
		});
	});
});

describe('token bucket', () => {
	it('admits the announced rate, then refuses the next request with the seconds to wait', async () => {
		const { applyThrottling, handleThrottleResponse } = await freshThrottle();

		await handleThrottleResponse(ctx, SEARCH_PATH, new Headers({ 'x-throttling-control': LIVE_HEADER }));

		// search=green:5 — five a minute, spendable back to back.
		const admitted: number[] = [];
		for (let i = 0; i < 5; i++) {
			admitted.push((await applyThrottling(ctx, SEARCH_PATH)).waitedMs);
		}
		const refusal = await applyThrottling(ctx, SEARCH_PATH).catch((error) => error);

		expect({
			admitted,
			refused: refusal.name,
			status: refusal.statusCode,
			// 5/min is one token every 12s, past the 5s cap a caller with no budget gets.
			retryAfter: refusal.retryAfter,
		}).toEqual({
			admitted: [0, 0, 0, 0, 0],
			refused: 'OpsDeadlineExceededError',
			status: 503,
			retryAfter: 12,
		});
	});

	it('admits one more request once a token has refilled', async () => {
		const { applyThrottling, handleThrottleResponse } = await freshThrottle();

		await handleThrottleResponse(ctx, SEARCH_PATH, new Headers({ 'x-throttling-control': LIVE_HEADER }));
		for (let i = 0; i < 5; i++) {
			await applyThrottling(ctx, SEARCH_PATH);
		}
		await vi.advanceTimersByTimeAsync(12_000);

		expect(await applyThrottling(ctx, SEARCH_PATH)).toEqual({ waitedMs: 0 });
	});

	it('sleeps a short token wait instead of refusing it', async () => {
		const { applyThrottling, handleThrottleResponse } = await freshThrottle();

		// inpadoc=green:30 is one token every 2s — inside the single-sleep cap, so it is
		// waited out rather than turned into a 503.
		await handleThrottleResponse(ctx, SEARCH_PATH, new Headers({ 'x-throttling-control': LIVE_HEADER }));
		for (let i = 0; i < 30; i++) {
			await applyThrottling(ctx, '/family/EP1000000');
		}

		const pending = applyThrottling(ctx, '/family/EP1000000', generousBudget());
		await vi.advanceTimersByTimeAsync(5_000);

		expect(await pending).toEqual({ waitedMs: 2_000 });
	});
});

describe('backoff', () => {
	it('arms 60s for every bucket on a black state, and expires it', async () => {
		const { getThrottleSnapshot, handleThrottleResponse } = await freshThrottle();

		await handleThrottleResponse(ctx, SEARCH_PATH, new Headers({ 'x-throttling-control': 'black' }));
		const armed = Object.values(getThrottleSnapshot(ctx)).map((b) => b.backoffRemainingSeconds);
		await vi.advanceTimersByTimeAsync(60_000);
		const expired = Object.values(getThrottleSnapshot(ctx)).map((b) => b.backoffRemainingSeconds);

		expect({ armed, expired }).toEqual({ armed: [60, 60, 60, 60], expired: [0, 0, 0, 0] });
	});

	it('caps a 600-second Retry-After at 60 seconds', async () => {
		const { getThrottleSnapshot, handleThrottleResponse } = await freshThrottle();

		await handleThrottleResponse(ctx, SEARCH_PATH, new Headers({ 'retry-after': '600' }));

		// Jitter would make it 660s; the ceiling is what a request may honestly wait for.
		expect(getThrottleSnapshot(ctx).search.backoffRemainingSeconds).toBe(60);
	});
});

describe('per-credential scope', () => {
	it('leaves a BYOK request untouched by the house keys backoff', async () => {
		const { applyThrottling, handleThrottleResponse, getThrottleScopeCount } = await freshThrottle();

		// A house-key 503: arms the shared scope every trialing user spends.
		await handleThrottleResponse(ctx, SEARCH_PATH, new Headers({ 'retry-after': '600' }));

		const byok = await withUserKeys(() => applyThrottling(ctx, SEARCH_PATH));
		const house = await applyThrottling(ctx, SEARCH_PATH).catch((error) => error);

		expect({
			byokWaitedMs: byok.waitedMs,
			houseRefusedFor: house.retryAfter,
			scopes: getThrottleScopeCount(ctx),
		}).toEqual({ byokWaitedMs: 0, houseRefusedFor: 60, scopes: 2 });
	});
});

describe('getThrottleSnapshot', () => {
	it('reports the house scope: every bucket, its rate, and the backoff counted down', async () => {
		const { getThrottleSnapshot, handleThrottleResponse } = await freshThrottle();

		await handleThrottleResponse(ctx, 
			SEARCH_PATH,
			new Headers({ 'retry-after': '10', 'x-throttling-control': LIVE_HEADER })
		);
		await vi.advanceTimersByTimeAsync(4_000);

		expect(getThrottleSnapshot(ctx)).toEqual({
			search: { backoffRemainingSeconds: 7, perMinute: 5 },
			retrieval: { backoffRemainingSeconds: 0, perMinute: 50 },
			inpadoc: { backoffRemainingSeconds: 0, perMinute: 30 },
			images: { backoffRemainingSeconds: 0, perMinute: 50 },
		});
	});
});

describe('throttle state-change logging', () => {
	it('logs the armed backoff, its source header, and the wait a later request enters', async () => {
		const { applyThrottling, handleThrottleResponse } = await freshThrottle();

		await handleThrottleResponse(ctx, SEARCH_PATH, new Headers({ 'retry-after': '10' }));
		const pending = applyThrottling(ctx, SEARCH_PATH, generousBudget());
		await vi.advanceTimersByTimeAsync(20_000);
		await pending;

		expect(throttleLogs()).toEqual([
			'backoff_armed bucket=search scope=house seconds=11 source=retry-after',
			'backoff_wait bucket=search scope=house seconds_remaining=11',
		]);
	});

	it('logs every per-minute rate the real header changes', async () => {
		const { handleThrottleResponse } = await freshThrottle();

		await handleThrottleResponse(ctx, SEARCH_PATH, new Headers({ 'x-throttling-control': LIVE_HEADER }));

		expect(throttleLogs()).toEqual([
			'limit_changed bucket=images scope=house per_minute=1200->50 source=x-throttling-control',
			'limit_changed bucket=inpadoc scope=house per_minute=600->30 source=x-throttling-control',
			'limit_changed bucket=retrieval scope=house per_minute=1200->50 source=x-throttling-control',
			'limit_changed bucket=search scope=house per_minute=600->5 source=x-throttling-control',
		]);
	});

	it('says nothing when a response announces no throttle state', async () => {
		const { applyThrottling, handleThrottleResponse } = await freshThrottle();

		await handleThrottleResponse(ctx, SEARCH_PATH, new Headers());
		await applyThrottling(ctx, SEARCH_PATH);

		expect(throttleLogs()).toEqual([]);
	});
});
