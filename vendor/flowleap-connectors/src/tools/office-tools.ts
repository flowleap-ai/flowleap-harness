/*---------------------------------------------------------------------------------------------
 *  The office tools (ADR 0019, slice C2a) — defined once, registered by both hosts.
 *
 *  Every entry is a {@link ToolDefinition}: name, description, zod input
 *  schema, annotations, the credential it spends, and a handler over the
 *  office clients of its host ({@link ToolContext}). The backend wraps each
 *  one in its registry entry (src/tools/registry.ts: access tier, rate limit,
 *  the tool gate) and lists it on /v1/tools and the MCP server; the harness
 *  plugin registers the same definitions under the same names (ADR 0019
 *  decision 5). Handlers call the clients, never HTTP, so the two hosts share
 *  one behaviour and the backend's surfaces share one cache.
 *
 *  What stays with the backend (ADR 0019 decision 3, the paid boundary):
 *  PATSTAT, the examiner baseline, the enriched citations, patent images and
 *  the BigQuery analytics, plus server_info. OCR is an office tool since C3a:
 *  it runs on the host's own Mistral key (./ocr-tool.ts).
 *
 *  History: these entries were the backend's src/tools/registry.ts (the
 *  agent-first facade, docs/PATENT_CONNECTOR_CLI_GAP_ANALYSIS.md).
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';
import { getCacheKey } from '../cache-key.js';
import { cachedProviderRead } from '../cached-provider-read.js';
import { ErrorCodes } from '../contract/error-codes.js';
import { InvalidRangeError, parseCitationsRange } from '../ops/citations-range.js';
import { registerZeroHitHint } from '../ops/register-hint.js';
import type { LegalResponse, PriorityClaim } from '../ops/types.js';
import { officeList, shortCoverageSentences, textOfficesOf, textSourceLabel } from '../office-coverage.js';
import type { ToolDefinition } from './definition.js';
import { patentDocumentReference, withDocumentReference } from './document-reference.js';
import { withEvidenceAnchor } from './evidence-anchor.js';
import { withExtendedFamilyCoverage } from './family-coverage.js';
import { literatureTools } from './literature.js';
import { ocrTool } from './ocr-tool.js';
import { detectPatentProvider } from './provider.js';
import {
	searchPatentsHandler,
	searchPatentsInput,
	SEARCH_PATENTS_DESCRIPTION,
} from './search-parity.js';
import {
	ToolError,
	tool,
	flexibleId,
	unwrapRead,
	unwrapCachedOdp,
	cachedOdpRead,
	ODP_SEARCH_TTL,
	ODP_LOOKUP_TTL,
	ODP_DOCUMENT_TEXT_TTL,
} from './shared.js';
import { usLookupTools } from './us-lookups.js';

// ============================================================================
// Helpers
// ============================================================================

/** Parse epodoc-style (YYYYMMDD) or ISO dates; returns null when unparseable. */
function parsePatentDate(value: string | null | undefined): Date | null {
	if (!value) return null;
	const digits = value.replace(/\D/g, '');
	if (digits.length !== 8) return null;
	const date = new Date(`${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T00:00:00Z`);
	return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(date: Date | null): string | null {
	return date ? date.toISOString().slice(0, 10) : null;
}

interface BiblioLike {
	docId?: string;
	title?: string | null;
	abstract?: string | null;
	applicants?: string[];
	inventors?: string[];
	ipc?: string[];
	cpc?: string[];
	dates?: { filing?: string | null; publication?: string | null; priority?: PriorityClaim[] };
}

function computePatentTerm(patentNumber: string, biblio: BiblioLike) {
	const filing = parsePatentDate(biblio.dates?.filing);
	let baseExpiry: Date | null = null;
	if (filing) {
		baseExpiry = new Date(filing);
		baseExpiry.setUTCFullYear(baseExpiry.getUTCFullYear() + 20);
	}
	const isUS = detectPatentProvider(patentNumber) === 'uspto';
	return {
		patentNumber,
		filingDate: isoDate(filing),
		baseExpiryDate: isoDate(baseExpiry),
		basis: '20 years from filing date',
		disclaimer:
			'Estimated term only: does not account for annuity lapses, terminal disclaimers, ' +
			'SPCs/extensions' +
			(isUS ? ', or US patent term adjustment (PTA — get_patent_term_adjustment returns the official day counts)' : '') +
			'. Check get_legal_status for lapse/withdrawal events.',
	};
}

// ============================================================================
// Search syntax reference (get_search_syntax)
// ============================================================================

const SEARCH_SYNTAX: Record<string, unknown> = {
	epo_ops: {
		provider: 'epo_ops',
		language: 'EPO OPS CQL',
		summary:
			'CQL query language. Combine field=value terms with and/or/not. Quote multi-word values.',
		fields: {
			ti: 'title, e.g. ti="battery separator"',
			ab: 'abstract',
			ta: 'title or abstract',
			txt: 'title, abstract, applicant, inventor',
			pa: 'applicant, e.g. pa=siemens',
			in: 'inventor',
			pn: 'publication number, e.g. pn=EP1000000',
			ap: 'application number',
			pr: 'priority number',
			pd: 'publication date, e.g. pd within "2020 2024"',
			ic: 'IPC class, e.g. ic=H01M',
			cpc: 'CPC class, e.g. cpc=H01M50/20',
			ct: 'cited document (forward citations)',
		},
		examples: [
			'ti="solid state battery" and pa=toyota',
			'cpc=H01M50/20 and pd within "2019 2024"',
			'(ta=perovskite and ta="solar cell") not pa=oxford',
		],
	},
	epo_register: {
		provider: 'epo_register',
		language: 'EPO OPS Register CQL (search_register)',
		summary:
			'CQL over the EP Register (EP applications only). The one grammar with an EP representative index. ' +
			'Combine field=value terms with and/or/not. Quote multi-word values. The role indexes (re, op, ia, pa, in) ' +
			'match one role each; `nm` matches a name in any role, so a 0 on a role index is not "absent from the ' +
			'register". Indexes verified against OPS ' +
			'2026-10-11 (nm 2026-10-15); `ag`, `rep`, `ab`, `cpc`, `st`, `ps`, `fd`, `ctr` are NOT register indexes (OPS answers ' +
			'SERVER.DomainAccess): the representative index is `re`, nothing else. The US attorney of record is a ' +
			'different index on a different provider: uspto `recordAttorney.attorneyBag.lastName`.',
		fields: {
			re: 'professional representative (agent) of record, e.g. re=Kreuels',
			op: 'opponent, e.g. op=Siemens',
			ia: 'inventor or applicant',
			pa: 'applicant',
			in: 'inventor',
			nm:
				'name in any role (applicant, inventor, representative, opponent), e.g. nm=Boniberger. Use it when a ' +
				'role index (re/op/ia/pa/in) answers 0, to find which role the person holds: re=Boniberger 0, ' +
				'op=Boniberger 3, nm=Boniberger 5 (live 2026-10-15). Names are stored surname-first: use the surname ' +
				'alone, or nm="Surname, First"; nm="First Last" finds nothing',
			ti: 'title',
			pn: 'EP publication number, e.g. pn=EP1000000',
			ap: 'EP application number, e.g. ap=EP25183540',
			pr: 'priority number or country, e.g. pr=DE',
			pd: 'publication date, e.g. pd>=20200101',
			ic: 'IPC class, e.g. ic=G01M',
		},
		examples: ['re=Kreuels', 're="Kreuels" and ia=Syntegon', 'op=Siemens and pd>=20200101', 'nm=Boniberger'],
	},
	uspto: {
		provider: 'uspto',
		language: 'USPTO ODP Lucene',
		summary:
			'Lucene syntax over application metadata fields. Combine with AND/OR/NOT; ranges use [a TO b]. ' +
			'ODP answers 0 hits, not an error, for a field path it does not index, so use only the paths ' +
			'listed here (each probed live with a known-positive value, 2026-10-12): a 0 on an unlisted path ' +
			'means the path is wrong, not that nothing matches. `applicationMetaData.firstNamedApplicant` and ' +
			'`recordAttorney.attorneyBag.attorneyName` are NOT paths.',
		fields: {
			'applicationMetaData.inventionTitle': 'title text',
			'applicationMetaData.firstApplicantName': 'first-named applicant, e.g. "Syntegon Technology GmbH" or Syntegon*',
			'applicationMetaData.applicantBag.applicantNameText':
				'any applicant, not only the first-named (for "Robert Bosch GmbH" it adds 651 records where Bosch is a co-applicant)',
			'applicationMetaData.inventorBag.inventorNameText': 'any inventor',
			'applicationMetaData.firstInventorName': 'first-named inventor only',
			'recordAttorney.attorneyBag.lastName':
				'attorney or agent of record, last name. This is the USPTO-registered practitioner, so a non-US ' +
				'representative of the same family (an EP agent) is not expected here; search_register answers the EP side',
			'recordAttorney.attorneyBag.firstName': 'attorney or agent of record, first name',
			'recordAttorney.attorneyBag.registrationNumber': 'attorney or agent of record, USPTO registration number',
			'applicationMetaData.filingDate': 'filing date, e.g. [2020-01-01 TO 2024-12-31]',
			'applicationMetaData.applicationStatusDescriptionText': 'status, e.g. "Patented Case"',
			'applicationMetaData.customerNumber': 'USPTO customer number',
			applicationNumberText: 'application number',
			'applicationMetaData.patentNumber': 'granted patent number',
		},
		examples: [
			'applicationMetaData.inventionTitle:"machine learning" AND applicationMetaData.filingDate:[2022-01-01 TO 2024-12-31]',
			'applicationMetaData.firstApplicantName:"International Business Machines"',
			'recordAttorney.attorneyBag.lastName:Laff AND applicationMetaData.applicationStatusDescriptionText:"Patented Case"',
		],
	},
};

// ============================================================================
// Tool definitions
// ============================================================================

/**
 * The error code behind a partial failure, for the `errorCodes` map that rides beside
 * `errors` on the compound tools.
 *
 * `errors` stays a prose map forever: ADR 0014 rule 2 makes responses add-only, and both
 * shipped clients render those values as text, so changing the value shape in place would
 * degrade them silently. `errorCodes` is the add-only companion that satisfies rule 4 —
 * clients match the code, never the message wording, which may change at any time.
 *
 * A `ToolError` already carries a code from the closed registry. Anything else reaching
 * here is an unexpected throw, which is exactly `INTERNAL_ERROR`.
 */
function partialFailureCode(reason: unknown): string {
	return reason instanceof ToolError ? reason.code : ErrorCodes.INTERNAL_ERROR;
}

/**
 * The `get_legal_status` payload, shared with `get_patent_summary`'s `legalStatus`
 * section so the two can never drift.
 *
 * `docId` echoes the caller's document id, as the ops route wrapper always did.
 * `designatedStates`/`extensionStates` ride at the TOP level rather than staying buried
 * in the AK/AX events: for an EP filing they are its designated-state coverage, and digging
 * out of the events is exactly the step every caller was getting wrong. Both lists are
 * always present — empty reads as "designates no states", never as "unknown".
 */
function legalStatusPayload(docId: string, data: LegalResponse) {
	return {
		docId,
		events: data.events,
		designatedStates: data.designatedStates,
		extensionStates: data.extensionStates,
	};
}

/** The one publication-number input; the backend's image and citation tools extend it too. */
export const patentNumberInput = z.object({
	patent_number: flexibleId(2).describe(
		'Publication number including the requested kind, e.g. EP1234567B1. Preserve A2/B1 exactly. Without a kind, OPS resolves bibliography first; this does not mean the latest or granted publication.'
	),
});

/** The one US application-number input. */
export const usApplicationNumberInput = z.object({
	application_number: flexibleId(4).describe('USPTO application number, e.g. 16123456'),
});

const definitions: ToolDefinition[] = [
	// ------------------------------------------------------------------ search
	tool({
		name: 'search_patents',
		// Search parity with the legacy routes (PRD 0013 T05, #273): hydrated EPO
		// details (default on) + countries[], full ODP passthrough + enrichment.
		// The behavior lives in ./search-parity.ts; the unwrap helpers stay this
		// registry's error chokepoint and are injected.
		description: SEARCH_PATENTS_DESCRIPTION,
		input: searchPatentsInput,
		access: 'epoOps',
		handler: searchPatentsHandler,
	}),
	tool({
		name: 'get_search_syntax',
		description:
			'Query grammar reference for a search provider (epo_ops CQL, uspto ODP Lucene, or epo_register: the ' +
			'EP Register CQL of search_register, with the representative and opponent indexes).',
		input: z.object({ provider: z.enum(['epo_ops', 'uspto', 'epo_register']).default('epo_ops') }),
		access: 'none',
		handler: async (input) => SEARCH_SYNTAX[input.provider],
	}),
	tool({
		name: 'search_register',
		annotations: { title: 'Search the EP Register' },
		description:
			'Search the EP Register by register CQL: the EP representative index. `re=` is the ' +
			'professional representative (agent) of record, `op=` an opponent, `ia=` inventor or applicant; ' +
			'`pa`, `in`, `ti`, `pn`, `ap`, `pr`, `pd`, `ic` work too. `nm=` matches a name in ANY role ' +
			'(applicant, inventor, representative, opponent): use it when a role index answers 0, to find which ' +
			'role the person holds; a zero-hit role query answers a `hint` with the nm= query to retry. Names are ' +
			'stored surname-first: use the surname alone, or nm="Surname, First". Answers OPS\'s `total` for the whole query ' +
			'(capped at 10000) and one row per EP application: its register record with applicants, representatives, ' +
			'status, opponents and dates. ' +
			'EP applications only. epo_ops published-data search has no representative index; the US attorney of ' +
			'record is search_patents provider=uspto on `recordAttorney.attorneyBag.lastName`, or get_attorney per ' +
			'application.',
		input: z.object({
			query: z.string().min(1).describe('EP Register CQL, e.g. re=Kreuels (see get_search_syntax provider=epo_register)'),
			range: z
				.string()
				.regex(/^\d+-\d+$/)
				.default('1-25')
				.describe('result range "start-end", max 100 per page'),
		}),
		access: 'epoOps',
		handler: async (input, ctx) => {
			// The one "start-end" rule set (../ops/citations-range.ts); a bad page is
			// an input fault, refused before any upstream call.
			try {
				parseCitationsRange(input.range);
			} catch (error) {
				if (error instanceof InvalidRangeError) {
					throw new ToolError(422, ErrorCodes.INVALID_INPUT, error.message, { range: input.range });
				}
				throw error;
			}
			const page = unwrapRead(await ctx.connectors.ops.searchRegister(input.query, input.range));
			// Computed after the cache, so a cached zero-hit page gets it too and
			// the cached datum does not carry it (#582). Suggested, never run.
			const hint = page.total === 0 ? registerZeroHitHint(input.query) : undefined;
			return hint ? { ...page, hint } : page;
		},
	}),

	// --------------------------------------------------------------- retrieval
	tool({
		name: 'get_bibliography',
		description:
			'Bibliographic data (title, abstract, applicants, inventors, IPC/CPC, dates) for any publication number via EPO OPS (worldwide bibliographic office coverage).',
		input: patentNumberInput.extend({
			include_designated_states: z
				.boolean()
				.default(false)
				.describe(
					'Also return the EP designated/extension states. Off by default because they are not in ' +
						'the bibliography document: answering costs a second OPS read (INPADOC legal).'
				),
			resolve_npl: z
				.boolean()
				.default(false)
				.describe(
					'Look up each cited non-patent reference (citedReferences[].npl) in OpenAlex and attach ' +
						'`nplWork` (title, DOI, abstract preview) to it. Off by default: one OpenAlex read per reference.'
				),
		}),
		access: 'epoOps',
		handler: async (input, ctx) => {
			// The bibliography anchor (`PUB:bibliography`, no language) is the one a report cites the abstract under (S5 D0.2).
			const read = withEvidenceAnchor(withDocumentReference(unwrapRead(await ctx.connectors.ops.getBiblio(input.patent_number))));
			// The NPL lookup soft-fails per reference (lookup_failed), never failing the read.
			const biblio = input.resolve_npl ? await ctx.connectors.openalex.withResolvedNpl(read) : read;
			if (!input.include_designated_states) return biblio;

			// The OPS bibliography document carries no designation block at all — the
			// states live only in the INPADOC legal record's AK/AX events, so this is a
			// join, not a richer parse. A legal-read failure must not fail the
			// bibliography: report it as a partial the way get_patent_summary does.
			try {
				const legal = unwrapRead(await ctx.connectors.ops.getLegalStatus(input.patent_number));
				return {
					...biblio,
					designatedStates: legal.designatedStates,
					extensionStates: legal.extensionStates,
				};
			} catch (error) {
				return {
					...biblio,
					errors: { designatedStates: error instanceof Error ? error.message : 'failed' },
					errorCodes: { designatedStates: partialFailureCode(error) },
				};
			}
		},
	}),
	tool({
		name: 'get_abstract',
		description: 'Abstract text for a publication number.',
		input: patentNumberInput,
		access: 'epoOps',
		handler: async (input, ctx) => {
			const data = unwrapRead(await ctx.connectors.ops.getAbstract(input.patent_number));
			// docId + abstract + the document language (add-only field, #276).
			// The abstract anchor carries the returned language (`PUB:abstract:<lang>`): the IDE
			// prints none for the abstract, so the harness recorder's rule is the one to match (S5 D0.2).
			return withEvidenceAnchor(withDocumentReference({ docId: data.docId, lang: data.lang, abstract: data.abstract }, 'abstract'), data.lang ?? undefined);
		},
	}),
	tool({
		name: 'get_claims',
		description: `Claims text for a publication number. ${shortCoverageSentences('claims')} The language is selectable.`,
		input: patentNumberInput.extend({ language: z.string().length(2).default('en') }),
		access: 'epoOps',
		handler: async (input, ctx) => {
			const data = unwrapRead(await ctx.connectors.fulltext.getClaimsRouted(input.patent_number, input.language));
			// Legacy tool shape: numbered claims + total, with additive navigation targets.
			const documentReference = patentDocumentReference(data.docId, 'claims');
			const numberedClaims = data.numberedClaims ?? data.claims.map((text, index) => ({ number: (index + 1).toString(), text }));
			// One anchor per claim, the string the IDE prints beside "Claim N" (S5 D0.2);
			// unsegmented text has the section anchor only, so no claim anchor is fabricated.
			const claims = numberedClaims.map(claim =>
				withEvidenceAnchor({ ...claim, documentReference: documentReference ? { ...documentReference, claimNumber: claim.number } : null }, data.lang)
			);
			// The section anchor at the top (`PUB:claims:<lang>`). A host's ledger records the
			// section (every claim joined) and each claim from these fields; the result does
			// not repeat the text.
			return withEvidenceAnchor(withDocumentReference({
				docId: data.docId, claims, totalClaims: data.unsegmentedText ? null : claims.length, language: data.lang,
				...(data.unsegmentedText ? { unsegmentedText: data.unsegmentedText } : {}),
				...(data.fallback ? { fallback: data.fallback } : {}),
			}, 'claims'), data.lang);
		},
	}),
	tool({
		name: 'get_description',
		description: `Description/specification text for a publication number. ${shortCoverageSentences('description')}`,
		input: patentNumberInput.extend({ language: z.string().length(2).default('en') }),
		access: 'epoOps',
		handler: async (input, ctx) => {
			const data = unwrapRead(await ctx.connectors.fulltext.getDescriptionRouted(input.patent_number, input.language));
			const result = withDocumentReference({
				docId: data.docId,
				description: data.description || null,
				language: data.language,
				availableLanguages: data.availableLanguages,
				requestedLanguage: data.requestedLanguage,
				...(data.fallback ? { fallback: data.fallback } : {}),
			}, 'description');
			// The description is one passage under the section anchor (`PUB:description:<lang>`):
			// the IDE labels every line with the same anchor (S5 D0.2).
			return withEvidenceAnchor(result, data.language);
		},
	}),
	tool({
		name: 'get_fulltext',
		annotations: { title: 'Get full-text availability' },
		description:
			'Full-text availability (claims/description languages) for a publication number, from the ' +
			`${textSourceLabel('epo_ops')} holdings only (${officeList([...textOfficesOf('epo_ops')])}).`,
		input: patentNumberInput,
		access: 'epoOps',
		handler: async (input, ctx) => unwrapRead(await ctx.connectors.ops.getFulltextSections(input.patent_number)),
	}),
	tool({
		name: 'get_patent_family',
		annotations: { title: 'Get simple patent family' },
		description:
			'SIMPLE family only (EPO OPS published-data /equivalents). Does NOT include grants of the ' +
			'applications it lists, nor divisionals, continuations or any other filing linked through a ' +
			'shared priority — so it can answer with pre-grant publications for a patent that has long ' +
			'since granted. Use it for one question: "which office republished THIS document". For ' +
			'"what is the family", "where is this protected" or "which US members exist", call get_family ' +
			'(extended INPADOC family) instead. When this read is a strict subset of the extended family ' +
			'the response carries an `extendedFamily` block naming what it left out, and `representatives` ' +
			'names the publication to cite for each member it did return (first grant, else earliest).',
		input: patentNumberInput,
		access: 'epoOps',
		handler: async (input, ctx) =>
			// #450: the correction rides the RESPONSE, not the description —
			// see ./family-coverage.ts for why the description alone did not hold.
			withExtendedFamilyCoverage(
				ctx,
				unwrapRead(await ctx.connectors.ops.getEquivalentsFamily(input.patent_number)),
				input.patent_number
			),
	}),
	tool({
		name: 'get_legal_status',
		description: 'Legal status events (grants, lapses, oppositions) for a publication number.',
		input: patentNumberInput,
		access: 'epoOps',
		handler: async (input, ctx) =>
			legalStatusPayload(input.patent_number, unwrapRead(await ctx.connectors.ops.getLegalStatus(input.patent_number))),
	}),
	tool({
		name: 'get_register_events',
		annotations: { title: 'Get EP register events' },
		description: 'EP register prosecution events for a publication number.',
		input: patentNumberInput,
		access: 'epoOps',
		handler: async (input, ctx) => {
			const data = unwrapRead(await ctx.connectors.ops.getRegisterEvents(input.patent_number));
			return { docId: input.patent_number, events: data.events };
		},
	}),
	tool({
		name: 'get_register_biblio',
		annotations: { title: 'Get EP register bibliography' },
		description:
			'EP Register bibliographic record for an EP publication number: title, applicants, status, filing and ' +
			'publication dates, the professional representatives (agents) of record before the EPO, and the ' +
			'opponents named in any opposition. EP only; for a US attorney of record use get_attorney.',
		input: patentNumberInput,
		access: 'epoOps',
		handler: async (input, ctx) => unwrapRead(await ctx.connectors.ops.getRegisterBiblio(input.patent_number)),
	}),
	tool({
		name: 'get_citations',
		annotations: { title: 'Get forward citations' },
		description:
			'Forward citations (documents citing this patent) via EPO OPS, with a citation-type filter. The rows carry ' +
			'no citation origin of their own (`citedIn` repeats the filter): the citation origin (e.g. SEA examiner ' +
			'search, APP applicant) of every citation of one patent, in one call, comes from patstat_patent — "who cites X and how" goes there.',
		input: patentNumberInput.extend({
			type: z.enum(['all', 'examination', 'opposition', 'applicant', 'other']).default('all'),
			range: z.string().regex(/^\d+-\d+$/).default('1-25'),
		}),
		access: 'epoOps',
		handler: async (input, ctx) => {
			// Shared range bounds (start ≥ 1, ≤ 100 results — ../ops/citations-range.ts).
			try {
				parseCitationsRange(input.range);
			} catch (error) {
				if (error instanceof InvalidRangeError) {
					throw new ToolError(422, ErrorCodes.TOOL_EXECUTION_ERROR, error.message);
				}
				throw error;
			}
			const data = unwrapRead(
				await ctx.connectors.ops.getForwardCitations(input.patent_number, input.type, input.range)
			);
			return withDocumentReference({ ...data, docId: input.patent_number, citations: data.citations.map(doc => withDocumentReference(doc)) });
		},
	}),
	// get_patent_image stays with the backend: patent images are paid (ADR 0019 decision 3).
	tool({
		name: 'convert_patent_number',
		description:
			'Convert a patent number between epodoc, docdb and original formats. from_format names the format of the input number (default epodoc).',
		input: patentNumberInput.extend({
			to_format: z.enum(['epodoc', 'docdb', 'original']),
			from_format: z.enum(['epodoc', 'docdb', 'original']).default('epodoc'),
		}),
		access: 'epoOps',
		handler: async (input, ctx) => {
			// The input schema already restricts both formats to the valid enum.
			const data = unwrapRead(
				await ctx.connectors.ops.convertPatentNumber(input.patent_number, input.to_format, input.from_format)
			);
			return { ...data, input: input.patent_number };
		},
	}),
	tool({
		name: 'get_continuity',
		annotations: { title: 'Get US continuity chain' },
		description: 'US application parent/child continuity chain (USPTO ODP).',
		input: z.object({
			application_number: flexibleId(4).describe('USPTO application number, e.g. 16123456'),
		}),
		access: 'usptoOdp',
		// ODP file-wrapper lookups ride the read-through cache (#334): repeats
		// never touch the 60 req/min ODP key, and cache hits are free for the
		// trial data budget (ADR 0017).
		handler: async (input, ctx) =>
			cachedOdpRead(
				ctx,
				'odp-continuity',
				{ applicationNumberText: input.application_number },
				ODP_LOOKUP_TTL,
				() => ctx.connectors.odp.getODPApplicationContinuity(input.application_number)
			),
	}),

	// ------------------------------------------------ file wrapper (USPTO ODP)
	tool({
		name: 'get_transactions',
		annotations: { title: 'Get US prosecution transactions' },
		description:
			'USPTO prosecution transaction/event history for a US application (eventDataBag): filings, office actions, responses, fee payments, issue events — each with event code, description, and date. Use to reconstruct what happened during US prosecution and when.',
		input: usApplicationNumberInput,
		access: 'usptoOdp',
		handler: async (input, ctx) =>
			cachedOdpRead(
				ctx,
				'odp-transactions',
				{ applicationNumberText: input.application_number },
				ODP_LOOKUP_TTL,
				() => ctx.connectors.odp.getODPApplicationTransactions(input.application_number)
			),
	}),
	tool({
		name: 'get_assignments',
		annotations: { title: 'Get US assignments' },
		description:
			'USPTO assignment records for a US application (assignmentBag): reel/frame numbers, conveyance text, assignors, assignees with addresses, and recorded dates. Use to trace chain of title / current ownership of a US patent or application.',
		input: usApplicationNumberInput,
		access: 'usptoOdp',
		handler: async (input, ctx) =>
			cachedOdpRead(
				ctx,
				'odp-assignment',
				{ applicationNumberText: input.application_number },
				ODP_LOOKUP_TTL,
				() => ctx.connectors.odp.getODPApplicationAssignment(input.application_number)
			),
	}),
	tool({
		name: 'get_foreign_priority',
		annotations: { title: 'Get US foreign priority claims' },
		description:
			'Foreign priority claims for a US application (foreignPriorityBag): the foreign filing date, application number, and IP office each priority claim rests on. Use to pin the effective priority date of a US filing.',
		input: usApplicationNumberInput,
		access: 'usptoOdp',
		handler: async (input, ctx) =>
			cachedOdpRead(
				ctx,
				'odp-foreign-priority',
				{ applicationNumberText: input.application_number },
				ODP_LOOKUP_TTL,
				() => ctx.connectors.odp.getODPApplicationForeignPriority(input.application_number)
			),
	}),
	tool({
		name: 'get_patent_term_adjustment',
		annotations: { title: 'Get US patent term adjustment' },
		description:
			'Official USPTO patent term adjustment (PTA) data for a granted US application: A/B/C delay day counts, applicant delay, overlap, the total adjustment, and the event-by-event PTA history. Complements get_patent_term (which estimates 20-years-from-filing without PTA).',
		input: usApplicationNumberInput,
		access: 'usptoOdp',
		handler: async (input, ctx) =>
			cachedOdpRead(
				ctx,
				'odp-adjustment',
				{ applicationNumberText: input.application_number },
				ODP_LOOKUP_TTL,
				() => ctx.connectors.odp.getODPApplicationAdjustment(input.application_number)
			),
	}),
	tool({
		name: 'get_attorney',
		annotations: { title: 'Get US attorney of record' },
		description:
			'Attorney/agent of record for a US application (recordAttorney): active power of attorney (names, registration numbers), correspondence address, and USPTO customer number. Use with search_uspto_portfolio_by_customer_number to expand from one application to the firm\'s portfolio.',
		input: usApplicationNumberInput,
		access: 'usptoOdp',
		handler: async (input, ctx) =>
			cachedOdpRead(
				ctx,
				'odp-attorney',
				{ applicationNumberText: input.application_number },
				ODP_LOOKUP_TTL,
				() => ctx.connectors.odp.getODPApplicationAttorney(input.application_number)
			),
	}),
	tool({
		name: 'get_application_documents',
		annotations: { title: 'List US file-wrapper documents' },
		description:
			'List the USPTO Image File Wrapper (IFW) documents of a US application — office actions, applicant responses, claims, notices — as compact records with documentIdentifier, document code, description, date, direction, and page count. Filter by document_code (e.g. CTNF non-final rejection, CTFR final rejection, NOA allowance, CLM claims, REM remarks) or direction (INCOMING = applicant→office, OUTGOING = office→applicant). Feed a documentIdentifier to read_application_document to get the document text.',
		input: z.object({
			application_number: flexibleId(4).describe('USPTO application number, e.g. 16123456'),
			document_code: z
				.string()
				.optional()
				.describe('Filter by USPTO document code, e.g. CTNF, CTFR, NOA, CLM, REM'),
			direction: z.enum(['INCOMING', 'OUTGOING']).optional(),
		}),
		access: 'usptoOdp',
		handler: async (input, ctx) => {
			// The listing mutates as prosecution proceeds (new documents arrive),
			// so it rides the modest lookup TTL; filters below run on the
			// mutation-safe copy, never on the cached entry.
			const data = await cachedOdpRead(
				ctx,
				'odp-documents',
				{ applicationNumberText: input.application_number },
				ODP_LOOKUP_TTL,
				() => ctx.connectors.odp.getODPApplicationDocuments(input.application_number)
			);
			let docs = data.documentBag;
			if (input.document_code) {
				const wanted = input.document_code.toUpperCase();
				docs = docs.filter((d) => d.documentCode?.toUpperCase() === wanted);
			}
			if (input.direction) {
				docs = docs.filter((d) => d.directionCategory === input.direction);
			}
			return {
				applicationNumber: input.application_number,
				total: data.count,
				returned: docs.length,
				documents: docs.map((d) => ({
					documentIdentifier: d.documentIdentifier,
					documentCode: d.documentCode,
					description: d.documentCodeDescriptionText,
					officialDate: d.officialDate,
					direction: d.directionCategory,
					pageCount: d.downloadOptionBag?.find((o) => o.mimeTypeIdentifier === 'PDF')
						?.pageTotalQuantity,
					// Kept whole: the CLI's `uspto documents` renderer shows the
					// download options (#276; compaction loses nothing a caller renders).
					downloadOptionBag: d.downloadOptionBag,
				})),
			};
		},
	}),
	tool({
		name: 'read_application_document',
		annotations: { title: 'Read US file-wrapper document' },
		description:
			'Fetch a USPTO file-wrapper (IFW) document and return its text as markdown: downloads the PDF from USPTO ODP and runs Mistral OCR (most IFW documents are scanned images with no text layer). Use for reading office actions, applicant arguments, or examiner notices — get the document_id from get_application_documents first. Results are cached; large documents may take tens of seconds on first read.',
		input: z.object({
			application_number: flexibleId(4).describe('USPTO application number, e.g. 16123456'),
			document_id: z
				.string()
				.regex(/^[A-Za-z0-9]+$/)
				.describe('IFW documentIdentifier from get_application_documents, e.g. LAQYXZN3XBLUEX4'),
		}),
		access: 'usptoOdp',
		// The outer app+documentIdentifier cache the documents lib always promised
		// (#334): a filed IFW document is immutable, so a cache hit skips both the
		// ODP download and the OCR run (the host's `ocr` capability). getODPDocumentText
		// throws typed errors; cachedProviderRead maps them to the unified envelope and
		// unwrapCachedOdp re-raises key/rate-limit conditions for the route layer — the
		// same observable behavior as the old inline catch.
		handler: async (input, ctx) =>
			unwrapCachedOdp(
				await cachedProviderRead(ctx.connectors.host, {
					cacheKey: getCacheKey('odp-document-text', {
						applicationNumberText: input.application_number,
						documentIdentifier: input.document_id,
					}),
					ttlSeconds: ODP_DOCUMENT_TEXT_TTL,
					fetchFresh: () => ctx.connectors.odp.getODPDocumentText(input.application_number, input.document_id),
				})
			),
	}),

	// search_office_action_citations, search_enriched_citations and server_info
	// stay with the backend: the enriched citations are paid (ADR 0019 decision 3),
	// server_info describes the backend. reference_search was retired under ADR
	// 0017 (the backend's tool-envelopes.ts answers 410 endpoint_gone).

	// ---------------------------------------------------------------- compound
	tool({
		name: 'get_patent_summary',
		description:
			'Compound snapshot for a publication number: bibliography, legal status, family and estimated term in one call.',
		input: patentNumberInput,
		access: 'epoOps',
		handler: async (input, ctx) => {
			const doc = input.patent_number;
			const { ops } = ctx.connectors;
			const [biblio, legal, family] = await Promise.allSettled([
				(async () => unwrapRead(await ops.getBiblio(doc)))(),
				(async () => legalStatusPayload(doc, unwrapRead(await ops.getLegalStatus(doc))))(),
				// Same simple-family trap as get_patent_family, same coverage note (#450).
				(async () => withExtendedFamilyCoverage(ctx, unwrapRead(await ops.getEquivalentsFamily(doc)), doc))(),
			]);
			const errors: Record<string, string> = {};
			const errorCodes: Record<string, string> = {};
			const settle = <T>(key: string, result: PromiseSettledResult<T>): T | null => {
				if (result.status === 'rejected') {
					errors[key] = result.reason instanceof Error ? result.reason.message : 'failed';
					errorCodes[key] = partialFailureCode(result.reason);
					return null;
				}
				return result.value;
			};
			// Without biblio the summary is meaningless — rethrow with the real
			// upstream status (404 vs 429 vs 500), not a blanket NOT_FOUND.
			if (biblio.status === 'rejected') {
				throw biblio.reason;
			}
			const biblioData = biblio.value as BiblioLike;
			return {
				patentNumber: doc,
				bibliography: withDocumentReference(biblio.value),
				documentReference: patentDocumentReference(biblio.value.docId),
				legalStatus: settle('legalStatus', legal),
				family: settle('family', family),
				term: computePatentTerm(doc, biblioData),
				errors: Object.keys(errors).length ? errors : undefined,
				// Same keys as `errors`, machine-readable. See partialFailureCode.
				errorCodes: Object.keys(errorCodes).length ? errorCodes : undefined,
			};
		},
	}),
	tool({
		name: 'compare_patents',
		description: 'Side-by-side bibliographic comparison of 2-10 patents.',
		input: z.object({
			patent_numbers: z.array(flexibleId(2)).min(2).max(10),
		}),
		access: 'epoOps',
		handler: async (input, ctx) => {
			const results = await Promise.all(
				input.patent_numbers.map(async (doc) => {
					try {
						const biblio = unwrapRead(await ctx.connectors.ops.getBiblio(doc)) as BiblioLike;
						return { patentNumber: doc, ...biblio, error: undefined };
					} catch (error) {
						return {
							patentNumber: doc,
							error: error instanceof Error ? error.message : 'failed',
						};
					}
				})
			);
			return { count: results.length, patents: results };
		},
	}),
	// examiner_baseline stays with the backend (#548; paid, ADR 0019 decision 3).
	tool({
		name: 'get_prosecution_timeline',
		description:
			'Chronological prosecution timeline for a publication number, merging EP register events and INPADOC legal events.',
		input: patentNumberInput,
		access: 'epoOps',
		handler: async (input, ctx) => {
			const doc = input.patent_number;
			const [registerResult, legalResult] = await Promise.all([
				ctx.connectors.ops.getRegisterEvents(doc),
				ctx.connectors.ops.getLegalStatus(doc),
			]);
			type TimelineEvent = {
				source: 'register' | 'legal';
				date: string | null;
				code: string | null;
				description: string | null;
			};
			const events: TimelineEvent[] = [];
			const sources: Record<string, string> = {};

			if (registerResult.ok) {
				for (const e of registerResult.data.events) {
					events.push({
						source: 'register',
						date: e.date ?? null,
						code: e.code ?? null,
						description: e.description,
					});
				}
			} else {
				sources.register = registerResult.body.error.message;
			}

			if (legalResult.ok) {
				// getLegalStatus returns events with per-event
				// { code, date, country, text, gazette } (../ops/direct.ts).
				for (const e of legalResult.data.events) {
					events.push({
						source: 'legal',
						date: e.date ?? null,
						code: e.code ?? null,
						description: e.text ?? null,
					});
				}
			} else {
				sources.legal = legalResult.body.error.message;
			}

			if (events.length === 0) {
				throw new ToolError(
					404,
					ErrorCodes.NOT_FOUND,
					`No prosecution events found for ${doc}`,
					Object.keys(sources).length ? sources : undefined
				);
			}

			events.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
			return {
				patentNumber: doc,
				totalEvents: events.length,
				events,
				sourceErrors: Object.keys(sources).length ? sources : undefined,
			};
		},
	}),
	tool({
		name: 'get_patent_term',
		annotations: { title: 'Estimate patent term' },
		description:
			'Estimated patent term: 20 years from filing date (no PTA/SPC/annuity-lapse adjustments).',
		input: patentNumberInput,
		access: 'epoOps',
		handler: async (input, ctx) => {
			const biblio = unwrapRead(await ctx.connectors.ops.getBiblio(input.patent_number)) as BiblioLike;
			const term = computePatentTerm(input.patent_number, biblio);
			if (!term.filingDate) {
				throw new ToolError(
					422,
					ErrorCodes.TOOL_EXECUTION_ERROR,
					`No filing date available for ${input.patent_number}; cannot estimate term.`
				);
			}
			return term;
		},
	}),
	tool({
		name: 'search_uspto_portfolio_by_customer_number',
		description:
			'US applications filed under a USPTO customer number (equivalent to ODP query applicationMetaData.customerNumber:<n>).',
		input: z.object({
			customer_number: z.union([z.string().regex(/^\d+$/), z.number().int()]),
			limit: z.number().int().min(1).max(100).default(25),
			offset: z.number().int().min(0).default(0),
		}),
		access: 'usptoOdp',
		handler: async (input, ctx) => {
			const request = {
				q: `applicationMetaData.customerNumber:${input.customer_number}`,
				pagination: { limit: input.limit, offset: input.offset },
			};
			// Same 'odp-search' cache namespace as search_patents' ODP arm — an
			// identical request hits one entry regardless of which tool made it.
			return cachedOdpRead(ctx, 'odp-search', request, ODP_SEARCH_TTL, () =>
				ctx.connectors.odp.searchODPApplications(request)
			);
		},
	}),

	// patent_analytics (BigQuery) stays with the backend (ADR 0019 decision 3).
	// The analyze_claim tool was retired under ADR 0012.

	// ------------------------------------------------------------------ OCR
	// ocr (./ocr-tool.ts, ADR 0019 C3a): the package's Mistral client on the
	// host's own key — the backend's MISTRAL_API_KEY, the firm's key in the
	// harness (FlowLeap provides no OCR there).
	ocrTool,

	// -------------------------------------------- US lookups (PRD 0013 T06)
	...usLookupTools,

	// ------------------------------------------- INPADOC family (PRD 0013 T07)
	// get_citation_stats, its sibling in the backend's citation-family.ts, is
	// paid (enriched citations, ADR 0019 decision 3) and stays there. The
	// extended family is a plain OPS read and the family-member workaround of
	// ADR 0024 depends on it, so it is an office tool.
	tool({
		name: 'get_family',
		annotations: { title: 'Get INPADOC extended family' },
		description:
			'INPADOC patent family members for a publication number (EPO OPS /family/publication): ' +
			'every application and publication linked through common priorities — the extended INPADOC family. ' +
			'THIS is the tool for "what is the family", "where is this protected" and "which US/EP/JP members ' +
			'exist": it holds the grants, divisionals and continuations that get_patent_family (simple-family ' +
			'equivalents, /equivalents) leaves out. ' +
			'`representatives` names ONE publication per member (one application): its first grant where one ' +
			'exists, else its earliest publication — the same rule get_patent_family and the PATSTAT graph ' +
			'apply, and the number to cite when reporting the family. `members` is a flat row list where a ' +
			'member can appear several times, or where its grant can be missing entirely. ' +
			'Cite `publication` on every member. `docdbApplication` and the deprecated `number` carry DOCDB\'s ' +
			'application format on application and priority members, which for US reads like a filing number ' +
			'and is not one ("US10374408 (A)" is USPTO application 12/103,744) — never print either as a ' +
			'filing or priority number (#419).',
		input: z.object({
			patent_number: flexibleId(2).describe(
				'Publication number, e.g. EP1000000, US10123456, WO2020123456'
			),
		}),
		access: 'epoOps',
		handler: async (input, ctx) => unwrapRead(await ctx.connectors.ops.getFamily(input.patent_number)),
	}),

	// ------------------------------------------------------------- literature
	// search_academic, search_npl, get_npl_work (./literature.ts, PRD 0013 T08
	// #276) — same clients as their route counterparts. get_legal_jurisdictions
	// was retired under ADR 0017 (410 endpoint_gone, the backend's tool-envelopes.ts).
	...literatureTools,
];

/**
 * The office tools, in the order the backend's catalog lists them. Both hosts
 * register exactly these, under exactly these names (ADR 0019 decision 5).
 */
export function officeTools(): readonly ToolDefinition[] {
	return definitions;
}
