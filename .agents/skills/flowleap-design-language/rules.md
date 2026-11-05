# The bar

Each rule gives the numbers, the check, and the source. A script check runs from the skill folder (`node scripts/<name>.mjs`); "measure" means the browser inspector on the built screen at 1440 × 900. The values are the harness client theme's tokens, mapped in [tokens.md](tokens.md); Linear sets the layout and the interaction, not the look. Source keys are in the [table at the end](#sources). A number marked "own choice" has no outside source; the skill set it.

## Type and hierarchy

### R1. Type scale

- **Rule.** The client font (`--dsw-font-family`) and the client type roles only. Rows, controls and UI text are 13 px (`xs-13`); labels, keys and button text are 12 px (`xxs-12`); the lede and the ⌘K input are 14 px (`s-14`); titles are 20 px (`l-20`); the one key fact of a screen (a due date) is 24 px (`xl-24`, at weight 500). Tabular figures for dates, numbers and counts.
- **Numbers.** 12/18, 13/20, 14/22, 20/28, 24/32 px (size/line height of `--dsw-font-*`). No tracking.
- **Check.** `check-css.mjs` fails on a `font-size` or `line-height` that is not one of these five roles (a markdown or an 11 px token fails too), on a composite font token such as `var(--dsw-font-xl-24)`, on a `font` shorthand with anything but these tokens (`bold`, `11px`, a family name), on another `font-family`, on any `letter-spacing`, and on `@font-face` or an `@import` that is not a client theme sheet. Measure the largest text on the screen: it is the key fact or the title.
- **Source.** [dsh-client-ui-ux](../dsh-client-ui-ux/SKILL.md) theme typography and the 13 px row size; [RUI] hierarchy by size and colour; [VERCEL] tabular numbers.

### R2. Two weights

- **Rule.** 400 for text, 500 for emphasis, never above (the xl-24 role is 600 in the theme; the key fact takes 500). Hierarchy comes from size and the two text colours, not from bold. No weight change on hover or selection.
- **Numbers.** `--dsw-font-xs-13-font-weight` (400), `--dsw-font-xs-strong-13-font-weight` (500).
- **Check.** `check-css.mjs` fails on a `font-weight` that is not a client weight token or whose value is above 500.
- **Source.** [dsh-client-ui-ux](../dsh-client-ui-ux/SKILL.md) caps feature CSS at 500; [RAUNO] no weight change on hover.

### R3. Two text colours and one icon grey

- **Rule.** `--dsw-alias-label-primary` for primary text, `--dsw-alias-label-secondary` for labels, times, counts and metadata. `--dsw-alias-label-tertiary` is 3.71:1 on the light panel, so it is for icons and separators only, never text.
- **Numbers.** Text at least 4.5:1, icons at least 3:1 on every surface, both themes ([contrast.md](contrast.md)).
- **Check.** `check-css.mjs` fails on `color: var(--dsw-alias-label-tertiary)` in a rule whose selector does not end in `svg`, and `--pairs` accepts a text pair only when contrast.mjs has a text row (minimum 4.5) for it. `check-mockups.mjs` fails on any rendered text in that colour. `contrast.mjs` exits 0.
- **Source.** [RUI] text colours by hierarchy; [WCAG] 1.4.3 and 1.4.11.

### R4. One key fact per screen

- **Rule.** Each screen answers one question first, and that answer is the largest thing on it: the due date on a deadline, the letter and its proposed matter on an intake item, the decision on a work page. The title or the key fact is the largest text.
- **Numbers.** Key fact 24 px, title 20 px, everything else 12 to 14 px.
- **Check.** Name the screen's question in the PR; measure that its answer is the largest text.
- **Source.** [L-REFRESH] "Don't compete for attention you haven't earned".

## Space, size and surface

### R5. Spacing scale

- **Rule.** Margins, paddings and gaps come from the scale; the client has no spacing tokens. More space around a group than inside it. 2 px only between stacked rows and inside a segmented control.
- **Numbers.** 2, 4, 8, 12, 16, 24, 32, 48 px. Content column padding 32 px (own choice).
- **Check.** `check-css.mjs` fails on a `margin`, `padding` or `gap` that is not 0, `auto`, a scale value or its negative (`calc(-1 * 4px)`).
- **Source.** [RUI] spacing scale with at least 25 % between steps.

