/*---------------------------------------------------------------------------------------------
 *  Zero-result hint for search_register (#582).
 *
 *  The EP Register has one name index per role (`re` representative, `op`
 *  opponent, `ia` inventor or applicant, `pa` applicant, `in` inventor) and
 *  one index that matches a name in any role, `nm`. An agent that searches
 *  `re=Boniberger` gets 0 because the person is an opponent, not a
 *  representative (live 2026-10-15: re 0, op 3, nm 5). This module turns a
 *  zero-hit role query into a suggestion to retry with `nm=`. It rewrites
 *  the CQL only; it never runs the fallback query.
 *
 *  The hint is computed at the tool layer, after the cache, so it is not part
 *  of the cached datum (RegisterSearchResponse) and no shape bump is needed.
 *--------------------------------------------------------------------------------------------*/

const ROLE_INDEXES = ['re', 'op', 'ia', 'pa', 'in'] as const;

const ROLE_INDEX_ALTERNATION = ROLE_INDEXES.join('|');

/**
 * One quoted value, or one role term `index=value` (value quoted or bare).
 * The quoted-value branch comes first so that a word inside quotes
 * (ti="in situ") is never read as the `in` index. `\b` keeps `pre=` and
 * `ti=repair` out.
 */
const ROLE_TERM = new RegExp(`"[^"]*"|\\b(?<index>${ROLE_INDEX_ALTERNATION})\\s*=\\s*(?<value>"[^"]*"|[^\\s()]+)`, 'g');

/** Any mention of a role index outside quotes, with whatever operator follows it. */
const ROLE_INDEX_MENTION = new RegExp(`"[^"]*"|\\b(?<index>${ROLE_INDEX_ALTERNATION})\\b(?=\\s*(?:=|<|>|\\s))`, 'g');

const ROLE_NOTE = 'The name can be in a different role (applicant, inventor, representative, opponent).';

const SURNAME_FIRST_NOTE = '(the register stores names surname-first)';

const GENERIC_RETRY = 'Retry with the nm= index, which matches a name in any role.';

/**
 * A quoted value of two or more words and no comma is "First Last", the order
 * the register does not store. Returns the surname-first form and the
 * surname alone (last word = surname, the rest = first names), or null for
 * any other value.
 */
function surnameFirstForms(value: string): { surnameFirst: string; surnameAlone: string } | null {
	if (!value.startsWith('"') || !value.endsWith('"')) {
		return null;
	}
	const words = value.slice(1, -1).trim().split(/\s+/);
	if (value.includes(',') || words.length < 2) {
		return null;
	}
	const surname = words[words.length - 1];
	return { surnameFirst: `"${surname}, ${words.slice(0, -1).join(' ')}"`, surnameAlone: surname };
}

function countRoleMentions(query: string): number {
	let count = 0;
	for (const match of query.matchAll(ROLE_INDEX_MENTION)) {
		if (match.groups?.index) {
			count += 1;
		}
	}
	return count;
}

/**
 * The hint for a register query that answered 0, or undefined when the query
 * uses no role-specific name index (nothing to suggest).
 *
 * Safe rewrite: every `role=value` term becomes `nm=value`; the rest of the
 * CQL (and/or/not, parentheses, date terms) is kept as it is. A quoted
 * "First Last" value is suggested surname-first, with the surname alone as
 * the alternative, because the register stores names surname-first. When a
 * role index is present but the rewrite cannot be trusted (unbalanced
 * quotes, an operator other than `=`), the hint names `nm=` without a
 * rewritten query.
 */
export function registerZeroHitHint(query: string): string | undefined {
	const mentions = countRoleMentions(query);
	if (mentions === 0) {
		return undefined;
	}

	const quotesBalanced = (query.match(/"/g) ?? []).length % 2 === 0;
	let rewritten = 0;
	let firstLast = false;
	let suggested = '';
	let surnameAlone = '';
	let last = 0;
	for (const match of query.matchAll(ROLE_TERM)) {
		const value = match.groups?.value;
		if (!value) {
			continue; // a quoted value, kept as it is
		}
		const forms = surnameFirstForms(value);
		const between = query.slice(last, match.index);
		suggested += `${between}nm=${forms?.surnameFirst ?? value}`;
		surnameAlone += `${between}nm=${forms?.surnameAlone ?? value}`;
		last = match.index + match[0].length;
		rewritten += 1;
		firstLast ||= forms !== null;
	}
	suggested += query.slice(last);
	surnameAlone += query.slice(last);

	const prefix = `No results for ${query}. ${ROLE_NOTE}`;
	if (!quotesBalanced || rewritten !== mentions) {
		return `${prefix} ${GENERIC_RETRY}`;
	}
	if (firstLast) {
		return `${prefix} Retry with ${suggested} ${SURNAME_FIRST_NOTE}, or with the surname alone: ${surnameAlone}.`;
	}
	return `${prefix} Retry with ${suggested}.`;
}
