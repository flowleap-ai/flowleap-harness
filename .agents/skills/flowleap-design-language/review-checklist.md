# Design review checklist

The checklist applies to the IPMS screens only. The reviewer checks the built screen, not the mockup, at 1440 × 900, 1366 × 650 and 390 px, in light and dark, and in German. Copy this list into the PR and write PASS or FAIL after each item, with a screenshot or a measurement for each FAIL. An item that does not apply to the screen is PASS with the reason ("no list on this screen"). Script paths are relative to the skill folder.

1. The founder approved the mockups of this screen before the code, and the PR links the approval.
2. The PR has a table: choice, Linear screen URL, why. One row for each new component, token or value not a client token or in rules.md.
3. `node scripts/check-css.mjs <changed CSS and scripts>` exits 0, and the largest text is the screen's key fact or title (R1, R2, R4, R5, R7, R9, R15). Each radius has its role of R7.
4. Only weights 400 and 500 appear, and hover or selection never changes the weight (R2).
5. No text uses `--dsw-alias-label-tertiary`; text uses `label-primary` and `label-secondary` (R3).
6. The top bar, rows, group headers, controls, panels, ⌘K and avatars have the sizes in R6.
7. Every neutral border is 0.5 px, and no element has both a neutral border and an elevation shadow (R8).
8. Inside the content column, only the decision bar, a file row, evidence (a quote, its excerpt, the letter drawing), a notice, a text field, a menu, a board card and controls have a shadow, or a background different from their parent plus a border. Paste [scripts/panel-boxes.js](scripts/panel-boxes.js) into DevTools: it lists such elements and returns `[]` (R8).
9. Menus, listboxes and ⌘K use `Menu` or `MenuSurface` material (R8, [docs/web-styling.md](../../../docs/web-styling.md#component-rules)).
10. `node scripts/contrast.mjs` exits 0, and `node scripts/check-css.mjs --pairs <changed CSS>` lists each foreground and background token pair that the change uses, each with a row in contrast.mjs (R10).
11. Under `filter: grayscale(1)`, each status shows one of the six shapes and its atlas word from [status-map.md](status-map.md), in English and German. No icon shows without its word, except an `aria-hidden` row or card icon under a header of the same state; the status component cannot render without the word. A page shows its subject's status once. No two different states on the screen share both shape and word (R11).
12. Each "days left" is computed from today, and a past date shows "Overdue by N days" (R11).
13. Each view state has at most one enabled primary button, and each act shows its current key from the shortcut registry in the keycap, the key of [keys.md](keys.md) by default; no key is typed into a label (R12, R16).
14. At 1440 × 900, 1366 × 650 and 390 × 844, the decision bar's primary button is visible without scrolling (R13).
15. Each draft statement has an exact span (quote and page), and missing evidence blocks Accept with the reason in the decision bar (R14).
16. Motion uses only `transform`, `opacity` and colours, the token durations and the ease-out curve, none on keyboard acts, and stops under reduced motion (R15).
17. Every act works from the keyboard, with a visible focus ring, and `⌘K` offers the open item's acts with their keys. A single key typed into a reason box or a menu runs no act. Rebinding an act in the shortcut reference changes its keycap everywhere, the `G` sequences included (R16).
18. Lists are 44 px rows with no hairlines, grouped by state in tinted 36 px headers with counts, with the hover and selected states of R17. The column and group headers stick while the list scrolls; a person in a row is an avatar with the name on hover; `X` and ⇧ click select rows for one bulk act; a right-click on a row opens its acts with the same keys.
19. Forced empty: icon, heading, one sentence, one secondary button. Forced loading: skeleton rows on the real column grid after 150 ms, shown for at least 300 ms. Forced error: a notice with the data time and Try again; the rows below it pass contrast.mjs with no opacity (R18).
20. `node scripts/check-copy.mjs <locale files>` and `check-mockups.mjs` find no match in the rendered text or the locale entries: form codes (`EPO Form \d+`), hashes (`[0-9a-f]{7,}`), snake_case ids, `seq`, internal actors (router, engine, reader, intake, runtime) and account handles (`\w+\.\w`). The reviewer reads the rest (R19, product rule 4).
21. `node scripts/check-copy.mjs <feature locales.ts>` exits 0, so every dictionary has all 8 client languages (en, de, es, fr, ja, pt, ru, zh) with every English key. The reviewer reads the English and German copy: sentence case, the person's words.
22. A decision is recorded only by the person in the decision bar, and the bar says why this person may decide (product rule 6).
23. A board card moves only on an allowed transition; a disallowed column says why, and a decision move opens the decision bar (product rule 7).
24. A fixture has one person outside the matter's wall. That person is in no row, card, picker or Activity line. The PR links the test (product rule 8).
25. At 390 px on a touch screen there is no overlap, clipping or page-wide horizontal scroll; no key shows; the primary action stays in view; and every act of the 1440 px screen is reachable, shown or in an overflow menu ([dsh-responsive-ui](../dsh-responsive-ui/SKILL.md)).
26. From 1366 px a queue shows its list and the open item side by side, with the decision bar in view (R20).

## Blocking FAIL or ticket

The reviewer marks each FAIL as blocking or as a ticket. A blocking FAIL stops the merge. A ticket does not stop the merge: the reviewer gives it a title and a fix, the PR author files it before the merge, and it is fixed after the merge. The verdict is MERGE when no blocking FAIL remains (founder decision, 2026-11-05).

A FAIL is blocking when it has one of these effects:

- copy that is not true, or that shows an internal id, code or account handle (items 20 to 22);
- a person or a fact outside the matter's wall shows (item 24);
- an act that a person cannot reach, by pointer, keyboard or touch, or a primary button that is not in view (items 13, 14, 17, 25);
- text or a status icon below the contrast minimum (items 5, 10);
- evidence that is wrong or missing, or Accept that is not blocked when evidence is missing (item 15);
- a status, a date or a count that misleads, such as a past date with no overdue flag (items 11, 12);
- a decision or a board move that the product rules do not allow (items 22, 23);
- no approved mockup for the screen (item 1), or a check script that does not exit 0.

Every other FAIL is a ticket: a small visual item that misleads nobody and loses no act, such as a wrap, a gap, a size or a radius off the rules, a missing icon in an overflow menu, or a skeleton offset.
