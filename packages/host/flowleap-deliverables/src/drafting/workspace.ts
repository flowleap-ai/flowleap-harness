/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The files of one drafting matter (`drafting/<matter>/` under the working
 * directory) and the gate checks the drafting tools share: the IDE's
 * `draftingWorkspace.ts` (SOURCE.json) with its file I/O rewritten onto
 * `ctx.fs` and the Word files onto the host-path byte write of `../bytes.ts`.
 * The folder contract, the `approvedHash` binding, the Working Record fields,
 * the findings merge and the Drafting Checklist are the IDE's. Not ported:
 * the VS Code editors (the checklist is named in the result, never revealed),
 * the "app restarted" chat advice (the harness has no extension host; a
 * Session is the unit), the drawings `MatterFiles` (the drawing tools stay out
 * of S5) and the PDF style exemplar reader (a PDF exemplar is reported as
 * unread). The IDE's editor buttons ("click **Approve Claims** at the top of
 * the file", "click **Waive…** on the item") have no counterpart here, so
 * {@link withoutEditorButtons} rewrites every gate and waiver sentence to the
 * file edit first, then the question card and the slash command (S5 D3).
 * @module
 */

import * as mammoth from 'mammoth';
import type { Context } from '@deepseek-ai/cordis';
import { FsError, type FsTarget } from '@deepseek-ai/dsh-fs';
import { writeWorkspaceBytes } from '../bytes.ts';
import { sha256Hex } from '../report/text.ts';
import { checklistPointer, DraftingChecklist, DraftingChecklistStep, gateActionText, gateEdit, nextChecklistStep, readDraftingChecklist, renderChecklist, stepActionText } from './checklist.ts';
import { DraftFinding, findingLine, isInventorQuestion } from './finding.ts';
import { blockingFindings, mergeFindings, parseFindingsFile, renderFindingsFile } from './findings-file.ts';
import { DRAFT_DOCUMENT_TYPES, DRAFT_OUTLINE_SAVE, DRAFTING_FILE_NAMES, DRAFTING_STYLE_FOLDER, DraftingFolder, resolveDraftingFolder } from './folder-contract.ts';
import { DraftingFrontmatterFields, DraftingGateFlag, DraftingGateState, DraftingOffice, parseDraftingFrontmatter, readGateFlag, readOffice, writeDraftingFrontmatter } from './frontmatter.ts';
import { parseDraftOutline } from './outline.ts';
import { checkOutlineClaims } from './outline-validators.ts';
import { isStyleExemplar, MAX_STYLE_EXEMPLARS, renderStyleReadme, STYLE_README } from './style-folder.ts';
import { validateDraft } from './validate-draft.ts';
import { addRecordLine, APPROVAL_CLEARED, APPROVED_CLAIMS_HASH, emptyWorkingRecord, readRecordField, setRecordField, EXPORTED_DRAFT_HASH, VALIDATED_DRAFT_HASH, VERSION_CLAIMS_HASH } from './working-record.ts';

/** The largest drafting file read, text or Word: a matter folder holds documents, not archives. */
export const MAX_DRAFTING_FILE_BYTES = 50 * 1024 * 1024;

/** Characters of one exemplar returned; the rest is cut and the cut is stated. */
const MAX_EXEMPLAR_CHARS = 20_000;

/**
 * The last refusal of each matter and Figure, in memory. A refusal that repeats with the same
 * text means the agent anchors on its own refusal (seen 2026-10-16): the attorney starts a new
 * chat. The memory lives as long as the process. No file carries it, because the attorney never
 * reads it.
 */
const lastRefusals = new Map<string, string>();

/** Forgets every refusal; the tests call it between matters. */
export function forgetRefusals(): void {
	lastRefusals.clear();
}

/** The labels of the gate buttons the IDE shows, and the slash command of the same gate here. */
const GATE_CARD_COMMAND: Readonly<Record<string, string>> = { 'Approve Claims': 'approve-claims', 'Confirm Feature List': 'confirm-features' };

/** The end of the edit clause of a gate sentence: the first `.` outside backticks. */
function clauseEnd(text: string, from: number): number {
	let inCode = false;
	for (let index = from; index < text.length; index++) {
		const char = text[index];
		if (char === '`') {
			inCode = !inCode;
		} else if (char === '.' && !inCode) {
			return index;
		}
	}
	return text.length;
}

