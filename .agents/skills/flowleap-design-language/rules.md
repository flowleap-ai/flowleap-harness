# The bar

Each rule gives the numbers, the check, and the source. A script check runs from the skill folder (`node scripts/<name>.mjs`); "measure" means the browser inspector on the built screen at 1440 × 900. The values are the harness client theme's tokens, mapped in [tokens.md](tokens.md); Linear sets the layout and the interaction, not the look. Source keys are in the [table at the end](#sources). A number marked "own choice" has no outside source; the skill set it.

## Type and hierarchy

### R1. Type scale

- **Rule.** The client font (`--dsw-font-family`) and the client type roles only. Rows, controls and UI text are 13 px (`xs-13`); labels, keys and button text are 12 px (`xxs-12`); the lede and the ⌘K input are 14 px (`s-14`); titles are 20 px (`l-20`); the one key fact of a screen (a due date) is 24 px (`xl-24`, at weight 500). Tabular figures for dates, numbers and counts.
- **Numbers.** 12/18, 13/20, 14/22, 20/28, 24/32 px (size/line height of `--dsw-font-*`). No tracking.
- **Check.** `check-css.mjs` fails on a `font-size`, `font`, `line-height` or `font-family` value that is not a client font token, and on any `letter-spacing`. Measure the largest text on the screen: it is the key fact or the title.
- **Source.** [dsh-client-ui-ux](../dsh-client-ui-ux/SKILL.md) theme typography and the 13 px row size; [RUI] hierarchy by size and colour; [VERCEL] tabular numbers.

### R2. Two weights

- **Rule.** 400 for text, 500 for emphasis, never above (the xl-24 role is 600 in the theme; the key fact takes 500). Hierarchy comes from size and the two text colours, not from bold. No weight change on hover or selection.
- **Numbers.** `--dsw-font-xs-13-font-weight` (400), `--dsw-font-xs-strong-13-font-weight` (500).
- **Check.** `check-css.mjs` fails on a `font-weight` that is not a client weight token or whose value is above 500.
- **Source.** [dsh-client-ui-ux](../dsh-client-ui-ux/SKILL.md) caps feature CSS at 500; [RAUNO] no weight change on hover.

### R3. Two text colours and one icon grey

- **Rule.** `--dsw-alias-label-primary` for primary text, `--dsw-alias-label-secondary` for labels, times, counts and metadata. `--dsw-alias-label-tertiary` is 3.71:1 on the light panel, so it is for icons and separators only, never text.
- **Numbers.** Text at least 4.5:1, icons at least 3:1 on every surface, both themes ([contrast.md](contrast.md)).
- **Check.** No text element uses `--dsw-alias-label-tertiary`. `contrast.mjs` exits 0.
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
- **Numbers.** Top bar 44 px. Row 44 px, also for ⌘K items. Group header 36 px. Column header and property row 32 px. Button 28 px (`Button` `sm`), the decision's primary button 36 px (`Button` `md`). Key 20 px. UI icon 16 px, status icon 14 px. Avatar 20 px in rows, 24 px in headers and the decision bar. Sidebar 244 px, properties panel 376 px with a 96 px label column, agent dock 376 px, ⌘K 712 px wide.
- **Check.** Measure each changed part against the numbers.
- **Source.** [L-TRIAGE-IMG] 44 px view header; [L-LIVE] 44 px rows, 36 px group headers, a properties column of about 376 px, ⌘K 713 px wide with 46 px items. The skill takes 712 px (the nearest multiple of 8) and 44 px items (one row height for every list); `ui-primitives` `Button` gives 28 and 36 px; the other sizes are its own choice.

### R7. Radii

- **Rule.** The client radius scale ([docs/ui-radius.md](../../../docs/ui-radius.md)). An outer radius is the inner radius plus the padding between them.
- **Numbers.** `--dsw-radius-xs` 4 px keys, quotes and small chips; `--dsw-radius-sm` 8 px 28 px controls, group headers and cards; `--dsw-radius-md` 12 px the content panel, the decision bar, menus, the composer and the 36 px button; 999px capsules, 50% circles.
- **Check.** `check-css.mjs` fails on a `border-radius` that is not a `--dsw-radius-*` token, 999px or 50%.
- **Source.** [docs/ui-radius.md](../../../docs/ui-radius.md); [MIFB] concentric radii.

