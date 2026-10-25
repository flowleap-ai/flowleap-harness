/*---------------------------------------------------------------------------------------------
 *  Office coverage of the text tier (ADR 0024, #581) — ONE table, three readers.
 *
 *  "Office coverage" is a property of a tool: the offices it answers for, and
 *  from which source. The text tools (get_claims, get_description,
 *  get_fulltext) serve two offices from EPO OPS and US claims from the
 *  BigQuery full-text table. Every other office, and US description, has no
 *  text source: the router answers FULLTEXT_UNAVAILABLE with reason
 *  `no_source`. ADR 0024 decided that no new source is added until a customer
 *  names an office, so a served sentence must not call an office "pending".
 *
 *  The family-member workaround is the agent's route to text for the offices
 *  without a source: `get_family` (the extended INPADOC family) finds the EP,
 *  WO or US member, and the text tools read that member. The share of filings
 *  with such a member was measured per office on PATSTAT 2026 Spring
 *  (docs/research/2026-10-11-office-coverage-full-text.md). Two limits ride
 *  with it, always: a member's claims are not the office's claims, and the
 *  member's text must itself be served.
 *
 *  The router (./fulltext-router.ts), the registry docs (the backend's
 *  src/tools/registry.docs.ts) and `server_info` (the backend's
 *  src/tools/registry.ts) import this module, so the three surfaces cannot
 *  drift. In the package since ADR 0019 C2a: the text tools and the sentences
 *  their descriptions carry are defined once, for both hosts. A new text source
 *  changes this file, and the contract in the research doc applies.
 *--------------------------------------------------------------------------------------------*/

/** A full-text section the router serves. */
export type TextSection = 'claims' | 'description';

/** A text source, named as `server_info` names its providers. */
export type TextSource = 'epo_ops' | 'bigquery';

/** One office that a section is served for, and the source that serves it. */
export interface OfficeTextSource {
	office: string;
	source: TextSource;
}

const SOURCE_LABEL: Record<TextSource, string> = {
	epo_ops: 'EPO OPS',
	bigquery: 'FlowLeap US full text',
};

/** Per section, the offices with text and the source per office. */
export const TEXT_OFFICE_COVERAGE: Readonly<Record<TextSection, readonly OfficeTextSource[]>> = {
	claims: [
		{ office: 'EP', source: 'epo_ops' },
		{ office: 'WO', source: 'epo_ops' },
		{ office: 'US', source: 'bigquery' },
	],
	description: [
		{ office: 'EP', source: 'epo_ops' },
		{ office: 'WO', source: 'epo_ops' },
	],
};

/** The eight named offices that have bibliographic, family and legal-event depth, and no text. */
export const OFFICES_WITHOUT_TEXT_SOURCE: readonly string[] = ['CN', 'JP', 'KR', 'CA', 'AU', 'FR', 'DE', 'GB'];

/** The offices one source serves text for, in table order, each office once. */
export function textOfficesOf(source: TextSource): ReadonlySet<string> {
	const offices = new Set<string>();
	for (const rows of Object.values(TEXT_OFFICE_COVERAGE)) {
		for (const row of rows) {
			if (row.source === source) offices.add(row.office);
		}
	}
	return offices;
}

/** Every office with a text source for at least one section, in table order, each office once. */
export function servedTextOffices(): readonly string[] {
	const offices = new Set<string>();
	for (const rows of Object.values(TEXT_OFFICE_COVERAGE)) {
		for (const row of rows) offices.add(row.office);
	}
	return [...offices];
}

/** The source that serves one section for one office, or null when the table has none. */
export function textSourceFor(section: TextSection, office: string): TextSource | null {
	return TEXT_OFFICE_COVERAGE[section].find(row => row.office === office)?.source ?? null;
}

/**
 * The human label of a source, as the served sentences name it. A product term, never
 * a vendor or an implementation name: the model and the attorney read the label.
 */
export function textSourceLabel(source: TextSource): string {
	return SOURCE_LABEL[source];
}

/** The tool that reads one text section — the same name in every host (ADR 0019 decision 5). */
export const TEXT_SECTION_TOOL: Readonly<Record<TextSection, 'get_claims' | 'get_description'>> = {
	claims: 'get_claims',
	description: 'get_description',
};

/**
 * Who runs each text source. An office's own API runs on any host that holds the key
 * (on a self-hosted harness, the firm's). FlowLeap's own service runs on the backend
 * only, and is paid (ADR 0019 decision 3: US full text from BigQuery stays behind the
 * backend).
 */
