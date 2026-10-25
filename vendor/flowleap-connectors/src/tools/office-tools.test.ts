/*---------------------------------------------------------------------------------------------
 *  The office tools over a fake host alone (ADR 0019 C2a): what the harness
 *  plugin gets when it registers `officeTools()` and runs a handler over a
 *  ToolContext built from its own ConnectorHost. No environment, no backend,
 *  no network: a recorded OPS upstream behind the host's fetch.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createConnectors, ErrorCodes, evidenceAnchor, evidenceAnchorLabel, evidenceSource, officeTools, ToolError, toolInputJsonSchema, type ToolContext } from '../index.js';
import { createFakeHost } from '../__tests__/fake-host.js';

const FIXED_NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const fixture = (name: string) => readFileSync(new URL(`../ops/__fixtures__/${name}`, import.meta.url), 'utf8');
const biblioXml = fixture('ep1234567-biblio.xml');
const b1BiblioXml = fixture('ep1234567-b1-biblio.xml');
const b1ClaimsXml = fixture('ep1234567-b1-claims.xml');
/** A two-paragraph English description in the OPS full-text envelope (no recorded fixture holds one). */
const b1DescriptionXml =
	'<?xml version="1.0" encoding="UTF-8"?><ops:world-patent-data xmlns="http://www.epo.org/exchange" xmlns:ops="http://ops.epo.org">' +
	'<ftxt:fulltext-documents xmlns="http://www.epo.org/fulltext" xmlns:ftxt="http://www.epo.org/fulltext"><ftxt:fulltext-document system="ops.epo.org" fulltext-format="text-only">' +
	'<bibliographic-data><publication-reference data-format="docdb"><document-id><country>EP</country><doc-number>1234567</doc-number><kind>B1</kind></document-id></publication-reference></bibliographic-data>' +
	'<description lang="EN"><p>The invention relates to a filling material.</p><p>The composite has an average particle size of 20 to 50 µm.</p></description>' +
	'</ftxt:fulltext-document></ftxt:fulltext-documents></ops:world-patent-data>';

/** The OPS token mint and the recorded EP1234567 documents; everything else is a 404. */
function recordedOps() {
	const urls: string[] = [];
	const recorded: Record<string, string> = {
		'/published-data/publication/docdb/EP.1234567.A2/biblio': biblioXml,
		'/published-data/publication/docdb/EP.1234567.B1/biblio': b1BiblioXml,
		'/published-data/publication/docdb/EP.1234567.B1/abstract': b1BiblioXml,
		'/published-data/publication/docdb/EP.1234567.B1/claims': b1ClaimsXml,
		'/published-data/publication/docdb/EP.1234567.B1/description': b1DescriptionXml,
	};
	const fetch = async (input: string | URL): Promise<Response> => {
		const url = String(input);
		urls.push(url);
		if (url === 'https://ops.epo.org/3.2/auth/accesstoken') {
			return Response.json({ access_token: 'tok-1', expires_in: 1200 });
		}
		const body = Object.entries(recorded).find(([path]) => url.endsWith(path))?.[1];
		if (body !== undefined) {
			return new Response(body, {
				status: 200,
				headers: { 'x-throttling-control': 'idle (search=green:600, retrieval=green:1200)' },
			});
		}
		return new Response('not recorded', { status: 404 });
	};
	return { fetch, urls };
}

function contextOver(fetch: ReturnType<typeof recordedOps>['fetch']): ToolContext {
	return { connectors: createConnectors(createFakeHost({ fetch, now: FIXED_NOW })) };
}

const byName = new Map(officeTools().map((definition) => [definition.name, definition]));

