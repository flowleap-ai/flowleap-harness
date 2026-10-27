/*---------------------------------------------------------------------------------------------
 *  The OCR contract (ADR 0019 C3a): a host that stores a `mistral` credential
 *  gets OCR without implementing anything.
 *
 *  Over a fake host alone — a recorded Mistral answer behind `host.fetch`, an
 *  in-memory cache, a fixed clock, no environment, nothing from the backend:
 *  the `ocr` tool on base64 and URL input, a rejected user key, `verifyKey`,
 *  and the resolution order the IFW document reader follows (the host's own
 *  `ocr` capability, else the package client on the credential, else
 *  `ocr_unavailable`). What the harness plugin gets when it implements
 *  ConnectorHost with the firm's Mistral key.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import {
	createConnectors,
	ErrorCodes,
	officeTools,
	ProviderKeyInvalidError,
	resolveOcr,
	ToolError,
	type ToolContext,
} from '../index.js';
import { createFakeHost, hostCredentials, userCredentials } from './fake-host.js';

const FIXED_NOW = Date.UTC(2026, 9, 22, 12, 0, 0);

/** A recorded Mistral: the OCR endpoint, the models endpoint, every request logged. */
function recordedMistral(options: { status?: number } = {}) {
	const requests: Array<{ url: string; method: string; headers: Record<string, string>; body?: unknown }> = [];
	const fetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
		const url = String(input);
		requests.push({
			url,
			method: init?.method ?? 'GET',
			headers: Object.fromEntries(new Headers(init?.headers).entries()),
			body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
		});
		if (options.status) {
			return new Response('{"message":"Unauthorized"}', { status: options.status });
		}
		if (url === 'https://api.mistral.ai/v1/ocr') {
			return Response.json({
				pages: [
					{
						index: 0,
						markdown: '# Office Action\n\nClaims 1-3 are rejected under 35 U.S.C. 103.',
						images: [{ id: 'img-0.jpeg', image_base64: 'data:image/jpeg;base64,/9j/4AAQ', top_left_x: 0 }],
						dimensions: { dpi: 200, height: 2200, width: 1700 },
					},
					{ index: 1, markdown: 'Page 2', images: [], dimensions: { dpi: 200, height: 2200, width: 1700 } },
				],
				model: 'mistral-ocr-2505-completion',
				usage_info: { pages_processed: 2, doc_size_bytes: 4321 },
			});
		}
		if (url === 'https://api.mistral.ai/v1/models') {
			return Response.json({ object: 'list', data: [{ id: 'mistral-ocr-latest' }] });
		}
		if (url.startsWith('https://api.uspto.gov/api/v1/download/')) {
			return new Response(Buffer.from('%PDF-1.4 fake'), { status: 200 });
		}
		return new Response('not recorded', { status: 404 });
	};
	return { fetch, requests };
}

const ocrTool = officeTools().find((t) => t.name === 'ocr')!;

