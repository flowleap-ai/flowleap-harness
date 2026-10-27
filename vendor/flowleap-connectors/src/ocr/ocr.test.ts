/*---------------------------------------------------------------------------------------------
 *  Tests for the Mistral OCR client (./ocr.ts) — over a fake host alone: a
 *  recorded Mistral answer behind `host.fetch`, the host's in-memory cache, a
 *  fixed clock, no environment, no live Mistral call (#108, ADR 0019 C3a).
 *
 *  Covers: the happy path for URL and base64 inputs (exact response shape,
 *  the wire request Mistral receives, image extraction incl. data-URL
 *  stripping and both field spellings), the 24h cache (hit and store), input
 *  error mapping (missing_input / missing_filename / unsupported_file_type),
 *  Mistral error normalization (429 → RateLimitError, a user key rejected →
 *  ProviderKeyInvalidError, a host key rejected and other statuses →
 *  APIError), the not-configured error, `verifyKey`, `isOcrConfigured`, the
 *  capability metadata, and the shared input schema.
 *
 *  History: tests/lib/ocr.test.ts of the backend, against the Mistral SDK mock.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeHost, hostCredentials, userCredentials, type FakeHost } from '../__tests__/fake-host.js';
import { createContext, type ConnectorContext } from '../context.js';
import { APIError, ProviderKeyInvalidError, RateLimitError } from '../errors.js';
import {
	runOcr,
	verifyKey,
	isOcrConfigured,
	OcrInputError,
	OcrNotConfiguredError,
	OcrConfigurationError,
	OCR_CACHE_TTL,
	OCR_RESPONSE_SHAPE_VERSION,
	OCR_MODEL,
	OCR_SUPPORTED_FORMATS,
	MISTRAL_API_BASE,
	ocrInputSchema,
} from './index.js';

const FIXED_NOW = Date.UTC(2026, 9, 22, 12, 0, 0);

/** One recorded Mistral: every request logged, the next answer set by the test. */
function mistralUpstream() {
	const requests: Array<{ url: string; init: RequestInit; body: Record<string, any> | undefined }> = [];
	let answer: () => Response = () => Response.json({ pages: [] });
	const fetch = vi.fn(async (input: string | URL, init?: RequestInit): Promise<Response> => {
		const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
		requests.push({ url: String(input), init: init ?? {}, body });
		return answer();
	});
	return {
		fetch,
		requests,
		answer(next: () => Response) {
			answer = next;
		},
		/** The last request's headers as a plain object. */
		lastHeaders: () => Object.fromEntries(new Headers(requests.at(-1)?.init.headers).entries()),
	};
}

let upstream: ReturnType<typeof mistralUpstream>;
let host: FakeHost;
let ctx: ConnectorContext;

beforeEach(() => {
	upstream = mistralUpstream();
	host = createFakeHost({
		fetch: upstream.fetch,
		now: FIXED_NOW,
		credentials: { mistral: hostCredentials<'mistral'>({ apiKey: 'test-mistral-key' }) },
	});
	ctx = createContext(host);
});