describe('officeTools()', () => {
	it('lists the 34 office tools once each, every one with its credential, title and an object schema', () => {
		const tools = officeTools();
		expect(tools).toHaveLength(34);
		expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
		for (const definition of tools) {
			expect(definition.description.length, definition.name).toBeGreaterThan(20);
			expect(['epoOps', 'usptoOdp', 'semanticScholar', 'mistral', 'none'], definition.name).toContain(definition.access);
			expect(definition.annotations, definition.name).toMatchObject({ readOnlyHint: true, destructiveHint: false });
			expect(definition.annotations?.title.trim().length, definition.name).toBeGreaterThan(0);
			expect(toolInputJsonSchema(definition), definition.name).toMatchObject({ type: 'object' });
		}
	});

	it('keeps the backend tool names, in the backend catalog order', () => {
		expect(officeTools().map((t) => t.name)).toEqual([
			'search_patents', 'get_search_syntax', 'search_register',
			'get_bibliography', 'get_abstract', 'get_claims', 'get_description', 'get_fulltext',
			'get_patent_family', 'get_legal_status', 'get_register_events', 'get_register_biblio', 'get_citations',
			'convert_patent_number', 'get_continuity',
			'get_transactions', 'get_assignments', 'get_foreign_priority', 'get_patent_term_adjustment', 'get_attorney',
			'get_application_documents', 'read_application_document',
			'get_patent_summary', 'compare_patents', 'get_prosecution_timeline', 'get_patent_term',
			'search_uspto_portfolio_by_customer_number',
			'ocr',
			'get_us_grant', 'get_us_application', 'get_family',
			'search_academic', 'search_npl', 'get_npl_work',
		]);
	});

	it('names the credential each tool spends', () => {
		const access = (name: string) => byName.get(name)?.access;
		expect(access('get_bibliography')).toBe('epoOps');
		expect(access('get_us_grant')).toBe('usptoOdp');
		expect(access('search_academic')).toBe('semanticScholar');
		expect(access('search_npl')).toBe('none');
		expect(access('get_search_syntax')).toBe('none');
		// OCR spends the host's own Mistral key (ADR 0019 C3a).
		expect(access('ocr')).toBe('mistral');
	});

	it('runs a pure tool with no host call at all', async () => {
		const syntax = byName.get('get_search_syntax')!;
		const input = syntax.input.parse({});
		const answer = (await syntax.handler(input, contextOver(async () => new Response('', { status: 500 })))) as {
			provider: string;
		};
		expect(answer.provider).toBe('epo_ops');
	});

	it('runs get_bibliography end to end over the fake host: token mint, OPS read, the navigation reference', async () => {
		const upstream = recordedOps();
		const ctx = contextOver(upstream.fetch);
		const biblio = byName.get('get_bibliography')!;
		const input = biblio.input.parse({ patent_number: 'EP1234567A2' });
		const answer = (await biblio.handler(input, ctx)) as Record<string, unknown>;
		expect(answer).toMatchObject({
			docId: 'EP1234567.A2',
			title: 'Filling material based on particulate composite',
			documentReference: { publicationNumber: 'EP1234567A2', section: 'bibliography' },
		});
		expect(upstream.urls).toEqual([
			'https://ops.epo.org/3.2/auth/accesstoken',
			'https://ops.epo.org/3.2/rest-services/published-data/publication/docdb/EP.1234567.A2/biblio',
		]);
	});

	it('answers US claims not_configured on a host without the US full-text capability', async () => {
		const claims = byName.get('get_claims')!;
		const input = claims.input.parse({ patent_number: 'US10765880B2' });
		const failure = await claims.handler(input, contextOver(async () => new Response('', { status: 500 }))).catch((e) => e);
		expect(failure).toBeInstanceOf(ToolError);
		expect(failure).toMatchObject({
			status: 404,
			code: ErrorCodes.FULLTEXT_UNAVAILABLE,
			// The paid route rides under details, so a harness acts on the field (ADR 0014).
			details: { reason: 'not_configured', paidRoute: { tool: 'get_claims', mcpTool: 'mcp__flowleap__get_claims' } },
		});
	});
});

/**
 * The passage tools print the evidence anchors the IDE prints (S5 D0.2): the
 * `anchor` beside each section and each claim, and nothing else — a result does
 * not repeat its passages; a host's ledger derives its record (`evidenceSource`)
 * from the result's own text, `documentReference` and language, so its anchors
 * equal the printed ones. The expected anchors are what the IDE's
 * `evidenceAnchor` answers for the same references; the label is the IDE's.
 */
