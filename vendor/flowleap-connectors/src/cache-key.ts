import crypto from 'node:crypto';

/**
 * Generate cache key from endpoint and params: `<endpoint>:<md5 of the JSON params>`.
 * Byte-identical to the backend's historical `getCacheKey`, so entries written
 * before the extraction keep their keys.
 */
export function getCacheKey(endpoint: string, params: unknown): string {
	const hash = crypto.createHash('md5').update(JSON.stringify(params)).digest('hex');
	return `${endpoint}:${hash}`;
}
