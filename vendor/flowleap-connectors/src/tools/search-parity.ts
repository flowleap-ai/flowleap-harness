/*---------------------------------------------------------------------------------------------
 *  search_patents parity module (PRD 0013 T05, #273)
 *
 *  Brings the facade's search_patents tool to parity with the legacy search
 *  routes so nothing is lost migrating off them (ADR 0013):
 *
 *   - EPO (provider=epo_ops): hydrated per-document details — full title,
 *     abstract, applicants — DEFAULT ON with an opt-out (details:false), plus
 *     a countries[] filter. Mirrors POST /v1/patent-search: the CQL search and
 *     country filter run in the EPO document module (searchPatents, which
 *     compiles the country filter into the CQL — so OPS's own total counts the
 *     filtered match set — and clamps the range end to it), and the
 *     per-document biblio fan-out rides the module's shared epo:biblio: cache
 *     entries, staggered to stay friendly to the EPO quota. A failed
 *     per-document biblio degrades to null detail fields — it never fails the
 *     search, however it failed — and the response counts the degraded records
 *     in `detailsUnavailable` so a partial page announces itself.
 *
 *   - USPTO (provider=uspto): the FULL ODPSearchRequest forwarded — q,
 *     range_filters, sort, fields, facets, pagination — plus the opt-in EPO
 *     enrichment fan-out (enrich: abstract/claims/family/legal/ipc) landing
 *     under the namespaced epoEnrichment block per granted record, exactly as
 *     POST /v1/patent-search-uspto/search applies it.
 *
 *  Snake_case parameter names per the facade convention (range_filters, …);
 *  they map 1:1 onto the ODP client's camelCase request fields.
 *
 *  The unwrap helpers (the facade's error chokepoint) come from ./shared.ts,
 *  the leaf module — one error-mapping contract, no registry import, no cycle
 *  (T09 consolidation, #277). In the package since ADR 0019 C2a: the office
 *  clients come from the handler's ToolContext.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';
import { recordCacheRead } from '../cache-visibility.js';
import type { ProviderReadResult } from '../cached-provider-read.js';
import type { BiblioData, SearchResultItem } from '../ops/types.js';
import { parseEnrichKeys } from '../uspto-odp/enrichment.js';
import type { ODPSearchRequest } from '../uspto-odp/patent-search.js';
import type { ToolContext } from './definition.js';
import { patentDocumentReference, withDocumentReference } from './document-reference.js';
import { unwrapRead, cachedOdpRead, ODP_SEARCH_TTL } from './shared.js';

// ============================================================================
// Input schema (the registry's search_patents entry)
// ============================================================================

const ENRICH_KEYS = ['abstract', 'claims', 'family', 'legal', 'ipc'] as const;

export const searchPatentsInput = z.object({
	query: z.string().min(1).describe('CQL (epo_ops) or Lucene (uspto) query'),
	provider: z.enum(['epo_ops', 'uspto']).default('epo_ops'),
	range: z
		.string()
		.regex(/^\d+-\d+$/)
		.default('1-25')
		.describe('epo_ops only: result range "start-end", max 100 per page'),
	details: z
		.boolean()
		.default(true)
		.describe(
			'epo_ops only: hydrate each result with title, abstract, applicants and publication date ' +
				'via per-document bibliography (default). Set false for bare document references only.'
		),
	countries: z
		.array(z.string().length(2))
		.optional()
		.describe(
			'epo_ops only: restrict to these publication countries, e.g. ["EP","WO"]. Compiled into ' +
				'the CQL as `pn any "EP WO"`, so `total` counts the filtered match set; the CQL ' +
				'actually sent comes back as `effectiveQuery`.'
		),
	limit: z.number().int().min(1).max(100).default(25).describe('uspto only'),
	offset: z.number().int().min(0).default(0).describe('uspto only'),
	range_filters: z
		.string()
		.optional()
		.describe('uspto only: ODP rangeFilters expression, forwarded verbatim'),
	sort: z
		.string()
		.optional()
		.describe('uspto only: ODP sort expression, e.g. "applicationMetaData.filingDate desc"'),
	fields: z
		.array(z.string())
		.optional()
		.describe('uspto only: ODP field projection (defaults to the standard compact field set)'),
	facets: z.string().optional().describe('uspto only: ODP facets expression, forwarded verbatim'),
	enrich: z
		.array(z.enum(ENRICH_KEYS))
		.optional()
		.describe(
			'uspto only: opt-in EPO OPS enrichment of each granted record, attached under its ' +
				'epoEnrichment block. Keys: abstract, claims, family, legal, ipc.'
		),
});

export type SearchPatentsInput = z.infer<typeof searchPatentsInput>;

export const SEARCH_PATENTS_DESCRIPTION =
	'Search patents. provider=epo_ops uses EPO OPS CQL (worldwide bibliographic search; the text tier is get_claims and get_description); provider=uspto uses ' +
	'USPTO ODP Lucene over US applications. Use get_search_syntax for the query grammar. ' +
	'epo_ops results are hydrated by default (title, abstract, applicants, publication date per ' +
	'document); pass details=false for bare references, and countries=["EP","WO"] to restrict to ' +
	'those publication countries — the filter rides the CQL, so `total` counts the filtered set ' +
	'and `effectiveQuery` echoes the CQL sent. uspto accepts the full ODP request — range_filters, ' +
	'sort, fields, facets — plus enrich=["abstract","claims","family","legal","ipc"] to attach EPO-sourced data ' +
	'under each granted record\'s epoEnrichment block.';

// ============================================================================
// EPO hydration fan-out (route parity: full abstract, full applicant list)
// ============================================================================

/**
 * The exchange extractor can yield an array for multi-paragraph abstracts;
 * the legacy route has always returned a single joined string.
 */