/**
 * The IDE's gate and waiver sentences name editor buttons the harness does not have. This keeps
 * the file edit first, which is the gate (PRD 0025: the file stays the gate), drops the button
 * clause, and adds the two ways the harness offers (S5 D3): the question card the drafting tool
 * shows in the chat, and the slash command. "then click **Approve Claims** at the top of the
 * file, or change `false` to `true` on line 3." becomes "then change `false` to `true` on line 3,
 * or answer the Approve Claims card in the chat, or type `/approve-claims hinge`."; "To waive,
 * click **Waive…** on the item in `findings.md:4`, or add under it:   - Waived: <your reason>"
 * becomes "To waive, add under the item in `findings.md:4`:   - Waived: <your reason>, or answer
 * the Waive Errors card validate_draft and export_draft_docx show in the chat, or type `/waive
 * hinge <findings.md line or rule> <reason>`".
 * @param text - a tool result, a refusal or the checklist text.
 * @param matter - the matter name the commands take; `<matter>` when unknown.
 * @returns the text without the editor-button clauses.
 */
export function withoutEditorButtons(text: string, matter = '<matter>'): string {
	const button = /then click \*\*(?<label>Approve Claims|Confirm Feature List)\*\* at the top of the file, or /g;
	let result = '';
	let last = 0;
	for (const match of text.matchAll(button)) {
		/* v8 ignore next -- the label group is not optional in the button pattern, so it is always set */
		const label = match.groups?.label ?? '';
		const editStart = match.index + match[0].length;
		const end = clauseEnd(text, editStart);
		result += `${text.slice(last, match.index)}then ${text.slice(editStart, end)}, or answer the ${label} card in the chat, or type \`/${GATE_CARD_COMMAND[label]} ${matter}\``;
		last = end;
	}
	result += text.slice(last);
	return result.replace(
		/To waive, click \*\*Waive…\*\* on the item in (?<where>.+?), or add under it: {3}- Waived: <your reason>/g,
		`To waive, add under the item in $<where>:   - Waived: <your reason>, or answer the Waive Errors card validate_draft and export_draft_docx show in the chat, or type \`/waive ${matter} <findings.md line or rule> <reason>\``,
	);
}

/** The chat advice at the end of every drafting tool result (PRD 0026 S2). */
const CHAT_ADVICE = {
	stay: 'Stay in this chat.',
	repeated: 'Start a new chat: the agent refused the same step twice.',
} as const;

/** The state of the claims approval of a matter, read from `claims.md` and the Working Record. */
export interface ClaimsApproval {
	/** The `approved` flag of `claims.md`, or `'no-file'` when the file does not exist. */
	readonly gate: DraftingGateState | 'no-file';
	/** SHA-256 of the claims body (the frontmatter is not hashed, so setting the flag does not change it). */
	readonly hash?: string;
	/** Why the approval does not hold for the draft, when the claims changed. */
	readonly changed?: string;
	/** True when this check set `approved: false` in `claims.md`. */
	readonly cleared?: boolean;
}

/** A style exemplar as text. */
export interface StyleExemplar {
	readonly path: string;
	readonly text?: string;
	readonly truncated?: boolean;
	readonly error?: string;
}

/** The outcome of a save of a drafting file: the refusal, or what was written. */
export type DraftingSaveResult =
	| { readonly saved: false; readonly reason: string }
	| { readonly saved: true; readonly message: string };

/** The Draft Outline of a matter and, when it was made for other claims, why it does not hold. */
export interface DraftOutlineState {
	/** `draft-outline.md`. */
	readonly text: string;
	/** Why the outline does not hold for the Approved Claims; absent when it was made for them. */
	readonly stale?: string;
}

/**
 * The file I/O of one working directory as the drafting tools use it: every path is relative to
 * the working directory and uses `/`; a path that escapes it is refused with an `Error`. The
 * production implementation is {@link workspaceFiles} over `ctx.fs`; a test may pass its own.
 */
export interface DraftingFiles {
	/** The absolute process path of the working directory. */
	readonly root: string;
	/** Reads a text file; `undefined` when it does not exist. */
	read(path: string): Promise<string | undefined>;
	/** Reads a file as bytes; `undefined` when it does not exist. */
	readBytes(path: string): Promise<Uint8Array | undefined>;
	/** Writes a text file, creating its folders. */
	write(path: string, text: string): Promise<void>;
	/** Writes a binary file, creating its folders. */
	writeBytes(path: string, bytes: Uint8Array): Promise<void>;
	/** The names of the regular files in a folder, sorted; empty when the folder does not exist. */
	listFiles(folder: string): Promise<string[]>;
	/** True when the path exists (file or folder). */
	exists(path: string): Promise<boolean>;
	/** The absolute process path of a workspace path, for the delivery card. */
	processPath(path: string): Promise<string>;
}

/**
 * Build the {@link DraftingFiles} of a working directory over `ctx.fs`.
 * @param ctx - a context whose `fs` is active.
 * @param cwd - the working directory's process path.
 * @param signal - the tool call's signal.
 * @returns the file I/O, fenced to the working directory.
 */
