/*---------------------------------------------------------------------------------------------
 *  Caller-gone abort (PRD 0001 S4, host-scoped under ADR 0019 C1).
 *
 *  During the 2026-09-02 incident nginx dropped every client at 60s while Node kept
 *  retrying against EPO OPS on their behalf: the abandoned requests re-spent the shared
 *  5/min search bucket and sustained the outage that had just dropped them.
 *
 *  So the host hands the clients the signal of the caller the work is for
 *  (`host.signal()`: the backend's request marker, aborted by the completion middleware
 *  when the socket closes; the harness's cancellation), and the upstream layers consult
 *  it through the helpers here:
 *
 *    throwIfClientGone(host)        before an attempt, a token mint, or a budget charge
 *    abortableSleep(host, ms)       instead of a bare setTimeout, so a backoff wakes at once
 *    withClientAbort(host, signal)  to hand `fetch` the per-attempt timeout AND this signal
 *
 *  With no signal (a host without one, scripts, tests) every helper behaves exactly as the
 *  plain code it replaced.
 *--------------------------------------------------------------------------------------------*/

import type { ConnectorHost } from './host.js';

export { ClientGoneError } from './errors.js';
import { ClientGoneError } from './errors.js';

type SignalHost = Pick<ConnectorHost, 'signal'>;

function signalOf(host: SignalHost): AbortSignal | undefined {
	return host.signal?.();
}

/** Whether the current caller has already gone away. False without a signal. */
export function isClientGone(host: SignalHost): boolean {
	return signalOf(host)?.aborted === true;
}

/**
 * Throw {@link ClientGoneError} when the current caller has gone away. Call it
 * before spending anything real on that caller's behalf — an upstream attempt, a token
 * mint, a rate-limit token, a trial data budget charge.
 */
export function throwIfClientGone(host: SignalHost): void {
	if (isClientGone(host)) {
		throw new ClientGoneError();
	}
}

/**
 * Sleep `ms`, waking early with {@link ClientGoneError} if the caller goes away meanwhile.
 * The drop-in replacement for `new Promise(r => setTimeout(r, ms))` at any backpressure
 * wait: a request that has lost its caller must not resume for another attempt.
 */
export function abortableSleep(host: SignalHost, ms: number): Promise<void> {
	const signal = signalOf(host);
	if (!signal) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
	if (signal.aborted) {
		return Promise.reject(new ClientGoneError());
	}
	return new Promise((resolve, reject) => {
		const onAbort = (): void => {
			clearTimeout(timer);
			reject(new ClientGoneError());
		};
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		signal.addEventListener('abort', onAbort, { once: true });
	});
}

/**
 * The signal to hand one `fetch`: the per-attempt signal (typically a timeout
 * controller's) combined with the caller-gone signal, so the call is aborted by
 * whichever fires first. Without a caller signal it is `attemptSignal` unchanged.
 *
 * @param attemptSignal Omit it at a call site with no timeout of its own — the result is
 * then the caller-gone signal alone, or `undefined` when there is none.
 */
export function withClientAbort(host: SignalHost, attemptSignal?: AbortSignal): AbortSignal | undefined {
	const requestSignal = signalOf(host);
	if (!attemptSignal) {
		return requestSignal;
	}
	return requestSignal ? AbortSignal.any([attemptSignal, requestSignal]) : attemptSignal;
}
