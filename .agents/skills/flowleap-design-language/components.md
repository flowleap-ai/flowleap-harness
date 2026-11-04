# Components

Each component lists its anatomy, its sizes and its states. The [reference mockups](references/mockups/) implement each one in `records.css`; the class name is in brackets. Rule numbers point to [rules.md](rules.md).

## List row

- **Anatomy.** Status icon at the start; title line (13 px, 500) and an optional secondary line (12 px, `--text-3`); structured columns; the time or the key right-aligned in tabular figures. Rows sit under a 32 px column header and in groups (`.row`, `.row.two`, `.thead`, `.group`).
- **Sizes.** 36 px, or 52 px with a second line; 16 px side padding (8 px inside a detail table); 12 px column gap; 1 px hairline below. Group header 34 px on `--bg-sunken`: state icon, state word, count, and the keys of the group's acts at the right.
- **States.** Rest; hover `--bg-hover` (under `(hover: hover)` only); selected `--bg-selected` plus a 2 px accent bar inset 6 px; unread a 6 px accent dot; loading a skeleton row; error the last rows at full contrast under the notice that says how old they are. Long text truncates; the full value is in the detail (R17).

## Status icon with the atlas word

- **Anatomy.** A 14 px icon whose shape carries the meaning, coloured by its role, followed by the atlas state word in sentence case (`.st`, `.status`). In the header eyebrow the pair sits on a 12 % tint as a 22 px pill (`.pill`).
- **Shapes.** Waits for a person: dashed ring with a centre dot (`--st-wait`). Done: filled disc with a check (`--st-ok`). Working: ring with a filled sector (`--st-run`). Refused or rejected: filled disc with a cross (`--st-bad`). Stale or disputed: filled triangle with a bar (`--st-bad`). No action needed: ring with a dash (`--st-idle`).
- **States.** One per atlas state; the word changes, the six shapes do not. Pill text uses the `--st-*-text` role, not the icon colour (R10, R11).

## Properties panel

- **Anatomy.** A 272 px column at the right of a detail, left hairline, 16 px padding. Groups with a 12 px heading in `--text-3`; rows of label and value (`.props`, `.prop`).
- **Sizes.** Label column 88 px in `--text-3`; value in `--text-1`; rows 30 px; 16 px above each group heading.
- **States.** A value can carry a status icon or an avatar. A long value truncates with the full value on hover; a key fact is never truncated (shorten the value instead, for example "Rule 71(3) EPC"). An editable value shows its picker on click.

## Decision bar

- **Anatomy.** A raised panel (`--bg-raised`, 12 px radius, `--accent-line` border, a 4 px `--accent-tint` halo, `--shadow-3`). Header: the deciding person's 22 px avatar, "Your decision", the question in plain words, and at the right why this person may decide. Body: one row per required part, each with its evidence state (`.part`), or the evidence itself (letter page, readings table, calculation steps). Footer on `--bg-sunken`: tertiary acts at the left, a one-line note, the one primary button at the right (`.decision`, `.decision-h`, `.decision-b`, `.decision-f`).
- **Sizes.** Header 44 px; part rows 44 px; footer 52 px; primary button 32 px with its key.
- **States.** Ready (primary enabled); a part not set (primary disabled, the part says what is missing); evidence missing (Accept and the primary disabled, the reason in amber with a warning icon, R14); not this person's decision (the evidence stays, the footer says who decides and has no primary); decided (the bar becomes a "Decided by" line in Activity). On a page with long evidence the bar is fixed at the bottom of the content column (`.work`, `.decision-dock`, R13).

## Evidence quote

- **Anatomy.** The quoted span in 12 px monospace on `--st-wait-tint`, then the page ("p. 1") in `--text-3` (`.span-ref`, `.quote`, `.page-ref`). A statement table has three columns: number, what the draft says, source in the letter (`.stmt`).
- **States.** Rest; hover or focus (the quote gets a 1 px amber ring and an excerpt popover shows the letter text with the span marked, `.excerpt`); a record as the source (a chip such as "Deadline, active"); missing evidence (an amber "Missing evidence" chip, one sentence why, and "Find the source" and "Remove from the draft"; the row gets an amber tint, `.missing`). The letter drawing marks the same spans (`.letter .hl`).

## Activity timeline

- **Anatomy.** A 13 px heading; one line per event with a 22 px icon column joined by a 1 px line (`.activity`, `.ev`). The actor in 500, the event in `--text-3`, the time after it in `--text-3`. A comment box closes the list; Audit is a disclosure below it.
- **States.** System event (one muted line, actor in `--text-2`); a person's act (actor in `--text-1`, avatar as the icon, `.ev.person`); a comment (a card under the line); mention picker open (only people inside the wall, with a footer that says so).

## Docked agent panel

- **Anatomy.** A 372 px column at the right with a 44 px header (agent name, model, minimise, expand, close), the task bubble, the attached matter, "Finished · N steps", the agent's prose, a result card, and the composer at the bottom (`.dock`).
- **Sizes.** 16 px padding; result card 8 px radius with a file row and a footer with the state and Preview; composer 12 px radius.
- **States.** Running (the steps line shows a working icon); finished; failed (refused icon and one sentence); something changed since the run (a line such as "Since then: attorney.b confirmed the deadline"). The result card names the work product ("Client report"), with the file name in its secondary line.

## Board card

- **Anatomy.** A card on a column of one atlas machine: status icon and matter key, the title (two lines at most), the matter name, and fact chips (due date with days left, report state) (`.card`).
- **States.** Rest; lifted while dragged (`--shadow-5`, 1° tilt); ghost at its old place (35 % opacity, dashed); a target column that is an allowed move shows "Drop to decide" and what opens; a column that is not an allowed move dims its header and keeps its reason at full contrast ("Not an allowed move"). A drop that is a decision opens the decision bar; nothing moves until the person records it.

## People avatar and stack

- **Anatomy.** A round avatar with the initial in `--on-avatar` on an `--av-*` fill, followed by the name (`.av`, `.who`). A team is a stack with 5 px overlap and a 2 px ring in the surface colour (`.stack`).
- **Sizes.** 18 px in rows, 22 px in headers and the decision bar; presence dot 7 px `--st-ok` with a 2 px ring.
- **States.** Present now (green dot); a mention chip (`--accent-tint`, `--accent-text`); a picker that lists only people inside the matter's wall and says so in its footer.

## ⌘K menu

- **Anatomy.** A 620 px overlay at 14 % of the view height on a scrim: the open item as a chip at the top, a 52 px input (16 px), then groups of acts with their keys (`.cmdk`).
- **Sizes.** Items 36 px; group headings 12 px `--text-3`; 12 px radius; `--shadow-5`.
- **States.** Open with no query (the item's acts first); filtered; an item selected (`--bg-selected`); no result (one line and a way out). Opens and closes with no motion (R15).

## Empty, loading and error states

- **Empty.** Centred in the list area: a 56 px framed icon, a 14 px heading that states the good outcome ("Nothing waits for you"), one sentence on what appears here and how, and one secondary button for the next step.
- **Loading.** Skeleton rows with the real column grid, shown after 150 ms, shimmer 1.4 s, no shimmer under reduced motion. Never a corner spinner; a non-list page centres one spinner.
- **Error.** A notice above the content with a warning icon, one plain sentence of what failed and what is still safe, and "Try again" with its key. The last data stays visible at full contrast; the notice says how old it is ("The list shows the letters as of 14:16"). Never dim it with opacity, because dimmed text fails R10.