export async function workspaceFiles(ctx: Context, cwd: string, signal: AbortSignal): Promise<DraftingFiles> {
	const root = await ctx.fs.resolve(cwd, { signal });
	const rootPath = ctx.fs.processPath(root);
	const inside = async (path: string): Promise<FsTarget> => {
		const target = await ctx.fs.resolve(path, { cwd: rootPath, signal });
		if (!ctx.fs.contains(root, target)) {
			throw new Error(`Drafting files must stay within the working directory ${rootPath} (refused: ${path}).`);
		}
		return target;
	};
	const absent = (error: unknown): boolean => error instanceof FsError && (error.code === 'FS_NOT_FOUND' || error.code === 'FS_NOT_REGULAR_FILE');
	return {
		root: rootPath,
		async read(path) {
			const target = await inside(path);
			try {
				return await ctx.fs.readText(target, signal);
			} catch (error) {
				if (absent(error) || await ctx.fs.stat(target, signal) === undefined) { return undefined; }
				throw error;
			}
		},
		async readBytes(path) {
			const target = await inside(path);
			try {
				return await ctx.fs.readBytes(target, signal, MAX_DRAFTING_FILE_BYTES);
			} catch (error) {
				if (absent(error) || await ctx.fs.stat(target, signal) === undefined) { return undefined; }
				throw error;
			}
		},
		async write(path, text) {
			await ctx.fs.writeText(await inside(path), text, undefined, signal);
		},
		async writeBytes(path, bytes) {
			await writeWorkspaceBytes(ctx.fs, root, await inside(path), bytes, signal);
		},
		async listFiles(folder) {
			const target = await inside(folder);
			if ((await ctx.fs.stat(target, signal))?.type !== 'directory') { return []; }
			return (await ctx.fs.listDir(target, signal)).filter(entry => entry.type === 'file').map(entry => entry.name).sort();
		},
		async exists(path) {
			return await ctx.fs.stat(await inside(path), signal) !== undefined;
		},
		async processPath(path) {
			return ctx.fs.processPath(await inside(path));
		},
	};
}

/**
 * A Note, never an Error, when the claims file still carries the "not searched" status the
 * claim-drafting skill writes for claims drafted without a prior-art search. The attorney may
 * approve such claims on purpose; the record must show it.
 */
function unsearchedClaimsNote(claims: string): DraftFinding[] {
	const status = parseDraftingFrontmatter(claims).fields.status;
	if (typeof status !== 'string' || !/^not searched/i.test(status.trim())) {
		return [];
	}
	return [{ severity: 'Note', rule: 'claims-unsearched', file: DRAFTING_FILE_NAMES.claims, message: `The Approved Claims carry status "${status.trim()}": they were drafted without a prior-art search. Run the prior-art step and re-approve, or record in the review that the claims are deliberately unsearched.` }];
}

/**
 * The SHA-256 of the claims body of a `claims.md` text: the Approved Claims hash.
 * @param claims - the `claims.md` text.
 * @returns the hex digest.
 */
export function claimsHash(claims: string): string {
	return sha256Hex(parseDraftingFrontmatter(claims).body.trim());
}

/**
 * Why a Draft Outline was not made for the claims with this hash, or `undefined` when it was:
 * the `outline-claims` rule, whose message names both hashes.
 */
function outlineStaleReason(outline: string, approvedClaimsHash: string): string | undefined {
	return checkOutlineClaims(parseDraftOutline(outline), approvedClaimsHash)[0]?.message;
}

/**
 * The SHA-256 of a draft text together with the claims body it was checked or exported with: a
 * validator run or an export is current while the hash of the current files matches.
 * @param draft - the draft text.
 * @param claims - the `claims.md` text.
 * @returns the hex digest.
 */
export function draftHash(draft: string, claims: string): string {
	return sha256Hex(`${draft}\0${claimsHash(claims)}`);
}

/** The frontmatter field of `claims.md` that ties `approved: true` to the claims body it approved. */
export const APPROVED_HASH_FIELD = 'approvedHash';

/** The fields with `approvedHash` set right after `approved`. */
function withApprovedHash(fields: DraftingFrontmatterFields, hash: string): DraftingFrontmatterFields {
	const result: DraftingFrontmatterFields = {};
	for (const [key, value] of Object.entries(withoutApprovedHash(fields))) {
		result[key] = value;
		if (key === 'approved') {
			result[APPROVED_HASH_FIELD] = hash;
		}
	}
	return result;
}

function withoutApprovedHash(fields: DraftingFrontmatterFields): DraftingFrontmatterFields {
	return Object.fromEntries(Object.entries(fields).filter(([key]) => key !== APPROVED_HASH_FIELD));
}

