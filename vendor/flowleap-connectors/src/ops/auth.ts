import { createHash } from "node:crypto";
import type { ConnectorContext, OpsTokenData } from "../context.js";
import { APIError, DataKeysRequiredError, ProviderKeyInvalidError } from "../errors.js";
import { fetchWithRetry } from "../fetch-with-retry.js";
import type { CredentialLookup } from "../host.js";

/**
 * Access-token cache. One entry per credential, keyed by a fingerprint of the
 * credential itself: 'env:<sha256(key:secret)>' for the host-owned
 * EPO_CLIENT_ID/SECRET pair, 'user:<sha256(key:secret)>' for user-supplied
 * credentials (issue #30) — the fingerprint keys the cache so a changed secret
 * can never reuse a stale token, and the secret itself is never stored, only
 * the short-lived access token OPS minted from it.
 *
 * Two layers (issue #66): the instance's in-memory map (`ctx.state.ops.tokens`),
 * then the host cache under ops:token:* so restarts (and any future second
 * instance) reuse a live token instead of re-authenticating against EPO. Host
 * cache entries carry the token's own remaining lifetime as TTL; both layers
 * refuse a token inside the expiry safety margin. With no host cache, behavior
 * is exactly the memory-only story.
 */

const CACHE_KEY_PREFIX = "ops:token:";

/** Refuse tokens this close to expiry — a request in flight must not outlive them. */
const EXPIRY_MARGIN_MS = 30_000;

function isUsable(token: OpsTokenData | null | undefined, now: number): token is OpsTokenData {
  return !!token && token.expiry_time > now + EXPIRY_MARGIN_MS;
}

/** Cap user-token entries so the cache can't grow unboundedly (tokens are ~20 min anyway). */
const MAX_CACHE_ENTRIES = 500;

/** Test hook: drop all cached tokens of this instance. */
export function clearOpsTokenCache(ctx: ConnectorContext): void {
  ctx.state.ops.tokens.clear();
}

/** Env-credential entries share this key prefix — evictIfNeeded protects them by it. */
const ENV_KEY_PREFIX = "env:";

/**
 * Fingerprint BOTH credential paths, not just the user one.
 *
 * The env path used to be the constant "env", so rotating EPO_CLIENT_ID/SECRET
 * left the token minted from the OLD secret cached — in Redis for its full
 * ~20 min TTL. Rotating to a wrong value therefore looked perfectly healthy
 * until the cached token expired, and the failure then arrived with no deploy
 * and nothing to correlate it against (observed in production 2026-08-27).
 * Hashing the credential makes the cache key change the moment the credential
 * does, so a rotation invalidates the entry instead of outliving it.
 *
 * The secret is never stored, only hashed; the 'env:' / 'user:' prefixes keep
 * the two provenances distinguishable in Redis (docs/REDIS_OPERATIONS.md).
 */
function cacheKeyFor(userOwned: boolean, key: string, secret: string): string {
  return (userOwned ? "user:" : ENV_KEY_PREFIX) + credentialFingerprint(key, secret);
}

/**
 * The stable identity of one EPO OPS credential pair: sha256 of `key:secret`, never the
 * secret itself. Extracted from {@link cacheKeyFor} (behaviour identical) so the throttle
 * module can scope its per-credential state on exactly the identity this token cache keys
 * on — one credential, one token, one throttle scope (PRD 0001 S3).
 */
export function credentialFingerprint(key: string, secret: string): string {
  return createHash("sha256").update(`${key}:${secret}`).digest("hex");
}

function evictIfNeeded(tokenCache: Map<string, OpsTokenData>): void {
  if (tokenCache.size < MAX_CACHE_ENTRIES) {
    return;
  }
  // Maps iterate in insertion order — drop the oldest non-env entry. Env entries
  // stay protected: they are shared by every keyless caller, so evicting one
  // costs an EPO auth round-trip for all of them. Matched by PREFIX because the
  // env key is now a credential fingerprint rather than the literal "env"; each
  // rotation leaves one more env entry behind, and rotations are rare enough
  // that they cannot crowd out the cap.
  for (const cacheKey of tokenCache.keys()) {
    if (!cacheKey.startsWith(ENV_KEY_PREFIX)) {
      tokenCache.delete(cacheKey);
      return;
    }
  }
}

