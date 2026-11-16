/**
 * The XML answers of DPMAconnectPlus, parsed and checked.
 *
 * Sources of the shapes: the official schema `DE-PATGBM-RegisterExt.xsd`
 * (the DPMA extension of WIPO ST.36) for a register record, and recorded
 * answers of the live service for the hit list and the failure answers (see
 * `__fixtures__/README.md`). The schema of the hit list is not public.
 *
 * A schema here names only the fields the clients read. An element the DPMA
 * adds later does not fail a parse.
 */

import { parseStringPromise } from 'xml2js';
import { z } from 'zod';
import type { DpmaFailure, DpmaHit, DpmaHitList, DpmaParty, DpmaRegisterEvent, DpmaRegisterRecord } from './types.js';

/** A text element as xml2js gives it: a string, or `{ _ }` when the element has attributes. */
const text = z.union([z.string(), z.object({ _: z.string().optional() }).transform((node) => node._ ?? '')]).transform((value) => value.trim());

const texts = z.array(text).default([]);

/** The first text of a repeated element, or undefined when it is absent or empty. */
function first(values: readonly string[]): string | undefined {
	const value = values[0];
	return value === undefined || value === '' ? undefined : value;
}

/** A container element that xml2js gives as `''` when it is empty. */
function container<T extends z.ZodType>(schema: T) {
	return z.array(z.union([z.literal('').transform(() => undefined), schema])).default([]);
}

// ── Failure answers ──────────────────────────────────────────────────────────

const errorRoot = z.object({
	Error: z.object({ $: z.object({ Message_DE: z.string().optional(), Message_EN: z.string().optional() }) }),
});

const transactionRoot = z.object({
	Transaction: z.object({
		TradeMarkTransactionBody: z.array(
			z.object({
				TransactionErrorDetails: z.array(
					z.object({
						TransactionError: z.array(z.object({ TransactionErrorCode: texts, TransactionErrorText: texts })),
					}),
				),
			}),
		),
	}),
});

/**
 * Read a failure answer of the DPMA. The DPMA sends failures as XML bodies:
 * an `Error` element for a refused login, and a `Transaction` element for
 * "data not available" (also from the patent service, inside an element
 * named `TradeMarkTransactionBody`).
 * @returns the failure, or undefined when the body is not a failure answer.
 */
export function failureFromXml(parsed: unknown): DpmaFailure | undefined {
	const error = errorRoot.safeParse(parsed);
	if (error.success) {
		const attributes = error.data.Error.$;
		return { kind: 'auth', message: attributes.Message_EN ?? attributes.Message_DE ?? 'DPMA refused the login' };
	}
	const transaction = transactionRoot.safeParse(parsed);
	if (transaction.success) {
		const detail = transaction.data.Transaction.TradeMarkTransactionBody[0]?.TransactionErrorDetails[0]?.TransactionError[0];
		const message = (detail && first(detail.TransactionErrorText)) ?? 'DPMA gave no data';
		return { kind: 'not_available', message };
	}
	return undefined;
}

// ── The hit list ─────────────────────────────────────────────────────────────

const hitRecord = z.object({
	'leading-registered-number': texts,
	'registered-number': texts,
	type: texts,
	legalstatus: texts,
	'invention-title': texts,
	applicationDate: texts,
	publicationDate: texts,
	registrationDate: texts,
	applicants: container(z.object({ applicant: texts })),
	inventors: container(z.object({ inventor: texts })),
	agent: texts,
});

const hitListRoot = z.object({
	PatentHitList: z.union([
		z.literal('').transform(() => ({ $: undefined, PatentHitListRecord: [] })),
		z.object({
			$: z
				.object({
					HitCount: z.string().optional(),
					maxHitsReached: z.string().optional(),
					Message_DE: z.string().optional(),
					Message_EN: z.string().optional(),
				})
				.optional(),
			PatentHitListRecord: z.array(hitRecord).default([]),
		}),
	]),
});

