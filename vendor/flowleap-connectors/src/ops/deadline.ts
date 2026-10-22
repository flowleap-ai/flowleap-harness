/*---------------------------------------------------------------------------------------------
 *  EPO OPS request deadline (PRD 0001 S2)
 *
 *  Doctrine: a request never waits on upstream backpressure longer than the
 *  proxy window. When EPO OPS says "wait", the backend answers 503
 *  `upstream_unavailable` + the real `Retry-After` at once, and the agent's
 *  escalation ladder decides what to do (ADR 0010).
 *
 *  This module holds the two rules every sleep site in `opsFetch` and
 *  `applyThrottling` must pass, so the rule lives in one place instead of being
 *  re-derived at each `setTimeout`. It is deliberately free of imports from
 *  `fetch.ts`/`throttle.ts` so both can depend on it without a cycle.
 *--------------------------------------------------------------------------------------------*/

import { UpstreamUnavailableError } from "../errors.js";

/** Service name carried by every OPS-facing error. */
const OPS_SERVICE_NAME = "EPO OPS";

/** Which sleep site refused to wait — used only to word the message. */
export type WaitSource = "retry-after" | "throttle-backoff" | "retry-delay";

/** The wait budget of one logical OPS request, retries included. */
export type SleepBudget = {
	/** Epoch ms the whole logical request must not outlive. */
	readonly deadline: number;
	/** Hard cap on any single sleep, regardless of the deadline. */
	readonly maxSingleSleepMs: number;
};

/**
 * A wait that does not fit in the request budget.
 *
 * Extends {@link UpstreamUnavailableError} on purpose: ADR 0014's error
 * registry is closed, so this still reaches the wire as `503
 * upstream_unavailable` + `Retry-After`. The distinct type only lets `opsFetch`
 * tell "stop, the budget is spent" apart from a retryable upstream 5xx.
 */
export class OpsDeadlineExceededError extends UpstreamUnavailableError {
	constructor(options: {
		/** Seconds the caller should wait before retrying. */
		waitSeconds: number;
		source: WaitSource;
		upstreamStatus?: number;
	}) {
		super(OPS_SERVICE_NAME, {
			retryAfter: options.waitSeconds,
			upstreamStatus: options.upstreamStatus,
			message: messageFor(options.source, options.waitSeconds),
		});
		this.name = "OpsDeadlineExceededError";
	}
}

function messageFor(source: WaitSource, waitSeconds: number): string {
	const retry = `Please retry the same query in ${waitSeconds} seconds.`;
	switch (source) {
		case "retry-after":
			return `${OPS_SERVICE_NAME} asked us to wait ${waitSeconds} seconds, longer than a single request may wait. ${retry}`;
		case "throttle-backoff":
			return `${OPS_SERVICE_NAME} asked us to wait ${waitSeconds} seconds and the shared EPO throttle is still backing off. ${retry}`;
		case "retry-delay":
			return `${OPS_SERVICE_NAME} is temporarily unavailable and the next retry would wait ${waitSeconds} seconds, past this request's deadline. ${retry}`;
	}
}

/** Whole seconds a client should wait for a delay of `ms` (never below 1). */
export function waitSecondsFrom(ms: number): number {
	return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * Guard a wait EPO imposed on us — a `Retry-After`, an armed throttle backoff,
 * the per-bucket spacing.
 *
 * Such a wait is never shortened: sleeping half a `Retry-After` only earns a
 * second 429. So it is either waited in full or refused. Returns normally when
 * the caller may sleep `waitMs`; throws {@link OpsDeadlineExceededError} when
 * the wait would cross the deadline or exceed the single-sleep cap.
 *
 * @param retryAfterSeconds The upstream's own `Retry-After`, when it gave one;
 * otherwise the refusal reports the remaining wait, rounded up.
 */
export function assertImposedWaitFits(
	waitMs: number,
	budget: SleepBudget,
	source: WaitSource,
	retryAfterSeconds?: number,
	now: number = Date.now()
): void {
	const fits = waitMs <= budget.maxSingleSleepMs && now + waitMs <= budget.deadline;
	if (fits) {
		return;
	}
	throw new OpsDeadlineExceededError({
		waitSeconds: retryAfterSeconds ?? waitSecondsFrom(waitMs),
		source,
	});
}

/**
 * Shrink a delay we chose ourselves (the exponential retry backoff) to what the
 * budget allows. Unlike an imposed wait this one may be cut short — it exists
 * to space out our own retries, not to obey EPO.
 *
 * @returns The ms to sleep, or 0 when no retry fits before the deadline.
 */
export function fitDiscretionaryDelay(delayMs: number, budget: SleepBudget, now: number = Date.now()): number {
	const capped = Math.min(delayMs, budget.maxSingleSleepMs);
	return now + capped <= budget.deadline ? capped : 0;
}
