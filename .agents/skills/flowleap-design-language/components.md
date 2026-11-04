# Components

Each component lists its anatomy, its sizes and its states. It is built from client tokens ([tokens.md](tokens.md)) and, where the client has one, the `ui-primitives` component: `Button`, `ShortcutKeys`, `Checkbox`, `SegmentedControl`, `Menu` and `MenuSurface`, `Pill`, `Tooltip`, `HoverCard`, `Toast`. The client has no status icon set, list row, decision bar, properties panel or evidence quote; these five are the only client additions ([client-gaps.md](client-gaps.md)). The [reference mockups](references/mockups/) implement each one in `records.css`; the class name is in brackets. Rule numbers point to [rules.md](rules.md); sizes are the tokens of R6.

## List row

- **Anatomy.** Status icon at the start; the title in `label-primary` with its source in `label-secondary` on the same line; structured columns; the time right-aligned in tabular figures. Rows sit under a 32 px column header and in groups (`.row`, `.thead`, `.group`).
- **Sizes.** 44 px, one line, no hairline; 16 px side padding (8 px inside a detail table); 16 px column gap. Group header 36 px on `bg-multi-select`, 8 px radius, inset 8 px: state icon, the atlas word, the count, and for the group of the selected row the keys of its acts at the right.
- **States.** Rest; hover `interactive-bg-hover` (under `(hover: hover)` only); selected `interactive-bg-active` plus a 2 px accent bar; unread an 8 px accent dot; loading a skeleton row on the same column grid; error the last rows at full contrast under the notice. Long text truncates; the full value is in the detail (R17). At 390 px a row keeps the status, the title and the time.

## Status icon with the atlas word

- **Anatomy.** A 14 px icon whose shape carries the meaning, coloured by its role, followed by the atlas state word in sentence case (`.st`, `.status`). In the header eyebrow the pair sits on its tint as a 24 px pill (`.pill`). [status-map.md](status-map.md) gives the shape and word of every atlas state; a mockup marks the element with `data-atlas="<machine>.<state>"`.
- **Shapes.** `wait` waits for a person: dashed ring with a centre dot (`state-warn-primary`). `ok` done: filled disc with a check (`state-success-primary`). `run` working: ring with a filled sector (`state-business-primary`). `bad` refused or rejected: filled disc with a cross (`state-error-primary`). `stale` stale or disputed: filled triangle with a bar (`state-error-primary`). `idle` no action needed: ring with a dash (`state-idle-primary`).
- **States.** One per atlas state; the word changes, the six shapes do not. Pill text is `label-primary` on the status tint, never the icon colour (R10, R11).

## Properties panel

- **Anatomy.** A 376 px column at the right of a detail, 0.5 px left hairline, 16 px padding. Groups with a 12 px heading in `label-secondary`; rows of label and value (`.props`, `.prop`).
- **Sizes.** Label column 96 px in `label-secondary`; value in `label-primary`; rows 32 px; 16 px above each group heading.
- **States.** A value can carry a status icon or an avatar. A long value truncates with the full value on hover; a key fact is never truncated (shorten the value instead, for example "Rule 71(3) EPC"). An editable value shows its picker on click. At 390 px the panel hides on a decision page and stacks under the content on other pages.

## Decision bar

- **Anatomy.** An elevated panel (`bg-layer-2`, 12 px radius, `--dsw-elevation-prominent`, no border) docked at the bottom of the content column, 16 px from its edges; the content above it scrolls (`.work`, `.work-scroll`, `.decision-dock`). Header: the deciding person's 24 px avatar, "Your decision", the question in plain words, and at the right why this person may decide. Body: one row for each required part with its evidence state (`.part`); the evidence itself (the letter, the statements with their spans, the calculation) is in the content above. Footer: the tertiary acts at the left, a one-line note, the secondary act and the one primary button at the right (`.decision`, `.decision-h`, `.decision-b`, `.decision-f`).
- **Sizes.** Header 44 px; part rows 44 px; footer 60 px; primary button 36 px (`Button` `md`) with its key.
- **States.** Ready (primary enabled); a part not set (primary disabled, the part says what is missing); evidence missing (Accept and the primary disabled, the reason with a warning icon, R14); not this person's decision (the evidence stays, the footer says who decides and has no primary); decided (the bar becomes a "Decided by" line in Activity). At 390 px the note hides and a part's control moves under its text.

## Evidence quote