describe('runOcr — happy path', () => {
	it('processes a URL-based PDF and returns the legacy response shape', async () => {
		upstream.answer(() =>
			Response.json({
				pages: [
					{ index: 0, markdown: 'Page one', dimensions: { width: 100, height: 200, dpi: 200 } },
					{ index: 1, markdown: 'Page two' },
				],
				model: 'mistral-ocr-2505-completion',
				usage_info: { pages_processed: 2, doc_size_bytes: 1234 },
			}),
		);

		const result = await runOcr(ctx, { url: 'https://example.com/spec.pdf' });

		expect(result).toEqual({
			success: true,
			filename: 'https://example.com/spec.pdf',
			pages: [
				{
					pageNumber: 1,
					markdown: 'Page one',
					dimensions: { width: 100, height: 200, dpi: 200 },
					images: undefined,
				},
				{ pageNumber: 2, markdown: 'Page two', dimensions: undefined, images: undefined },
			],
			markdown: 'Page one\n\n---\n\nPage two',
			images: [],
			imageCount: 0,
			pageCount: 2,
			model: 'mistral-ocr-latest',
			processingTimeMs: 0,
			cached: false,
		});

		// The wire call: Mistral's REST OCR endpoint, the bearer key, the document as document_url.
		expect(upstream.requests).toHaveLength(1);
		expect(upstream.requests[0].url).toBe(`${MISTRAL_API_BASE}/v1/ocr`);
		expect(upstream.requests[0].init.method).toBe('POST');
		expect(upstream.lastHeaders()).toMatchObject({
			authorization: 'Bearer test-mistral-key',
			'content-type': 'application/json',
		});
		expect(upstream.requests[0].body).toEqual({
			model: 'mistral-ocr-latest',
			document: { type: 'document_url', document_url: 'https://example.com/spec.pdf' },
			include_image_base64: true,
		});
		// Stored in the host cache for 24h, under the versioned key.
		expect(host.store.size).toBe(1);
		const [key, stored] = [...host.store.entries()][0];
		// The key carries the shape version (AGENTS.md Gotchas): the entry outlives a deploy on the backend.
		expect(key).toMatch(new RegExp(`^ocr:v${OCR_RESPONSE_SHAPE_VERSION}:[0-9a-f]{32}$`));
		expect(stored).toMatchObject({ success: true, pageCount: 2 });
		expect(OCR_CACHE_TTL).toBe(86400);
	});

	it('sends a base64 image as an image_url data URL with the right MIME type', async () => {
		upstream.answer(() => Response.json({ pages: [{ markdown: 'A figure' }] }));

		await runOcr(ctx, { file: 'QUJDRA==', filename: 'figure-1.PNG' });

		expect(upstream.requests[0].body).toEqual({
			model: 'mistral-ocr-latest',
			document: { type: 'image_url', image_url: 'data:image/png;base64,QUJDRA==' },
			include_image_base64: true,
		});
	});

	it('sends a base64 PDF as a document_url data URL', async () => {
		upstream.answer(() => Response.json({ pages: [{ markdown: 'Spec' }] }));

		await runOcr(ctx, { file: 'JVBERi0=', filename: 'spec.pdf' });

		expect(upstream.requests[0].body?.document).toEqual({
			type: 'document_url',
			document_url: 'data:application/pdf;base64,JVBERi0=',
		});
	});

	it('sends a URL-based image as image_url (not document_url)', async () => {
		upstream.answer(() => Response.json({ pages: [] }));

		await runOcr(ctx, { url: 'https://example.com/drawing.jpg' });

		expect(upstream.requests[0].body?.document).toEqual({
			type: 'image_url',
			image_url: 'https://example.com/drawing.jpg',
		});
	});

	it('extracts images, stripping data-URL prefixes and accepting either field spelling', async () => {
		upstream.answer(() =>
			Response.json({
				pages: [
					{
						markdown: 'With images',
						images: [
							{ id: 'img-a', image_base64: 'data:image/jpeg;base64,QUJD' },
							{ imageBase64: 'REVG', mimeType: 'image/png' },
							{ id: 'no-data', image_base64: null }, // no base64 payload → skipped
						],
					},
				],
			}),
		);

		const result = await runOcr(ctx, {
			url: 'https://example.com/figures.pdf',
			include_images: true,
		});

		const expectedImages = [
			{ id: 'img-a', base64: 'QUJD', mimeType: 'image/jpeg' },
			{ id: 'img-1', base64: 'REVG', mimeType: 'image/png' },
		];
		expect(result.images).toEqual(expectedImages);
		expect(result.pages[0].images).toEqual(expectedImages);
		expect(result.imageCount).toBe(2);
	});

	it('is text-only by default: images stripped, imageCount reports them, full result cached', async () => {
		upstream.answer(() =>
			Response.json({
				pages: [
					{
						markdown: 'With images',
						images: [{ id: 'img-a', image_base64: 'data:image/jpeg;base64,QUJD' }],
					},
				],
			}),
		);

		const result = await runOcr(ctx, { url: 'https://example.com/figures.pdf' });

		expect(result.images).toEqual([]);
		expect(result.pages[0].images).toBeUndefined();
		expect(result.imageCount).toBe(1);
		expect(result.markdown).toBe('With images');
		// The cache keeps the FULL image-laden response, so a later
		// include_images call costs no second OCR.
		const stored = [...host.store.values()][0] as { images: unknown };
		expect(stored.images).toEqual([{ id: 'img-a', base64: 'QUJD', mimeType: 'image/jpeg' }]);
	});

	it('runs without a cache on the host', async () => {
		const noCache = createContext(
			createFakeHost({
				fetch: upstream.fetch,
				now: FIXED_NOW,
				noCache: true,
				credentials: { mistral: hostCredentials<'mistral'>({ apiKey: 'k' }) },
			}),
		);
		upstream.answer(() => Response.json({ pages: [{ markdown: 'Once' }] }));
		await runOcr(noCache, { url: 'https://example.com/a.pdf' });
		await runOcr(noCache, { url: 'https://example.com/a.pdf' });
		expect(upstream.requests).toHaveLength(2);
	});
});