/** The EPO OPS credentials resolved for one request, with their provenance. */
export type EpoCredentialLookup = CredentialLookup<"epoOps">;

/**
 * Resolve the EPO OPS credentials for the current call through the host.
 *
 * The host answers with the user's keys (forwarded on the request, or the stored key the
 * key-resolution step put there, ADR 0023 / #518), its own key pair, or a refusal.
 *
 * ADR 0008: with no user EPO key, the host's own pair is a trial-only feature on the
 * backend. When the host refuses it (`required`: a paid `active` subscription), throw
 * {@link DataKeysRequiredError} (mapped to `400 data_keys_required`) rather than riding the
 * host's OPS credentials.
 */
export async function resolveEpoCredentials(ctx: ConnectorContext): Promise<EpoCredentialLookup> {
  const lookup = await ctx.host.credentials("epoOps");
  if (lookup.status === "required") {
    throw new DataKeysRequiredError("epo");
  }
  return lookup;
}

/**
 * Get an EPO OPS access token via the OAuth2 client-credentials exchange.
 *
 * Credentials resolve through the host (see {@link resolveEpoCredentials}); a caller that
 * has already resolved them for this request passes the lookup. A rejected USER credential
 * throws {@link ProviderKeyInvalidError} (mapped to `400 patent_provider_key_invalid`),
 * never a generic auth error; for a stored key the error is marked `stored`, so the
 * envelope sends the human to the keys page.
 */
export async function getAccessToken(
  ctx: ConnectorContext,
  lookup?: EpoCredentialLookup,
): Promise<string> {
  const { host } = ctx;
  const now = host.now();

  const creds = lookup ?? (await resolveEpoCredentials(ctx));
  if (creds.status !== "available") {
    throw new Error("Missing EPO_CLIENT_ID or EPO_CLIENT_SECRET environment variables");
  }
  const userOwned = creds.owner === "user";
  const key = creds.credentials.consumerKey;
  const secret = creds.credentials.consumerSecret;

  if (!key || !secret) {
    throw new Error("Missing EPO_CLIENT_ID or EPO_CLIENT_SECRET environment variables");
  }

  const tokenCache = ctx.state.ops.tokens;
  const cacheKey = cacheKeyFor(userOwned, key, secret);

  // Memory first (fast path), then the host cache (survives restarts).
  const cached = tokenCache.get(cacheKey);
  if (isUsable(cached, now)) {
    return cached.access_token;
  }

  const persisted = await host.cache?.get<OpsTokenData>(CACHE_KEY_PREFIX + cacheKey);
  if (isUsable(persisted, now)) {
    evictIfNeeded(tokenCache);
    tokenCache.set(cacheKey, persisted);
    return persisted.access_token;
  }

  const authString = Buffer.from(`${key}:${secret}`).toString("base64");

  let response: Response;
  try {
    // fetchWithRetry retries transient failures (5xx/network) but throws APIError
    // immediately on 4xx, so a bad credential never burns retries.
    response = await fetchWithRetry(
      host,
      "https://ops.epo.org/3.2/auth/accesstoken",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${authString}`,
        },
        body: "grant_type=client_credentials",
      },
      { service: "EPO Auth", maxRetries: 2 },
    );
  } catch (err) {
    // OPS answers 400/401/403 for a bad consumer key/secret. For USER credentials that is
    // a "fix your keys" condition, not a server fault — surface it as the typed error.
    if (
      userOwned &&
      err instanceof APIError &&
      (err.statusCode === 400 || err.statusCode === 401 || err.statusCode === 403)
    ) {
      throw new ProviderKeyInvalidError(
        "epo",
        `EPO OPS rejected the supplied consumer key/secret (HTTP ${err.statusCode}). Check your OPS credentials.`,
        creds.stored === true,
      );
    }
    throw err;
  }

  const data = await response.json() as { access_token: string; expires_in: number };

  const tokenData: OpsTokenData = {
    access_token: data.access_token,
    expires_in: data.expires_in,
    expiry_time: now + data.expires_in * 1000,
  };

  evictIfNeeded(tokenCache);
  tokenCache.set(cacheKey, tokenData);
  // TTL = the token's own remaining lifetime; a host cache degrades to a no-op
  // (never throws) when its shared tier is unavailable.
  await host.cache?.set(CACHE_KEY_PREFIX + cacheKey, tokenData, Math.max(1, data.expires_in));

  return data.access_token;
}
