/**
 * The DPMAconnectPlus client for patents and utility models
 * (`DPMAregisterPatService`).
 *
 * Source: "DPMAconnect REST Web Services API", the interface description of
 * the DPMA. Every function sends HTTP Basic authentication. The DPMA sends
 * its failures as XML bodies, so each answer is read before its status
 * decides anything.
 *
 * The base URL is fixed. A host that must reach a different server (a test
 * double) rewrites the URL in `host.fetch`.
 */

import { throwIfClientGone, withClientAbort } from '../client-abort.js';
import type { ConnectorContext } from '../context.js';
import { ClientGoneError } from '../errors.js';
import type { CredentialLookup } from '../host.js';
import { DPMA_EXTRACT_PERIODS, type DpmaExtractPeriod, type DpmaFailure, type DpmaHitList, type DpmaRegisterRecord, type DpmaResult } from './types.js';
import { parseDpmaFailure, parseDpmaHitList, parseDpmaRegisterRecord } from './wire.js';

export const DPMA_BASE_URL = 'https://dpmaconnect.dpma.de/dpmaws/rest-services';
const PATENT_SERVICE = 'DPMAregisterPatService';

/** One search or one record. */
const READ_TIMEOUT_MS = 60_000;
/** A register extract is a ZIP of all changes of a period. */
const EXTRACT_TIMEOUT_MS = 10 * 60_000;

const LEADING_NUMBER = /^[A-Z0-9]{5,20}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type DpmaCredentialLookup = CredentialLookup<'dpma'>;

/** Resolve the DPMA credential for the current call through the host. */
export async function resolveDpmaCredentials(ctx: ConnectorContext): Promise<DpmaCredentialLookup> {
	return ctx.host.credentials('dpma');
}

function fail(error: DpmaFailure): { readonly ok: false; readonly error: DpmaFailure } {
	return { ok: false, error };
}

type Answer = { readonly ok: true; readonly response: Response } | { readonly ok: false; readonly error: DpmaFailure };

/** Send one authenticated GET. No retry: a refused login must not repeat. */
async function dpmaGet(ctx: ConnectorContext, path: string, timeoutMs: number): Promise<Answer> {
	const { host } = ctx;
	const lookup = await resolveDpmaCredentials(ctx);
	if (lookup.status === 'missing') return fail({ kind: 'not_configured', message: 'No DPMAconnectPlus user name and password are configured.' });
	if (lookup.status === 'required') return fail({ kind: 'keys_required', message: 'DPMA data needs a DPMAconnectPlus access of your own.' });
	const { username, password } = lookup.credentials;
	throwIfClientGone(host);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await host.fetch(`${DPMA_BASE_URL}/${PATENT_SERVICE}/${path}`, {
			method: 'GET',
			headers: { Authorization: `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}` },
			signal: withClientAbort(host, controller.signal),
		});
		return { ok: true, response };
	} catch (error) {
		if (error instanceof ClientGoneError) throw error;
		throwIfClientGone(host);
		const message = controller.signal.aborted ? `DPMA did not answer in ${timeoutMs / 1000} seconds` : `DPMA is not reachable (${error instanceof Error ? error.message : String(error)})`;
		return fail({ kind: 'upstream', message });
	} finally {
		clearTimeout(timer);
	}
}

/** The failure of an answer that is not usable: the failure the body names, else the HTTP status. */
async function failureOf(status: number, body: string): Promise<DpmaFailure> {
	const named = await parseDpmaFailure(body);
	if (named) return { ...named, status };
	if (status === 401 || status === 403) return { kind: 'auth', message: `DPMA refused the login (HTTP ${status})`, status };
	if (status === 404) return { kind: 'not_available', message: 'DPMA has no data for this request (HTTP 404)', status };
	return { kind: 'upstream', message: `DPMA answered HTTP ${status}`, status };
}

/**
 * The version of the patent service. The cheapest authenticated call: a host
 * uses it to test a stored credential.
 */