describe('runOcr — cache', () => {
	it('returns the cached result with cached: true and zero processing time, no upstream call', async () => {
		const cachedResponse = {
			success: true,
			filename: 'https://example.com/cached.pdf',
			pages: [],
			markdown: '',
			images: [],
			pageCount: 0,
			model: 'mistral-ocr-latest',
			processingTimeMs: 1234,
		};
		upstream.answer(() => Response.json({ pages: [{ markdown: 'fresh' }] }));
		await runOcr(ctx, { url: 'https://example.com/cached.pdf' });
		const [key] = [...host.store.keys()];
		host.store.set(key, cachedResponse);

		const result = await runOcr(ctx, { url: 'https://example.com/cached.pdf' });

		expect(result).toEqual({
			...cachedResponse,
			cached: true,
			processingTimeMs: 0,
			imageCount: 0,
		});
		expect(upstream.requests).toHaveLength(1);
	});

	it('a cache hit honors include_images against the stored full response', async () => {
		upstream.answer(() =>
			Response.json({
				pages: [{ markdown: 'Cached', images: [{ id: 'img-a', image_base64: 'QUJD', mime_type: 'image/jpeg' }] }],
			}),
		);
		const storedImage = { id: 'img-a', base64: 'QUJD', mimeType: 'image/jpeg' };
		await runOcr(ctx, { url: 'https://example.com/cached.pdf' });

		const textOnly = await runOcr(ctx, { url: 'https://example.com/cached.pdf' });
		expect(textOnly.cached).toBe(true);
		expect(textOnly.images).toEqual([]);
		expect(textOnly.pages[0].images).toBeUndefined();
		expect(textOnly.imageCount).toBe(1);

		const withImages = await runOcr(ctx, {
			url: 'https://example.com/cached.pdf',
			include_images: true,
		});
		expect(withImages.cached).toBe(true);
		expect(withImages.images).toEqual([storedImage]);
		expect(withImages.pages[0].images).toEqual([storedImage]);
		expect(upstream.requests).toHaveLength(1);
	});

	it('a base64 file is keyed by its content hash, not its name', async () => {
		upstream.answer(() => Response.json({ pages: [{ markdown: 'Same bytes' }] }));
		await runOcr(ctx, { file: 'JVBERi0=', filename: 'first.pdf' });
		const again = await runOcr(ctx, { file: 'JVBERi0=', filename: 'second.pdf' });
		expect(again.cached).toBe(true);
		expect(upstream.requests).toHaveLength(1);
	});
});

describe('runOcr — input errors (OcrInputError with stable codes)', () => {
	it('neither file nor url → missing_input', async () => {
		await expect(runOcr(ctx, {})).rejects.toMatchObject({
			name: 'OcrInputError',
			code: 'missing_input',
			message: 'Either "file" (base64) or "url" is required',
		});
	});

	it('file without filename → missing_filename', async () => {
		await expect(runOcr(ctx, { file: 'QUJD' })).rejects.toMatchObject({
			code: 'missing_filename',
			message: '"filename" is required when providing base64 file',
		});
	});

	it('unsupported extension → unsupported_file_type, nothing sent', async () => {
		await expect(runOcr(ctx, { url: 'https://example.com/notes.txt' })).rejects.toMatchObject({
			code: 'unsupported_file_type',
		});
		expect(upstream.requests).toHaveLength(0);
	});

	it('OcrInputError is an Error subclass', async () => {
		await expect(runOcr(ctx, {})).rejects.toBeInstanceOf(OcrInputError);
	});
});

