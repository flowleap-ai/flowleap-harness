/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The longest-common-subsequence diff of two sequences, with the shape of the
 * change list the IDE's `draftDiff.ts` reads from VS Code's `LcsDiff`
 * (`util/vs/base/common/diff/diff.ts`, 1,300 lines with its own hashing and
 * trimming). The draft diff compares a few hundred paragraphs, so a plain
 * quadratic table is enough; this file replaces the import instead of copying
 * the VS Code module. Elements are compared by `===`.
 * @module
 */

/** One run of differing elements: `originalLength` of the first sequence replaced by `modifiedLength` of the second. */
export interface LcsChange {
	readonly originalStart: number;
	readonly originalLength: number;
	readonly modifiedStart: number;
	readonly modifiedLength: number;
}

/**
 * Diff two sequences into runs of changes between matched elements.
 * @param original - the first sequence.
 * @param modified - the second sequence.
 * @returns the changes in sequence order; an empty list when the sequences are equal.
 */
export function lcsDiff<T>(original: readonly T[], modified: readonly T[]): LcsChange[] {
	const n = original.length;
	const m = modified.length;
	// lengths[i][j] = length of the LCS of original[i..] and modified[j..]
	const lengths: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			lengths[i][j] = original[i] === modified[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
		}
	}
	const changes: LcsChange[] = [];
	let i = 0;
	let j = 0;
	let open: { originalStart: number; modifiedStart: number } | undefined;
	const close = () => {
		if (open) {
			changes.push({ originalStart: open.originalStart, originalLength: i - open.originalStart, modifiedStart: open.modifiedStart, modifiedLength: j - open.modifiedStart });
			open = undefined;
		}
	};
	while (i < n || j < m) {
		if (i < n && j < m && original[i] === modified[j]) {
			close();
			i++;
			j++;
			continue;
		}
		open ??= { originalStart: i, modifiedStart: j };
		// Prefer the side whose remaining LCS is longer; on a tie take the original first, as the IDE's diff does.
		if (j >= m || (i < n && lengths[i + 1][j] >= lengths[i][j + 1])) {
			i++;
		} else {
			j++;
		}
	}
	close();
	return changes;
}
