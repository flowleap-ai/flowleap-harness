/*---------------------------------------------------------------------------------------------
 *  unwrapRead error chokepoint (./shared.ts): the mapping from a
 *  failed ProviderReadResult onto the tool error contract. Regression focus:
 *  FULLTEXT_UNAVAILABLE must pass through verbatim (with its structured
 *  `reason` under details) — the registry docs promise it as a data-coverage
 *  verdict, and the generic 404→NOT_FOUND mapping used to swallow it.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import { unwrapRead, ToolError } from './shared.js';
import { ErrorCodes } from '../contract/error-codes.js';
import type { ProviderReadResult } from '../cached-provider-read.js';

function failure(error: Record<string, unknown>, status = 404): ProviderReadResult<never> {
	return {
		ok: false,
		status,
		headers: {},
		body: { success: false, status, error },
	} as ProviderReadResult<never>;
}

function caught(result: ProviderReadResult<never>): ToolError {
	try {
		unwrapRead(result);
	} catch (error) {
		if (error instanceof ToolError) return error;
		throw error;
	}
	throw new Error('unwrapRead did not throw');
}

describe('unwrapRead', () => {
	it('passes FULLTEXT_UNAVAILABLE through verbatim with its reason under details', () => {
		const error = caught(
			failure({
				code: ErrorCodes.FULLTEXT_UNAVAILABLE,
				reason: 'no_source',
				message: 'No full-text source serves claims for CN publication CN111111111A.',
			})
		);

		expect(error.status).toBe(404);
		expect(error.code).toBe(ErrorCodes.FULLTEXT_UNAVAILABLE);
		expect(error.details).toEqual({ reason: 'no_source' });
		expect(error.message).toContain('CN111111111A');
	});

	it('carries the no_source workaround under details beside the reason', () => {
		const workaround = { tool: 'get_family', note: 'limits' };
		const error = caught(
			failure({
				code: ErrorCodes.FULLTEXT_UNAVAILABLE,
				reason: 'no_source',
				message: 'No full-text source serves claims for DE publication DE102020215921A1.',
				workaround,
			})
		);
		expect(error.details).toEqual({ reason: 'no_source', workaround });
	});

	it('maps a plain upstream 404 to NOT_FOUND', () => {
		const error = caught(failure({ code: 'SERVER.EntityNotFound', message: 'not found upstream' }));
		expect(error.status).toBe(404);
		expect(error.code).toBe(ErrorCodes.NOT_FOUND);
	});

	it('maps a 429 to RATE_LIMITED and anything else to INTERNAL_ERROR', () => {
		expect(caught(failure({ code: 'x', message: 'slow down' }, 429)).code).toBe(
			ErrorCodes.RATE_LIMITED
		);
		expect(caught(failure({ code: 'x', message: 'boom' }, 502)).code).toBe(
			ErrorCodes.INTERNAL_ERROR
		);
	});

	it('returns the data of a successful read', () => {
		const result = { ok: true, cached: false, data: { claims: [] } } as ProviderReadResult<{
			claims: never[];
		}>;
		expect(unwrapRead(result)).toEqual({ claims: [] });
	});
});

describe('a malformed publication number (422 INVALID_INPUT from the connector) at the tool seam', () => {
	it('maps the envelope to 422 INVALID_INPUT, not INTERNAL_ERROR', () => {
		// The connector answers the malformed number as a 422 envelope (pinned in
		// ../ops/direct.biblio.test.ts); the tool seam must
		// carry that status and code through instead of the catch-all 500.
		const error = caught(failure({ code: ErrorCodes.INVALID_INPUT, message: 'Invalid publication number: ???' }, 422));
		expect(error).toMatchObject({ status: 422, code: ErrorCodes.INVALID_INPUT });
	});
});