describe('runOcr — Mistral error normalization', () => {
	it('429 → RateLimitError with the Retry-After honoured', async () => {
		upstream.answer(() => new Response('rate limit exceeded', { status: 429, headers: { 'retry-after': '7' } }));
		const error = await runOcr(ctx, { url: 'https://example.com/a.pdf' }).catch((e) => e);
		expect(error).toBeInstanceOf(RateLimitError);
		expect(error).toMatchObject({ service: 'Mistral', retryAfter: 7 });
		expect(error.message).toContain('rate limit exceeded');
	});

	it('a 401 on a USER-owned key → ProviderKeyInvalidError for mistral (stored flag carried)', async () => {
		host.setCredentials('mistral', userCredentials<'mistral'>({ apiKey: 'bad' }, true));
		upstream.answer(() => new Response('Unauthorized', { status: 401 }));
		const error = await runOcr(ctx, { url: 'https://example.com/a.pdf' }).catch((e) => e);
		expect(error).toBeInstanceOf(ProviderKeyInvalidError);
		expect(error).toMatchObject({ provider: 'mistral', stored: true, code: 'patent_provider_key_invalid' });
	});

	it('a 401 on the HOST key is a host fault: APIError 401, not a key the user must fix', async () => {
		upstream.answer(() => new Response('Unauthorized', { status: 401 }));
		const error = await runOcr(ctx, { url: 'https://example.com/a.pdf' }).catch((e) => e);
		expect(error).toBeInstanceOf(APIError);
		expect(error).toMatchObject({ service: 'Mistral', statusCode: 401 });
	});

	it('other HTTP failures → APIError with the upstream status and a bounded body excerpt', async () => {
		upstream.answer(() => new Response('x'.repeat(2000), { status: 502 }));
		const error = await runOcr(ctx, { url: 'https://example.com/b.pdf' }).catch((e) => e);
		expect(error).toBeInstanceOf(APIError);
		expect((error as APIError).statusCode).toBe(502);
		expect(error.message.length).toBeLessThan(600);
	});

	it('a network failure propagates raw', async () => {
		const weird = new Error('socket hangup');
		upstream.answer(() => {
			throw weird;
		});
		await expect(runOcr(ctx, { url: 'https://example.com/c.pdf' })).rejects.toBe(weird);
	});

	it('no mistral credential → OcrNotConfiguredError before anything is uploaded', async () => {
		host.setCredentials('mistral', { status: 'missing' });
		await expect(runOcr(ctx, { url: 'https://example.com/d.pdf' })).rejects.toBeInstanceOf(OcrNotConfiguredError);
		expect(upstream.requests).toHaveLength(0);
	});

	it('an empty cache miss plus a failed call caches nothing', async () => {
		upstream.answer(() => new Response('boom', { status: 500 }));
		await runOcr(ctx, { url: 'https://example.com/e.pdf' }).catch(() => undefined);
		expect(host.store.size).toBe(0);
	});
});

/** The test context with the Mistral credential replaced. */
function withMistral(credentials: { apiKey: string; baseUrl?: string }): ConnectorContext {
	host = createFakeHost({ fetch: upstream.fetch, now: FIXED_NOW, credentials: { mistral: hostCredentials<'mistral'>(credentials) } });
	return createContext(host);
}

