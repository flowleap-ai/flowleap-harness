# Components

Each component lists its anatomy, its sizes and its states, built from client tokens ([tokens.md](tokens.md)). The [reference mockups](references/mockups/) implement each one in `records.css`; the class name is in brackets. Rule numbers point to [rules.md](rules.md); sizes are the tokens of R6.

- **Used as they are:** `Button`, `Checkbox`, `SegmentedControl`, `Menu` and `MenuSurface`, `Pill` (the filter chips of a view bar; it is a selectable button, never a status), `Tooltip`, `HoverCard`, `Toast`, and the `ui-context-menu` contributions for the row context menu.
- **Extended in `ui-primitives`:** `StateDot` and `Tag` each get a `shape` prop for the status icon and the status pill ([client-gaps.md](client-gaps.md) item 2).
- **New, in the IPMS feature package:** the keycap, the list row, the queue split view, the decision bar, the properties panel, the evidence quote, the Activity timeline, the board card, and the avatar and stack ([client-gaps.md](client-gaps.md) item 3). `ShortcutKeys` is not used as it is: it draws unboxed 12 px text in `--dsw-alias-label-tertiary`, 3.71:1 on white (R3).

## List row

- **Anatomy.** The group's status icon at the start (`aria-hidden`, because the group header carries the word); the title in `label-primary` with its source in `label-secondary` on the same line; structured columns; a person as a 20 px avatar only, with the display name on hover and as its accessible name; the time right-aligned in tabular figures. Rows sit under a 32 px column header and in groups (`.row`, `.thead`, `.grp`, `.group`). A table in a detail page starts with the status and its word instead (`.tbl`).
- **Sizes.** 44 px, one line, no hairline; 16 px side padding (8 px inside a detail table); 16 px column gap. Group header 36 px on `bg-multi-select`, 12 px radius (a 32 to 40 px cell), inset 8 px: state icon, the atlas word and the count.
- **States.** Rest; hover `interactive-bg-hover` (under `(hover: hover)` only); selected `interactive-bg-active` plus a 2 px accent bar; unread an 8 px accent dot; loading a skeleton row on the same column grid; error the last rows at full contrast under the notice. The column header and the group header stick to the top of the list while it scrolls; the next group header pushes the last one out. Only a queue row's title and matter cell truncate; the full value is in the detail (R17). At 390 px a row keeps the status, the title and the time.
- **Selection.** `X` or ⇧ click selects a row: the checkbox replaces the status icon in every row, a checked row takes `interactive-bg-active`, and the decision bar offers the bulk act for the selection with one primary ("Accept and file 3", ⇧⌘↵). Esc clears it (`.selecting`, `.sel`, `.bulk`). With 0 rows checked there is no bulk bar: unchecking the last row or Esc leaves selection mode, and the open item's decision bar returns. Each number in the bulk bar is the checked count (`data-bulk` marks the bar in a mockup).
- **Context menu.** A right-click or Shift+F10 on a row opens `ui-context-menu` with the row's acts and their keys, the same as its decision bar and ⌘K, then Copy link (`.ctx-menu`, `.mi`).
- **Touch.** A touch has no context menu. A long press on a row selects it; while rows are selected, a tap checks or unchecks a row instead of opening it. The bulk bar's overflow menu (⋯) at the left of its primary holds the row acts of the one checked row (Open, File on another matter…, Copy link) and Clear the selection.

## Queue split view

- **Anatomy.** From 1366 px a queue shows the list (44 % of the content column, at least 480 px) and the open item side by side, separated by a 0.5 px hairline; the item pane has the eyebrow, the title, three key properties, the evidence and its docked decision bar (`.split`, `.list-pane`, `.detail-pane`, `.pane-props`). Below 1366 px the list fills the view and a row opens the item page, which has the "1 / N" control.
- **States.** One item open; several selected (the item pane lists the selection and the bulk decision); empty or loading (the list fills the view).

## Status icon with the atlas word