describe('evidence anchors on the passage tools', () => {
	const run = async <T,>(name: string, args: Record<string, unknown>): Promise<T> => {
		const definition = byName.get(name)!;
		return (await definition.handler(definition.input.parse(args), contextOver(recordedOps().fetch))) as T;
	};

	it('get_claims: one anchor per claim and the section anchor at the top, no repeated text', async () => {
		const claims = await run<{
			docId: string; language: string; anchor?: string; sources?: unknown;
			claims: { number: string; text: string; anchor?: string; documentReference: { publicationNumber: string; section: 'claims'; claimNumber?: string } }[];
		}>('get_claims', { patent_number: 'EP1234567B1' });
		expect([claims.docId, claims.language, claims.anchor, claims.claims.length]).toEqual(['EP1234567B1', 'en', 'EP1234567B1:claims:en', 26]);
		expect(claims.claims[3]).toEqual({
			number: '4',
			text: expect.stringMatching(/^4\. Composition according to Claim 3/),
			documentReference: { publicationNumber: 'EP1234567B1', section: 'claims', claimNumber: '4' },
			anchor: 'EP1234567B1:claims:4:en',
		});
		expect(evidenceAnchorLabel(claims.claims[3].anchor!)).toBe('[source anchor: EP1234567B1:claims:4:en]');
		// Every claim's anchor is the IDE's function over its own reference and the returned language.
		for (const claim of claims.claims) expect(claim.anchor).toBe(evidenceAnchor(claim.documentReference, claims.language));
		// The passages are not repeated: no `sources` field (a host's ledger builds its
		// records from the claims themselves, and they carry the same anchors).
		expect(claims).not.toHaveProperty('sources');
		expect(evidenceSource(claims.claims[3].documentReference, claims.claims[3].text, claims.language)).toMatchObject({
			anchor: claims.claims[3].anchor,
			text: claims.claims[3].text,
			retrieval: 'returned',
		});
	});

	it('get_description: the section anchor with the returned language', async () => {
		const description = await run<{ docId: string; description: string; language: string; anchor?: string; sources?: unknown }>(
			'get_description', { patent_number: 'EP1234567B1' });
		expect([description.docId, description.language, description.anchor]).toEqual(['EP1234567B1', 'en', 'EP1234567B1:description:en']);
		expect(description.description).toBe('The invention relates to a filling material.\n\nThe composite has an average particle size of 20 to 50 µm.');
		expect(description).not.toHaveProperty('sources');
	});

	it('get_abstract: the abstract anchor with the returned language, as the harness recorder derives it', async () => {
		// The IDE prints no abstract anchor (it cites the abstract under the bibliography),
		// so the harness recorder's rule is the one to match: `<pub>:abstract:<lang>`.
		const abstract = await run<{ docId: string; lang: string | null; abstract: string; anchor?: string; sources?: unknown }>(
			'get_abstract', { patent_number: 'EP1234567B1' });
		expect([abstract.docId, abstract.lang, abstract.anchor]).toEqual(['EP1234567B1', 'de', 'EP1234567B1:abstract:de']);
		expect(abstract.abstract).toMatch(/^\[0001\]\s+Partikuläres Kompositmaterial/);
		expect(abstract).not.toHaveProperty('sources');
	});

	it('get_bibliography: the bibliography anchor the IDE cites the abstract under, no language', async () => {
		const biblio = await run<{ docId: string; abstract: string | null; anchor?: string; sources?: unknown; documentReference: unknown }>(
			'get_bibliography', { patent_number: 'EP1234567B1' });
		expect([biblio.docId, biblio.anchor, biblio.documentReference]).toEqual(['EP1234567.B1', 'EP1234567B1:bibliography', { publicationNumber: 'EP1234567B1', section: 'bibliography' }]);
		expect(biblio).not.toHaveProperty('sources');
	});
});
