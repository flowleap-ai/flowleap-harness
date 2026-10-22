/*---------------------------------------------------------------------------------------------
 *  The structured `reason` values a search_academic source row can carry.
 *
 *  A leaf module with no imports: the tool description, the served docs and
 *  the lib spell each value from here (ADR 0014 rule 4: clients match codes,
 *  never message text), and a test that mocks the lib module whole still sees
 *  the value.
 *--------------------------------------------------------------------------------------------*/

/** Semantic Scholar refused the forwarded X-Semantic-Scholar-Key (#571). */
export const KEY_REJECTED_REASON = 'key_rejected' as const;
