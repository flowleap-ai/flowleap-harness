/*---------------------------------------------------------------------------------------------
 *  opsFetch — client-gone abort and trial-budget charging (PRD 0001 S4).
 *
 *  Two facts under test, both invisible before this slice: an EPO request whose client has
 *  already hung up must stop instead of re-spending the shared 5/min search bucket, and the
 *  trial data budget (ADR 0017) must be charged only for a request that actually reaches
 *  EPO. `fetch` is stubbed, so "reached EPO" is exactly "the stub was called".
 *
 *  throttle.js and auth.js are mocked: the throttle module is being rewritten in parallel
 *  (S3) and the token mint is not the subject here. The host side of both facts — the
 *  caller signal and the charge — is the fake host (ADR 0019 C1): "charged" is the
 *  `upstream_call` event the backend's trial budget hook charges on.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFakeHost, upstreamCalls, type FakeHost } from "../__tests__/fake-host.js";
import { ClientGoneError } from "../client-abort.js";
import { createContext, type ConnectorContext } from "../context.js";
import { OpsDeadlineExceededError } from "./deadline.js";
import { opsFetch } from "./fetch.js";
import { applyThrottling } from "./throttle.js";

vi.mock("./throttle.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("./throttle.js")>()),
	applyThrottling: vi.fn(async () => ({ waitedMs: 0 })),
	handleThrottleResponse: vi.fn(),
}));

vi.mock("./auth.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("./auth.js")>()),
	getAccessToken: vi.fn(async () => "test-access-token"),
}));

let fetchStub: ReturnType<typeof vi.fn>;
let host: FakeHost;
let ctx: ConnectorContext;

/** Run `fn` as a request on the house keys, with `signal` as its caller. */
function asTrialRequest<T>(signal: AbortSignal | undefined, fn: () => T): T {
	host.callerSignal = signal;
	return fn();
}

/** How many logical requests the host was asked to charge for. */
function charged(): number {
	return upstreamCalls(host);
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.mocked(applyThrottling).mockResolvedValue({ waitedMs: 0 });
	fetchStub = vi.fn(async () => new Response("<ops-payload/>", { status: 200 }));
	host = createFakeHost({ fetch: (input, init) => fetchStub(input, init) });
	ctx = createContext(host);
});

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe("opsFetch client-gone handling", () => {
	it("calls EPO once and charges once on a normal 200", async () => {
		const result = await asTrialRequest(new AbortController().signal, () =>
			opsFetch(ctx, "/published-data/search?q=test")
		);

		expect({ body: result, fetchCalls: fetchStub.mock.calls.length, charged: charged() }).toEqual({
			body: "<ops-payload/>",
			fetchCalls: 1,
			charged: 1,
		});
	});

	it("makes no upstream call and no charge when the client left before the first attempt", async () => {
		const controller = new AbortController();
		controller.abort();

		const attempt = asTrialRequest(controller.signal, () =>
			opsFetch(ctx, "/published-data/search?q=test")
		);

		await expect(attempt).rejects.toBeInstanceOf(ClientGoneError);
		expect({ fetchCalls: fetchStub.mock.calls.length, charged: charged() }).toEqual({
			fetchCalls: 0,
			charged: 0,
		});
	});

	it("stops mid-flight when the client leaves during EPO's Retry-After wait", async () => {
		fetchStub.mockResolvedValueOnce(
			new Response("busy", { status: 503, headers: { "Retry-After": "2" } })
		);
		const controller = new AbortController();

		const attempt = asTrialRequest(controller.signal, () =>
			opsFetch(ctx, "/published-data/search?q=test")
		);
		// Let the first attempt answer 503 and enter the Retry-After sleep, then hang up.
		await vi.advanceTimersByTimeAsync(1);
		controller.abort();

		await expect(attempt).rejects.toBeInstanceOf(ClientGoneError);
		// The one attempt that did reach EPO is charged; the retry never happens.
		expect({ fetchCalls: fetchStub.mock.calls.length, charged: charged() }).toEqual({
			fetchCalls: 1,
			charged: 1,
		});
	});

	it("does not charge a fail-fast refusal that never reaches EPO", async () => {
		vi.mocked(applyThrottling).mockRejectedValue(
			new OpsDeadlineExceededError({ waitSeconds: 47, source: "throttle-backoff" })
		);

		const attempt = asTrialRequest(new AbortController().signal, () =>
			opsFetch(ctx, "/published-data/search?q=test")
		);

		await expect(attempt).rejects.toBeInstanceOf(OpsDeadlineExceededError);
		expect({ fetchCalls: fetchStub.mock.calls.length, charged: charged() }).toEqual({
			fetchCalls: 0,
			charged: 0,
		});
	});

	it("behaves as before outside a request context (no signal to consult)", async () => {
		host.callerSignal = undefined;
		const result = await opsFetch(ctx, "/published-data/search?q=test");

		expect({ body: result, fetchCalls: fetchStub.mock.calls.length, charged: charged() }).toEqual({
			body: "<ops-payload/>",
			fetchCalls: 1,
			charged: 1,
		});
	});
});
