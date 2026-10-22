/**
 * USPTO ODP — EPO OPS enrichment fan-out
 *
 * For each ODP application record that resolves to a granted patent number,
 * fetches the requested fields from EPO OPS and attaches them under the
 * `epoEnrichment` block. See ADR 0002 for the source-provenance rationale.
 *
 * Cost model (per record, after cache):
 *   abstract, ipc   → 1 biblio call
 *   family          → 1 family call
 *   legal           → 1 legal-status call
 *   claims          → 1 claims call (largest payload)
 *
 * Per-record EPO failures are recorded in `epoEnrichment.errors[]` and never
 * fail the search; pre-grant applications without a `patentNumber` are skipped.
 *
 * Every datum rides the EPO document module's hybrid memory+Redis cache
 * (#95/#98) — the same entries the ops routes populate, so an enrichment
 * lookup after a route lookup of the same document makes no second upstream
 * call. Enrichment holds no private cache entries of its own.
 */

import type { ConnectorContext } from '../context.js';
import {
	getBiblio,
	getClaims,
	getEquivalentsFamily,
	getLegalStatus,
} from '../ops/direct.js';
import type { BiblioData, EquivalentsFamilyData } from '../ops/types.js';
import type { ODPApplicationRecord } from './patent-search.js';

/** Legal event entry in the shape enrichment has always emitted. */
interface EnrichmentLegalEvent {
	date?: string;
	code?: string;
	description?: string;
	country?: string;
}

export type EnrichmentKey = 'abstract' | 'claims' | 'family' | 'legal' | 'ipc';

const ALL_KEYS: readonly EnrichmentKey[] = ['abstract', 'claims', 'family', 'legal', 'ipc'];

export interface EpoEnrichment {
	abstract?: string;
	claims?: string[];
	family?: EquivalentsFamilyData['familyMembers'];
	legal?: EnrichmentLegalEvent[];
	ipc?: string[];
	errors?: EnrichmentKey[];
}

const RECORD_CONCURRENCY = 5;

function epoDocIdFromRecord(record: ODPApplicationRecord): string | null {
	const num = record.applicationMetaData?.patentNumber;
	if (typeof num !== 'string' || num.length === 0) return null;
	return `US${num}`;
}

/**
 * Biblio via the EPO document module: hybrid memory+Redis cache shared with
 * every other biblio consumer (one upstream call per document across the
 * whole backend). Failures collapse to null — recorded per-record, never
 * cached, never fatal to the search.
 */
async function getSharedBiblio(ctx: ConnectorContext, docId: string): Promise<BiblioData | null> {
	const result = await getBiblio(ctx, docId);
	return result.ok ? result.data : null;
}

/** Family via the module's equivalents-family entry (legacy field shape). */
async function getSharedFamily(ctx: ConnectorContext, docId: string): Promise<EquivalentsFamilyData | null> {
	const result = await getEquivalentsFamily(ctx, docId);
	return result.ok ? result.data : null;
}

/**
 * Legal events via the module's shared legal entry (the working
 * patent-family walker), mapped to the field names enrichment has always
 * emitted.
 */
async function getSharedLegal(ctx: ConnectorContext, docId: string): Promise<EnrichmentLegalEvent[] | null> {
	const result = await getLegalStatus(ctx, docId);
	if (!result.ok) return null;
	return result.data.events.map((event) => ({
		date: event.date || undefined,
		code: event.code || undefined,
		description: event.text ?? undefined,
		country: event.country ?? undefined,
	}));
}

/** Claims via the module's shared claims entry. */
async function getSharedClaims(ctx: ConnectorContext, docId: string): Promise<string[] | null> {
	const result = await getClaims(ctx, docId);
	return result.ok ? result.data.claims : null;
}

async function enrichOne(
	ctx: ConnectorContext,
	record: ODPApplicationRecord,
	keys: Set<EnrichmentKey>
): Promise<EpoEnrichment | undefined> {
	const docId = epoDocIdFromRecord(record);
	if (!docId) return undefined;

	const needsBiblio = keys.has('abstract') || keys.has('ipc');
	const needsFamily = keys.has('family');
	const needsLegal = keys.has('legal');
	const needsClaims = keys.has('claims');

	const [biblio, family, legal, claims] = await Promise.all([
		needsBiblio ? getSharedBiblio(ctx, docId) : Promise.resolve(null),
		needsFamily ? getSharedFamily(ctx, docId) : Promise.resolve(null),
		needsLegal ? getSharedLegal(ctx, docId) : Promise.resolve(null),
		needsClaims ? getSharedClaims(ctx, docId) : Promise.resolve(null),
	]);

	const enrichment: EpoEnrichment = {};
	const errors: EnrichmentKey[] = [];

	if (keys.has('abstract')) {
		if (biblio?.abstract) enrichment.abstract = biblio.abstract;
		else errors.push('abstract');
	}
	if (keys.has('ipc')) {
		if (biblio?.ipc && biblio.ipc.length > 0) enrichment.ipc = biblio.ipc;
		else if (!biblio) errors.push('ipc');
	}
	if (keys.has('family')) {
		if (family) enrichment.family = family.familyMembers ?? [];
		else errors.push('family');
	}
	if (keys.has('legal')) {
		if (legal) enrichment.legal = legal;
		else errors.push('legal');
	}
	if (keys.has('claims')) {
		if (claims) enrichment.claims = claims;
		else errors.push('claims');
	}

	if (errors.length > 0) enrichment.errors = errors;
	return enrichment;
}

/**
 * Parse and normalise the user-supplied `enrich` field. Accepts an array of
 * known keys; silently drops unknown values; returns null for absent/empty.
 */
export function parseEnrichKeys(raw: unknown): Set<EnrichmentKey> | null {
	if (!Array.isArray(raw)) return null;
	const set = new Set<EnrichmentKey>();
	for (const v of raw) {
		if (typeof v === 'string' && (ALL_KEYS as readonly string[]).includes(v)) {
			set.add(v as EnrichmentKey);
		}
	}
	return set.size > 0 ? set : null;
}

/**
 * Mutate `records` in place, attaching `epoEnrichment` to each record that
 * resolves to a granted patent. Pre-grant applications (no patentNumber) are
 * skipped silently. Per-record EPO failures are recorded but do not throw.
 */
export async function enrichRecords(
	ctx: ConnectorContext,
	records: ODPApplicationRecord[],
	keys: Set<EnrichmentKey>
): Promise<void> {
	for (let i = 0; i < records.length; i += RECORD_CONCURRENCY) {
		const batch = records.slice(i, i + RECORD_CONCURRENCY);
		const results = await Promise.all(batch.map((r) => enrichOne(ctx, r, keys)));
		for (let j = 0; j < batch.length; j++) {
			const e = results[j];
			if (e) {
				(batch[j] as Record<string, unknown>).epoEnrichment = e;
			}
		}
	}
}
