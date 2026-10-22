/*---------------------------------------------------------------------------------------------
 *  The package contract (ADR 0019 C1): the connectors work over a fake host alone.
 *
 *  One OPS call, one ODP call and one academic call, end to end — recorded
 *  responses behind the host's `fetch`, an in-memory cache, a fixed clock, no
 *  environment, nothing from the backend. What a second host (the harness
 *  plugin) gets when it implements ConnectorHost.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	createConnectors,
	DataKeysRequiredError,
	ErrorCodes,
	OcrNotConfiguredError,
	ProviderKeyInvalidError,
	UpstreamError,
} from '../index.js';
import { createFakeHost, userCredentials } from './fake-host.js';

const FIXED_NOW = Date.UTC(2026, 9, 22, 12, 0, 0);

const biblioXml = readFileSync(new URL('../ops/__fixtures__/ep1234567-biblio.xml', import.meta.url), 'utf8');

const arxivFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <opensearch:totalResults xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">1</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/2101.00001v2</id>
    <published>2021-03-01T00:00:00Z</published>
    <title>Solid state electrolytes</title>
    <summary>An abstract.</summary>
    <author><name>Ada Lovelace</name></author>
  </entry>
</feed>`;

/** A recorded upstream: the three providers answered from memory, every request logged. */
function recordedUpstream() {
	const requests: Array<{ url: string; headers: Record<string, string> }> = [];
	const fetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
		const url = String(input);
		requests.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
		if (url === 'https://ops.epo.org/3.2/auth/accesstoken') {
			return Response.json({ access_token: 'tok-1', expires_in: 1200 });
		}
		if (url.endsWith('/published-data/publication/docdb/EP.1234567.A2/biblio')) {
			return new Response(biblioXml, {
				status: 200,
				headers: { 'x-throttling-control': 'idle (search=green:600, retrieval=green:1200)' },
			});
		}
		if (url === 'https://api.uspto.gov/api/v1/patent/applications/search') {
			return Response.json({
				count: 1,
				patentFileWrapperDataBag: [
					{ applicationNumberText: '16000001', applicationMetaData: { inventionTitle: 'Battery', patentNumber: '10765880' } },
				],
			});
		}
		if (url.startsWith('https://export.arxiv.org/api/query')) {
			return new Response(arxivFeed, { status: 200 });
		}
		return new Response('not recorded', { status: 404 });
	};
	return { fetch, requests };
}