describe('runOcr — the base URL from the credential', () => {
	it('calls the credential\'s baseUrl, a trailing slash dropped, with the same key and body', async () => {
		upstream.answer(() => Response.json({ pages: [{ index: 0, markdown: 'gateway' }] }));
		const gateway = withMistral({ apiKey: 'virtual-key', baseUrl: 'http://flowleap-gateway:4000/' });
		const result = await runOcr(gateway, { url: 'https://example.com/spec.pdf' });
		expect(result.markdown).toBe('gateway');
		expect(upstream.requests[0].url).toBe('http://flowleap-gateway:4000/v1/ocr');
		expect(upstream.lastHeaders()).toMatchObject({ authorization: 'Bearer virtual-key' });
		expect(upstream.requests[0].body).toMatchObject({ model: OCR_MODEL, include_image_base64: true });
	});

	it('accepts an https base with a path', async () => {
		await runOcr(withMistral({ apiKey: 'k', baseUrl: 'https://gateway.example.com/mistral' }), { url: 'https://example.com/a.pdf' });
		expect(upstream.requests[0].url).toBe('https://gateway.example.com/mistral/v1/ocr');
	});

	it.each([
		['not a URL', 'gateway:4000', 'is not allowed'],
		['an unparsable value', 'http://', 'is not a valid URL'],
		['http to a dotted host name', 'http://gateway.example.com', 'is not allowed'],
		['http to an IP address', 'http://10.0.0.5:4000', 'is not allowed'],
		['another scheme', 'ftp://flowleap-gateway', 'is not allowed'],
		['user info', 'https://user:secret@gateway.example.com', 'must not contain user info'],
		['a query', 'https://gateway.example.com?x=1', 'must not contain user info, a query'],
	])('%s → OcrConfigurationError before anything is sent, never the default base', async (_case, baseUrl, message) => {
		const bad = withMistral({ apiKey: 'k', baseUrl });
		const error = await runOcr(bad, { url: 'https://example.com/a.pdf' }).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(OcrConfigurationError);
		expect(error).not.toBeInstanceOf(OcrNotConfiguredError);
		expect((error as Error).message).toContain(message);
		expect(upstream.requests).toHaveLength(0);
	});
});

describe('verifyKey — the settings-card test call', () => {
	it('GETs /v1/models with the bearer key and answers ok', async () => {
		upstream.answer(() => Response.json({ object: 'list', data: [] }));
		await expect(verifyKey(ctx)).resolves.toEqual({ ok: true, message: 'Mistral accepted the key.' });
		expect(upstream.requests[0].url).toBe(`${MISTRAL_API_BASE}/v1/models`);
		expect(upstream.requests[0].init.method).toBe('GET');
		expect(upstream.lastHeaders()).toMatchObject({ authorization: 'Bearer test-mistral-key' });
	});

	it('a credential store that throws is a red verdict with the reason, never a throw', async () => {
		// The harness reads the key from its credential store, which can fail (a locked
		// keychain): the settings card still gets a red card, not an exception.
		(host as { credentials: FakeHost['credentials'] }).credentials = async () => {
			throw new Error('keychain locked');
		};
		await expect(verifyKey(ctx)).resolves.toEqual({
			ok: false,
			message: 'The Mistral API key could not be read: keychain locked',
		});
		expect(upstream.requests).toHaveLength(0);
	});

	it('a rejected key is a red verdict with the status, never a throw', async () => {
		upstream.answer(() => new Response('Unauthorized', { status: 401 }));
		await expect(verifyKey(ctx)).resolves.toEqual({ ok: false, message: 'Mistral rejected the key (HTTP 401).' });
	});

	it('no key, a rate limit, another status and a network failure are each a red verdict with a reason', async () => {
		host.setCredentials('mistral', { status: 'missing' });
		await expect(verifyKey(ctx)).resolves.toMatchObject({ ok: false, message: expect.stringContaining('No Mistral API key') });
		expect(upstream.requests).toHaveLength(0);

		host.setCredentials('mistral', hostCredentials<'mistral'>({ apiKey: 'k' }));
		upstream.answer(() => new Response('', { status: 429 }));
		await expect(verifyKey(ctx)).resolves.toMatchObject({ ok: false, message: expect.stringContaining('rate limiting') });

		upstream.answer(() => new Response('', { status: 503 }));
		await expect(verifyKey(ctx)).resolves.toMatchObject({ ok: false, message: expect.stringContaining('HTTP 503') });

		upstream.answer(() => {
			throw new Error('ENOTFOUND api.mistral.ai');
		});
		await expect(verifyKey(ctx)).resolves.toMatchObject({ ok: false, message: expect.stringContaining('ENOTFOUND') });
	});
});