describe('OCR over a fake host with a mistral credential', () => {
	it('the ocr tool OCRs a base64 PDF: the bearer key, the data URL, the full page shape, text-only by default', async () => {
		const upstream = recordedMistral();
		const host = createFakeHost({
			fetch: upstream.fetch,
			now: FIXED_NOW,
			credentials: { mistral: hostCredentials<'mistral'>({ apiKey: 'firm-mistral-key' }) },
		});
		const connectors = createConnectors(host);
		const ctx: ToolContext = { connectors };

		const input = ocrTool.input.parse({ file: 'JVBERi0xLjQ=', filename: 'office-action.pdf' });
		const answer = (await ocrTool.handler(input, ctx)) as Record<string, unknown>;

		expect(answer).toEqual({
			success: true,
			filename: 'office-action.pdf',
			pages: [
				{
					pageNumber: 1,
					markdown: '# Office Action\n\nClaims 1-3 are rejected under 35 U.S.C. 103.',
					dimensions: { dpi: 200, height: 2200, width: 1700 },
					images: undefined,
				},
				{ pageNumber: 2, markdown: 'Page 2', dimensions: { dpi: 200, height: 2200, width: 1700 }, images: undefined },
			],
			markdown: '# Office Action\n\nClaims 1-3 are rejected under 35 U.S.C. 103.\n\n---\n\nPage 2',
			images: [],
			imageCount: 1,
			pageCount: 2,
			model: 'mistral-ocr-latest',
			processingTimeMs: 0,
			cached: false,
		});
		expect(upstream.requests).toEqual([
			{
				url: 'https://api.mistral.ai/v1/ocr',
				method: 'POST',
				headers: expect.objectContaining({ authorization: 'Bearer firm-mistral-key', 'content-type': 'application/json' }),
				body: {
					model: 'mistral-ocr-latest',
					document: { type: 'document_url', document_url: 'data:application/pdf;base64,JVBERi0xLjQ=' },
					include_image_base64: true,
				},
			},
		]);

		// The same document again, with the images: served from the host cache, no second upload.
		const withImages = (await ocrTool.handler(
			ocrTool.input.parse({ file: 'JVBERi0xLjQ=', filename: 'office-action.pdf', include_images: true }),
			ctx,
		)) as { cached: boolean; images: unknown[] };
		expect(withImages.cached).toBe(true);
		expect(withImages.images).toEqual([{ id: 'img-0.jpeg', base64: '/9j/4AAQ', mimeType: 'image/jpeg' }]);
		expect(upstream.requests).toHaveLength(1);
	});

	it('the ocr tool OCRs a public URL as document_url, and an image URL as image_url', async () => {
		const upstream = recordedMistral();
		const connectors = createConnectors(
			createFakeHost({
				fetch: upstream.fetch,
				now: FIXED_NOW,
				credentials: { mistral: hostCredentials<'mistral'>({ apiKey: 'k' }) },
			}),
		);
		const ctx: ToolContext = { connectors };

		const pdf = (await ocrTool.handler(ocrTool.input.parse({ url: 'https://example.com/spec.pdf' }), ctx)) as {
			pageCount: number;
			filename: string;
		};
		expect(pdf).toMatchObject({ pageCount: 2, filename: 'https://example.com/spec.pdf' });
		expect(upstream.requests[0].body).toMatchObject({
			document: { type: 'document_url', document_url: 'https://example.com/spec.pdf' },
		});

		await ocrTool.handler(ocrTool.input.parse({ url: 'https://example.com/figure.png' }), ctx);
		expect(upstream.requests[1].body).toMatchObject({
			document: { type: 'image_url', image_url: 'https://example.com/figure.png' },
		});
	});

	it('a 401 on the firm\'s key is ProviderKeyInvalidError for mistral: the settings card, not a host fault', async () => {
		const upstream = recordedMistral({ status: 401 });
		const connectors = createConnectors(
			createFakeHost({
				fetch: upstream.fetch,
				now: FIXED_NOW,
				credentials: { mistral: userCredentials<'mistral'>({ apiKey: 'revoked' }) },
			}),
		);
		const rejected = await ocrTool
			.handler(ocrTool.input.parse({ url: 'https://example.com/spec.pdf' }), { connectors })
			.catch((error) => error);
		expect(rejected).toBeInstanceOf(ProviderKeyInvalidError);
		expect(rejected).toMatchObject({ provider: 'mistral', stored: false, code: ErrorCodes.patent_provider_key_invalid });
		expect((rejected as Error).message).toMatch(/Mistral rejected the supplied API key \(HTTP 401\)/);
	});

	it('a host without a mistral credential answers the tool 503 SERVICE_UNAVAILABLE and uploads nothing', async () => {
		const upstream = recordedMistral();
		const connectors = createConnectors(createFakeHost({ fetch: upstream.fetch, now: FIXED_NOW }));
		const refused = await ocrTool
			.handler(ocrTool.input.parse({ url: 'https://example.com/spec.pdf' }), { connectors })
			.catch((error) => error);
		expect(refused).toBeInstanceOf(ToolError);
		expect(refused).toMatchObject({ status: 503, code: ErrorCodes.SERVICE_UNAVAILABLE });
		expect(upstream.requests).toHaveLength(0);
	});

	it('an invalid Mistral base URL answers the tool and the IFW reader 503 with the configuration message, never a missing key', async () => {
		const upstream = recordedMistral();
		const misconfigured = createConnectors(
			createFakeHost({
				fetch: upstream.fetch,
				now: FIXED_NOW,
				credentials: { mistral: hostCredentials<'mistral'>({ apiKey: 'k', baseUrl: 'http://gateway.example.com' }) },
			}),
		);
		const message = 'The Mistral base URL "http://gateway.example.com" is not allowed: use https, or http only to a host name without dots.';
		const refused = await ocrTool
			.handler(ocrTool.input.parse({ url: 'https://example.com/spec.pdf' }), { connectors: misconfigured })
			.catch((error) => error);
		expect(refused).toBeInstanceOf(ToolError);
		expect(refused).toMatchObject({ status: 503, code: ErrorCodes.SERVICE_UNAVAILABLE, message });
		await expect(misconfigured.odp.getODPDocumentText('16000001', 'DOC1')).rejects.toMatchObject({
			status: 503,
			code: ErrorCodes.ocr_unavailable,
			message,
		});
		expect(upstream.requests.filter((r) => r.url.includes('/v1/ocr'))).toHaveLength(0);
	});

	it('verifyKey is one authenticated GET /v1/models: green on 200, red with the status otherwise', async () => {
		const upstream = recordedMistral();
		const green = createConnectors(
			createFakeHost({
				fetch: upstream.fetch,
				now: FIXED_NOW,
				credentials: { mistral: userCredentials<'mistral'>({ apiKey: 'firm-mistral-key' }) },
			}),
		);
		await expect(green.ocr.verifyKey()).resolves.toEqual({ ok: true, message: 'Mistral accepted the key.' });
		expect(upstream.requests).toEqual([
			{
				url: 'https://api.mistral.ai/v1/models',
				method: 'GET',
				headers: expect.objectContaining({ authorization: 'Bearer firm-mistral-key' }),
				body: undefined,
			},
		]);
		await expect(green.ocr.isConfigured()).resolves.toBe(true);

		const red = createConnectors(
			createFakeHost({
				fetch: recordedMistral({ status: 401 }).fetch,
				now: FIXED_NOW,
				credentials: { mistral: userCredentials<'mistral'>({ apiKey: 'revoked' }) },
			}),
		);
		await expect(red.ocr.verifyKey()).resolves.toEqual({ ok: false, message: 'Mistral rejected the key (HTTP 401).' });

		const none = createConnectors(createFakeHost({ fetch: upstream.fetch, now: FIXED_NOW }));
		await expect(none.ocr.verifyKey()).resolves.toMatchObject({ ok: false });
		await expect(none.ocr.isConfigured()).resolves.toBe(false);
	});

	it('the IFW document reader resolves OCR in order: the host\'s own ocr, else the client on the credential, else none', async () => {
		const pdfOnly = async (input: string | URL) =>
			String(input).startsWith('https://api.uspto.gov/api/v1/download/')
				? new Response(Buffer.from('%PDF-1.4 fake'), { status: 200 })
				: new Response('not recorded', { status: 404 });

		// 1. The host's own OCR wins, even beside a mistral credential.
		const own = createFakeHost({
			fetch: pdfOnly,
			now: FIXED_NOW,
			credentials: { mistral: hostCredentials<'mistral'>({ apiKey: 'k' }) },
			ocr: { run: async () => ({ pageCount: 9, markdown: 'from the host', model: 'host-ocr' }) },
		});
		expect(await resolveOcr(createConnectors(own).context)).toBe(own.ocr);
		await expect(createConnectors(own).odp.getODPDocumentText('16000001', 'DOC1')).resolves.toMatchObject({
			applicationNumberText: '16000001',
			documentIdentifier: 'DOC1',
			pageCount: 9,
			markdown: 'from the host',
			model: 'host-ocr',
		});

		// 2. No host OCR: the package client on the mistral credential (the Mistral call recorded).
		const upstream = recordedMistral();
		const keyed = createConnectors(
			createFakeHost({
				fetch: upstream.fetch,
				now: FIXED_NOW,
				credentials: { mistral: hostCredentials<'mistral'>({ apiKey: 'firm-mistral-key' }) },
			}),
		);
		await expect(keyed.odp.getODPDocumentText('16000001', 'DOC1')).resolves.toEqual({
			applicationNumberText: '16000001',
			documentIdentifier: 'DOC1',
			pageCount: 2,
			markdown: '# Office Action\n\nClaims 1-3 are rejected under 35 U.S.C. 103.\n\n---\n\nPage 2',
			model: 'mistral-ocr-latest',
		});
		const ocrCall = upstream.requests.find((r) => r.url === 'https://api.mistral.ai/v1/ocr')!;
		expect(ocrCall.body).toMatchObject({
			document: { type: 'document_url', document_url: `data:application/pdf;base64,${Buffer.from('%PDF-1.4 fake').toString('base64')}` },
		});

		// 3. Neither: the existing not-configured answer.
		const none = createConnectors(createFakeHost({ fetch: pdfOnly, now: FIXED_NOW }));
		expect(await resolveOcr(none.context)).toBeUndefined();
		await expect(none.odp.getODPDocumentText('16000001', 'DOC1')).rejects.toMatchObject({
			status: 503,
			code: ErrorCodes.ocr_unavailable,
		});
	});
});