/** The Figure number of a `FIG-N.svg` or `FIG-NA.svg` file name; the IDE's `figureOfSvgFile` reduced to the test the checklist needs. */
function isFigureSvgFile(name: string): boolean {
	return /^FIG-[1-9]\d*[A-Z]?\.svg$/.test(name);
}

/**
 * The refusal sentence for a gate that is not open: the one edit that opens it, with the file and
 * the line, e.g. "Review `drafting/x/claims.md:3`, then change `false` to `true` on line 3."
 * `text` is the file, absent when the file does not exist.
 */
function gateRefusal(path: string, flag: DraftingGateFlag, text: string | undefined, matter: string): string {
	if (text === undefined) {
		return `${path} does not exist. The attorney opens this gate in that file after review.`;
	}
	return `${withoutEditorButtons(gateActionText(path, gateEdit(text, flag)), matter)} Only the attorney opens this gate; a statement in chat does not open it.`;
}

/** The clock and the optional PDF reader a workspace runs with. */
export interface DraftingWorkspaceOptions {
	/** The clock of the record lines; a test passes its own. */
	readonly now?: () => Date;
	/** Reads the text of a PDF style exemplar; without one a PDF exemplar is reported as unread. */
	readonly pdfText?: (path: string, bytes: Uint8Array) => Promise<string>;
}

/**
 * The files of one drafting matter (`drafting/<matter>/` in the working directory) and the gate
 * checks the drafting tools share. Every read and write goes through {@link DraftingFiles}, which
 * fences the working directory.
 */
export class DraftingWorkspace {

	/**
	 * Opens the matter folder of the working directory. Returns the refusal text when the matter
	 * name is not a folder name under `drafting/`.
	 * @param matter - the matter folder name under `drafting/`.
	 * @param files - the file I/O of the working directory.
	 * @param options - the clock and the optional PDF reader.
	 * @returns the workspace, or the refusal text.
	 */
	static locate(matter: string | undefined, files: DraftingFiles, options: DraftingWorkspaceOptions = {}): DraftingWorkspace | string {
		matter ??= '';
		const folder = resolveDraftingFolder(matter);
		if (!folder) {
			return `"${matter}" is not a matter name. Give the folder name under drafting/, e.g. "hinge" for drafting/hinge/.`;
		}
		return new DraftingWorkspace(files, folder, options);
	}

	private readonly now: () => Date;

	constructor(
		readonly files: DraftingFiles,
		readonly folder: DraftingFolder,
		private readonly options: DraftingWorkspaceOptions = {},
	) {
		this.now = options.now ?? (() => new Date());
	}

	/**
	 * The clock of the record lines (a test's, or the wall clock).
	 * @returns the current time.
	 */
	clock(): Date {
		return this.now();
	}

	/**
	 * Reads a workspace-relative file as bytes; `undefined` when it does not exist.
	 * @param path - the workspace-relative path.
	 * @returns the bytes, or `undefined`.
	 */
	readBytes(path: string): Promise<Uint8Array | undefined> {
		return this.files.readBytes(path);
	}

	/**
	 * Reads a workspace-relative text file; `undefined` when it does not exist.
	 * @param path - the workspace-relative path.
	 * @returns the text, or `undefined`.
	 */
	read(path: string): Promise<string | undefined> {
		return this.files.read(path);
	}

	/**
	 * Writes a workspace-relative file, text through `ctx.fs`, bytes through the host path.
	 * @param path - the workspace-relative path.
	 * @param content - the text or the bytes.
	 */
	write(path: string, content: string | Uint8Array): Promise<void> {
		return typeof content === 'string' ? this.files.write(path, content) : this.files.writeBytes(path, content);
	}