- **Anatomy.** The quoted span in 12 px monospace on `state-warn-tertiary`, then the page ("p. 1") in `label-secondary` (`.span-ref`, `.quote`, `.page-ref`). A statement table has three columns: number, what the draft says, source in the letter (`.stmt`).
- **States.** Rest; hover or focus (the quote gets a 1 px ring in the waits colour and an excerpt popover, `--dsw-elevation-prominent`, shows the letter text with the span marked, `.excerpt`); a record as the source (a chip such as "Deadline, active"); missing evidence (a "Missing evidence" chip on the waits tint, one sentence why, and "Find the source" and "Remove from the draft"; the row takes the waits tint, `.missing`). The letter drawing marks the same spans (`.letter .hl`); it is a picture of the source, so its text is exempt from the deny-list (`data-verbatim`).

## Activity timeline

- **Anatomy.** A 13 px heading; one line per event with a 24 px icon column joined by a 0.5 px line (`.activity`, `.ev`). The actor in 500, the event in `label-secondary`, the time after it. A comment box closes the list; Audit is a disclosure below it (`data-audit`).
- **States.** System event (one muted line, actor in `label-secondary`); a person's act (actor in `label-primary`, avatar as the icon, `.ev.person`); a comment; mention picker open (Menu material, only people inside the wall, with a footer that says so).

## Docked agent panel

- **Anatomy.** A 376 px column at the right with a 44 px header (agent name, model, minimise, expand, close), the task bubble, the attached matter, "Finished · N steps", the agent's prose, a result card, and the composer at the bottom (`.dock`).
- **Sizes.** 16 px padding; result card 8 px radius with a file row and a footer with the state and Preview; composer 12 px radius.
- **States.** Running (the steps line shows a working icon); finished; failed (refused icon and one sentence); something changed since the run (a line such as "Since then: Jonas Weber confirmed the deadline"). The result card names the work product ("Client report"), with the file name in its secondary line. At 390 px the panel opens full screen from the top bar.

## Board card

- **Anatomy.** A card on a column of one atlas machine: status icon and matter key, the title (two lines at most), the matter name, and fact chips (due date with days left, report state) (`.card`). Column headers carry the atlas word.
- **States.** Rest (`--dsw-elevation-panel`); lifted while dragged (`--dsw-elevation-prominent`, 1° tilt); a dashed empty slot at its old place, with no text; a target column that is an allowed move has a dashed accent border and says "Drop to decide" and what opens; a column that is not an allowed move has its header in `label-secondary` and its reason at full contrast ("Not an allowed move: FlowLeap assigns the work"). A drop that is a decision opens the decision bar; nothing moves until the person records it. At 390 px the board scrolls sideways inside its own area.

## People avatar and stack

- **Anatomy.** A round avatar with the initial of the given name in `label-primary` on `bg-overlay`, followed by the display name from Entra ("Dr. Anna Becker", "Jonas Weber") (`.av`, `.who`). A team is a stack with 4 px overlap and a 2 px ring in the surface colour (`.stack`).
- **Sizes.** 20 px in rows, 24 px in headers and the decision bar; presence dot 8 px `state-success-primary` with a 2 px ring.
- **States.** Present now (green dot); a mention chip (`label-primary` on `state-business-tertiary`); a picker that lists only people inside the matter's wall and says so in its footer.

## ⌘K menu

- **Anatomy.** A 712 px menu at 14 % of the view height on a scrim: the open item as a chip at the top, the 14 px input, then groups of acts, each with its key from [keys.md](keys.md) (`.cmdk`, `.menu`). It uses the Menu material (`--dsw-specific-menu`, `--dsw-menu-backdrop-filter`; `MenuSurface` in the client) with `--dsw-elevation-prominent` and no border.
- **Sizes.** Items 44 px; group headings 12 px `label-secondary`; 12 px radius.
- **States.** Open with no query (the item's acts first); filtered; an item selected (`interactive-bg-active`); no result (one line and a way out). Opens and closes with no motion (R15).

## Empty, loading and error states

- **Empty.** Centred in the list area: a 48 px raised icon tile, a 14 px heading that states the good outcome ("Nothing waits for you"), one sentence on what appears here and how, and one secondary button for the next step with its key.
- **Loading.** Skeleton rows on the real column grid, shown after 150 ms and then for at least 300 ms, on `--dsw-alias-bg-skeleton`, with no shimmer. Never a corner spinner; a non-list page centres one spinner.
- **Error.** A notice above the content with a warning icon, one plain sentence of what failed and what is still safe, and "Try again" with its key. The last data stays visible at full contrast; the notice says how old it is ("The list shows the letters as of 14:16"). Never dim it with opacity (R10).