### R8. Calm surfaces

- **Rule.** The sidebar and the content panel use the client surfaces. The content panel is one 12 px surface with a 0.5 px hairline and no shadow; inside it there are no boxes (except the decision bar, a file row, evidence, a notice, a text field, a menu and a board card) and no row hairlines, only space, tinted group headers and the hairlines of a detail table. Every neutral border is 0.5 px. An elevated surface (button, decision bar, card, menu, popover) takes a `--dsw-elevation-*` shadow, whose first layer is the 0.5 px stroke, and no border. A border that alone identifies a control, a dashed affordance and a state colour stay 1 px.
- **Numbers.** Hairline 0.5 px (`--dsw-alias-border-l2`, `-l3`). `--dsw-elevation-panel` buttons and cards; `--dsw-elevation-prominent` the decision bar, the letter drawing, menus, popovers and a lifted card.
- **Check.** `check-css.mjs` fails on a solid `--dsw-alias-border-l1` to `-l3` border that is not 0.5 px, and on a `--dsw-elevation-*` shadow in a rule that also sets such a border. `check-mockups.mjs` runs [scripts/panel-boxes.js](scripts/panel-boxes.js), which lists every box inside the panel other than the decision bar, a file row, evidence, a notice, a text field, a menu and a board card; paste it into DevTools on the built screen.
- **Source.** [L-REFRESH] "Structure should be felt not seen", fewer separators; [L-LIVE] no row hairlines, tinted group headers, 0.5 px borders; [docs/web-styling.md](../../../docs/web-styling.md) the 0.5 px hairline and no border with an elevation shadow; [L-REDESIGN] elevation by surface levels.

## Colour

### R9. Client roles only

- **Rule.** Feature CSS uses the `--dsw-alias-*` and `--dsw-specific-*` roles of the client theme ([tokens.md](tokens.md)), so both themes come from the client. No new colour, no `--dsw-static-*` palette value, no literal colour, no runtime `color-mix` shade.
- **Numbers.** The primary action is the client's primary button (near-black in light, near-white in dark). Selection and focus use `--dsw-alias-state-business-primary`. Five status roles: waits (warn), done (success), working (business), refused or stale (error), no action (idle).
- **Check.** `check-css.mjs` fails on a `var()` the client theme does not define, a `--dsw-static-*` value, a hex, `rgb()`, `hsl()`, `oklch()`, `color-mix()` or named colour, also in SVG `fill` and `stroke` attributes.
- **Source.** [docs/web-styling.md](../../../docs/web-styling.md) semantic aliases only; [L-REDESIGN] themes from a few variables.

### R10. Contrast in both themes

- **Rule.** Every text, icon and control colour pair meets WCAG 2.x in light and dark. A new pair gets a row in `scripts/contrast.mjs` in the same change. A status icon always sits beside its word, so the word carries the state and the icon has no minimum. Opacity never dims readable text; only an inactive control takes the client's 0.4.
- **Numbers.** Text below 24 px (18.66 px bold) 4.5:1. Icons, large text and a border that alone identifies a control 3:1. Hover, selected and group tints count as part of the surface; a menu row counts the Menu material over the scrim.
- **Check.** `contrast.mjs contrast.md` exits 0 and contrast.md is current. `check-css.mjs --pairs` lists each foreground and background pair that one CSS rule sets and fails on a pair with no row in contrast.mjs. It fails on an `opacity` that is not 0, 1 or 0.4.
- **Source.** [WCAG] 1.4.3, 1.4.11.

### R11. Never colour alone

