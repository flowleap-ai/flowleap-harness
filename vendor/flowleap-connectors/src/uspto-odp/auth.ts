/**
 * USPTO Open Data Portal Authentication
 *
 * Handles API key authentication for USPTO ODP APIs.
 * Key obtained from: https://data.uspto.gov/myodp/key-reveal
 *
 * The key resolves through the host (ADR 0019 C1): the user's key first (forwarded via
 * X-USPTO-ODP-Key, issue #30 / ADR 0007, or the stored key the key-resolution step put
 * there, ADR 0023 / #518), then the host's own USPTO_ODP_API_KEY, preserving pre-#30
 * behavior when no user key is on the request. Forwarded keys are never persisted or
 * logged; a stored key is the one persisted exception, encrypted at rest (ADR 0023).
 */

import { throwIfClientGone } from '../client-abort.js';
import type { ConnectorContext } from '../context.js';
import { DataKeysRequiredError, ProviderKeyInvalidError } from '../errors.js';
import type { CredentialLookup } from '../host.js';

/** The USPTO ODP key resolved for one call, with its provenance. */
export type OdpCredentialLookup = CredentialLookup<'usptoOdp'>;

/** Resolve the ODP key for the current call through the host. */
export async function resolveOdpCredentials(ctx: ConnectorContext): Promise<OdpCredentialLookup> {
	return ctx.host.credentials('usptoOdp');
}

/**
 * Get the USPTO ODP API key: the current request's user-supplied key, else the host's key.
 *
 * ADR 0008: with no user key, the host's key is a trial-only feature on the backend. When
 * the host refuses it (`required`: a paid `active` subscription), throw
 * {@link DataKeysRequiredError} (mapped to `400 data_keys_required`) rather than riding
 * FlowLeap's ODP key.
 * @returns API key or null if neither is configured
 * @throws DataKeysRequiredError when a paid request has no user key and fallback is denied
 */
export async function getUSPTOOdpApiKey(ctx: ConnectorContext, lookup?: OdpCredentialLookup): Promise<string | null> {
	const creds = lookup ?? (await resolveOdpCredentials(ctx));
	if (creds.status === 'available') {
		return creds.credentials.apiKey;
	}
	if (creds.status === 'required') {
		throw new DataKeysRequiredError('uspto');
	}
	ctx.host.logger.warn('[USPTO-ODP] USPTO_ODP_API_KEY not configured');
	return null;
}

/**
 * An upstream 401/403 on a USER-supplied key means "fix your key", not a FlowLeap
 * configuration fault — throw the typed error (routes map it to
 * `400 patent_provider_key_invalid`; a passthrough 401 would collide with the client's
 * Clerk re-sign-in handling). Any other status, or a host-key request, is a no-op.
 */
export function throwIfUserKeyRejected(lookup: OdpCredentialLookup, statusCode: number): void {
	if ((statusCode === 401 || statusCode === 403) && lookup.status === 'available' && lookup.owner === 'user') {
		throw new ProviderKeyInvalidError(
			'uspto',
			`USPTO ODP rejected the supplied API key (HTTP ${statusCode}). Check your ODP key.`,
			lookup.stored === true,
		);
	}
}

/**
 * Check if USPTO ODP API is usable for the current request (user key or host key).
 * A key the host refuses to this caller still counts as configured: the auth header
 * then answers the typed `data_keys_required`, not "not configured".
 */
export function isUSPTOOdpConfigured(lookup: OdpCredentialLookup): boolean {
	return lookup.status !== 'missing';
}

/**
 * Get API key header for USPTO ODP requests.
 *
 * Every ODP request site builds its headers through here exactly once, immediately
 * before its fetch, so this is also the ADR 0017 charging seam: a trialing request with
 * no user ODP key is about to ride the house keys — the host's `upstream_call` hook
 * charges the trial data budget (and throws the typed 429 when today's budget is spent).
 *
 * PRD 0001 S4 amends when that charge happens: a request whose client has already hung
 * up never emits its upstream call, so it stops here and is not charged.
 */
export async function getUSPTOOdpAuthHeader(ctx: ConnectorContext, lookup?: OdpCredentialLookup): Promise<Record<string, string>> {
	const { host } = ctx;
	// Observational (PRD 0001 S1): every ODP request site passes here exactly once, so
	// this is also where the completion line learns `upstream=odp`.
	host.onOutcome?.({ kind: 'upstream', upstream: 'odp' });

	const key = await getUSPTOOdpApiKey(ctx, lookup);
	if (!key) {
		throw new Error('USPTO ODP API key not configured. Set USPTO_ODP_API_KEY environment variable.');
	}
	// PRD 0001 S4: charge only what actually reaches USPTO. The fetch these headers are
	// built for is the very next statement at every call site, so this check closes the
	// whole gap between the charge and the upstream call.
	throwIfClientGone(host);
	host.onOutcome?.({ kind: 'upstream_call', office: 'uspto' });
	return {
		'x-api-key': key,
	};
}