	/**
	 * Reads the claims approval. The approval is tied to the claims body by `approvedHash` in the
	 * frontmatter of `claims.md`, beside `approved`:
	 *
	 * - `approved: true` without `approvedHash` is a new approval: the hash of the body is written.
	 * - `approved: true` with an `approvedHash` the body no longer has: the claims changed after
	 *   approval, so `approved` is set to `false`, `approvedHash` is removed and the clearing is
	 *   recorded in the Working Record. The attorney's next `approved: true` is a new approval.
	 * - `approved` not `true`: a left-over `approvedHash` is removed, so a later approval is new.
	 *
	 * When the approval holds but the saved draft version was generated against other claims, the
	 * draft is stale (`changed`, not `cleared`).
	 * @returns the approval state.
	 */
	async checkClaimsApproval(): Promise<ClaimsApproval> {
		const text = await this.read(this.folder.claims);
		if (text === undefined) {
			return { gate: 'no-file' };
		}
		const { fields } = parseDraftingFrontmatter(text);
		const hash = claimsHash(text);
		const gate = readGateFlag(fields, 'approved');
		const approvedHash = fields[APPROVED_HASH_FIELD];
		if (gate === 'set' && approvedHash !== undefined && approvedHash !== hash) {
			await this.write(this.folder.claims, writeDraftingFrontmatter({ ...withoutApprovedHash(fields), approved: false }, text));
			const record = await this.read(this.folder.workingRecord) ?? emptyWorkingRecord(this.folder.matter);
			await this.write(this.folder.workingRecord, addRecordLine(record, APPROVAL_CLEARED, `${this.now().toISOString()} (${DRAFTING_FILE_NAMES.claims} changed after approval)`));
			return {
				gate: 'not-true',
				hash,
				cleared: true,
				/* v8 ignore next -- the line above wrote claims.md, so the read finds it */
				changed: `${this.folder.claims} changed after it was approved, so the approval was withdrawn. ${withoutEditorButtons(gateActionText(this.folder.claims, gateEdit(await this.read(this.folder.claims) ?? '', 'approved')), this.folder.matter)} Then start_application_draft and a new save start the next draft version.`,
			};
		}
		if (gate === 'set' && approvedHash === undefined) {
			await this.write(this.folder.claims, writeDraftingFrontmatter(withApprovedHash(fields, hash), text));
		} else if (gate !== 'set' && approvedHash !== undefined) {
			await this.write(this.folder.claims, writeDraftingFrontmatter(withoutApprovedHash(fields), text));
		}
		const versionHash = readRecordField(await this.read(this.folder.workingRecord) ?? '', VERSION_CLAIMS_HASH);
		if (versionHash && versionHash !== hash) {
			return { gate, hash, changed: `The saved draft was generated against other claims than the current ${this.folder.claims}. Call start_application_draft, regenerate the specification and save it: the save starts the next draft version.` };
		}
		return { gate, hash };
	}

	/**
	 * The `confirmed` gate of `feature-list.md`: its frontmatter fields when the flag is set, else
	 * the refusal naming the flag and the file.
	 * @returns the Feature List, or the refusal.
	 */
	async requireConfirmedFeatureList(): Promise<{ readonly text: string; readonly fields: DraftingFrontmatterFields } | string> {
		const text = await this.read(this.folder.featureList);
		if (text === undefined) {
			return gateRefusal(this.folder.featureList, 'confirmed', undefined, this.folder.matter);
		}
		const { fields } = parseDraftingFrontmatter(text);
		return readGateFlag(fields, 'confirmed') === 'set' ? { text, fields } : gateRefusal(this.folder.featureList, 'confirmed', text, this.folder.matter);
	}

	/**
	 * The `approved` gate of `claims.md` (see {@link checkClaimsApproval}): the approval when it
	 * holds, else the refusal naming the flag and the file, or saying that the claims changed.
	 * A stale draft (`changed` without `cleared`) is returned for the caller to judge.
	 * @returns the approval with its hash, or the refusal.
	 */
	async requireApprovedClaims(): Promise<ClaimsApproval & { readonly hash: string } | string> {
		const approval = await this.checkClaimsApproval();
		if (approval.changed && approval.cleared) {
			return approval.changed;
		}
		if (approval.gate !== 'set' || !approval.hash) {
			/* v8 ignore next -- a gate other than no-file means checkClaimsApproval read claims.md */
			return gateRefusal(this.folder.claims, 'approved', approval.gate === 'no-file' ? undefined : await this.read(this.folder.claims) ?? '', this.folder.matter);
		}
		return { ...approval, hash: approval.hash };
	}

	/**
	 * Records the approved claims hash in the Working Record: the claims the next draft is generated against.
	 * @param hash - the Approved Claims hash.
	 */
	async recordApprovedClaims(hash: string): Promise<void> {
		const record = await this.read(this.folder.workingRecord) ?? emptyWorkingRecord(this.folder.matter);
		await this.write(this.folder.workingRecord, setRecordField(record, APPROVED_CLAIMS_HASH, hash));
	}

	/**
	 * Reads `draft-outline.md` and checks that its `claims` hash is the given Approved Claims hash;
	 * `undefined` when the file does not exist.
	 *
	 * Editing the claims clears the outline binding as it clears `approved`, with no edit of the
	 * outline file: the claims body gets a new hash, so the outline's `claims` hash no longer
	 * matches. The hash mismatch is the signal.
	 * @param approvedClaimsHash - the Approved Claims hash.
	 * @returns the outline, or `undefined`.
	 */
	async readOutline(approvedClaimsHash: string): Promise<DraftOutlineState | undefined> {
		const text = await this.read(this.folder.draftOutline);
		if (text === undefined) {
			return undefined;
		}
		const stale = outlineStaleReason(text, approvedClaimsHash);
		return stale ? { text, stale } : { text };
	}

