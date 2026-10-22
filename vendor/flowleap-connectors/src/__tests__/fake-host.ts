/*---------------------------------------------------------------------------------------------
 *  A fake ConnectorHost for the package's own tests (ADR 0019 C1).
 *
 *  Everything a client can ask a host for, answered in memory: credentials the
 *  test sets per provider, a Map-backed cache, a clock the test controls, a
 *  caller signal the test can abort, and a record of every event the clients
 *  report. No environment, no network: `fetch` is whatever the test passes.
 *--------------------------------------------------------------------------------------------*/

import { vi } from 'vitest';
import type {
	ConnectorCredentialMap,
	ConnectorEvent,
	ConnectorHost,
	ConnectorProvider,
	CredentialLookup,
} from '../host.js';

type Lookups = { [P in ConnectorProvider]?: CredentialLookup<P> };

export interface FakeHostOptions {
	fetch?: ConnectorHost['fetch'];
	credentials?: Lookups;
	/** A fixed epoch ms; absent, the host reads Date.now() (so fake timers pin it). */
	now?: number;
	/** Omit the cache capability entirely. */
	noCache?: boolean;
	/** Route the logger to the console (for a test that spies on console.warn). */
	consoleLogger?: boolean;
	settings?: ConnectorHost['settings'];
	ocr?: ConnectorHost['ocr'];
}

export interface FakeHost extends ConnectorHost {
	/** Every event the clients reported, in order. */
	readonly events: ConnectorEvent[];
	/** The in-memory cache behind `cache` (absent with `noCache`). */
	readonly store: Map<string, unknown>;
	/** Replace one provider's credentials for the calls that follow. */
	setCredentials<P extends ConnectorProvider>(provider: P, lookup: CredentialLookup<P>): void;
	/** The caller signal `signal()` answers; set to an aborted one to simulate a gone caller. */
	callerSignal: AbortSignal | undefined;
	/** A hook a test may replace to refuse an `upstream_call` (the backend's trial budget). */
	refuse?: (event: ConnectorEvent) => void;
}

export function userCredentials<P extends 'epoOps' | 'usptoOdp' | 'semanticScholar'>(
	credentials: ConnectorCredentialMap[P],
	stored = false,
): CredentialLookup<P> {
	return { status: 'available', credentials, owner: 'user', stored };
}

export function hostCredentials<P extends ConnectorProvider>(
	credentials: ConnectorCredentialMap[P],
): CredentialLookup<P> {
	return { status: 'available', credentials, owner: 'host' };
}

export function createFakeHost(options: FakeHostOptions = {}): FakeHost {
	const lookups: Lookups = {
		epoOps: hostCredentials<'epoOps'>({ consumerKey: 'house-key', consumerSecret: 'house-secret' }),
		usptoOdp: hostCredentials<'usptoOdp'>({ apiKey: 'house-odp-key' }),
		semanticScholar: hostCredentials<'semanticScholar'>({}),
		mistral: { status: 'missing' },
		...options.credentials,
	};
	const store = new Map<string, unknown>();
	const events: ConnectorEvent[] = [];
	const silent = () => {};

	const host: FakeHost = {
		events,
		store,
		callerSignal: undefined,
		setCredentials(provider, lookup) {
			(lookups as Record<string, unknown>)[provider] = lookup;
		},
		fetch: options.fetch ?? vi.fn(async () => new Response('', { status: 500 })),
		async credentials<P extends ConnectorProvider>(provider: P): Promise<CredentialLookup<P>> {
			return (lookups[provider] ?? { status: 'missing' }) as CredentialLookup<P>;
		},
		cache: options.noCache
			? undefined
			: {
					async get<T>(key: string) {
						return store.get(key) as T | undefined;
					},
					async set<T>(key: string, value: T) {
						store.set(key, value);
					},
				},
		logger: options.consoleLogger
			? {
					info: (m, ...r) => console.log(m, ...r),
					warn: (m, ...r) => console.warn(m, ...r),
					error: (m, ...r) => console.error(m, ...r),
				}
			: { info: silent, warn: silent, error: silent },
		now: options.now === undefined ? () => Date.now() : () => options.now as number,
		onOutcome(event) {
			events.push(event);
			host.refuse?.(event);
		},
		signal: () => host.callerSignal,
		ocr: options.ocr,
		settings: options.settings,
	};
	return host;
}

/** The `upstream_call` events the host saw: one per charged logical request. */
export function upstreamCalls(host: FakeHost): number {
	return host.events.filter((e) => e.kind === 'upstream_call').length;
}
