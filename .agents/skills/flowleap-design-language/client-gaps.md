# Client gaps

The current client (`packages/client/ui-theme`, `packages/client/ui-primitives`) cannot meet the bar yet. Each item below is one follow-up change. Until an item lands, a client screen that needs it cannot pass the [review checklist](review-checklist.md); the Records app in flowleap-os uses [tokens.css](tokens.css) directly.

1. **Token roles.** Map the roles of tokens.css onto `ui-theme`: four status hues with a tint and a text role each (`--st-wait`, `--st-ok`, `--st-run`, `--st-bad`, `--st-*-tint`, `--st-*-text`), the accent with its tint, line and hover, a sunken surface, the avatar fills, and the control border. Today `--dsw-alias-state-*` has no tint or text roles, and the primary button fill is near-black (`--dsw-alias-brand-primary`), so one blue primary action is not a token. The dark set applies under `body[data-ds-dark-theme]`.
2. **Contrast gate.** Run `scripts/contrast.mjs` against the client's token sheet in CI, so that a token change that fails R10 fails the build.
3. **Surfaces.** Make the dark sidebar dimmer than the content (today the dark sidebar, bluish-900, is lighter than the base, bluish-950), and add the inset content panel with a 12 px radius.
4. **Row primitive.** A table-row primitive with 36 px and 52 px heights, hover and selected states, the 2 px selection bar, group headers and a skeleton row.
5. **Status icon set.** The six status shapes as one icon set. A new glyph set needs designer approval ([dsh-client-ui-ux](../dsh-client-ui-ux/SKILL.md#reuse-before-adding)).
6. **Properties panel primitive.** Label and value rows with groups, 272 px.
7. **Decision bar primitive.** The raised panel with the accent halo, part rows with their evidence state, the reason step for negative acts, and the fixed position at the bottom of a scrolling content column.
8. **Evidence quote primitive.** The span with its page, the hover excerpt with the marked span, and the missing-evidence state that blocks Accept.
9. **Command menu.** An app-wide, item-scoped `⌘K` with single-key acts. Today `ui-commands` has only the `/` menu inside the chat composer (fuzzy search, arrow keys, Enter). Reuse its popup list; add the app-wide trigger and the item chip.
10. **People service.** A presence and people service from Entra ID with the wall check before any person shows (FlowLeap issue #227).
11. **Weight.** The client caps feature CSS at weight 500; the bar keeps that cap (R2), so no change is needed beyond removing any 600 that remains in feature CSS.