export const TEXT_SOURCE_OWNER: Readonly<Record<TextSource, 'office' | 'flowleap'>> = {
	epo_ops: 'office',
	bigquery: 'flowleap',
};

/** How a harness MCP row names the backend's tools (ADR 0019 decision 5, `mcp__flowleap__patstat_query`). */
export const FLOWLEAP_MCP_TOOL_PREFIX = 'mcp__flowleap__';

/** The paid route a host without a section's source names: the backend's tool, over the FlowLeap MCP row. */
export interface PaidTextRoute {
	/** The backend's tool of the same name as this host's (the one with the source). */
	tool: 'get_claims' | 'get_description';
	/** That tool as the harness MCP row names it. */
	mcpTool: string;
	source: TextSource;
	docId: string;
}

/**
 * The paid route for one section of one office when THIS host has no source for it:
 * the backend's tool of the same name, reached over the FlowLeap MCP row. Null when
 * the table has no source for the office, or when its source is an office API (then
 * the host lacks a key, not a service, and there is no paid route to name).
 */
export function paidTextRoute(section: TextSection, office: string, docId: string): PaidTextRoute | null {
	const source = textSourceFor(section, office);
	if (!source || TEXT_SOURCE_OWNER[source] !== 'flowleap') return null;
	const tool = TEXT_SECTION_TOOL[section];
	return { tool, mcpTool: `${FLOWLEAP_MCP_TOOL_PREFIX}${tool}`, source, docId };
}

/** "EP, WO and US" (or "EP, WO or US") for a list of offices. */
export function officeList(offices: readonly string[], conjunction: 'and' | 'or' = 'and'): string {
	if (offices.length <= 1) return offices.join('');
	return `${offices.slice(0, -1).join(', ')} ${conjunction} ${offices[offices.length - 1]}`;
}

/** One section's offices grouped by source, in table order. */
function officesBySource(section: TextSection): Array<[TextSource, string[]]> {
	const bySource = new Map<TextSource, string[]>();
	for (const row of TEXT_OFFICE_COVERAGE[section]) {
		bySource.set(row.source, [...(bySource.get(row.source) ?? []), row.office]);
	}
	return [...bySource.entries()];
}

/** The source as a served sentence names it: "EPO OPS", or "FlowLeap US full text (paid)" for FlowLeap's own service. */
function sourcePhrase(source: TextSource): string {
	return TEXT_SOURCE_OWNER[source] === 'flowleap' ? `${SOURCE_LABEL[source]} (paid)` : SOURCE_LABEL[source];
}

/** "EP and WO from EPO OPS and US from FlowLeap US full text (paid)": one section's offices, grouped by source. */
function sectionClause(section: TextSection): string {
	return officesBySource(section)
		.map(([source, offices]) => `${officeList(offices)} from ${sourcePhrase(source)}`)
		.join(' and ');
}

/**
 * Per section, the served text offices that have no source for it: US has
 * claims and no description, so this answers [['description', ['US']]].
 */
function unservedSections(): Array<[TextSection, string[]]> {
	const sections = Object.keys(TEXT_OFFICE_COVERAGE) as TextSection[];
	return sections
		.map((section): [TextSection, string[]] => [
			section,
			servedTextOffices().filter(office => textSourceFor(section, office) === null),
		])
		.filter(([, offices]) => offices.length > 0);
}

/** "US description": the served text offices and the section they have no source for. */
function unservedSectionsPhrase(): string {
	return unservedSections().map(([section, offices]) => `${officeList(offices)} ${section}`).join(' and ');
}

/** "US description is not served." One short sentence per section with such offices. */
function unservedSectionsSentences(): string {
	return unservedSections().map(([section, offices]) => `${officeList(offices)} ${section} is not served.`).join(' ');
}

const SECTION_VERB: Record<TextSection, string> = { claims: 'come', description: 'comes' };

/**
 * The short office-coverage sentences of one section, for a tool's short
 * description: "EP and WO claims come from EPO OPS. US claims come from
 * FlowLeap US full text (paid). The answer for every other office is FULLTEXT_UNAVAILABLE."
 */
export function shortCoverageSentences(section: TextSection): string {
	const served = officesBySource(section)
		.map(([source, offices]) => `${officeList(offices)} ${section} ${SECTION_VERB[section]} from ${sourcePhrase(source)}.`);
	const unserved = servedTextOffices().filter(office => textSourceFor(section, office) === null);
	const subjects = officeList([...unserved, 'every other office']);
	return `${served.join(' ')} The answer for ${subjects} is FULLTEXT_UNAVAILABLE.`;
}