describe('verifyKey — through a baseUrl', () => {
	it('POSTs one 1x1 PNG page to <base>/v1/ocr, since a gateway key allows no /v1/models', async () => {
		const gateway = withMistral({ apiKey: 'virtual-key', baseUrl: 'http://flowleap-gateway:4000' });
		await expect(verifyKey(gateway)).resolves.toEqual({ ok: true, message: 'Mistral accepted the key.' });
		expect(upstream.requests).toHaveLength(1);
		expect(upstream.requests[0].url).toBe('http://flowleap-gateway:4000/v1/ocr');
		expect(upstream.requests[0].init.method).toBe('POST');
		expect(upstream.lastHeaders()).toMatchObject({ authorization: 'Bearer virtual-key', 'content-type': 'application/json' });
		expect(upstream.requests[0].body).toEqual({
			model: OCR_MODEL,
			document: { type: 'image_url', image_url: expect.stringMatching(/^data:image\/png;base64,/) },
		});
	});

	it('an explicit https://api.mistral.ai base keeps the free GET /v1/models', async () => {
		await verifyKey(withMistral({ apiKey: 'k', baseUrl: 'https://api.mistral.ai/' }));
		expect(upstream.requests[0].url).toBe(`${MISTRAL_API_BASE}/v1/models`);
		expect(upstream.requests[0].init.method).toBe('GET');
	});

	it('an invalid baseUrl is a red verdict naming the base URL, and nothing is sent', async () => {
		await expect(verifyKey(withMistral({ apiKey: 'k', baseUrl: 'http://gateway.example.com' }))).resolves.toEqual({
			ok: false,
			message: 'The Mistral base URL "http://gateway.example.com" is not allowed: use https, or http only to a host name without dots.',
		});
		expect(upstream.requests).toHaveLength(0);
	});

	it('a gateway that rejects the key is a red verdict with the status', async () => {
		upstream.answer(() => new Response('{}', { status: 401 }));
		await expect(verifyKey(withMistral({ apiKey: 'k', baseUrl: 'http://flowleap-gateway:4000' }))).resolves.toEqual({
			ok: false,
			message: 'Mistral rejected the key (HTTP 401).',
		});
	});
});

describe('capability metadata', () => {
	it('isOcrConfigured tracks the Mistral credential, or the host\'s own OCR', async () => {
		await expect(isOcrConfigured(ctx)).resolves.toBe(true);
		host.setCredentials('mistral', { status: 'missing' });
		await expect(isOcrConfigured(ctx)).resolves.toBe(false);
		const ownOcr = createContext(
			createFakeHost({ ocr: { run: async () => ({ pageCount: 0, markdown: '', model: 'x' }) } }),
		);
		await expect(isOcrConfigured(ownOcr)).resolves.toBe(true);
	});

	it('exposes the model and the supported formats in health-probe order', () => {
		expect(OCR_MODEL).toBe('mistral-ocr-latest');
		expect([...OCR_SUPPORTED_FORMATS]).toEqual([
			'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'docx', 'pptx',
		]);
	});
});

describe('ocrInputSchema — the shared validation source', () => {
	it('accepts a url-only request and strips unknown keys', () => {
		const parsed = ocrInputSchema.parse({ url: 'https://example.com/a.pdf', extra: 'nope' });
		expect(parsed).toEqual({ url: 'https://example.com/a.pdf' });
	});

	it('accepts file + filename', () => {
		expect(ocrInputSchema.safeParse({ file: 'QUJD', filename: 'a.pdf' }).success).toBe(true);
	});

	it('rejects an empty request on the file path with the legacy message', () => {
		const result = ocrInputSchema.safeParse({});
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]).toMatchObject({
			path: ['file'],
			message: 'Either "file" (base64) or "url" is required',
		});
	});

	it('empty-string file behaves like an absent file (legacy missing_input path)', () => {
		const result = ocrInputSchema.safeParse({ file: '' });
		expect(result.success).toBe(false);
		expect(result.error?.issues[0].message).toBe('Either "file" (base64) or "url" is required');
	});

	it('rejects file without filename on the filename path with the legacy message', () => {
		const result = ocrInputSchema.safeParse({ file: 'QUJD' });
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]).toMatchObject({
			path: ['filename'],
			message: '"filename" is required when providing base64 file',
		});
	});

	it('rejects a malformed url', () => {
		const result = ocrInputSchema.safeParse({ url: 'not a url' });
		expect(result.success).toBe(false);
		expect(result.error?.issues[0].path).toEqual(['url']);
	});
});
