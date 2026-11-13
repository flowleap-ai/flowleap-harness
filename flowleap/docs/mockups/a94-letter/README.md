# Art. 94(3) letter walkthrough

A clickable walkthrough of [process sheet 9, an Art. 94(3) letter arrives](../../process-atlas/09-art-94-3-letter.md), as two persons: Sabine Wolf (formalities) and Jonas Weber (attorney), with Tobias Schmitt and Lena Hoffmann in the side paths. It uses the seed matter SF-2024-0007: the German communication of 18 Sep 2026 on EP 24 166 597.5, 5 objections, D1 to D5, a period of 4 months, the deadline 18 Jan 2027. It is a draft for the founder's decision; it is not approved.

## Open it

Open [a94-letter-walkthrough.html](a94-letter-walkthrough.html) from the file system. It is one file: the client theme, the CSS and the scripts are inside it, and it loads nothing else. A panel at the bottom left shows the path, the step, what the person sees, and **Back** and **Next**, 31 steps in all; the one control that goes on has a blue outline. **Hide** folds the panel; **Dark** and **Light** switch the theme. `?walk=<n>` opens step n.

| Path | Steps | What it shows |
|---|---|---|
| Main | 13 | Sabine confirms the deadline on the letter board; Jonas marks each objection, corrects objection 3 (claims 2–14 to 2–15), checks the deadline in the Review step, and accepts the reading |
| Ask the agent | 4 | In the Agent tab beside the form, Jonas asks about objection 3; the answer stays on the board with its passages; the agent proposes the correction and Jonas accepts it; the agent declines to accept the reading for him |
| New reading | 4 | Jonas asks for a new reading with a reason; reading 2 replaces reading 1, and a mark carries over |
| Reject | 3 | Jonas rejects the reading and works by hand |
| Moved task | 2 | A task that moved to Lena Hoffmann stays in Jonas's My work under Moved to others, with Take back |
| Scan | 5 | A scan with no text: Sabine files it and enters the period, Tobias confirms, Jonas has no reading and works by hand |

## Data

The letter pane shows the stored text layer of the seed letter (`flowleap-seed-firm`, EP24166597 row 6), page by page, without the representative's address and the examiner's name. The passages of the reading stand once on their pages. The reading itself (grounds, claim numbers, summaries) is an example written for the walkthrough, not a recorded agent run. Times, the Moved to others case and the scan are examples.

## Build and check

The page is generated. Edit `src/build.mjs`, `src/data.mjs`, `src/a94-letter.css` or `src/walk.js`, then run `node build.mjs` in `src`. It writes `src/a94-letter.html` (linked to the skill's `records.css`, for the checks; open it with `?state=<name>`) and the one-file walkthrough here.

From the skill folder `.agents/skills/flowleap-design-language`:

```sh
node scripts/check-css.mjs ../../../flowleap/docs/mockups/a94-letter/src
node scripts/check-copy.mjs ../../../flowleap/docs/mockups/a94-letter/src
node scripts/check-mockups.mjs ../../../flowleap/docs/mockups/a94-letter/src --shoot <dir>
```