/**
 * The family-member workaround: per office, the share (percent) of A filings
 * 2015 to 2024 whose family has a member with served text, and the two limits.
 * The limits read the served offices and the unserved section from the table.
 */
export const FAMILY_MEMBER_WORKAROUND = {
	tool: 'get_family',
	dataEdition: 'PATSTAT 2026 Spring',
	filingYears: '2015 to 2024',
	shares: { CA: 95, AU: 88, FR: 60, DE: 55, GB: 54, JP: 48, KR: 38, CN: 13 } as Readonly<Record<string, number>>,
	limits: [
		'The member\'s claims are not the office\'s claims. Use them for prior art and reading only. ' +
			'Do not use them for freedom-to-operate, infringement or validity of that office\'s right.',
		(`The member's text must itself be served. Only ${officeList(servedTextOffices(), 'or')} text is served. ` +
			unservedSectionsSentences()).trim(),
	] as readonly string[],
} as const;

/**
 * The office-coverage sentences of the text tools. The statements every
 * served text about claims or description starts with, one fact per sentence.
 */
export function officeCoverageSentence(): string {
	return `Office coverage of the text tier. ` +
		`Claims are served for ${sectionClause('claims')}. ` +
		`Description is served for ${sectionClause('description')}. ` +
		`Every other office answers FULLTEXT_UNAVAILABLE with reason no_source. ` +
		(unservedSectionsPhrase() ? `${unservedSectionsPhrase()} answers the same. ` : '') +
		`No text source exists for them (ADR 0024).`;
}

/** The two limits of the workaround as short sentences, for the `workaround.note` field. */
export function familyMemberWorkaroundNote(): string {
	return FAMILY_MEMBER_WORKAROUND.limits.join(' ');
}

/** The workaround paragraph: the tool, the two limits, and the measured share per office. */
export function familyMemberWorkaroundParagraph(): string {
	const workaround = FAMILY_MEMBER_WORKAROUND;
	const shares = OFFICES_WITHOUT_TEXT_SOURCE
		.map(office => `${office} ${workaround.shares[office]}%`)
		.join(', ');
	return `Family-member workaround for an office without text. ` +
		`Call ${workaround.tool} to find the ${officeList(servedTextOffices(), 'or')} member of the family. ` +
		`Then read that member's text. Two limits apply. ${familyMemberWorkaroundNote()} ` +
		`Share of A filings ${workaround.filingYears} whose family has such a member (${workaround.dataEdition}): ${shares}.`;
}

/** One row of the `server_info` office-coverage block: a BigQuery row says whether the server has it configured. */
export interface OfficeCoverageRow extends OfficeTextSource {
	configured?: boolean;
}

/** The `officeCoverage` block `server_info` serves (additive, ADR 0014). */
export interface OfficeCoverageBlock {
	get_claims: OfficeCoverageRow[];
	get_description: OfficeCoverageRow[];
	noTextSource: string[];
	workaround: {
		tool: typeof FAMILY_MEMBER_WORKAROUND.tool;
		shares: Record<string, number>;
		dataEdition: typeof FAMILY_MEMBER_WORKAROUND.dataEdition;
	};
}

/**
 * The office coverage of the text tools as data, for `server_info`. It is a
 * configured-capability statement: a BigQuery row carries `configured` from
 * the US full-text flag. An EPO OPS row carries no flag, because a forwarded
 * or stored Patent-Data Key serves EP and WO text whether or not the server
 * has House keys.
 */
export function officeCoverageBlock(flags: { bigqueryConfigured: boolean }): OfficeCoverageBlock {
	const rows = (section: TextSection): OfficeCoverageRow[] =>
		TEXT_OFFICE_COVERAGE[section].map(row =>
			row.source === 'bigquery' ? { ...row, configured: flags.bigqueryConfigured } : { ...row }
		);
	return {
		get_claims: rows('claims'),
		get_description: rows('description'),
		noTextSource: [...OFFICES_WITHOUT_TEXT_SOURCE],
		workaround: {
			tool: FAMILY_MEMBER_WORKAROUND.tool,
			shares: { ...FAMILY_MEMBER_WORKAROUND.shares },
			dataEdition: FAMILY_MEMBER_WORKAROUND.dataEdition,
		},
	};
}
