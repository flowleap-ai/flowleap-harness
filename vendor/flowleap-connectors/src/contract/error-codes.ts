/*---------------------------------------------------------------------------------------------
 *  Closed error-code registry — ADR 0014 rule 4 (PRD 0013 T01, #269).
 *
 *  The single import site for every error-code string the /v1 contract emits.
 *  Codes are frozen contract: clients branch on `error.code` (never on message
 *  text), so a code string may NEVER change once shipped — codes may only be
 *  added. Message wording, by the same rule, is freely editable at any time.
 *
 *  Emit sites import from here instead of inlining string literals; the values
 *  below are byte-identical to what the API emitted before this module existed.
 *
 *  Not yet migrated into this registry (candidates for later PRD 0013 tickets):
 *  auth-middleware codes (`unauthorized`, `auth_failed`, `forbidden`), the
 *  PATSTAT taxonomy (`patstat_*`), billing codes, and per-route validation
 *  codes (`missing_query`, `invalid_patent_number`, …). They remain contract
 *  all the same — additions here must never collide with them.
 *  The USPTO ODP taxonomy WAS folded in (PRD 0013 T09, per the T05 flag):
 *  `odp_api_key_missing`, `odp_upstream_error`, `application_not_found`,
 *  `patent_not_found` — values byte-identical to what the lib always emitted.
 *  Note: `odp_upstream_error` is the fallback when ODP reports no code of its
 *  own; when it does, that upstream code passes through verbatim and is by
 *  nature outside this closed registry.
 *--------------------------------------------------------------------------------------------*/

