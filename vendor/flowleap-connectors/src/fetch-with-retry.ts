/**
 * Fetch with Retry - Shared utility for HTTP requests with rate limit handling
 *
 * Features:
 * - Automatic retry with exponential backoff for rate limits (429)
 * - Respects Retry-After header
 * - Configurable max retries and timeout
 * - Custom error classes for different error types
 *
 * Host-scoped (ADR 0019 C1): the network is `host.fetch`, the caller-gone signal
 * `host.signal()`, the log `host.logger`. The Express-facing error responses that
 * used to share this file stay in the backend (src/lib/fetch-with-retry.ts).
 */

import { abortableSleep, ClientGoneError, throwIfClientGone, withClientAbort } from './client-abort.js';
import { APIError, RateLimitError } from './errors.js';
import type { ConnectorHost } from './host.js';

export { APIError, RateLimitError, UpstreamUnavailableError } from './errors.js';

export interface FetchWithRetryOptions {
	/** Maximum number of retries for rate limits (default: 3) */
	maxRetries?: number;
	/** Base delay in ms for exponential backoff (default: 1000) */
	baseDelayMs?: number;
	/** Maximum delay cap in ms (default: 30000) */
	maxDelayMs?: number;
	/** Service name for error messages */
	service: string;
	/** Request timeout in ms (default: 60000) */
	timeoutMs?: number;
	/** Never write the upstream response body to logs (for sensitive prompts/documents) */
	redactErrorBody?: boolean;
}

/**
 * Parse retry-after header from response (seconds or HTTP date).
 */
export function parseRetryAfter(headers: Headers, now: number = Date.now()): number | undefined {
	const retryAfter = headers.get('retry-after');
	if (!retryAfter) return undefined;

	// Could be seconds or HTTP date
	const seconds = parseInt(retryAfter, 10);
	if (!isNaN(seconds)) return seconds;

	// Try parsing as date
	const date = new Date(retryAfter);
	if (!isNaN(date.getTime())) {
		return Math.max(0, Math.ceil((date.getTime() - now) / 1000));
	}

	return undefined;
}

/**
 * Fetch with automatic retry for rate limits
 *
 * @example
 * ```ts
 * const response = await fetchWithRetry('https://api.example.com/data', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ query: 'test' }),
 * }, { service: 'ExampleAPI' });
 * ```
 */
export async function fetchWithRetry(
	host: ConnectorHost,
	url: string,
	init: RequestInit,
	options: FetchWithRetryOptions
): Promise<Response> {
	const {
		maxRetries = 3,
		baseDelayMs = 1000,
		maxDelayMs = 30000,
		service,
		timeoutMs = 60000,
		redactErrorBody = false,
	} = options;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		// PRD 0001 S4: never start (or restart) an upstream attempt for a client that has
		// already hung up — the retries of abandoned requests are what sustained the
		// 2026-09-02 outage.
		throwIfClientGone(host);

		// Create abort controller for timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await host.fetch(url, {
				...init,
				// Aborted by whichever comes first: this attempt's timeout, or the client leaving.
				signal: withClientAbort(host, controller.signal),
			});

			clearTimeout(timeoutId);

			if (response.ok) {
				return response;
			}

			const errorText = await response.text();

			// Handle rate limiting (429)
			if (response.status === 429) {
				const retryAfter = parseRetryAfter(response.headers, host.now());

				if (attempt < maxRetries) {
					// Calculate delay: use retry-after header or exponential backoff
					const baseDelay = retryAfter ? retryAfter * 1000 : baseDelayMs * Math.pow(2, attempt);
					const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
					const delay = Math.min(baseDelay + jitter, maxDelayMs);

					host.logger.warn(
						`[${service}] Rate limited (429). Attempt ${attempt + 1}/${maxRetries + 1}. ` +
						`Retrying in ${Math.round(delay / 1000)}s...`
					);

					await abortableSleep(host, delay);
					continue;
				}

				// Max retries exceeded
				host.logger.error(`[${service}] Rate limit exceeded after ${maxRetries + 1} attempts`);
				throw new RateLimitError(service, retryAfter, errorText);
			}

			// Handle server errors (5xx) with retry
			if (response.status >= 500 && attempt < maxRetries) {
				const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
				host.logger.warn(
					`[${service}] Server error (${response.status}). Attempt ${attempt + 1}/${maxRetries + 1}. ` +
					`Retrying in ${Math.round(delay / 1000)}s...`
				);
				await abortableSleep(host, delay);
				continue;
			}

			// Handle other errors (don't retry)
			const loggedError = redactErrorBody
				? `[REDACTED upstream response body; ${errorText.length} characters]`
				: errorText.substring(0, 500);
			host.logger.error(`[${service}] API error (${response.status}):`, loggedError);
			throw new APIError(service, response.status, errorText);

		} catch (error) {
			clearTimeout(timeoutId);

			// Re-throw our custom errors
			if (error instanceof RateLimitError || error instanceof APIError) {
				throw error;
			}

			// PRD 0001 S4: the client is gone — from a sleep that woke early, or from the
			// combined fetch signal. Never retried, and checked before the timeout branch
			// because a client-gone abort and a timeout both surface as AbortError.
			if (error instanceof ClientGoneError) {
				throw error;
			}
			throwIfClientGone(host);

			// Handle timeout
			if (error instanceof Error && error.name === 'AbortError') {
				if (attempt < maxRetries) {
					host.logger.warn(`[${service}] Request timeout. Retrying...`);
					continue;
				}
				throw new APIError(service, 408, 'Request timeout');
			}

			// Handle network errors
			if (attempt < maxRetries) {
				const delay = baseDelayMs * Math.pow(2, attempt);
				host.logger.warn(`[${service}] Network error. Retrying in ${delay}ms...`);
				await abortableSleep(host, delay);
				continue;
			}

			throw new APIError(service, 0, error instanceof Error ? error.message : 'Network error');
		}
	}

	// This shouldn't be reached, but TypeScript needs it
	throw new APIError(service, 500, 'Unknown error');
}