	/**
	 * The Draft Outline precondition of the draft save (PRD 0022 decision 1: a code precondition,
	 * not a human gate): the outline text when `draft-outline.md` exists and was made for the given
	 * Approved Claims hash, else the refusal naming the file and the template to save it with.
	 * @param approvedClaimsHash - the Approved Claims hash.
	 * @returns the outline text, or the refusal.
	 */
	async requireOutline(approvedClaimsHash: string): Promise<string | { readonly text: string }> {
		const outline = await this.readOutline(approvedClaimsHash);
		const path = this.folder.draftOutline;
		if (!outline) {
			return `${path} does not exist. Save the Draft Outline for the Approved Claims ${DRAFT_OUTLINE_SAVE}, to ${path} first; then save the draft.`;
		}
		return outline.stale ? `${outline.stale} Save it ${DRAFT_OUTLINE_SAVE}, to ${path}; then save the draft.` : { text: outline.text };
	}

	/**
	 * The result of a save, ending with the checklist line: after a refusal the open steps, else the
	 * next step. The checklist is written also after a refusal.
	 * @param result - the save result.
	 * @returns the result with the checklist line.
	 */
	async withChecklistLine(result: DraftingSaveResult): Promise<DraftingSaveResult> {
		const checklist = await this.checklistLine(!result.saved, result.saved ? undefined : result.reason);
		if (!checklist) {
			return result;
		}
		return result.saved ? { saved: true, message: `${result.message}\n${checklist}` } : { saved: false, reason: `${result.reason} ${checklist}` };
	}

	/**
	 * The office of the draft: the draft's frontmatter, else the Feature List's.
	 * @param draft - the draft text, if any.
	 * @returns the office, or `undefined`.
	 */
	async office(draft: string | undefined): Promise<DraftingOffice | undefined> {
		const fromDraft = draft ? readOffice(parseDraftingFrontmatter(draft).fields) : undefined;
		if (fromDraft) {
			return fromDraft;
		}
		const featureList = await this.read(this.folder.featureList);
		return featureList ? readOffice(parseDraftingFrontmatter(featureList).fields) : undefined;
	}

	/**
	 * Runs the validators over the draft, with the Draft Outline rules against the current claims
	 * (an `outline-claims` Error when `draft-outline.md` does not exist), adds the claims-change
	 * Error and the advisory items, and writes `findings.md` merged with the previous one (waivers
	 * kept). Records the hash of the validated draft in the Working Record, so the Drafting
	 * Checklist knows when `findings.md` is older than the draft. Returns the merged findings.
	 * @param office - the office whose validators run.
	 * @param draft - the draft text.
	 * @param claims - the `claims.md` text.
	 * @param approval - the claims approval.
	 * @param advisory - the Advisory items of the caller.
	 * @returns the merged findings.
	 */
	async validate(office: DraftingOffice, draft: string, claims: string, approval: ClaimsApproval, advisory: readonly DraftFinding[]): Promise<DraftFinding[]> {
		const figures = await this.read(this.folder.figures);
		const inventorAnswers = await this.read(this.folder.inventorAnswers);
		const outline = { text: await this.read(this.folder.draftOutline), approvedClaimsHash: claimsHash(claims), featureList: await this.read(this.folder.featureList) ?? '' };
		const current: DraftFinding[] = [
			...(approval.changed ? [{ severity: 'Error' as const, rule: 'claims-changed', file: DRAFTING_FILE_NAMES.claims, message: approval.changed }] : []),
			...unsearchedClaimsNote(claims),
			...validateDraft({ office, draft, claims, figures, inventorAnswers, outline }),
			...advisory,
		];
		const previous = parseFindingsFile(await this.read(this.folder.findings) ?? '');
		const merged = mergeFindings(current, previous);
		await this.write(this.folder.findings, renderFindingsFile(merged));
		const record = await this.read(this.folder.workingRecord) ?? emptyWorkingRecord(this.folder.matter);
		await this.write(this.folder.workingRecord, setRecordField(record, VALIDATED_DRAFT_HASH, draftHash(draft, claims)));
		return merged;
	}

	/**
	 * Records in the Working Record the hash of the draft and claims an export was written from.
	 * @param draft - the exported draft.
	 * @param claims - the `claims.md` text.
	 */
	async recordExport(draft: string, claims: string): Promise<void> {
		const record = await this.read(this.folder.workingRecord) ?? emptyWorkingRecord(this.folder.matter);
		await this.write(this.folder.workingRecord, setRecordField(record, EXPORTED_DRAFT_HASH, draftHash(draft, claims)));
	}

	/**
	 * The names of the files in a workspace-relative folder, sorted; empty when the folder does not exist.
	 * @param path - the workspace-relative folder.
	 * @returns the file names.
	 */
	listFiles(path: string): Promise<string[]> {
		return this.files.listFiles(path);
	}