function hitOf(record: z.infer<typeof hitRecord>): DpmaHit | undefined {
	const leadingRegisteredNumber = first(record['leading-registered-number']);
	if (leadingRegisteredNumber === undefined) return undefined;
	return {
		leadingRegisteredNumber,
		registeredNumber: first(record['registered-number']) ?? leadingRegisteredNumber,
		type: first(record.type) ?? '',
		legalStatus: first(record.legalstatus) ?? '',
		title: first(record['invention-title']) ?? '',
		applicationDate: first(record.applicationDate),
		publicationDate: first(record.publicationDate),
		registrationDate: first(record.registrationDate),
		applicants: record.applicants.flatMap((group) => group?.applicant ?? []).filter((line) => line !== ''),
		inventors: record.inventors.flatMap((group) => group?.inventor ?? []).filter((line) => line !== ''),
		agent: first(record.agent),
	};
}

type Parsed<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: DpmaFailure };

function malformed(what: string, error: unknown): Parsed<never> {
	const detail = error instanceof z.ZodError ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') : String(error);
	return { ok: false, error: { kind: 'malformed', message: `The DPMA ${what} does not have the expected fields (${detail})` } };
}

async function xmlOf(body: string): Promise<unknown> {
	return parseStringPromise(body, { explicitArray: true, explicitRoot: true, trim: true });
}

/**
 * Parse the answer of an expert search.
 *
 * A hit list with no hit and a message, and with no `maxHitsReached`, is the
 * answer of the DPMA to a query it cannot read: kind `query`. A hit list with
 * `maxHitsReached="true"` is a cut list: `limited`.
 */
export async function parseDpmaHitList(body: string): Promise<Parsed<DpmaHitList>> {
	let parsed: unknown;
	try {
		parsed = await xmlOf(body);
	} catch (error) {
		return malformed('hit list', error);
	}
	const failure = failureFromXml(parsed);
	if (failure) return { ok: false, error: failure };
	const root = hitListRoot.safeParse(parsed);
	if (!root.success) return malformed('hit list', root.error);
	const list = root.data.PatentHitList;
	const attributes = list.$ ?? {};
	const limited = attributes.maxHitsReached === 'true';
	const hits = list.PatentHitListRecord.map(hitOf).filter((hit): hit is DpmaHit => hit !== undefined);
	const message = attributes.Message_EN ?? attributes.Message_DE;
	if (message !== undefined && !limited && hits.length === 0) {
		return { ok: false, error: { kind: 'query', message } };
	}
	const hitCount = Number.parseInt(attributes.HitCount ?? '', 10);
	return { ok: true, data: { hitCount: Number.isFinite(hitCount) ? hitCount : hits.length, limited, hits } };
}

// ── The register record ──────────────────────────────────────────────────────

const documentId = z.object({ country: texts, 'doc-number': texts, kind: texts, date: texts });

const addressbook = z.object({
	text: texts,
	name: texts,
	address: z.array(z.object({ country: texts })).default([]),
});

const partyList = (element: string) => container(z.object({ [element]: z.array(z.object({ addressbook: z.array(addressbook).default([]) })).default([]) }));

const eventData = z.object({
	'type-of-procedure': texts,
	'procedural-status': texts,
	'date-of-procedural-status': texts,
	'publication-info': z.array(z.object({ 'publication-date': texts })).default([]),
	'published-documents': container(z.object({ document: texts })),
});

const registerRoot = z.object({
	'dpma-patent-document': z.object({
		$: z.object({ 'schema-version': z.string().optional() }).optional(),
		'bibliographic-data': z
			.array(
				z.object({
					'publication-references': container(
						z.object({ 'publication-reference': z.array(z.object({ 'document-id': z.array(documentId) })).default([]) }),
					),
					'application-reference': z.array(z.object({ 'document-id': z.array(documentId).min(1) })).min(1),
					'invention-title': texts,
					'classifications-ipcr': container(z.object({ 'classification-ipcr': z.array(z.object({ text: texts })).default([]) })),
					parties: container(
						z.object({
							applicants: partyList('applicant'),
							inventors: partyList('inventor'),
							agents: partyList('agent'),
						}),
					),
					'priority-claims': container(
						z.object({ 'priority-claim': z.array(z.object({ country: texts, date: texts, 'doc-number': texts })).default([]) }),
					),
					'office-specific-bib-data': container(
						z.object({
							'type-of-ip-right': texts,
							status: texts,
							'date-of-first-publication': texts,
							'date-last-register-update': texts,
							abstract: texts,
						}),
					),
				}),
			)
			.min(1),
		events: container(z.object({ 'event-data': z.array(eventData).default([]) })),
	}),
});