function normalizeAbstract(abstract: unknown): string | null {
	if (typeof abstract === 'string') return abstract;
	if (Array.isArray(abstract)) {
		const joined = abstract.filter((p): p is string => typeof p === 'string').join(' ');
		return joined || null;
	}
	return null;
}

/** A result whose details could not be hydrated: the docId stands, the rest is null. */
function bareDoc(docId: string): SearchResultItem {
	return { docId, title: null, abstract: null, applicants: [], publicationDate: null };
}

/**
 * Hydrate ONE result, absorbing every failure. A page is a set of independent
 * records, so one bad record must cost exactly itself: both the envelope
 * failures (upstream 404, rate limit) and any THROW out of the read land here
 * as a bare docId. The catch is not belt-and-braces — an unparseable
 * publication number in the page used to reject the whole Promise.all and
 * return 500 for a search whose other hits were perfectly good.
 *
 * Returns the item plus whether it is degraded, so the handler can count them.
 */
async function hydrate(ctx: ToolContext, docId: string): Promise<{ doc: SearchResultItem; degraded: boolean }> {
	let result: ProviderReadResult<BiblioData>;
	try {
		result = await ctx.connectors.ops.getBiblio(docId);
	} catch (error) {
		ctx.connectors.host.logger.warn(
			`[search_patents] Biblio read threw for ${docId}:`,
			error instanceof Error ? error.message : error
		);
		return { doc: bareDoc(docId), degraded: true };
	}
	return { doc: toHydratedDoc(ctx, docId, result), degraded: !result.ok };
}

/**
 * Map a module biblio read to the hydrated per-document shape. Like the legacy
 * /v1/patent-search route (and unlike the ops route's trimmed items), this
 * keeps the FULL abstract and the FULL applicant list. A failed biblio leaves
 * the detail fields null — never fatal to the search.
 */
function toHydratedDoc(ctx: ToolContext, docId: string, result: ProviderReadResult<BiblioData>): SearchResultItem {
	if (!result.ok) {
		ctx.connectors.host.logger.warn(
			`[search_patents] Failed to fetch biblio for ${docId}:`,
			result.body.error.message
		);
		return bareDoc(docId);
	}
	// Surface this read's cache verdict to the facade envelope's `cached` flag
	// (lib/api-contract/cache-visibility.ts) — the fan-out reads count too.
	recordCacheRead(result.cached);
	const biblio = result.data;
	return {
		docId,
		title: biblio.title || null,
		abstract: normalizeAbstract(biblio.abstract),
		applicants: biblio.applicants || [],
		publicationDate: biblio.dates?.publication || null,
	};
}

// ============================================================================
// Handler
// ============================================================================