	/**
	 * True when the workspace-relative path exists.
	 * @param path - the workspace-relative path.
	 * @returns true when it exists.
	 */
	exists(path: string): Promise<boolean> {
		return this.files.exists(path);
	}

	/**
	 * Writes the Drafting Checklist (`checklist.md`) from the files of the matter and returns it.
	 * Every drafting tool calls it after it runs, also after a refusal, so the file shows the new
	 * state at once (#785). Nothing is written while the matter has no folder and no drafting input.
	 * @returns the checklist, or `undefined` when nothing was written.
	 */
	async writeChecklist(): Promise<DraftingChecklist | undefined> {
		const { folder } = this;
		const [featureList, claims, draftOutline, draft] = [await this.read(folder.featureList), await this.read(folder.claims), await this.read(folder.draftOutline), await this.read(folder.draft)];
		if (featureList === undefined && claims === undefined && draftOutline === undefined && draft === undefined && !await this.exists(folder.folder)) {
			return undefined;
		}
		const findings = await this.read(folder.findings);
		const record = await this.read(folder.workingRecord) ?? '';
		const currentHash = draft !== undefined && claims !== undefined ? draftHash(draft, claims) : undefined;
		let exported = !!currentHash && readRecordField(record, EXPORTED_DRAFT_HASH) === currentHash;
		for (const type of DRAFT_DOCUMENT_TYPES) {
			exported &&= await this.exists(folder.docx[type]);
		}
		const claimsFields = claims !== undefined ? parseDraftingFrontmatter(claims).fields : {};
		const approvedHash = claimsFields[APPROVED_HASH_FIELD];
		const versionHash = readRecordField(record, VERSION_CLAIMS_HASH);
		const checklist = readDraftingChecklist({
			matter: folder.matter,
			featureList,
			claims,
			claimsChangedSinceApproval: claims !== undefined && readGateFlag(claimsFields, 'approved') === 'set' && approvedHash !== undefined && approvedHash !== claimsHash(claims),
			draftOutline,
			outlineStale: draftOutline !== undefined && (claims === undefined || !!outlineStaleReason(draftOutline, claimsHash(claims))),
			draft,
			draftStale: draft !== undefined && claims !== undefined && !!versionHash && versionHash !== claimsHash(claims),
			figures: await this.read(folder.figures),
			drawnFigures: (await this.listFiles(folder.drawings)).filter(isFigureSvgFile).length,
			inventorAnswers: await this.read(folder.inventorAnswers),
			findings,
			findingsCurrent: findings !== undefined && !!currentHash && readRecordField(record, VALIDATED_DRAFT_HASH) === currentHash,
			exported,
			styleExemplars: await this.countStyleExemplars(),
		});
		await this.write(folder.checklist, withoutEditorButtons(renderChecklist(checklist), folder.matter));
		return checklist;
	}

	/**
	 * The text of a refused tool call: the reason, then the open steps of the Drafting Checklist,
	 * which is written first. `prefix` says what did not happen, e.g. "The draft was not exported.".
	 * `figure` is the Figure the call was for, so the chat advice counts a repeated refusal per Figure.
	 * @param prefix - what did not happen.
	 * @param reason - why.
	 * @param figure - the Figure the call was for.
	 * @returns the refusal text.
	 */
	async refusal(prefix: string, reason: string, figure?: string | number): Promise<string> {
		const pointer = await this.checklistLine(true, reason, figure);
		return `${prefix} ${reason}${pointer ? `${reason.includes('\n') ? '\n' : ' '}${pointer}` : ''}`;
	}

	/**
	 * The text of a tool result that ran, then on a new line the next step of the Drafting Checklist, which is written first.
	 * @param text - the result text.
	 * @returns the text with the checklist line.
	 */
	async textWithChecklistLine(text: string): Promise<string> {
		const line = await this.checklistLine(false);
		return line ? `${text}\n${line}` : text;
	}

	/**
	 * Creates the style folder when it has no README, writes the Drafting Checklist and returns the
	 * sentence a tool result ends with: after a refusal the open steps, else the next step; then
	 * what the attorney does for the next step, with the file and the line, unless `said` (the
	 * refusal reason) already says it; then the chat advice (PRD 0026 S2). Empty when no checklist
	 * was written. `figure` is the Figure a drawings tool ran for.
	 * @param refused - whether the call was refused.
	 * @param said - the refusal reason, so the line does not repeat it.
	 * @param figure - the Figure the call was for.
	 * @returns the sentence, or empty.
	 */
	async checklistLine(refused: boolean, said?: string, figure?: string | number): Promise<string> {
		await this.ensureStyleFolder();
		const checklist = await this.writeChecklist();
		if (!checklist) {
			return '';
		}
		const advice = this.chatAdvice(refused ? said : undefined, figure);
		const next = nextChecklistStep(checklist);
		// The reason was rewritten for the harness already (card and command clauses), so the action is rewritten before the two are compared.
		const action = next ? withoutEditorButtons(this.stepAction(next), this.folder.matter) : '';
		const nextAction = action && !said?.includes(action) ? ` Next: ${action}` : '';
		if (refused) {
			return withoutEditorButtons(`${checklistPointer(checklist, this.folder.checklist)}${nextAction} ${advice}`, this.folder.matter);
		}
		return withoutEditorButtons(`Wrote ${this.folder.checklist}: ${next ? `the next step for the attorney is step ${next.step} (${next.title}).${nextAction}` : 'every step is done.'} ${advice}`, this.folder.matter);
	}