- **Rule.** A state is an icon shape and a word; colour repeats it. Each atlas state has one shape and one word in [status-map.md](status-map.md). Days left are computed from today; a past date says "Overdue by N days" in the refused colour.
- **Numbers.** Six status shapes ([components.md](components.md#status-icon-with-the-atlas-word)).
- **Check.** `status-map.mjs` fails when an atlas state has no row, a row is not an atlas state, or a shape contradicts the state's steps. `check-mockups.mjs` fails when a `[data-atlas]` element shows another shape or word, and on a typed day count (`3 days`, `in 12 days`, `seit 3 Tagen`) outside the `[data-due]` elements that frame.js fills.
- **Source.** [VERCEL] "Don't rely on color alone"; [RUI].

## Actions and decisions

### R12. One primary action

- **Rule.** A view has at most one enabled solid accent button: the act that moves the state machine for this person. Other acts are secondary (raised) or tertiary (text). A negative act (Not relevant, Reject) is tertiary and asks for a reason in its own step. Each button shows its key from [keys.md](keys.md).
- **Numbers.** 1 enabled primary per view. Key label 12 px in a 20 px box, as the client `ShortcutKeys`.
- **Check.** `check-mockups.mjs` counts the enabled primaries in each state and size. In the built screen, count them in each state.
- **Source.** [L-TRIAGE] single-key acts; [RUI] actions by hierarchy; [FRONTEND] buttons named by outcome.

### R13. The decision is in view

- **Rule.** Every decision bar is docked at the bottom of the content column; the content above it scrolls. The bar holds the question, one row for each part with its evidence state, and the acts; the evidence itself is in the content above.
- **Numbers.** The decision button is inside the view at 1440 × 900, 1366 × 650 (Windows 1366 × 768 and 1920 × 1080 at 125 %) and 390 × 844.
- **Check.** `check-mockups.mjs` at the three sizes; measure the built screen at each size without scrolling.
- **Source.** [L-LIVE] Linear keeps the controls of a detail page in place on every detail page while the content scrolls.

### R14. Evidence is exact

- **Rule.** Each draft statement and each read value points to an exact span of its source: a quote and a page, with the excerpt on hover. A statement without a span is "Missing evidence", and Accept is blocked with the reason in the decision bar. Never "the whole letter".
- **Numbers.** Quote 12 px monospace on `--dsw-alias-state-warn-tertiary`; page reference 12 px `--dsw-alias-label-secondary`.
- **Check.** Every statement row has at least one span or the missing-evidence warning; the missing state disables Accept and the primary button.
- **Source.** FlowLeap product rule: a decision is a person's act, made on evidence the person can check.

## Motion and input

### R15. Motion

- **Rule.** Motion confirms an act or prevents a jump; it never decorates. Transitions name their properties: `transform`, `opacity` or a colour, never a layout property or `all`. No motion on keyboard acts or on opening the command menu. Hover effects only under `(hover: hover)`. Off under `prefers-reduced-motion`, except opacity.
- **Numbers.** 100 ms (`--ds-transition-duration-fast`) press and hover, 200 ms (`--ds-transition-duration`) popovers and menus, 300 ms (`--ds-transition-duration-slow`) panels and the ceiling. `--ds-ease-in-out`, `ease` or `ease-out`. Press scale 0.97. Skeletons do not shimmer.
- **Check.** `check-css.mjs` fails on a literal duration, a layout property or `all` in a transition, and on `ease-in`, `linear` or a literal curve.
- **Source.** The client's motion tokens (`packages/client/ui-theme/src/styles/base.css`); [EMIL] press scale, no motion on frequent keyboard acts, the 300 ms ceiling; [RAUNO].

### R16. Keyboard first

- **Rule.** One key map for the product: [keys.md](keys.md). An act has the same key on every screen, in its button, in the group hint and in ⌘K. `⌘K` opens the command menu scoped to the open item, and it shows the key of every act. `J`/`K` or the arrows move in a list, `↵` opens, `Esc` closes. The top bar of a detail shows "1 / N" with up and down. In the client a key comes from the shortcut registry, so a rebound key shows its new binding.
- **Numbers.** The client focus ring (`focus.css`, 2 px `--dsw-alias-state-business-primary`) on `:focus-visible`.
- **Check.** `check-mockups.mjs` fails on a key that differs from keys.md or that shows with no `data-act`. Use the built screen with the keyboard only: each act is reachable and has a visible focus ring.
- **Source.** [L-INBOX] `J` / `K`; [L-TRIAGE] 1 accept, 2 decline; [L-LIVE] ⌘K shows a key for every act, with one key scheme.

## Lists and states

### R17. Lists are tables

- **Rule.** 44 px rows with no hairlines and no boxes; columns hold structured values; long text truncates with the full value in the detail. Groups are the atlas states that wait for a person, each a tinted 36 px header with an 8 px radius, its word and a count; empty groups hide. The group of the selected row shows the keys of its acts.
- **Numbers.** Row 44 px; group header 36 px on `--dsw-alias-bg-multi-select`, inset 8 px; hover `--dsw-alias-interactive-bg-hover`; selected `--dsw-alias-interactive-bg-active` plus a 2 px `--dsw-alias-state-business-primary` bar.
- **Check.** Measure a row and a group header; hover and select a row; the selected row passes R10. A reference list has at least 20 rows in several groups ([a-intake-list.html](references/mockups/a-intake-list.html)).
- **Source.** [L-LIVE] 44 px rows, tinted 36 px group headers; [L-TRIAGE-IMG].

### R18. Designed empty, loading and error states

- **Rule.** Empty says what appears here and how, and offers the next step. Loading is a skeleton of the real rows (`--dsw-alias-bg-skeleton`), shown after 150 ms and then for at least 300 ms. An error keeps the last data visible at full contrast, under one notice that says what failed, how old the data is, and "Try again".
- **Numbers.** Skeleton delay 150 ms, minimum visible time 300 ms; empty state text 360 px wide at most (own choice).
- **Check.** The mockups include each state for each list; the built screen shows each when forced ([review-checklist.md](review-checklist.md) item 19).
- **Source.** [VERCEL] a show-delay of about 150 to 300 ms and a minimum visible time of about 300 to 500 ms; [FRONTEND] empty states invite action.

### R19. The person's words

- **Rule.** The main view uses the attorney's and the clerk's words. "Rule 71(3) communication", not the form code; "FlowLeap", not an internal actor (router, engine, reader); "work", not "ticket"; "Client report", with the file name in a secondary line; a person's display name from Entra ("Dr. Anna Becker"), never an account handle. Codes, hashes and record positions live in Audit. Sentence case in English and German.
- **Numbers.** None.
- **Check.** `check-copy.mjs <locale files and mockups>` and `check-mockups.mjs` fail on a deny-list match: form codes, hashes, snake_case ids, `seq`, lower-case internal actor names, account handles. The reviewer reads the rest, in English and German.
- **Source.** FlowLeap product rule 4; [dsh-prose-standard](../dsh-prose-standard/SKILL.md) sentence case.

## Sources

| Key | Source |
|---|---|
| L-REDESIGN | Linear, how we redesigned the Linear UI: https://linear.app/now/how-we-redesigned-the-linear-ui |
| L-REFRESH | Linear, behind the latest design refresh: https://linear.app/now/behind-the-latest-design-refresh |
| L-TRIAGE | Linear docs, Triage: https://linear.app/docs/triage |
| L-INBOX | Linear docs, Inbox: https://linear.app/docs/inbox |
| L-TRIAGE-IMG | Linear Triage list and header screenshots ([references](references/README.md)) |
| L-LIVE | Live measurements of linear.app in the browser inspector by the independent review of 2026-11-04 ([references](references/README.md#live-linear-measurements)) |
| VERCEL | Vercel Web Interface Guidelines: https://vercel.com/design/guidelines |
| RAUNO | Rauno Freiberg, Web Interface Guidelines: https://interfaces.rauno.me |
| FRONTEND | Anthropic skills, frontend-design: https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md |
| MIFB | make-interfaces-feel-better: https://github.com/jakubkrehel/make-interfaces-feel-better |
| RUI | Refactoring UI, Adam Wathan and Steve Schoger: https://www.refactoringui.com |
| EMIL | Emil Kowalski, design engineering skills: https://github.com/emilkowalski/skills |
| WCAG | WCAG 2.2: https://www.w3.org/TR/WCAG22/ |