export async function searchPatentsHandler(input: SearchPatentsInput, ctx: ToolContext): Promise<unknown> {
	const { ops, odp } = ctx.connectors;
	if (input.provider === 'uspto') {
		const request: ODPSearchRequest = {
			q: input.query,
			pagination: { limit: input.limit, offset: input.offset },
		};
		if (input.range_filters !== undefined) request.rangeFilters = input.range_filters;
		if (input.sort !== undefined) request.sort = input.sort;
		if (input.fields !== undefined) request.fields = input.fields;
		if (input.facets !== undefined) request.facets = input.facets;

		// Read-through cached (#334) under the shared 'odp-search' namespace —
		// repeats never touch the 60 req/min ODP key. The cache key is the FULL
		// request (q, pagination, filters, sort, fields, facets); `enrich` stays
		// outside it, applied below to the mutation-safe copy.
		const data = await cachedOdpRead(ctx, 'odp-search', request, ODP_SEARCH_TTL, () =>
			odp.searchODPApplications(request)
		);

		// Opt-in EPO enrichment, exactly as the legacy /search route applies it:
		// attached under each granted record's epoEnrichment block; per-record
		// EPO failures are recorded in epoEnrichment.errors[], never fatal.
		const enrichKeys = parseEnrichKeys(input.enrich);
		if (enrichKeys) {
			await odp.enrichRecords(data.patentFileWrapperDataBag, enrichKeys);
		}
		// Add-only query echo (#278 ride-along): clients no longer need to
		// thread their own input to know what a result answers.
		return {
			...data,
			query: input.query,
			patentFileWrapperDataBag: data.patentFileWrapperDataBag.map(record => ({
				...record,
				// Never treat an application number as a publication number.
				documentReference: record.applicationMetaData?.patentNumber
					? patentDocumentReference(record.applicationMetaData.patentNumber, 'bibliography', 'US')
					: null,
			})),
		};
	}

	// EPO OPS: the module owns the CQL search, country filter and range clamp;
	// details:false here because the hydration fan-out below keeps the full
	// abstract/applicants (route parity), not the module's trimmed items.
	const countries =
		input.countries && input.countries.length > 0 ? input.countries.join(',') : null;
	const data = unwrapRead(
		await ops.searchPatents(input.query, { range: input.range, details: false, countries })
	);
	const docIds = data.docs as string[];

	// Add-only totals honesty: the countries filter is compiled INTO the CQL
	// (`pn any "EP WO"`), so `total` is OPS's count for the FILTERED query — it
	// no longer over-reports a worldwide count the filtered page cannot deliver.
	// `returned` is this page's size, `countryFilter` echoes the whitelist, and
	// `effectiveQuery` shows the CQL that produced the count.
	const totalsEcho = {
		total: data.total,
		...(data.returned !== undefined ? { returned: data.returned } : {}),
		...(data.effectiveQuery !== undefined ? { effectiveQuery: data.effectiveQuery } : {}),
		...(data.countryFilter ? { countryFilter: data.countryFilter } : {}),
	};

	if (!input.details) {
		// Opt-out: bare references in the tool's historical item shape.
		// `query` is the add-only echo (#278 ride-along).
		return {
			query: input.query,
			...totalsEcho,
			range: data.range,
			docs: docIds.map(
				(docId) => withDocumentReference({
					docId,
					title: null,
					abstract: null,
					applicants: [],
					publicationDate: null,
				})
			),
		};
	}

	// Per-document biblio via the module's shared cache entries, staggered to
	// stay friendly to the EPO quota (as the legacy route's fan-out does).
	// hydrate() absorbs per-record failures, so this Promise.all cannot reject.
	const hydrated = await Promise.all(
		docIds.map(async (docId, index) => {
			await new Promise((resolve) => setTimeout(resolve, index * 100));
			return hydrate(ctx, docId);
		})
	);

	// Add-only partial-page signal: how many of `returned` came back as a bare
	// docId because their bibliography could not be read. Every doc is still
	// present and still identified — this says the PAGE is partial, not short,
	// so an agent can re-read those few by number instead of mistaking null
	// fields for "this patent has no title". Omitted when the page is whole,
	// which keeps every existing response byte-identical.
	const detailsUnavailable = hydrated.filter(item => item.degraded).length;

	return {
		query: input.query,
		...totalsEcho,
		...(detailsUnavailable > 0 ? { detailsUnavailable } : {}),
		range: data.range,
		docs: hydrated.map(item => withDocumentReference(item.doc)),
	};
}