export async function getDpmaVersion(ctx: ConnectorContext): Promise<DpmaResult<string>> {
	const answer = await dpmaGet(ctx, 'version', READ_TIMEOUT_MS);
	if (!answer.ok) return answer;
	const body = await answer.response.text();
	if (!answer.response.ok) return fail(await failureOf(answer.response.status, body));
	const named = await parseDpmaFailure(body);
	if (named) return fail({ ...named, status: answer.response.status });
	const version = body.trim();
	if (version === '' || version.startsWith('<')) return fail({ kind: 'malformed', message: 'The DPMA version answer is not a version text', status: answer.response.status });
	return { ok: true, data: version };
}

/**
 * Run an expert search on patents and utility models.
 * @param query - a query in the expert syntax of DPMAregister, for example `INH=Siemens UND AT>=01.01.2020`.
 * A `limited` list is cut at the hit limit of the account (1000, or 100 for a test access).
 */
export async function searchDpmaRegister(ctx: ConnectorContext, query: string): Promise<DpmaResult<DpmaHitList>> {
	const trimmed = query.trim();
	if (trimmed === '') return fail({ kind: 'bad_input', message: 'The expert query is empty.' });
	const answer = await dpmaGet(ctx, `search/${encodeURIComponent(trimmed)}`, READ_TIMEOUT_MS);
	if (!answer.ok) return answer;
	const body = await answer.response.text();
	if (!answer.response.ok) return fail(await failureOf(answer.response.status, body));
	const parsed = await parseDpmaHitList(body);
	return parsed.ok ? parsed : fail({ ...parsed.error, status: answer.response.status });
}

/**
 * Read the register record of one file.
 * @param leadingRegisteredNumber - the key of the file, from the `leadingRegisteredNumber` of a search hit.
 */
export async function getDpmaRegisterInfo(ctx: ConnectorContext, leadingRegisteredNumber: string): Promise<DpmaResult<DpmaRegisterRecord>> {
	const key = leadingRegisteredNumber.trim().toUpperCase();
	if (!LEADING_NUMBER.test(key)) return fail({ kind: 'bad_input', message: `"${leadingRegisteredNumber}" is not a leading file number of DPMAregister.` });
	const answer = await dpmaGet(ctx, `getRegisterInfo/${key}`, READ_TIMEOUT_MS);
	if (!answer.ok) return answer;
	const body = await answer.response.text();
	if (!answer.response.ok) return fail(await failureOf(answer.response.status, body));
	const parsed = await parseDpmaRegisterRecord(body);
	return parsed.ok ? parsed : fail({ ...parsed.error, status: answer.response.status });
}

/**
 * Download a register extract: a ZIP of the register records that changed in
 * one closed period.
 * @param date - the query date `YYYY-MM-DD`. The period ends one day before it. A date in the future is refused by the DPMA.
 */
export async function getDpmaRegisterExtract(ctx: ConnectorContext, date: string, period: DpmaExtractPeriod): Promise<DpmaResult<Uint8Array>> {
	if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return fail({ kind: 'bad_input', message: `"${date}" is not a date of the form YYYY-MM-DD.` });
	if (!DPMA_EXTRACT_PERIODS.includes(period)) return fail({ kind: 'bad_input', message: `"${String(period)}" is not a period of a register extract.` });
	const answer = await dpmaGet(ctx, `getRegisterabzuege/${date}/${period}`, EXTRACT_TIMEOUT_MS);
	if (!answer.ok) return answer;
	const { response } = answer;
	if (!response.ok) return fail(await failureOf(response.status, await response.text()));
	const bytes = new Uint8Array(await response.arrayBuffer());
	// A ZIP starts with "PK". Any other body is a failure answer in XML.
	if (bytes[0] === 0x50 && bytes[1] === 0x4b) return { ok: true, data: bytes };
	const named = await parseDpmaFailure(Buffer.from(bytes).toString('utf8'));
	return fail(named ? { ...named, status: response.status } : { kind: 'malformed', message: 'The DPMA register extract is not a ZIP file', status: response.status });
}