	/**
	 * Whether the attorney stays in this chat (PRD 0026 S2): a new chat after the same refusal
	 * twice for the same matter and Figure. A call that ran forgets the last refusal of its matter
	 * and Figure.
	 */
	private chatAdvice(refusal: string | undefined, figure: string | number | undefined): string {
		const key = `${this.files.root}|${this.folder.matter}|${figure ?? ''}`;
		const repeated = refusal !== undefined && lastRefusals.get(key) === refusal;
		if (refusal === undefined) {
			lastRefusals.delete(key);
		} else {
			lastRefusals.set(key, refusal);
		}
		return repeated ? CHAT_ADVICE.repeated : CHAT_ADVICE.stay;
	}

	/** What the attorney does for a checklist step, with every `` `file:line` `` as a workspace path. */
	private stepAction(entry: DraftingChecklistStep): string {
		return stepActionText(entry, file => `${this.folder.folder}/${file}`);
	}

	/**
	 * Creates the workspace `style/` folder with its `README.md` when the README is missing. Never
	 * overwrites the README or any other file.
	 */
	private async ensureStyleFolder(): Promise<void> {
		const readme = `${DRAFTING_STYLE_FOLDER}/${STYLE_README}`;
		if (!await this.exists(readme)) {
			await this.write(readme, renderStyleReadme());
		}
	}

	/** The number of style exemplars in the workspace `style/` folder (the README is none). */
	private async countStyleExemplars(): Promise<number> {
		return (await this.listFiles(DRAFTING_STYLE_FOLDER)).filter(isStyleExemplar).length;
	}

	/**
	 * Reads up to five style exemplars from the workspace `style/` folder, in name order; never the README.
	 * @returns the exemplars, in name order.
	 */
	async styleExemplars(): Promise<StyleExemplar[]> {
		const names = (await this.listFiles(DRAFTING_STYLE_FOLDER)).filter(isStyleExemplar).slice(0, MAX_STYLE_EXEMPLARS);
		const exemplars: StyleExemplar[] = [];
		for (const name of names) {
			const path = `${DRAFTING_STYLE_FOLDER}/${name}`;
			try {
				const text = await this.exemplarText(path);
				exemplars.push(text.length > MAX_EXEMPLAR_CHARS ? { path, text: text.slice(0, MAX_EXEMPLAR_CHARS), truncated: true } : { path, text });
			} catch (error) {
				exemplars.push({ path, error: error instanceof Error ? error.message : String(error) });
			}
		}
		return exemplars;
	}

	private async exemplarText(path: string): Promise<string> {
		const bytes = await this.readBytes(path);
		if (!bytes) {
			throw new Error('the file could not be read');
		}
		if (/\.pdf$/i.test(path)) {
			if (!this.options.pdfText) {
				throw new Error('PDF exemplars are not read in this harness; save the exemplar as .docx or .md');
			}
			return this.options.pdfText(path, bytes);
		}
		if (/\.docx$/i.test(path)) {
			return (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
		}
		return new TextDecoder().decode(bytes);
	}
}

/**
 * Counts by severity and the blocking list, for a tool result.
 * @param findings - the findings.
 * @returns the two lines.
 */
export function findingsSummary(findings: readonly DraftFinding[]): string {
	const errors = findings.filter(finding => finding.severity === 'Error' && !isInventorQuestion(finding));
	const questions = findings.filter(isInventorQuestion);
	const count = (severity: DraftFinding['severity']) => findings.filter(finding => finding.severity === severity).length;
	const blocking = blockingFindings(findings);
	return [
		`Errors: ${errors.length} (${errors.filter(finding => finding.waived).length} waived). Inventor Questions: ${questions.length} (${questions.filter(finding => finding.waived).length} waived). Notes: ${count('Note')}. Advisory: ${count('Advisory')}.`,
		blocking.length ? `Blocking export (${blocking.length}):\n${blocking.map(findingLine).join('\n')}` : 'No unwaived Error and no open Inventor Question.',
	].join('\n');
}
