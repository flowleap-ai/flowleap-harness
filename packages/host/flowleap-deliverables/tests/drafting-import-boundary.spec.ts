/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The drafting layer is a copy of the IDE's `tools/common/drafting` (SOURCE.json) and stays
 * pure: a file under `src/drafting` imports its siblings and `yaml` only, never the drawings
 * engine (#798 in the IDE), the report core, dsh seams or Node. The IDE's `vs` diff module is
 * replaced by the local `lcs-diff.ts`, so the folder has no import outside itself. The
 * exceptions are `workspace.ts`, the file I/O over `ctx.fs`, which is a rewrite, not a copy, and
 * the two saves (`draft-application-save.ts`, `draft-outline-save.ts`), copies of the IDE's
 * `vscode-node` modules, which read `sha256Hex` from the report core as the IDE reads it from
 * `util/node/crypto`.
 */

const DRAFTING = path.resolve(import.meta.dirname, '../src/drafting');

const importPattern = /\bfrom\s+'(?<specifier>[^']+)'|\bimport\(\s*'(?<dynamic>[^']+)'\s*\)/g;

const allowed = /^(?:\.\/[a-z-]+\.ts|yaml)$/;

/** Every `.ts` file under a folder, recursively, relative to it. */
function sourceFiles(folder: string, prefix = ''): string[] {
	return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
		const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			return sourceFiles(path.join(folder, entry.name), relative);
		}
		return entry.name.endsWith('.ts') ? [relative] : [];
	});
}

describe('drafting import boundary', () => {
	it('no file under src/drafting imports anything but a sibling or yaml', () => {
		const rewritten = new Set(['workspace.ts', 'draft-application-save.ts', 'draft-outline-save.ts']);
		const offenders = sourceFiles(DRAFTING).filter(file => !rewritten.has(file)).flatMap(file => {
			const text = readFileSync(path.join(DRAFTING, file), 'utf8');
			return [...text.matchAll(importPattern)]
				.map(match => match.groups?.specifier ?? match.groups?.dynamic ?? '')
				.filter(specifier => !allowed.test(specifier))
				.map(specifier => `${file}: ${specifier}`);
		});
		expect(offenders).toEqual([]);
	});
});