export const ErrorCodes = {
	// ── Access gating ─────────────────────────────────────────────────────────
	/**
	 * 402 — no active/trialing subscription (ADR 0004). Carries `upgradeUrl` on the
	 * facade and the REST routes; over the hosted MCP transport it has none (#539).
	 */
	subscription_required: 'subscription_required',
	/**
	 * 400 — paid user, no forwarded patent-data key, server fallback denied
	 * (ADR 0008). Carries `provider`, and when stored keys are enabled
	 * `keysPageUrl` and `nextStep` (actor human, #516). Never a 402: the user
	 * already pays.
	 */
	data_keys_required: 'data_keys_required',
	/**
	 * 400 — the USER-supplied patent-data key was rejected upstream (ADR 0007).
	 * Carries `provider`. Never a passthrough 401/403 (clients map 401 to
	 * re-sign-in).
	 */
	patent_provider_key_invalid: 'patent_provider_key_invalid',
	/**
	 * 403 — the caller's subscription status does not grant a Trial Model key
	 * (ADR 0015). Carries `reason` (`not_trialing`) so the client maps it to a
	 * first-class recovery action (add your own BYO-key), like
	 * `data_keys_required`.
	 */
	trial_model_key_unavailable: 'trial_model_key_unavailable',
	/**
	 * 403 — a verified OAuth access token without the scope `patent-data`
	 * (#496). Carries `WWW-Authenticate: Bearer error="insufficient_scope"`
	 * (RFC 6750 §3.1), which makes an MCP client ask the user to consent again.
	 * Distinct from 401 `unauthorized`: the token is valid, its grant is short.
	 */
	insufficient_scope: 'insufficient_scope',

	// ── Stored Patent-Data Keys (/v1/keys/stored, ADR 0023, #515) ────────────
	/**
	 * 404 — stored keys are not enabled on this deployment: the master key
	 * (STORED_KEYS_MASTER_KEY) is absent. NOT retryable: the answer changes
	 * only when the operator sets the master key (same precedent as
	 * `endpoint_not_found` for the hosted MCP flag; a 503 in this contract
	 * means "retry"). The website shows a "not available" state. A refused
	 * save is not this code: it is `patent_provider_key_invalid` with
	 * `provider`, carrying the office's reason.
	 */
	stored_keys_not_enabled: 'stored_keys_not_enabled',
	/**
	 * 400 — the stored-key save body or office is malformed: JSON that does
	 * not parse or is too large, an office other than `epo` or `uspto`, or a
	 * missing or empty `key` (and `secret` for EPO OPS). Nothing is stored,
	 * no office is called, and the body is never logged or echoed.
	 */
	invalid_stored_key_input: 'invalid_stored_key_input',
	/**
	 * 409 — two saves of the same user and office ran at the same time and
	 * this one lost twice. Nothing of it is stored; the other save stands.
	 * Retry the save.
	 */
	stored_key_conflict: 'stored_key_conflict',

	// ── Trial data budget (ADR 0017) ─────────────────────────────────────────
	/**
	 * 429 — the trialing user's daily house-key budget is exhausted (ADR 0017).
	 * Carries `remaining: 0`, `resets_at`, `retry_after` + Retry-After. Distinct
	 * from `data_keys_required` on purpose: this resets at the next UTC day; the
	 * recovery action ("add your own free keys") is the same.
	 */
	trial_data_budget_exhausted: 'trial_data_budget_exhausted',
	/**
	 * Success-envelope WARNING (never an error status): ≥80% of today's trial
	 * data budget is used. Carries `remaining` and `resets_at` so an agent can
	 * finish its recipe and surface the BYOK nudge before the hard 429.
	 */
	trial_data_budget_low: 'trial_data_budget_low',

	// ── Rate limiting ─────────────────────────────────────────────────────────
	/** 429 — FlowLeap's own per-identity abuse limit. Carries Retry-After. */
	rate_limited: 'rate_limited',
	/** 429 — an UPSTREAM provider rate limit. Carries `service` and, when known, `retry_after` + Retry-After. */
	rate_limit_exceeded: 'rate_limit_exceeded',

	// ── Retirement (ADR 0014 rule 3) ─────────────────────────────────────────
	/**
	 * 410 — the canonical retirement code. Emitted only by the shared helper in
	 * ./retirement.ts, with optional structured `successor` and `reason`.
	 */
	endpoint_gone: 'endpoint_gone',
	/**
	 * SUPERSEDED by `endpoint_gone` — no emit site remains. Kept in the closed
	 * registry so the name is never reused with a different meaning; stale
	 * clients may still match it in old code paths.
	 */
	endpoint_retired: 'endpoint_retired',
	/**
	 * 404 — the endpoint is not switched on for this deployment: the hosted MCP
	 * server with MCP_HOSTED_ENABLED off (#494), Remote Access with
	 * REMOTE_ACCESS_ENABLED off. Not a retirement: it may exist later.
	 */
	endpoint_not_found: 'endpoint_not_found',

	// ── Upstream provider failures (unified envelope chokepoints) ─────────────
	/** 503 — transient upstream failure; retry the same request (carries `service`, optional `retry_after`). */
	upstream_unavailable: 'upstream_unavailable',
	/** 4xx/5xx passthrough — the upstream provider reported a failure. */
	upstream_error: 'upstream_error',
	/** 500 — unclassified server-side failure (fetch-with-retry catch-all). */
	server_error: 'server_error',
	/** Structured "no full text for this office/section" verdict from the fulltext router. */
	FULLTEXT_UNAVAILABLE: 'FULLTEXT_UNAVAILABLE',

	// ── USPTO ODP taxonomy (lib/uspto-odp, folded in per the T05 flag) ────────
	/** 503 — no USPTO ODP API key configured server-side and none forwarded. */
	odp_api_key_missing: 'odp_api_key_missing',
	/**
	 * 503 — `read_application_document` downloaded the IFW document but no OCR
	 * can read it: the host has no OCR capability, or its OCR has no key
	 * (the backend without MISTRAL_API_KEY). Not retryable until the host is configured.
	 */
	ocr_unavailable: 'ocr_unavailable',
	/**
	 * 4xx/5xx passthrough — ODP reported a failure without its own code.
	 * Carries `upstreamRequestIdentifier` when USPTO provided one.
	 */
	odp_upstream_error: 'odp_upstream_error',
	/** 404 — ODP has no application with that applicationNumberText. */
	application_not_found: 'application_not_found',
	/** 404 — ODP has no granted patent with that patentNumber (may be unissued, withdrawn, or not yet ingested). */
	patent_not_found: 'patent_not_found',

	// ── Tools-facade codes (/v1/tools, ADR 0013) ─────────────────────────────
	/** 422 — the tool input failed schema validation. Carries `issues`. */
	INVALID_INPUT: 'INVALID_INPUT',
	/** 404 — no tool by that name. Discovery: GET /v1/tools. */
	UNKNOWN_TOOL: 'UNKNOWN_TOOL',
	/** 422 (or upstream status) — the tool ran and failed. */
	TOOL_EXECUTION_ERROR: 'TOOL_EXECUTION_ERROR',
	/** 404 — the upstream provider has no such document. */
	NOT_FOUND: 'NOT_FOUND',
	/** 429 — upstream rate limit surfaced through a tool (legacy facade spelling). */
	RATE_LIMITED: 'RATE_LIMITED',
	/** 500 (or upstream status) — unexpected tool failure. */
	INTERNAL_ERROR: 'INTERNAL_ERROR',
	/** OCR-specific tool failure (Mistral Document AI reported an error). */
	OCR_ERROR: 'OCR_ERROR',
	/** 503 — the OCR backend is not configured/reachable. */
	SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

	// ── Activation telemetry (/v1/telemetry/activation, ADR 0019) ────────────
	/**
	 * 400 — one or more events in the batch failed the strict activation-event
	 * schema (unknown name, unknown/mistyped prop key, empty or oversized
	 * batch). Carries `issues`. The batch is all-or-nothing: nothing is stored.
	 */
	invalid_activation_event: 'invalid_activation_event',
	/**
	 * 403 — the caller is not in the `ADMIN_CLERK_USER_IDS` allowlist (ADR 0019).
	 * An unset/empty allowlist means nobody is admin, so every caller gets this.
	 */
	admin_required: 'admin_required',

	// ── Hosted Workspace (/v1/hosted/authorize, PRD 0019 H3) ─────────────────
	/**
	 * 403 — the caller has a valid session but `HOSTED_ALLOWLIST` has no entry
	 * for their Clerk user id on this workspace (`user_x` or `user_x@<name>`).
	 * An unset/empty allowlist admits nobody.
	 */
	hosted_not_allowlisted: 'hosted_not_allowlisted',

	// ── Remote Access (/v1/remote-access, agent-v2 PRD 0018 B2) ──────────────
	/**
	 * 400 — a pair request body or query is malformed: a hostId that is not a
	 * UUID, an empty or over-long label, or a proof that is not 16–256
	 * characters of hex or base64. Carries `issues` (paths and messages only;
	 * a value is never echoed, it may be a proof).
	 */
	invalid_remote_access_input: 'invalid_remote_access_input',
	/**
	 * 404 — no such pair for this account: unknown, expired, revoked, or
	 * another user's. One answer for all four, so a pairId reveals nothing.
	 */
	remote_access_pair_not_found: 'remote_access_pair_not_found',
	/** 409 — the pair was already claimed by a Viewer. Pair again on the Host. */
	remote_access_pair_already_claimed: 'remote_access_pair_already_claimed',
	/**
	 * 403 — the claim's proof does not match the offer. Carries `attemptsLeft`;
	 * the fifth failure removes the offer (`attemptsLeft: 0`, later claims 404).
	 */
	remote_access_proof_invalid: 'remote_access_proof_invalid',

	// ── Reserved (defined, NOT enforced — ADR 0014 rule 6) ───────────────────
	/**
	 * 426 — reserved for a future incompatible release: the client build is too
	 * old for this server. Defined from day one so clients can implement the
	 * branch; NO server code path emits it in PRD 0013.
	 */
	client_upgrade_required: 'client_upgrade_required',
} as const;

/** Any code from the closed registry. */
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