- **Anatomy.** `StateDot` with its `shape` prop: a 14 px icon whose shape carries the meaning, coloured by its role, followed by the atlas state word in sentence case (`.st`, `.status`). In the header eyebrow the pair is `Tag` with the same `shape` prop: a 24 px capsule on the status tint (`.pill`). The IPMS status wrapper requires the word, so the icon never renders alone; the one exception is a row or board-card icon under a group or column header of the same state, which is `aria-hidden`. [status-map.md](status-map.md) gives the shape and the English and German word of every atlas state; a mockup marks the element with `data-atlas="<machine>.<state>"`.
- **Shapes.** `wait` waits for a person: dashed ring with a centre dot (`state-warn-primary`). `ok` done: filled disc with a check (`state-success-primary`). `run` working: ring with a filled sector (`state-business-primary`). `bad` refused or rejected: filled disc with a cross (`state-error-primary`). `stale` stale or disputed: filled triangle with a bar (`state-error-primary`). `idle` no action needed: ring with a dash (`label-tertiary`, because `state-idle-primary` is 1.48:1 on white).
- **States.** One per atlas state; the word changes, the six shapes do not. Pill text is `label-primary` on the status tint, never the icon colour (R10, R11). A page shows its subject's status once, in the eyebrow; the properties panel does not repeat it.

## Keycap

- **Anatomy.** The current binding from the registry catalog in an 18 px box: 12 px text in `label-secondary`, 0.5 px `border-l3` hairline, 4 px radius, 4 px side padding; a sequence is two keycaps (`.kbd`, `.kbds`). In a primary button the text takes the button's foreground and the box has no line; in a selected ⌘K item the text is `label-primary`.
- **States.** Fine pointer: shown beside the act's label. Coarse pointer: hidden, as the `Menu` key hints are.

## Properties panel

- **Anatomy.** A 376 px column at the right of a detail, 0.5 px left hairline, 16 px padding. Groups with a 12 px heading in `label-secondary`; rows of label and value (`.props`, `.prop`). No "State" row: the eyebrow shows it.
- **Sizes.** Label column 96 px in `label-secondary`; value in `label-primary`; rows 32 px; 16 px above each group heading.
- **States.** A value can carry a status icon or an avatar. A long value truncates with the full value on hover; a key fact is never truncated (shorten the value instead, for example "Rule 71(3) EPC"). An editable value shows its picker on click. At 390 px the panel hides on a decision page and stacks under the content on other pages.

## Decision bar

- **Anatomy.** An elevated panel (`bg-layer-2`, 28 px radius as a floating panel, `--dsw-elevation-prominent`, no border) docked at the bottom of the content column, 16 px from its edges; the content above it scrolls (`.work`, `.work-scroll`, `.decision-dock`). Header: the deciding person's 24 px avatar, "Your decision", the question in plain words, and at the right why this person may decide. Body: one row for each required part with its evidence state (`.part`); the evidence itself (the letter, the statements with their spans, the calculation) is in the content above. Footer: the tertiary acts at the left, a one-line note, the secondary act and the one primary button at the right (`.decision`, `.decision-h`, `.decision-b`, `.decision-f`).
- **Sizes.** Header 44 px; part rows 44 px; footer 60 px; primary button 36 px (`Button` `md`) with its key. The bar takes at most 40 % of the view height: above that, the part rows scroll inside it, and the header, the failure notice and the footer stay. The note shares the footer line with the acts.
- **States.** Ready (primary enabled); a part not set (primary disabled, the part says what is missing); evidence missing (Accept and the primary disabled, the reason with a warning icon, R14); not this person's decision (the evidence stays, the footer says who decides and has no primary); decided (the bar becomes a "Decided by" line in Activity). At 390 px the note hides, each part keeps only its title and its control (its icon and its evidence line hide; a missing-evidence warning stays), the control follows the title on its line when it fits, and each secondary act that does not fit moves into an overflow menu (⋯) at the left of the primary, so every act stays reachable (`.more`, `.overflow-menu`).

## Evidence quote

- **Anatomy.** The quoted span in 12 px monospace on `state-warn-tertiary`, inline so that it wraps, then the page ("p. 1") in `label-secondary` (`.span-ref`, `.quote`, `.page-ref`). A statement table has three columns: number, what the draft says, source in the letter (`.stmt`).
- **States.** Rest; hover or focus (the quote gets a 1 px ring in the waits colour and an excerpt popover, `--dsw-elevation-prominent`, shows the letter text with the span marked, `.excerpt`); a record as the source (a chip such as "Deadline, active"); missing evidence (a "Missing evidence" chip on the waits tint, one sentence why, and "Find the source" and "Remove from the draft"; the row takes the waits tint, `.missing`). The letter drawing marks the same spans (`.letter .hl`); it is a picture of the source, so its text is exempt from the deny-list (`data-verbatim`).

## Activity timeline

