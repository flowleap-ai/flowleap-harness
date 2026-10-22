/*---------------------------------------------------------------------------------------------
 *  The office tools over a fake host alone (ADR 0019 C2a): what the harness
 *  plugin gets when it registers `officeTools()` and runs a handler over a
 *  ToolContext built from its own ConnectorHost. No environment, no backend,
 *  no network: a recorded OPS upstream behind the host's fetch.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createConnectors, ErrorCodes, officeTools, ToolError, toolInputJsonSchema, type ToolContext } from '../index.js';
import { createFakeHost } from '../__tests__/fake-host.js';

const FIXED_NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const biblioXml = readFileSync(new URL('../ops/__fixtures__/ep1234567-biblio.xml', import.meta.url), 'utf8');

/** The OPS token mint and one recorded bibliography; everything else is a 404. */
function recordedOps() {
	const urls: string[] = [];
	const fetch = async (input: string | URL): Promise<Response> => {
		const url = String(input);
		urls.push(url);
		if (url === 'https://ops.epo.org/3.2/auth/accesstoken') {
			return Response.json({ access_token: 'tok-1', expires_in: 1200 });
		}
		if (url.endsWith('/published-data/publication/docdb/EP.1234567.A2/biblio')) {
			return new Response(biblioXml, {
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
	it('lists the 33 office tools once each, every one with its credential, title and an object schema', () => {
		const tools = officeTools();
		expect(tools).toHaveLength(33);
		expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
		for (const definition of tools) {
			expect(definition.description.length, definition.name).toBeGreaterThan(20);
			expect(['epoOps', 'usptoOdp', 'semanticScholar', 'none'], definition.name).toContain(definition.access);
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
			details: { reason: 'not_configured' },
		});
	});
});