### R6. Fixed sizes

- **Rule.** The frame and the repeating parts have fixed sizes, so the eye finds them in the same place on every screen. Controls take the client `Button` sizes.
- **Numbers.** Top bar 44 px. Row 44 px, also for ⌘K items. Group header 36 px. Column header and property row 32 px. Button 28 px (`Button` `sm`), the decision's primary button 36 px (`Button` `md`). Keycap 18 px. UI icon 16 px, status icon 14 px. Avatar 20 px in rows, 24 px in headers and the decision bar. Sidebar 244 px, properties panel 376 px with a 96 px label column, agent dock 376 px, the list of a queue split view 480 px, ⌘K 712 px wide.
- **Check.** Measure each changed part against the numbers.
- **Source.** [L-TRIAGE-IMG] 44 px view header; [L-LIVE] 44 px rows, 36 px group headers, a properties column of about 376 px, ⌘K 713 px wide with 46 px items. The skill takes 712 px (the nearest multiple of 8) and 44 px items (one row height for every list); `ui-primitives` `Button` gives 28 and 36 px; the other sizes are its own choice.

### R7. Radii

- **Rule.** The role and size bands of [docs/ui-radius.md](../../../docs/ui-radius.md): choose the role first, then the size. An inner radius is the outer radius minus the inset. Every 999px or 50 % radius pairs with `corner-shape: round` in the same rule ([docs/web-styling.md](../../../docs/web-styling.md#component-rules)). The content column is flush with the sidebar, as the client `AppFrame` is, so it has no radius.
- **Numbers.** `--dsw-radius-xs` 4 px: below 20 px, the keycap, an inline quote, a mention, a skeleton bar. `--dsw-radius-sm` 8 px: 20 to 28 px controls (the `sm` button, an icon button, a tab, a chip, a segment). `--dsw-radius-md` 12 px: 32 to 40 px cells (the `md` button, the group header, a notice, a text field, a ⌘K or picker item, the segmented control track). `--dsw-radius-lg` 16 px: preview cards and grouped content (a file row, the result card, the excerpt popover, the letter drawing, the ⌘K and menu outer, a board column, the empty-state tile). `--dsw-radius-xl` 20 px: independent cards (a board card, the task bubble). `--dsw-radius-panel` 28 px: floating panels (the decision bar, the composer). 999px capsules (the status pill), 50 % circles (avatars, dots).
- **Check.** `check-css.mjs` fails on a `border-radius` that is not a `--dsw-radius-*` token, 999px or 50 %, and on a full-round radius without `corner-shape: round`. `check-mockups.mjs` fails on a rendered radius off the scale or outside the height band (below 20 px high: 4 px; 20 to 28 px: 8 px; 29 to 31 px: 8 or 12 px; 32 to 40 px: 12 px; above 40 px: 12 px at least).
- **Source.** [docs/ui-radius.md](../../../docs/ui-radius.md); [MIFB] concentric radii.

### R8. Calm surfaces

- **Rule.** The sidebar and the content column use the client surfaces, as `AppFrame` draws them: the sidebar with a 0.5 px right hairline, the content column flush on `bg-base` with no shadow; inside it there are no boxes (except the decision bar, a file row, evidence, a notice, a text field, a menu and a board card) and no row hairlines, only space, tinted group headers and the hairlines of a detail table. Every neutral border is 0.5 px. An elevated surface (button, decision bar, card, menu, popover) takes a `--dsw-elevation-*` shadow, whose first layer is the 0.5 px stroke, and no border. A border that alone identifies a control, a dashed affordance and a state colour stay 1 px.
- **Numbers.** Hairline 0.5 px (`--dsw-alias-border-l2`, `-l3`). `--dsw-elevation-panel` buttons and cards; `--dsw-elevation-prominent` the decision bar, the letter drawing, menus, popovers and a lifted card.
- **Check.** `check-css.mjs` fails on a solid `--dsw-alias-border-l1` to `-l3` line that is not 0.5 px, also through `border-*-width` longhands, logical sides and `outline`; on a `--dsw-elevation-*` shadow with another layer or in a rule, or for a class in another rule, that also sets such a border; and on a neutral ring in `box-shadow` that is not 0.5 px. `check-mockups.mjs` fails on any rendered element with a neutral border and a shadow, and runs [scripts/panel-boxes.js](scripts/panel-boxes.js), which lists every box (32 px or higher, with a shadow on any background, or a border on its own background) inside the panel other than the allowed parts and controls; paste it into DevTools on the built screen.
- **Source.** [L-REFRESH] "Structure should be felt not seen", fewer separators; [L-LIVE] no row hairlines, tinted group headers, 0.5 px borders; [docs/web-styling.md](../../../docs/web-styling.md) the 0.5 px hairline and no border with an elevation shadow; [L-REDESIGN] elevation by surface levels.

## Colour

### R9. Client roles only

- **Rule.** Feature CSS uses the `--dsw-alias-*` and `--dsw-specific-*` roles of the client theme ([tokens.md](tokens.md)), so both themes come from the client. No new colour, no `--dsw-static-*` palette value, no literal colour, no runtime `color-mix` shade.
- **Numbers.** The primary action is the client's primary button (near-black in light, near-white in dark). Selection and focus use `--dsw-alias-state-business-primary`. Five status roles: waits (warn), done (success), working (business), refused or stale (error), no action (idle).
- **Check.** `check-css.mjs` fails on a `var()` that the light theme does not define (a token defined only for dark fails), a `--dsw-static-*` value, a definition of any `--dsw-*` or `--ds-*` property, a hex, `rgb()`, `hsl()`, `oklch()`, `color-mix()` or any CSS named colour, also in SVG `fill`, `stroke`, `color` and `flood-color` attributes in either quote style, in `style` attributes, and in `el.style`, `cssText` and `setProperty()` in scripts.
- **Source.** [docs/web-styling.md](../../../docs/web-styling.md) semantic aliases only; [L-REDESIGN] themes from a few variables.

### R10. Contrast in both themes

- **Rule.** Every text, icon and control colour pair meets WCAG 2.x in light and dark. A new pair gets a row in `scripts/contrast.mjs` in the same change. A status icon always sits beside its word, so the word carries the state and the icon has no minimum. Opacity never dims readable text; only an inactive control takes the client's 0.4.
- **Numbers.** Text below 24 px (18.66 px bold) 4.5:1. Icons, large text and a border that alone identifies a control 3:1. Hover, selected and group tints count as part of the surface; a menu row counts the Menu material over the scrim.
- **Check.** `contrast.mjs contrast.md` exits 0 and contrast.md is current; it also fails when a token has no value in a theme. `check-css.mjs --pairs` lists each foreground and background pair that one CSS rule sets and fails on a pair with no row of the right kind in contrast.mjs. It fails on an `opacity` that is not 0, 1 or 0.4, on a keyframe `opacity` that is not 0 or 1, and on `filter: opacity()`.
- **Source.** [WCAG] 1.4.3, 1.4.11.

### R11. Never colour alone

- **Rule.** A state is an icon shape and a word; colour repeats it. Each atlas state has one shape and one English and German word in [status-map.md](status-map.md). The status component requires the word; an icon alone is allowed only for a row or card under a group or column header of the same state, marked `aria-hidden`. A page shows its subject's status once. Days left are computed from today and written out ("117 days left", never "117 d"); a past date says "Overdue by N days" after a red warning glyph that is not a status shape; the overdue text stays `label-primary` for contrast and only the glyph is red (founder decision, 2026-11-05: the refused colour is below 4.5:1 as text).
- **Numbers.** Six status shapes ([components.md](components.md#status-icon-with-the-atlas-word)).
- **Check.** `status-map.mjs` fails when an atlas state has no row or no German word, a row is not an atlas state, a word repeats in a machine, or a shape contradicts the state's steps. `check-mockups.mjs` fails on a status icon outside a `[data-atlas]` element (except the `aria-hidden` row or card icon above), on a `.pill` or `.status` with no `data-atlas`, when a `[data-atlas]` element shows another shape or the wrong English or German word, when its word is in the text but not seen (a box under 2 × 2 px, a `clip` or `clip-path`, opacity 0 or a transparent colour, as a visually hidden class does), and on a typed day or week count in digits or words (`3 days`, `3-day`, `noch 3 Werktage`, `drei Tage`, `in 2 Wochen`) outside the `[data-due]` elements that frame.js fills.
- **Source.** [VERCEL] "Don't rely on color alone"; [RUI].

## Actions and decisions

### R12. One primary action

- **Rule.** A view has at most one enabled solid accent button: the act that moves the state machine for this person. Other acts are secondary (raised) or tertiary (text). A negative act (Not relevant, Reject) is tertiary and asks for a reason in its own step. Each button shows its key from [keys.md](keys.md).
- **Numbers.** 1 enabled primary per view. Key label: the keycap ([components.md](components.md#keycap)), 12 px `label-secondary` text in an 18 px box; it is a new part, because the client `ShortcutKeys` is unboxed 12 px text in `label-tertiary`.
- **Check.** `check-mockups.mjs` counts the enabled controls whose computed fill is the primary button fill, in each state and size, whatever their class. It also fails on a bulk decision bar (`[data-bulk]`) that shows with no row checked, or whose number differs from the checked count. In the built screen, count them in each state.
- **Source.** [L-TRIAGE] single-key acts; [RUI] actions by hierarchy; [FRONTEND] buttons named by outcome.

### R13. The decision is in view

- **Rule.** Every decision bar is docked at the bottom of the content column; the content above it scrolls. The bar holds the question, one row for each part with its evidence state, and the acts; the evidence itself is in the content above.
- **Numbers.** The decision button is inside the view at 1440 × 900, 1366 × 650 (Windows 1366 × 768 and 1920 × 1080 at 125 %) and 390 × 844.
- **Check.** `check-mockups.mjs` at the three sizes fails when the decision's primary button is outside the view, takes no click (`pointer-events: none`) or another element covers its centre (a toast, a fixed bar), unless a modal such as ⌘K is open. It checks again with each scroll container scrolled to its end and fails when the bar moves, so a bar inside the scrolling content fails. Measure the built screen at each size, before and after scrolling.
- **Source.** [L-LIVE] Linear keeps the controls of a detail page in place on every detail page while the content scrolls.

### R14. Evidence is exact

- **Rule.** Each draft statement and each read value points to an exact span of its source: a quote and a page, with the excerpt on hover. A statement without a span is "Missing evidence", and Accept is blocked with the reason in the decision bar. Never "the whole letter". An office event entered by hand has no source letter: it is evidence for a deadline only when a second person, not the person who entered it, confirms it, and the screens show "No source letter" (German "Kein Quellschreiben") in place of the quote, and name both people (founder decision, 2026-11-05; atlas sheet 2 applies the same rule to a manual deadline).
- **Numbers.** Quote 12 px monospace on `--dsw-alias-state-warn-tertiary`; page reference 12 px `--dsw-alias-label-secondary`.
- **Check.** Every statement row has at least one span or the missing-evidence warning; the missing state disables Accept and the primary button.
- **Source.** FlowLeap product rule: a decision is a person's act, made on evidence the person can check.

## Motion and input

### R15. Motion

- **Rule.** Motion confirms an act or prevents a jump; it never decorates. Transitions name their properties: `transform`, `opacity` or a colour, never a layout property or `all`. No motion on keyboard acts or on opening the command menu. Hover effects only under `(hover: hover)`. Off under `prefers-reduced-motion`, except opacity.
- **Numbers.** 100 ms (`--ds-transition-duration-fast`) press and hover, 200 ms (`--ds-transition-duration`) popovers and menus, 300 ms (`--ds-transition-duration-slow`) panels and the ceiling. `--ds-ease-in-out`, `ease` or `ease-out`. Press scale 0.97. Skeletons do not shimmer.
- **Check.** `check-css.mjs` fails on a literal duration, on a property other than `transform`, `opacity` or a colour in `transition` or `transition-property`, and on `ease-in`, `linear` or a literal curve.
- **Source.** The client's motion tokens (`packages/client/ui-theme/src/styles/base.css`); [EMIL] press scale, no motion on frequent keyboard acts, the 300 ms ceiling; [RAUNO].

### R16. Keyboard first

- **Rule.** One key map for the product: [keys.md](keys.md). An act has the same key on every screen, in its button, its context-menu item and ⌘K. `⌘K` opens the command menu scoped to the open item, and it shows the key of every act. `J`/`K` or the arrows move in a list, `X` selects, `↵` opens, `Esc` closes. The top bar of a detail page shows "1 / N" with up and down. In the client every key except `↵` and `Esc` is a rebindable registry command; `↵` (Open the row) is a fixed key of the view-scoped layer, because the composer's fixed plain Enter holds it ([keys.md](keys.md)). Single keys, `↵` and `G` sequences work only through the view-scoped layer, never while focus is in a text field, an editable element or a menu. A key in a row's context menu acts on that row. Keys hide on a coarse pointer.
- **Numbers.** The client focus ring (`focus.css`, 2 px `--dsw-alias-state-business-primary`) on `:focus-visible`.
- **Check.** `check-mockups.mjs` fails on a key that differs from keys.md, a key with no `data-act`, a key typed into a label ("Other matter (O)", "⌘K" as text), a button of an act with a key that shows no keycap, a label that names two acts or shows two keys on one page ("Not relevant…" for `reject` in the bar and for `accept` in the context menu), and a keycap on the 390 px touch screen. Use the built screen with the keyboard only: each act is reachable and has a visible focus ring; type each single key into a reason box and see that no act runs.
- **Source.** [L-INBOX] `J` / `K`; [L-TRIAGE] 1 accept, 2 decline; [L-SELECT] `X` selects; [L-LIVE] ⌘K shows a key for every act, with one key scheme; the shortcut registry README for the Web binding rules.

## Lists and states

### R17. Lists are tables

- **Rule.** 44 px rows with no hairlines and no boxes; columns hold structured values. Only a queue row's title and matter cell truncate, with the full value in the detail; every other value fits at 1366 px (shorten it, for example "Rule 71(3) EPC"). Groups are the atlas states that wait for a person, each a tinted 36 px header with its word and a count; empty groups hide. The column header and the group header stick while the list scrolls. A person in a row is an avatar only, with the name on hover. `X` or ⇧ click selects rows for one bulk act in the decision bar. A row's context menu offers the same acts with the same keys.
- **Numbers.** Row 44 px; group header 36 px on `--dsw-alias-bg-multi-select`, inset 8 px; hover `--dsw-alias-interactive-bg-hover`; selected and checked `--dsw-alias-interactive-bg-active`, the open row with a 2 px `--dsw-alias-state-business-primary` bar.
- **Check.** `check-mockups.mjs` fails on text cut with an ellipsis at 1440 or 1366 px outside a queue row's title and matter cell. Measure a row and a group header; hover, select and check rows; scroll and see the headers stick; right-click a row. The selected row passes R10. A reference list has at least 20 rows in several groups ([a-intake-list.html](references/mockups/a-intake-list.html), states `scrolled`, `select`, `context`).
- **Source.** [L-LIVE] 44 px rows, tinted 36 px group headers; [L-TRIAGE-IMG]; [L-SELECT] `X`, ⇧ click, bulk acts and the right-click menu; [L-REVIEW2] sticky headers, avatars only in rows.

### R18. Designed empty, loading and error states

- **Rule.** Empty says what appears here and how, and offers the next step. Loading is a skeleton of the real rows (`--dsw-alias-bg-skeleton`), shown after 150 ms and then for at least 300 ms. An error keeps the last data visible at full contrast, under one notice that says what failed, how old the data is, and "Try again".
- **Numbers.** Skeleton delay 150 ms, minimum visible time 300 ms; empty state text 360 px wide at most (own choice).
- **Check.** The mockups include each state for each list; the built screen shows each when forced ([review-checklist.md](review-checklist.md) item 19).
- **Source.** [VERCEL] a show-delay of about 150 to 300 ms and a minimum visible time of about 300 to 500 ms; [FRONTEND] empty states invite action.

### R19. The person's words

- **Rule.** The main view uses the attorney's and the clerk's words. "Rule 71(3) communication", not the form code; "FlowLeap", not an internal actor (router, engine, reader); "work", not "ticket"; "Client report", with the file name in a secondary line; a person's display name from Entra ("Dr. Anna Becker"), never an account handle. Codes, hashes and record positions live in Audit. Sentence case in English and German.
- **Numbers.** None.
- **Check.** `check-copy.mjs <locales.ts and mockups>` and `check-mockups.mjs` fail on a deny-list match in the text and in `title`, `aria-label`, `placeholder` and `alt`: form codes with or without the office ("Form 2004C"), hashes, snake_case ids, `seq`, internal actor names in either case (Router, engine; "Intake" as a view name is allowed), account handles (`a.becker`, `Anna.Becker`, `ABECKER`, `KANZLEI\jweber`) and e-mail addresses outside a `data-address` element. `check-copy.mjs` reads the client `locales.ts` dictionaries, fails when one lacks any of the 8 client languages or an English key in one, fails on a text that is empty or only white space (a German key with `''`), and fails when it finds no input. The reviewer reads the rest, in English and German.
- **Source.** FlowLeap product rule 4; [dsh-prose-standard](../dsh-prose-standard/SKILL.md) sentence case.

## Queues

### R20. List and detail side by side

- **Rule.** From 1366 px a queue (Intake, later the deadline and work queues) shows its list and the open item side by side; the person works through the queue without leaving the list. Below 1366 px the list fills the view and a row opens the item page with "1 / N". The item pane keeps the docked decision bar of R13.
- **Numbers.** List 44 % of the content column, at least 480 px; its Matter column is as wide as a file number (92 px) and the title takes the rest; item pane the rest, with three key properties above the evidence instead of the 376 px properties panel.
- **Check.** `check-mockups.mjs` at 1440 and 1366 px (the list and the item pane are in view) and at 390 px; each act of the item pane is reachable at 390 px on the item page that `data-narrow-page` names.
- **Source.** [L-REVIEW2] Linear processes a queue as list plus detail; [L-SELECT] bulk acts.

## Sources

| Key | Source |
|---|---|
| L-REDESIGN | Linear, how we redesigned the Linear UI: https://linear.app/now/how-we-redesigned-the-linear-ui |
| L-REFRESH | Linear, behind the latest design refresh: https://linear.app/now/behind-the-latest-design-refresh |
| L-TRIAGE | Linear docs, Triage: https://linear.app/docs/triage |
| L-INBOX | Linear docs, Inbox: https://linear.app/docs/inbox |
| L-TRIAGE-IMG | Linear Triage list and header screenshots ([references](references/README.md)) |
| L-LIVE | Live measurements of linear.app in the browser inspector by the independent review of 2026-11-04 ([references](references/README.md#live-linear-measurements)) |
| L-SELECT | Linear docs, Select issues: https://linear.app/docs/select-issues |
| L-REVIEW2 | The second independent review of PR 288, 2026-11-04: Linear's queue, header and avatar patterns observed in the live app ([references](references/README.md#live-linear-measurements)) |
| VERCEL | Vercel Web Interface Guidelines: https://vercel.com/design/guidelines |
| RAUNO | Rauno Freiberg, Web Interface Guidelines: https://interfaces.rauno.me |
| FRONTEND | Anthropic skills, frontend-design: https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md |
| MIFB | make-interfaces-feel-better: https://github.com/jakubkrehel/make-interfaces-feel-better |
| RUI | Refactoring UI, Adam Wathan and Steve Schoger: https://www.refactoringui.com |
| EMIL | Emil Kowalski, design engineering skills: https://github.com/emilkowalski/skills |
| WCAG | WCAG 2.2: https://www.w3.org/TR/WCAG22/ |
