/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The `draft-outline` save of `write_patent_results`: the IDE's
 * `draftOutlineSave.ts` (SOURCE.json) with its imports rewritten onto this
 * package. The gates refuse with the file edit, the card and the command (see
 * `workspace.ts`); the save itself never asks.
 * @module
 */

import { DraftFinding, findingLine } from './finding.ts';
import { DRAFT_OUTLINE_SAVE } from './folder-contract.ts';
import { parseDraftingFrontmatter, readOffice, writeDraftingFrontmatter } from './frontmatter.ts';
import { parseDraftOutline } from './outline.ts';
import { checkOutline } from './outline-validators.ts';
import { addRecordLine, emptyWorkingRecord, OUTLINE_RESAVED } from './working-record.ts';
import { sha256Hex } from '../report/text.ts';
import { DraftingSaveResult, DraftingWorkspace } from './workspace.ts';

/** Errors listed in the tool result; the rest are counted. */
const MAX_LISTED_ERRORS = 10;

/** The outline findings in a few lines: the counts, then the Errors to fix before drafting. */
function outlineFindingsSummary(findings: readonly DraftFinding[]): string {
	const errors = findings.filter(finding => finding.severity === 'Error');
	const notes = findings.length - errors.length;
	if (!errors.length) {
		/* v8 ignore next -- checkOutline reports Errors only, so notes is 0 */
		return `Outline check: no Error${notes ? `, ${notes} Note(s)` : ''}.`;
	}
	const more = errors.length - MAX_LISTED_ERRORS;
	return [
		/* v8 ignore start -- checkOutline reports Errors only, so notes is 0 */
		`Outline check: ${errors.length} Error(s)${notes ? `, ${notes} Note(s)` : ''}. Fix them in the outline and save it again before drafting:`,
		/* v8 ignore stop */
		...errors.slice(0, MAX_LISTED_ERRORS).map(findingLine),
		...(more > 0 ? [`- and ${more} more.`] : []),
	].join('\n');
}

/**
 * Saves a Draft Outline (the `draft-outline` template of `write_patent_results`, PRD 0022):
 * `draft-outline.md` with the frontmatter `office` (from the Feature List) and `claims` (the
 * SHA-256 of the Approved Claims, as the drafting tools compute it), then the outline table as the
 * model wrote it.
 *
 * The save refuses while `confirmed` is not `true` in `feature-list.md` or `approved` is not `true`
 * in `claims.md`, and when the content has no Outline Item to read (no table, or no row that
 * parses): the refusal names the first parse error. A save that replaces a different
 * `draft-outline.md` (for example one the attorney edited) adds an `Outline re-saved` line with
 * both hashes to the Working Record. The outline rules never block the save; their
 * Errors are listed in the result. After the save, also after a refusal, it writes the Drafting
 * Checklist.
 * @param workspace - the matter.
 * @param content - the outline table as the model wrote it.
 * @returns the refusal, or what was written.
 */
export async function saveDraftOutline(workspace: DraftingWorkspace, content: string): Promise<DraftingSaveResult> {
	return workspace.withChecklistLine(await save(workspace, content));
}

async function save(workspace: DraftingWorkspace, content: string): Promise<DraftingSaveResult> {
	const { folder } = workspace;
	const featureList = await workspace.requireConfirmedFeatureList();
	if (typeof featureList === 'string') {
		return { saved: false, reason: featureList };
	}
	const office = readOffice(featureList.fields);
	if (!office) {
		return { saved: false, reason: `${folder.featureList} names no office. Its frontmatter needs \`office: US\` or \`office: EPO\`.` };
	}
	const approval = await workspace.requireApprovedClaims();
	if (typeof approval === 'string') {
		return { saved: false, reason: approval };
	}

	const { fields } = parseDraftingFrontmatter(content);
	const others = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== 'office' && key !== 'claims'));
	const document = writeDraftingFrontmatter({ office, claims: approval.hash, ...others }, content);
	const outline = parseDraftOutline(document);
	if (!outline.items.length) {
		const [first] = outline.errors;
		return { saved: false, reason: `The content has no Outline Item to save: ${first ? `line ${first.line}: ${first.message}` : 'the Outline table has no rows.'} Write the plan as one table, one row per Outline Item, and save it again ${DRAFT_OUTLINE_SAVE}.` };
	}
	const previous = await workspace.read(folder.draftOutline);
	await workspace.write(folder.draftOutline, document);
	if (previous !== undefined && previous !== document) {
		const record = await workspace.read(folder.workingRecord) ?? emptyWorkingRecord(folder.matter);
		await workspace.write(folder.workingRecord, addRecordLine(record, OUTLINE_RESAVED, `${sha256Hex(previous).slice(0, 12)} → ${sha256Hex(document).slice(0, 12)}`));
	}

	// Read again: requireApprovedClaims may have rewritten the frontmatter of claims.md, which moves the claim lines.
	const findings = checkOutline({
		outline: document,
		/* v8 ignore next -- requireApprovedClaims read claims.md, so it exists */
		claims: await workspace.read(folder.claims) ?? '',
		approvedClaimsHash: approval.hash,
		featureList: featureList.text,
		figures: await workspace.read(folder.figures),
		inventorAnswers: await workspace.read(folder.inventorAnswers),
	});
	return {
		saved: true,
		message: [
			`Saved ${folder.draftOutline} (office ${office}, ${outline.items.length} Outline Item(s), made for the Approved Claims with SHA-256 ${approval.hash}). Tell the attorney the outline is in the folder and may be edited before drafting; it is not a gate. The draft save refuses while the outline is missing or made for other claims.`,
			outlineFindingsSummary(findings),
		].join('\n'),
	};
}
