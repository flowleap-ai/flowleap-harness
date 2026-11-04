# Design review checklist

The reviewer checks the built screen, not the mockup, at 1440 × 900 in light and dark, at 390 px, and in German. Copy this list into the PR and write PASS or FAIL after each item, with a screenshot or a measurement for each FAIL. **Any FAIL blocks the merge.** An item that does not apply to the screen is PASS with the reason ("no list on this screen").

1. The founder approved the mockups of this screen before the code, and the PR links the approval.
2. The PR names the Linear screen or pattern that each new design choice follows, and why.
3. Every font size is a `--fs-*` token, and the largest text is the screen's key fact or title (R1, R4).
4. Only weights 400 and 500 appear, and hover or selection never changes the weight (R2).
5. No text uses `--text-4`; text uses the three text greys (R3).
6. Every margin, padding, gap and radius is a token or a scale value (R5, R7).
7. The top bar, rows, controls, panels and avatars have the sizes in R6.
8. Inside the content panel there are no boxes other than the decision bar, a file row and an evidence excerpt (R8).
9. No literal colour outside tokens.css (R9).
10. `node scripts/contrast.mjs tokens.css` exits 0, and each new colour pair has a row in it (R10).
11. In greyscale, each state still reads by its icon shape and its word (R11).
12. Each "days left" is computed from today, and a past date shows "Overdue by N days" (R11).
13. Each view state has at most one enabled primary button, and each act shows its key (R12).
14. At 1440 × 900, the decision bar's primary button is visible without scrolling (R13).
15. Each draft statement has an exact span (quote and page), and missing evidence blocks Accept with the reason in the decision bar (R14).
16. Motion uses only `transform` and `opacity`, the token durations and the ease-out curve, none on keyboard acts, and stops under reduced motion (R15).
17. Every act works from the keyboard, with a visible focus ring, and `⌘K` offers the open item's acts (R16).
18. Lists are 36 px or 52 px rows, grouped by state with counts, with the hover and selected states of R17.
19. Each list has its designed empty, loading and error states, and the error keeps the last data at full contrast (R18).
20. No technical word, form code, hash, internal actor or record position in the main view, in English and in German (R19, product rule 4).
21. English and German copy is in sentence case and comes from the locale dictionaries.
22. A decision is recorded only by the person in the decision bar, and the bar says why this person may decide (product rule 6).
23. A board card moves only on an allowed transition; a disallowed column says why, and a decision move opens the decision bar (product rule 7).
24. Each person shown (row, card, picker, Activity) is inside the matter's wall (product rule 8).
25. At 390 px there is no overlap, clipping or page-wide horizontal scroll, and the primary action stays reachable ([dsh-responsive-ui](../dsh-responsive-ui/SKILL.md)).
