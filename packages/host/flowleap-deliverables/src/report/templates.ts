/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Named report templates for {@link ToolName.WritePatentResults}. Each template wraps the model's
 * free-form content in a consistent, professional document structure (title block, matter/date
 * placeholder fields, standard sections for the document type, a results area where the model's
 * content lands, and a not-legal-advice disclaimer footer).
 *
 * Kept free of any `vscode` dependency so the pure document shaping is unit-testable in isolation.
 *
 * The `invalidity-claim-chart` and `eou-infringement-chart` templates present element-by-element charts,
 * the same shape `compareClaimsTool.ts` renders via {@link renderMarkdownTable}. That renderer cannot be
 * called from here directly — it lives in `tools/vscode-node`, one layer above this `tools/common` module,
 * and this module wraps opaque model-produced text rather than the structured row/column data the renderer
 * needs. Instead, the template's guidance text instructs the model to produce a table using the identical
 * `| Claim Element | ... |` column convention, so charts read the same wherever they appear.
 *
 * Local divergence from the IDE copy (S5 acceptance defect C, 2026-10-25; see the README, "What
 * differs from the IDE copy"): the `dossier` template, the dossier of one publication (snapshot,
 * claims, family, legal status, citations, US family chain, sources and limitations), so a dossier
 * is a checked save with a provenance appendix and not a free-form file. An authored dossier body
 * (its own sections in place of the scaffold) is refused without a US Family Chain heading (S5
 * acceptance pass 3, 2026-10-26).
 */
export type PatentReportTemplate =
	| 'prior-art-report'
	| 'fto-memo'
	| 'office-action-scaffold'
	| 'invalidity-claim-chart'
	| 'find-better-report'
	| 'eou-infringement-chart'
	| 'patentability-opinion'
	| 'landscape-report'
	| 'portfolio-due-diligence-memo'
	| 'dossier';

/** The template identifiers accepted by the tool's input schema. Keep in sync with package.json. */
export const PATENT_REPORT_TEMPLATES: readonly PatentReportTemplate[] = [
	'prior-art-report',
	'fto-memo',
	'office-action-scaffold',
	'invalidity-claim-chart',
	'find-better-report',
	'eou-infringement-chart',
	'patentability-opinion',
	'landscape-report',
	'portfolio-due-diligence-memo',
	'dossier',
];

/** Footer appended to every templated report. */
const DISCLAIMER = 'This document was generated with AI assistance for informational purposes only and does not constitute legal advice. Consult a licensed patent attorney before relying on its contents.';

/** Placeholder for a field the practitioner fills in after generation. */
const FIELD = '_(to be completed)_';

/**
 * Values known at generation time. The tool supplies `date`/`preparedBy`; the model supplies the
 * rest from the conversation. Anything absent falls back to the practitioner placeholder, so a
 * report is never blocked on missing metadata — but is no longer an empty form when the
 * information was right there in the request.
 */
export interface PatentReportFields {
	readonly matter?: string;
	readonly subject?: string;
	readonly date?: string;
	readonly preparedBy?: string;
	readonly objective?: string;
	readonly searchStrategy?: string;
	/** invalidity-claim-chart (structured) and find-better-report: the patent whose claims are charted. */
	readonly challengedPublication?: string;
	/** invalidity-claim-chart (structured) and find-better-report: the distinct claims the rows name. */
	readonly claimsAtIssue?: string;
	/** invalidity-claim-chart (structured) and find-better-report: the date the art is measured against. */
	readonly criticalDateBasis?: string;
}

/** Render a `| Field | Value |` metadata table; empty values fall back to the placeholder. */
function fieldTable(rows: readonly [string, string | undefined][]): string {
	return ['| Field | Details |', '| --- | --- |', ...rows.map(([label, value]) => `| ${label} | ${value?.trim() || FIELD} |`)].join('\n');
}

/** A scaffold section body: the supplied text, or the italic guidance stub when absent. */
function section(stub: string, value: string | undefined): string {
	return value?.trim() ? value.trim() : stub;
}

/** The templates whose body is always generated from structured coverage, so their content must be empty. */
type StructuredTemplate = 'prior-art-report' | 'find-better-report';

