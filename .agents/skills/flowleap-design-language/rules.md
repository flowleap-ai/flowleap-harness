# The bar

Each rule gives the numbers, the check a reviewer runs, and the source. "Grep" means a search of the changed CSS and markup; "measure" means the browser inspector on the built screen at 1440 × 900. Token names are in [tokens.css](tokens.css). Source keys are in the [table at the end](#sources).

## Type and hierarchy

### R1. Type scale

- **Rule.** Font sizes come from the scale only. Body and rows are 13 px; secondary lines, labels and keys are 12 px; the lede and inputs are 14 px; the command menu input is 16 px; titles are 24 px; the one key fact of a screen (a due date) is 30 px. Tabular figures for dates, numbers and counts.
- **Numbers.** 12, 13, 14, 16, 20, 24, 30 px (`--fs-*`). Line height 1.45 for UI text, 1.25 for titles. Tracking −0.006 em UI, −0.018 em titles, −0.024 em the key fact.
- **Check.** Grep `font-size`: each value is a `--fs-*` token. Measure the largest text on the screen: it is the key fact or the title.
- **Source.** [L-REDESIGN] one display face for headings; [RUI] hand-picked scale, no modular ratios; [VERCEL] tabular numbers.

### R2. Two weights

- **Rule.** 400 for text, 500 for emphasis. Hierarchy comes from size and the three text greys, not from bold. No weight change on hover or selection.
- **Numbers.** 400, 500 (`--w-regular`, `--w-medium`).
- **Check.** Grep `font-weight`: only the two tokens.
- **Source.** [dsh-client-ui-ux](../dsh-client-ui-ux/SKILL.md) caps feature CSS at 500; [RAUNO] no weight change on hover; [RUI] emphasis by weight and colour.

### R3. Three text greys and one icon grey

- **Rule.** `--text-1` primary, `--text-2` secondary, `--text-3` tertiary (labels, times, counts). `--text-4` is for icons and separators only, never text.
- **Numbers.** Text at least 4.5:1, icons at least 3:1 on every surface, both themes ([contrast.md](contrast.md)).
- **Check.** Grep `--text-4`: no text element uses it. `node scripts/contrast.mjs tokens.css` exits 0.
- **Source.** [RUI] three text colours; [WCAG] 1.4.3 and 1.4.11.

### R4. One key fact per screen

- **Rule.** Each screen answers one question first, and that answer is the largest thing on it: the due date on a deadline, the matter on an intake item, the decision on a work page.
- **Numbers.** Key fact 30 px, title 24 px, everything else 12 to 14 px.
- **Check.** Name the screen's question in the PR; measure that its answer is the largest text.
- **Source.** [L-REFRESH] "Don't compete for attention you haven't earned".

## Space, size and surface

### R5. Spacing scale

- **Rule.** Margins, paddings and gaps come from the scale. More space around a group than inside it.
- **Numbers.** 4, 8, 12, 16, 24, 32, 48 px (`--s1` to `--s7`). Content column padding 32 px top, 40 px sides.
- **Check.** Grep `margin`, `padding`, `gap`: tokens or scale values only (1 px and 2 px for hairlines and bars).
- **Source.** [RUI] spacing scale with at least 25 % between steps.

### R6. Fixed sizes

- **Rule.** The frame and the repeating parts have fixed sizes, so the eye finds them in the same place on every screen.
- **Numbers.** Top bar 44 px. Row 36 px, two-line row 52 px, group header 34 px. Control 28 px, large control 32 px. Status icon 14 px, UI icon 15 px. Sidebar 244 px, properties panel 272 px (label column 88 px, rows 30 px), agent dock 372 px, command menu 620 px. Avatar 18 px in rows, 22 px in headers.
- **Check.** Measure each changed part against the numbers.
- **Source.** [L-TRIAGE-IMG] 44 px view header; [L-INBOX] two-line rows.

### R7. Radii

- **Rule.** One small family. An outer radius is the inner radius plus the padding between them.
- **Numbers.** 4, 6, 8, 12 px (`--r-xs` to `--r-lg`); pills 999 px.
- **Check.** Grep `border-radius`: tokens only.
- **Source.** [MIFB] concentric radii; [L-REDESIGN].

### R8. Calm surfaces

- **Rule.** The sidebar is dimmer than the content panel. The content panel is one 12 px rounded surface with a hairline border; inside it there are no boxes, only hairlines and space. Elevation comes from the surface roles (`--bg-sunken`, `--bg-main`, `--bg-raised`, `--bg-overlay`) and three shadows.
- **Numbers.** Hairline 1 px `--line`. Shadows `--shadow-1` (buttons), `--shadow-3` (popovers, the decision bar), `--shadow-5` (menus, the command menu).
- **Check.** No card or box inside the panel except the decision bar, a file row and an evidence excerpt. No coloured left border wider than the 2 px selection bar.
- **Source.** [L-REFRESH] "Structure should be felt not seen"; [L-REDESIGN] elevation by surface levels; [IMPECCABLE] no side-stripe borders.

## Colour

### R9. Roles only

- **Rule.** Feature CSS uses the roles in tokens.css. Both themes come from the same roles. No literal colour, no runtime `color-mix` shade.
- **Numbers.** One accent (`--accent`, FlowLeap blue, oklch 0.55 0.21 263) for the primary action, selection and focus. Four status hues: waits (amber), done (green), working (blue), refused (red), plus a neutral for no action.
- **Check.** Grep `oklch(`, `#`, `rgb(`, `hsl(` outside tokens.css: none.
- **Source.** [L-REDESIGN] themes from base, accent and contrast; [GEIST] fixed colour roles.

### R10. Contrast in both themes

- **Rule.** Every text, icon and control colour pair meets WCAG 2.x in light and dark. A new pair gets a row in `scripts/contrast.mjs` in the same change.
- **Numbers.** Text below 24 px (18.66 px bold) 4.5:1. Icons, large text and a border that alone identifies a control 3:1. Hover and selected tints count as part of the surface.
- **Check.** `node scripts/contrast.mjs tokens.css contrast.md` exits 0 and contrast.md is current. Opacity on a container never dims text below 4.5:1.
- **Source.** [WCAG] 1.4.3, 1.4.11; [VERCEL].

### R11. Never colour alone

- **Rule.** A state is an icon shape and a word; colour repeats it. Days left are computed from today; a past date says "Overdue by N days" in the refused colour.
- **Numbers.** Six status shapes ([components.md](components.md#status-icon-with-the-atlas-word)).
- **Check.** Turn the screen to greyscale: each state still reads. No typed day count in a mockup (`scripts/check-mockups.mjs`).
- **Source.** [VERCEL] status never by colour alone; [RUI].

## Actions and decisions

### R12. One primary action

- **Rule.** A view has at most one enabled solid accent button: the act that moves the state machine for this person. Other acts are secondary (outlined) or tertiary (text). A negative or destructive act (Not relevant, Reject) is tertiary and asks for a reason in its own step. Each button shows its key.
- **Numbers.** 1 enabled primary per view. Key label 11 px in an 18 px box.
- **Check.** `scripts/check-mockups.mjs` counts the enabled primaries. In the built screen, count them in each state.
- **Source.** [L-TRIAGE] single-key acts; [RUI] actions by hierarchy; [FRONTEND] buttons named by outcome.

### R13. The decision is in view

- **Rule.** The primary button of a decision bar is inside the first 1440 × 900 view. When the evidence above it is long, the content column scrolls and the decision bar stays fixed at its bottom.
- **Numbers.** Decision button bottom ≤ 900 px at 1440 × 900.
- **Check.** `scripts/check-mockups.mjs`; measure the built screen at 1440 × 900 without scrolling.
- **Source.** The Linear issue page keeps the top bar and the properties sidebar fixed while the description and Activity scroll, so the controls that change the issue stay in reach ([references](references/README.md)).

### R14. Evidence is exact

- **Rule.** Each draft statement and each read value points to an exact span of its source: a quote and a page, with the excerpt on hover. A statement without a span is "Missing evidence", and Accept is blocked with the reason in the decision bar. Never "the whole letter".
- **Numbers.** Quote 12 px monospace on `--st-wait-tint`; page reference 12 px `--text-3`.
- **Check.** Every statement row has at least one span or the missing-evidence warning; the missing state disables Accept and the primary button.
- **Source.** [L-AGENT] the agent result card with Preview; the founder's rule that a decision is a person's act.

## Motion and input

### R15. Motion

- **Rule.** Motion confirms an act or prevents a jump; it never decorates. Only `transform` and `opacity`. No motion on keyboard acts or on the command menu. Hover effects only under `(hover: hover)`. Off under `prefers-reduced-motion`, except opacity.
- **Numbers.** 120 ms (`--t-fast`) for press and hover, 180 ms (`--t-base`) for popovers; ease-out `cubic-bezier(0.23, 1, 0.32, 1)`; press scale 0.97; skeleton shimmer 1.4 s; nothing above 300 ms.
- **Check.** Grep `transition`: named properties, token durations, no `all`, no `ease-in`.
- **Source.** [EMIL]; [RAUNO] under 200 ms, press scale near 0.96.

### R16. Keyboard first

- **Rule.** `⌘K` opens the command menu scoped to the open item. `J`/`K` or the arrows move in a list, `Enter` opens, single keys run the intake acts, `⌘Enter` records a decision, `Esc` closes. The top bar of a detail shows "1 / N" with up and down. Keys show in buttons and in the command menu, never in a footer.
- **Numbers.** Focus ring 2 px surface gap plus 2 px accent (`--focus`) on `:focus-visible`.
- **Check.** Use the screen with the keyboard only: each act is reachable and has a visible focus ring.
- **Source.** [L-INBOX], [L-TRIAGE], [RAYCAST].

## Lists and states

### R17. Lists are tables

- **Rule.** Rows with hairlines, no boxes; columns hold structured values; long text truncates with the full value in the detail. Groups are the atlas states that wait for a person, with a count; empty groups hide.
- **Numbers.** Row 36 px or 52 px; hover tint 4.5 %; selected tint 8 % plus a 2 px accent bar inset 6 px.
- **Check.** Measure a row; hover and select one; the selected row passes R10.
- **Source.** [L-TRIAGE-IMG], [L-INBOX].

### R18. Designed empty, loading and error states

- **Rule.** Empty says what appears here and how, and offers the next step. Loading is a skeleton of the real rows, shown after 150 ms. An error keeps the last data visible, with one plain sentence that says how old it is and a Retry button above it.
- **Numbers.** Skeleton delay 150 ms; empty state text 360 px wide at most.
- **Check.** The mockups include each state for each list; the built screen shows each when forced.
- **Source.** [VERCEL] skeleton after a delay; [FRONTEND] empty states invite action; [IMPECCABLE].

### R19. The person's words

- **Rule.** The main view uses the attorney's and the clerk's words. "Rule 71(3) communication", not the form code; "FlowLeap", not an internal actor (router, engine, reader); "work", not "ticket"; "Client report", with the file name in a secondary line. A second agent pass shows only as "Updated after a new letter". Codes, hashes and record positions live in Audit. Sentence case in English and German.
- **Numbers.** None.
- **Check.** Read every visible string of the screen; each technical word is a FAIL. German screens get the same read.
- **Source.** [L-INBOX] titles a person wrote, metadata muted; [dsh-prose-standard](../dsh-prose-standard/SKILL.md) sentence case.

## Sources

| Key | Source |
|---|---|
| L-REDESIGN | Linear, how we redesigned the Linear UI: https://linear.app/now/how-we-redesigned-the-linear-ui |
| L-REFRESH | Linear, behind the latest design refresh: https://linear.app/now/behind-the-latest-design-refresh |
| L-TRIAGE | Linear docs, Triage: https://linear.app/docs/triage |
| L-INBOX | Linear docs, Inbox: https://linear.app/docs/inbox |
| L-TRIAGE-IMG | Linear Triage list and header screenshots ([references](references/README.md)) |
| L-AGENT | Linear issue view with the docked agent panel (founder's screenshot, [references](references/README.md)) |
| VERCEL | Vercel Web Interface Guidelines: https://vercel.com/design/guidelines |
| GEIST | Vercel Geist colours: https://vercel.com/geist/colors |
| RAUNO | Rauno Freiberg, Web Interface Guidelines: https://interfaces.rauno.me |
| RAYCAST | Raycast API, List and Action Panel: https://developers.raycast.com/api-reference/user-interface/list |
| FRONTEND | Anthropic skills, frontend-design: https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md |
| MIFB | make-interfaces-feel-better: https://github.com/jakubkrehel/make-interfaces-feel-better |
| IMPECCABLE | impeccable: https://github.com/pbakaus/impeccable |
| RUI | Refactoring UI, Adam Wathan and Steve Schoger: https://www.refactoringui.com |
| EMIL | Emil Kowalski, animations.dev: https://animations.dev |
| WCAG | WCAG 2.2: https://www.w3.org/TR/WCAG22/ |