- **Anatomy.** A 13 px heading; one line per event with a 24 px icon column joined by a 0.5 px line (`.activity`, `.ev`). The icon is the actor's avatar or a UI glyph on a system avatar, never a status shape: the event text says what happened. The actor in 500, the event in `label-secondary`, the time after it. A comment box closes the list; Audit is a disclosure below it (`data-audit`).
- **States.** System event (one muted line, actor in `label-secondary`); a person's act (actor in `label-primary`, avatar as the icon, `.ev.person`); a comment; mention picker open (Menu material, only people inside the wall, with a footer that says so).

## Docked agent panel

- **Anatomy.** A 376 px column at the right with a 44 px header (agent name, model, minimise, expand, close), the task bubble, the attached matter, "Finished · N steps", the agent's prose, a result card, and the composer at the bottom (`.dock`).
- **Sizes.** 16 px padding; result card 16 px radius (a preview card) with a file row and a footer with the report status and Preview; task bubble 20 px radius; composer 28 px radius.
- **States.** Running (the steps line shows a working icon); finished; failed (refused icon and one sentence); something changed since the run (a line such as "Since then: Jonas Weber confirmed the deadline"). The result card names the work product ("Client report"), with the file name in its secondary line. At 390 px the panel opens full screen from the top bar.

## Board card

- **Anatomy.** A card (20 px radius, an independent card) on a column (16 px radius, grouped content) of one atlas machine: the column's status icon (`aria-hidden`) and the matter key, the team avatars, the title (two lines at most), the matter name with the due date, and labelled fact chips that each carry a status with its word ("Deadline · Active", "Report · Proposed", "Reply · Sent") (`.card`). Column headers carry the atlas word.
- **States.** Rest (`--dsw-elevation-panel`), the reference state; lifted while dragged (`--dsw-elevation-prominent`, 1° tilt, inside its target column); a dashed empty slot at its old place, with no text; a target column that is an allowed move has a dashed accent border and says "Drop to decide" and what opens; a column that is not an allowed move has its header in `label-secondary` and its reason at full contrast ("FlowLeap assigns the work; a person cannot move a card here"). A drop that is a decision opens the decision bar; nothing moves until the person records it. All columns and the "Other states" panel fit at 1366 px; at 390 px the board scrolls sideways inside its own area.

## People avatar and stack

- **Anatomy.** A round avatar (50 % radius with `corner-shape: round`) with the initial of the given name in `label-primary` on `bg-overlay`. In a list row or a card it stands alone, with the display name from Entra on hover (`Tooltip`) and as its accessible name; in a header, the properties panel and Activity the display name follows it ("Dr. Anna Becker", "Jonas Weber") (`.av`, `.who`). A team is a stack with 4 px overlap and a 2 px ring in the surface colour (`.stack`).
- **Sizes.** 20 px in rows, 24 px in headers and the decision bar; presence dot 8 px `state-success-primary` with a 2 px ring.
- **States.** Present now (green dot); a mention chip (`label-primary` on `state-business-tertiary`); a picker that lists only people inside the matter's wall and says so in its footer.

## ⌘K menu

- **Anatomy.** A 712 px menu at 14 % of the view height on a scrim: the open item as a chip at the top, the 14 px input, then groups of acts, each with its key from [keys.md](keys.md) (`.cmdk`, `.menu`). It is `MenuSurface` (`--dsw-menu-surface-fill`, `--dsw-menu-backdrop-filter`; the mockups draw `--dsw-specific-menu`, its fill without the macOS backing) with `--dsw-elevation-prominent` and no border.
- **Sizes.** Items 44 px with 12 px radius; outer radius 16 px with 4 px padding (a standard menu, [docs/ui-radius.md](../../../docs/ui-radius.md)); group headings 12 px `label-secondary`.
- **States.** Open with no query (the item's acts first); filtered; an item selected (`interactive-bg-active`, its text and keys in `label-primary`, because secondary text on it is 4.42:1 in light); no result (one line and a way out). Opens and closes with no motion (R15).

## Empty, loading and error states

- **Empty.** Centred in the list area: a 48 px raised icon tile, a 14 px heading that states the good outcome ("Nothing waits for you"), one sentence on what appears here and how, and one secondary button for the next step with its key.
- **Loading.** Skeleton rows on the real column grid, shown after 150 ms and then for at least 300 ms, on `--dsw-alias-bg-skeleton`, with no shimmer. Never a corner spinner; a non-list page centres one spinner.
- **Error.** A notice above the content with a warning icon, one plain sentence of what failed and what is still safe, and "Try again" with its key. The last data stays visible at full contrast; the notice says how old it is ("The list shows the letters as of 14:16"). Never dim it with opacity (R10).