/**
 * What each template's `content` must carry. The structured templates are absent: their body is
 * generated from structured coverage, so their content must be empty.
 */
const CONTENT_REQUIREMENT: Record<Exclude<PatentReportTemplate, StructuredTemplate>, string> = {
	'fto-memo': 'fto-memo needs content: the per-feature analysis, naming each candidate blocking claim, its legal status and its jurisdiction.',
	'office-action-scaffold': 'office-action-scaffold needs content: the remarks answering every ground of rejection, each naming the claims affected and the reference applied against them.',
	'invalidity-claim-chart': 'invalidity-claim-chart needs content: the element-by-element table, one row per claim element and one column per reference, each cell quoting the disclosing passage.',
	'eou-infringement-chart': 'eou-infringement-chart needs content: the element-by-element table mapping each claim element to the accused feature, its literal or doctrine-of-equivalents marking, and the supporting evidence.',
	'patentability-opinion': 'patentability-opinion needs content: the novelty and inventive-step analysis, naming the reference relied on for each claim feature.',
	'landscape-report': 'landscape-report needs content: the filing-trend table, the top-filers table, the jurisdiction split and the white-space observations, each figure with its counting basis (families / applications / publications / live search hits) and its source (PATSTAT edition, analytics corpus, or the query).',
	'portfolio-due-diligence-memo': 'portfolio-due-diligence-memo needs content: the key-asset analysis, one entry per asset with its claim breadth, its status and the observation bearing on value.',
	'dossier': 'dossier needs content: the snapshot of the publication, its claims with claim 1 verbatim, the family with the status and dates of each state, the legal status, the citations, the US family chain, and the sources and limitations.',
};

/** Closing sentence of every missing-content message: the one template the rule does not apply to. */
const CONTENT_EXCEPTION = 'Only prior-art-report and find-better-report use empty content with structured fields.';

/** `invalidity-claim-chart` has the same structured alternative, so its message offers it instead. */
const INVALIDITY_EXCEPTION = 'Either write the chart into content, or supply structured coverage and leave content empty; the writer then generates, validates and receipts the chart.';

/** Second-level headings the model wrote itself. */
const AUTHORED_SECTIONS = /^##\s+\S/gm;

/** How many of its own sections make a body a written report rather than one section's text. */
const AUTHORED_SECTION_COUNT = 3;

/**
 * Whether the body is a report the model structured itself. A body that already carries its own
 * sections is a written document, not the text of one section: the numbered scaffold would then
 * stand above the model's own headings as empty duplicates, and a reader cannot tell which of the
 * two structures the analysis actually follows.
 */
function isAuthoredReport(content: string): boolean {
	return (content.match(AUTHORED_SECTIONS) ?? []).length >= AUTHORED_SECTION_COUNT;
}

/** A body that stands in for content the model did not write. */
const PLACEHOLDER_BODY = /^(?:to be (?:completed|filled|added)|tbd|todo|placeholder)$/i;