function partiesOf(groups: readonly (Record<string, { addressbook: z.infer<typeof addressbook>[] }[]> | undefined)[], element: string): DpmaParty[] {
	return groups
		.flatMap((group) => group?.[element] ?? [])
		.flatMap((entry) => entry.addressbook)
		.map((book) => ({ text: first(book.text) ?? first(book.name) ?? '', name: first(book.name), country: first(book.address[0]?.country ?? []) }))
		.filter((party) => party.text !== '');
}

function eventOf(event: z.infer<typeof eventData>): DpmaRegisterEvent | undefined {
	const status = first(event['procedural-status']);
	const date = first(event['date-of-procedural-status']);
	if (status === undefined || date === undefined) return undefined;
	return {
		procedure: first(event['type-of-procedure']) ?? '',
		status,
		date,
		publicationDate: first(event['publication-info'][0]?.['publication-date'] ?? []),
		publishedDocuments: event['published-documents'].flatMap((group) => group?.document ?? []).filter((id) => id !== ''),
	};
}

/** Parse the answer of `getRegisterInfo`: one register record. */
export async function parseDpmaRegisterRecord(body: string): Promise<Parsed<DpmaRegisterRecord>> {
	let parsed: unknown;
	try {
		parsed = await xmlOf(body);
	} catch (error) {
		return malformed('register record', error);
	}
	const failure = failureFromXml(parsed);
	if (failure) return { ok: false, error: failure };
	const root = registerRoot.safeParse(parsed);
	if (!root.success) return malformed('register record', root.error);
	const document = root.data['dpma-patent-document'];
	const biblio = document['bibliographic-data'][0]!;
	const application = biblio['application-reference'][0]!['document-id'][0]!;
	const applicationNumber = first(application['doc-number']);
	if (applicationNumber === undefined) return malformed('register record', 'application-reference has no doc-number');
	const parties = biblio.parties.filter((group) => group !== undefined);
	const office = biblio['office-specific-bib-data'].find((group) => group !== undefined);
	return {
		ok: true,
		data: {
			schemaVersion: document.$?.['schema-version'],
			applicationNumber,
			applicationDate: first(application.date),
			publications: biblio['publication-references']
				.flatMap((group) => group?.['publication-reference'] ?? [])
				.flatMap((reference) => reference['document-id'])
				.flatMap((id) => {
					const number = first(id['doc-number']);
					return number === undefined ? [] : [{ country: first(id.country) ?? 'DE', number, kind: first(id.kind) }];
				}),
			title: first(biblio['invention-title']),
			ipRightType: office && first(office['type-of-ip-right']),
			status: office && first(office.status),
			applicants: partiesOf(parties.map((group) => group.applicants[0]), 'applicant'),
			inventors: partiesOf(parties.map((group) => group.inventors[0]), 'inventor'),
			agents: partiesOf(parties.map((group) => group.agents[0]), 'agent'),
			priorities: biblio['priority-claims']
				.flatMap((group) => group?.['priority-claim'] ?? [])
				.flatMap((claim) => {
					const country = first(claim.country);
					return country === undefined ? [] : [{ country, date: first(claim.date), number: first(claim['doc-number']) }];
				}),
			ipc: biblio['classifications-ipcr']
				.flatMap((group) => group?.['classification-ipcr'] ?? [])
				.flatMap((entry) => entry.text)
				.filter((symbol) => symbol !== ''),
			firstPublicationDate: office && first(office['date-of-first-publication']),
			lastRegisterUpdate: office && first(office['date-last-register-update']),
			abstract: office && first(office.abstract),
			events: document.events
				.flatMap((group) => group?.['event-data'] ?? [])
				.map(eventOf)
				.filter((event): event is DpmaRegisterEvent => event !== undefined),
		},
	};
}

/** Read a failure answer from a raw body. Undefined when the body is not XML or not a failure. */
export async function parseDpmaFailure(body: string): Promise<DpmaFailure | undefined> {
	try {
		return failureFromXml(await xmlOf(body));
	} catch {
		return undefined;
	}
}