describe('@flowleap/connectors over a fake host', () => {
	it('answers an OPS read, an ODP search and an academic search from recorded responses', async () => {
		const upstream = recordedUpstream();
		const host = createFakeHost({ fetch: upstream.fetch, now: FIXED_NOW });
		const { ops, odp, academic } = createConnectors(host);

		// EPO OPS: token mint, throttled fetch, XML decoding, the normalised biblio shape.
		const biblio = await ops.getBiblio('EP1234567A2');
		expect(biblio.ok).toBe(true);
		if (!biblio.ok) return;
		expect(biblio.cached).toBe(false);
		expect(biblio.data).toMatchObject({
			docId: 'EP1234567.A2',
			title: 'Filling material based on particulate composite',
			dates: { publication: '20020828' },
		});
		// The same read again: served from the host cache, no upstream call.
		const again = await ops.getBiblio('EP1234567A2');
		expect(again).toMatchObject({ ok: true, cached: true });

		// USPTO ODP: the house key rides the x-api-key header.
		const search = await odp.searchODPApplications({ q: 'applicationMetaData.inventionTitle:battery' });
		expect(search).toMatchObject({ ok: true, data: { count: 1 } });

		// Academic: arXiv answers, the result is cached.
		const papers = await academic.runAcademicSearch({ query: 'solid state electrolyte', sources: ['arxiv'] });
		expect(papers.ok).toBe(true);
		if (!papers.ok) return;
		expect(papers.data.papers.map((p) => p.title)).toEqual(['Solid state electrolytes']);

		// What the host saw: one token mint and one biblio fetch for OPS (the second read
		// was a cache hit), one ODP call, one arXiv call — with the host's keys on them.
		const urls = upstream.requests.map((r) => r.url);
		expect(urls).toEqual([
			'https://ops.epo.org/3.2/auth/accesstoken',
			'https://ops.epo.org/3.2/rest-services/published-data/publication/docdb/EP.1234567.A2/biblio',
			'https://api.uspto.gov/api/v1/patent/applications/search',
			expect.stringMatching(/^https:\/\/export\.arxiv\.org\/api\/query\?/),
		]);
		expect(upstream.requests[0].headers.authorization).toBe(`Basic ${Buffer.from('house-key:house-secret').toString('base64')}`);
		expect(upstream.requests[1].headers.authorization).toBe('Bearer tok-1');
		expect(upstream.requests[2].headers['x-api-key']).toBe('house-odp-key');

		// The accounting the host received: one charged upstream call per office request,
		// and the cache hit reported as such.
		expect(host.events.filter((e) => e.kind === 'upstream_call')).toEqual([
			{ kind: 'upstream_call', office: 'epo' },
			{ kind: 'upstream_call', office: 'uspto' },
		]);
		expect(host.events).toContainEqual({ kind: 'upstream', upstream: 'cache' });

		// The state the host keeps: the token under its fingerprint key, the biblio under
		// the versioned EPO key, the academic result under its md5 key.
		const keys = [...host.store.keys()];
		expect(keys.filter((k) => k.startsWith('ops:token:env:'))).toHaveLength(1);
		expect(keys).toContain('epo:v8:publication-v2:biblio:EP1234567A2');
		expect(keys.filter((k) => k.startsWith('academic-search:'))).toHaveLength(1);
	});

	it('keeps throttle and token state per instance', async () => {
		const upstream = recordedUpstream();
		const first = createConnectors(createFakeHost({ fetch: upstream.fetch, now: FIXED_NOW, noCache: true }));
		const second = createConnectors(createFakeHost({ fetch: upstream.fetch, now: FIXED_NOW, noCache: true }));

		await first.ops.getBiblio('EP1234567A2');
		await second.ops.getBiblio('EP1234567A2');

		// Each instance minted its own token: two mints, two biblio fetches.
		expect(upstream.requests.filter((r) => r.url.endsWith('/auth/accesstoken'))).toHaveLength(2);
		expect(first.ops.getThrottleSnapshot()).toEqual(second.ops.getThrottleSnapshot());
		expect(first.context.state.ops.tokens).not.toBe(second.context.state.ops.tokens);
	});

	it('maps a host that refuses its keys, and a rejected user key, to the typed envelopes', async () => {
		const upstream = recordedUpstream();
		const host = createFakeHost({ fetch: upstream.fetch, now: FIXED_NOW });
		host.setCredentials('epoOps', { status: 'required' });
		const { ops, odp } = createConnectors(host);

		const refused = await ops.getBiblio('EP1234567A2');
		expect(refused).toMatchObject({
			ok: false,
			status: 400,
			body: { error: { code: ErrorCodes.data_keys_required, provider: 'epo' } },
		});
		expect(upstream.requests).toHaveLength(0);
		await expect(ops.getAccessToken()).rejects.toBeInstanceOf(DataKeysRequiredError);

		// A user key USPTO rejects is the user's to fix, never a host fault.
		host.setCredentials('usptoOdp', userCredentials<'usptoOdp'>({ apiKey: 'bad' }, true));
		const rejecting = createConnectors(
			createFakeHost({
				fetch: async () => new Response('forbidden', { status: 403 }),
				now: FIXED_NOW,
				credentials: { usptoOdp: userCredentials<'usptoOdp'>({ apiKey: 'bad' }, true) },
			}),
		);
		const rejected = await rejecting.odp.searchODPApplications({ q: 'x' }).catch((error) => error);
		expect(rejected).toBeInstanceOf(ProviderKeyInvalidError);
		expect(rejected).toMatchObject({ provider: 'uspto', stored: true, code: ErrorCodes.patent_provider_key_invalid });
		expect(odp).toBeDefined();
	});

	it('answers the registered ocr_unavailable code when no OCR resolves on the host', async () => {
		// The IFW document reader downloads through ODP, then needs OCR: the host's own
		// `ocr` capability, else the package's Mistral client on the host's `mistral`
		// credential (ADR 0019 C3a). A host with neither (or whose own OCR has no key)
		// is a 503 with a code from the closed registry.
		expect(ErrorCodes.ocr_unavailable).toBe('ocr_unavailable');
		const pdf = async () => new Response(Buffer.from('%PDF-1.4 fake'), { status: 200 });

		const noOcr = createConnectors(createFakeHost({ fetch: pdf, now: FIXED_NOW }));
		const missing = await noOcr.odp.getODPDocumentText('16000001', 'DOC1').catch((error) => error);
		expect(missing).toBeInstanceOf(UpstreamError);
		expect(missing).toMatchObject({ status: 503, code: ErrorCodes.ocr_unavailable });

		const keyless = createConnectors(
			createFakeHost({
				fetch: pdf,
				now: FIXED_NOW,
				ocr: { run: async () => { throw new OcrNotConfiguredError(); } },
			}),
		);
		const unkeyed = await keyless.odp.getODPDocumentText('16000001', 'DOC1').catch((error) => error);
		expect(unkeyed).toMatchObject({ status: 503, code: ErrorCodes.ocr_unavailable });
	});
});