/** Strip markdown emphasis, brackets and trailing punctuation so a stub reads as its bare words. */
function bareText(value: string): string {
	return value.replace(/[_*`()[\]]/g, '').replace(/[.:;!]+$/, '').trim();
}

/**
 * Why this `content` cannot be saved under this `template`, or `undefined` when it can.
 *
 * Every template but `prior-art-report` wraps a body the model writes; saving one with no body
 * produces a document whose sections all say "to be completed" while the findings stay in the chat,
 * where nothing keeps them. Free-form saves (no template) are unaffected.
 * @param template - the report template.
 * @param content - the model-written report body.
 * @param structuredBody - whether the body is generated from coverage rows.
 * @returns the refusal lines, one per issue, empty when the input passes.
 */
export function contentRequirementError(template: PatentReportTemplate | undefined, content: string, structuredBody = false): string | undefined {
	if (!template || template === 'prior-art-report' || template === 'find-better-report' || structuredBody) {
		return undefined;
	}
	const requirement = `${CONTENT_REQUIREMENT[template]} ${template === 'invalidity-claim-chart' ? INVALIDITY_EXCEPTION : CONTENT_EXCEPTION}`;
	if (!content.trim()) {
		return requirement;
	}
	// A section body that is only a stub is the same failure one heading further down: the body was
	// never written. Headings themselves are the template's, so only the text under them is judged.
	const bodies = [content, ...content.split(/^#{1,6} .*$/m).slice(1)];
	if (bodies.some(body => PLACEHOLDER_BODY.test(bareText(body)))) {
		return `${requirement} A placeholder such as "to be completed" is not content.`;
	}
	// An authored dossier replaces the scaffold, so the scaffold's US Family Chain section must be one
	// of its own headings; a family with no US member says so under that heading.
	if (template === 'dossier' && isAuthoredReport(content) && !US_FAMILY_CHAIN_HEADING.test(content)) {
		return DOSSIER_US_FAMILY_CHAIN;
	}
	return undefined;
}

/** A heading that names the US family chain (or the US continuity) of the publication. */
const US_FAMILY_CHAIN_HEADING = /^#{1,6} [^\n]*\bUS\b[^\n]*\b(?:chain|continuity)\b/im;

/** The refusal of an authored dossier without that heading. */
const DOSSIER_US_FAMILY_CHAIN = 'dossier needs a US Family Chain section: a heading that names the US family chain, with the US applications and grants of the family in filing order, each with its serial number, publication, grant date and maintenance standing. When the family has no US member, write the heading and say so under it.';

/**
 * Wrap the model-produced `content` in the professional structure named by `template`, and append the
 * `generated` sections (checks derived from the execution record) above the disclaimer footer. When
 * `template` is undefined the content is returned unchanged (free-form save).
 * @param content - the model-written report body.
 * @param template - the report template.
 * @param fields - the header fields the tool and the conversation know.
 * @param generated - the generated sections appended above the footer.
 * @param structuredBody - whether the body is generated from coverage rows.
 * @returns the rendered text.
 */
export function buildPatentReport(content: string, template: PatentReportTemplate | undefined, fields?: PatentReportFields, generated?: string, structuredBody = false): string {
	if (!template) {
		return content;
	}
	return [...templateSections(content, template, fields ?? {}, structuredBody), ...(generated?.trim() ? [generated.trim(), ''] : []), '---', `*${DISCLAIMER}*`, ''].join('\n');
}

/**
 * The template's own sections, ending with the blank line that precedes the disclaimer footer.
 *
 * Every template but `prior-art-report` wraps a body the model writes, so every one of them steps
 * aside for a body that is already a structured report: the title block and the field table are
 * kept, and the model's own sections stand in place of the numbered scaffold. `prior-art-report` is
 * excluded because its body is generated from structured coverage, not written free-form.
 */
function templateSections(content: string, template: PatentReportTemplate, f: PatentReportFields, structuredBody: boolean): readonly string[] {
	if (template !== 'prior-art-report' && (structuredBody || isAuthoredReport(content))) {
		return [...templateHeader(template, f, structuredBody), content.trim(), ''];
	}
	return templateScaffold(content, template, f);
}

/** The title and metadata table every version of a template opens with. */
function templateHeader(template: PatentReportTemplate, f: PatentReportFields, structuredBody = false): readonly string[] {
	switch (template) {
		/* v8 ignore next 2 -- templateSections and templateScaffold never ask for the prior-art-report header; the IDE copy keeps the case. */
		case 'prior-art-report':
			return ['# Prior Art Candidate Review', '', fieldTable([['Matter / Reference', f.matter], ['Subject Technology', f.subject], ['Date', f.date], ['Prepared By', f.preparedBy]]), ''];
		case 'fto-memo':
			return ['# Freedom-to-Operate Memorandum', '', fieldTable([['Matter / Reference', f.matter], ['Product / Technology', f.subject], ['Jurisdiction(s)', undefined], ['Date', f.date], ['Prepared By', f.preparedBy]]), ''];
		case 'office-action-scaffold':
			return ['# Office Action Response', '', fieldTable([['Application No.', f.matter], ['Examiner', undefined], ['Art Unit', undefined], ['Mailing Date', undefined], ['Response Due Date', undefined], ['Prepared By', f.preparedBy]]), ''];
		case 'invalidity-claim-chart':
			// The structured chart names the challenged patent and the claims its own rows cover, so the
			// header states what was charted; the written-content chart keeps the practitioner fields.
			return structuredBody
				? ['# Invalidity Claim Chart', '', fieldTable([['Challenged patent', f.challengedPublication], ['Claim(s) at issue', f.claimsAtIssue], ['Critical date basis', f.criticalDateBasis], ['Date', f.date], ['Prepared by', f.preparedBy]]), '']
				: ['# Invalidity Claim Chart', '', fieldTable([['Patent No. / Claim(s) at Issue', f.matter], ['Prior Art Reference(s)', f.subject], ['Date', f.date], ['Prepared By', f.preparedBy]]), ''];
		case 'find-better-report':
			return ['# Find Better Report', '', fieldTable([['Target patent', f.challengedPublication], ['Independent claim(s) compared', f.claimsAtIssue], ['Earliest priority date basis', f.criticalDateBasis], ['Date', f.date], ['Prepared by', f.preparedBy]]), ''];
		case 'eou-infringement-chart':
			return ['# Evidence-of-Use (EoU) Infringement Chart', '', fieldTable([['Patent No. / Claim(s) Asserted', f.matter], ['Accused Product / Service', f.subject], ['Date', f.date], ['Prepared By', f.preparedBy]]), ''];
		case 'patentability-opinion':
			return ['# Patentability Opinion', '', fieldTable([['Matter / Reference', f.matter], ['Invention Title', f.subject], ['Date', f.date], ['Prepared By', f.preparedBy]]), ''];
		case 'landscape-report':
			return ['# Patent Landscape Report', '', fieldTable([['Technology Area / Scope', f.subject], ['Search Criteria', f.searchStrategy], ['Date', f.date], ['Prepared By', f.preparedBy]]), ''];
		case 'portfolio-due-diligence-memo':
			return ['# Portfolio Due Diligence Memorandum', '', fieldTable([['Target / Portfolio', f.subject], ['Transaction / Purpose', f.matter], ['Date', f.date], ['Prepared By', f.preparedBy]]), ''];
		case 'dossier':
			return ['# Patent Dossier', '', fieldTable([['Publication', f.matter], ['Title / Technology', f.subject], ['Date', f.date], ['Prepared By', f.preparedBy]]), ''];
	}
}

/** The template's numbered scaffold, with the model's text in the section that holds the results. */
function templateScaffold(content: string, template: PatentReportTemplate, f: PatentReportFields): readonly string[] {
	const results = content.trim().length > 0 ? content.trim() : FIELD;

	switch (template) {
		case 'prior-art-report':
			return [
				'# Prior Art Candidate Review',
				'',
				fieldTable([['Matter / Reference', f.matter], ['Subject Technology', f.subject], ['Date', f.date], ['Prepared By', f.preparedBy]]),
				'',
				'## 1. Objective',
				section('Objective not supplied.', f.objective),
				'',
				'## 2. Search Strategy',
				section('Search strategy not supplied.', f.searchStrategy),
				'',
				'## 3. Candidate Evidence',
				results,
				'',
			];

		case 'fto-memo':
			return [
				'# Freedom-to-Operate Memorandum',
				'',
				fieldTable([['Matter / Reference', f.matter], ['Product / Technology', f.subject], ['Jurisdiction(s)', undefined], ['Date', f.date], ['Prepared By', f.preparedBy]]),
				'',
				'## 1. Product / Technology Description',
				'_Describe the product or process being cleared._',
				'',
				'## 2. Analysis',
				results,
				'',
				'## 3. Blocking References & Risk',
				'_In-force claims that may read on the product, with an infringement-risk rating for each._',
				'',
				'## 4. Recommendations',
				'_Design-around options, licensing, invalidity positions, or further investigation._',
				'',
				'## 5. Assumptions & Limitations',
				'_Scope of the search and any assumptions made._',
				'',
			];

		case 'office-action-scaffold':
			return [
				'# Office Action Response',
				'',
				fieldTable([['Application No.', f.matter], ['Examiner', undefined], ['Art Unit', undefined], ['Mailing Date', undefined], ['Response Due Date', undefined], ['Prepared By', f.preparedBy]]),
				'',
				'## 1. Summary of Rejections',
				'_List each rejection and objection (statute, claims affected, cited references)._',
				'',
				'## 2. Claim Amendments',
				'_Complete listing of ALL claims — not only those amended — each with its status identifier ((Original), (Currently Amended), (Canceled), (Withdrawn), (New), (Previously Presented)) and amendments in marked-up form, per 37 CFR 1.121._',
				'',
				'## 3. Remarks',
				'_Address EVERY ground of rejection and objection raised in the office action (37 CFR 1.111(b)); an unanswered ground makes the reply non-responsive._',
				results,
				'',
				'## 4. Conclusion',
				'_Request for allowance and any remaining issues._',
				'',
			];

		case 'invalidity-claim-chart':
			return [
				'# Invalidity Claim Chart',
				'',
				fieldTable([['Patent No. / Claim(s) at Issue', f.matter], ['Prior Art Reference(s)', f.subject], ['Date', f.date], ['Prepared By', f.preparedBy]]),
				'',
				'## 1. Overview',
				'_Identify the challenged patent, the claim(s) at issue, and the prior art reference(s) applied against them._',
				'',
				'## 2. Prior Art Qualification',
				'_For each reference: its publication or public-availability date and the statutory basis on which it qualifies as prior art against the earliest claimed priority date (Patent L.R. 3-3(a))._',
				'',
				'## 3. Element-by-Element Invalidity Chart',
				'_Render as a markdown table with one row per claim element and one column per prior art reference, mirroring the element-by-element chart produced by compare_claims: `| Claim Element | <Reference 1> | <Reference 2> | ... |`. Each cell quotes or paraphrases the disclosing passage and notes the applicable basis (X/§102 anticipation or Y/§103 obviousness, alone or in combination)._',
				results,
				'',
				'## 4. Basis Summary',
				'_For each ground raised, list the statute (§102 or §103), the claim(s) affected, and the reference(s) or combination relied upon — and for EVERY §103 combination, the motivation to combine and its source (Patent L.R. 3-3(b))._',
				'',
				'## 5. Claim Language',
				'_Verbatim text of the challenged claim(s), for reference._',
				'',
			];

		case 'find-better-report':
			// Always structured: the body is generated from coverage, so there is no scaffold to fill.
			return [...templateHeader(template, f, true), results, ''];

		case 'eou-infringement-chart':
			return [
				'# Evidence-of-Use (EoU) Infringement Chart',
				'',
				fieldTable([['Patent No. / Claim(s) Asserted', f.matter], ['Accused Product / Service', f.subject], ['Date', f.date], ['Prepared By', f.preparedBy]]),
				'',
				'## 1. Overview',
				'_Identify the asserted patent, the claim(s) asserted, and the accused product or service being mapped._',
				'',
				'## 2. Element-by-Element Evidence-of-Use Chart',
				'_Render as a markdown table with one row per claim element and columns for the accused product/feature and supporting evidence, mirroring the element-by-element chart produced by compare_claims: `| Claim Element | Accused Product Feature | Literal / DOE | Supporting Evidence |` — mark EACH element literal or doctrine-of-equivalents (Patent L.R. 3-1(e)). Cite specifications, teardown reports, marketing materials, or source documentation for each mapped element._',
				results,
				'',
				'## 3. Infringement Theory',
				'_For each element marked DOE in the chart: the function-way-result or insubstantial-differences rationale._',
				'',
				'## 4. Evidentiary Sources',
				'_Documents, specifications, or public materials relied upon for the evidence-of-use mapping._',
				'',
			];

		case 'patentability-opinion':
			return [
				'# Patentability Opinion',
				'',
				fieldTable([['Matter / Reference', f.matter], ['Invention Title', f.subject], ['Date', f.date], ['Prepared By', f.preparedBy]]),
				'',
				'## 1. Invention Summary',
				'_Describe the invention, its key features, and the claim(s) or claim concepts under evaluation._',
				'',
				'## 2. Prior Art Discussed',
				'_References considered, with publication/application numbers and a brief description of each._',
				'',
				'## 3. Novelty and Inventive-Step Analysis',
				results,
				'',
				'## 4. Per-Claim Assessment',
				'_ISA/237 Box V-style grid: `| Claim | Novelty (Y/N) | Inventive Step (Y/N) | Key Reference(s) |` — one row per claim or claim concept evaluated._',
				'',
				'## 5. Conclusion and Risk Assessment',
				'_Overall patentability conclusion with a risk rating (low/medium/high) and recommended next steps._',
				'',
			];

		case 'landscape-report':
			return [
				'# Patent Landscape Report',
				'',
				fieldTable([['Technology Area / Scope', f.subject], ['Search Criteria', f.searchStrategy], ['Date', f.date], ['Prepared By', f.preparedBy]]),
				'',
				'## 1. Executive Summary',
				'_The key findings in under a page — for many readers this is the only section read (WIPO Pub 946)._',
				'',
				'## 2. Scope & Methodology',
				section('_Technology area covered, search criteria (keywords, CPC/IPC codes, jurisdictions, date range), data source, and the data cutoff date._', f.searchStrategy),
				'',
				'## 3. Filing Trends, Assignees & Classification Breakdown',
				results,
				'',
				'## 4. White-Space Observations',
				'_Underexplored technology intersections, declining vs. emerging filing activity, and potential opportunity areas suggested by the data._',
				'',
				'## 5. Issues & Limitations',
				'_What the data cannot show: coverage and language limits, publication lag on the most recent 18 months, family-counting caveats, and any classification ambiguities._',
				'',
			];

		case 'portfolio-due-diligence-memo':
			return [
				'# Portfolio Due Diligence Memorandum',
				'',
				fieldTable([['Target / Portfolio', f.subject], ['Transaction / Purpose', f.matter], ['Date', f.date], ['Prepared By', f.preparedBy]]),
				'',
				'## 1. Portfolio Overview',
				'_Scope of the portfolio reviewed: number of assets, families, jurisdictions, and technology areas._',
				'',
				'## 2. Legal-Status Summary',
				'_Status of each asset (granted, pending, abandoned, expired) and maintenance-fee/annuity standing._',
				'',
				'## 3. Key Asset Analysis',
				results,
				'',
				'## 4. Encumbrances and Risks',
				'_Liens, licenses, litigation history, inventorship or ownership issues, and any other encumbrances identified._',
				'',
				'## 5. Valuation-Relevant Observations',
				'_Factors bearing on portfolio value: claim breadth, remaining term, citation activity, and market relevance._',
				'',
			];

		case 'dossier':
			return [
				'# Patent Dossier',
				'',
				fieldTable([['Publication', f.matter], ['Title / Technology', f.subject], ['Date', f.date], ['Prepared By', f.preparedBy]]),
				'',
				'## 1. Snapshot',
				'_Publication number, title, applicant, filing, priority and grant dates, and the current status, each as a retrieved record states it._',
				results,
				'',
				'## 2. Claims',
				'_Claim count, the independent claims by number, and claim 1 verbatim from the retrieved claim text; a claim text that was not retrieved is named as not read, never reconstructed._',
				'',
				'## 3. Family',
				'_Every family member with its publication number and, per designated state, its status and the dates it rests on (grant, last fee payment, lapse)._',
				'',
				'## 4. Legal Status',
				'_The events that decide whether the publication is in force, lapsed or expired, each with its date; an expiry is stated only from a retrieved term or adjustment record, or marked as an estimate._',
				'',
				'## 5. Citations',
				'_Backward citations with the search-report categories (X, Y, A) and the claims they were cited against; the forward-citation count with every route checked, a zero named as a zero from the sources reached, not a verified absence._',
				'',
				'## 6. US Family Chain',
				'_The US applications and grants of the family in filing order, each with its serial number, publication, grant date and maintenance standing; a DOCDB application id is never printed as a US serial._',
				'',
				'## 7. Sources and Limitations',
				'_The retrieved records each section rests on, what was not retrieved, and what a register check must still confirm._',
				'',
			];
	}
}
