---
name: flowleap-design-language
description: The FlowLeap design language for the IPMS screens (the Records features taken from PATORG, such as intake, matter, deadline, work on a letter and the board, and every later IPMS screen), Linear's layout and interaction quality as checkable rules on the harness client theme, with components, product rules, the mockup gate and the merge checklist. Use for any UI change, brief, mockup or design review of an IPMS screen; every IPMS screen is a React view in packages/client.
---

# FlowLeap design language

The founder's bar is Linear (https://linear.app). A screen meets the bar when it passes every rule here, not when it looks good.

**Where to build.** Build every IPMS screen in the harness client (`packages/client`) as a React view on `ui-primitives`, the client theme, the shortcut registry and `MenuSurface`. The Records service in flowleap-os is the server and the API only; do not build UI there. Its server-rendered pages and the `ui-flowleap-records` iframe wrapper go away when the client views land ([client-gaps.md](client-gaps.md) item 1).

**Scope.** The IPMS screens only: the Records features taken from PATORG (intake, matter, deadline, work on a letter, the work board) and every later IPMS screen. The rest of the FlowLeap app keeps its current design. **Look.** The harness client theme and `ui-primitives` as they are ([tokens.md](tokens.md)): its font, colours, radii, motion, 0.5 px hairlines, elevation and `Menu`/`MenuSurface`. This skill adds no token. **What comes from Linear** is the layout and the interaction: hierarchy, one primary action, status icon plus word, dense list rows with sticky group headers, a queue as list and detail side by side, multi-select with bulk acts, a row context menu, the detail page with a properties panel and Activity, the docked decision bar, keyboard and ⌘K, and designed empty, loading and error states. We learn Linear's rules; we do not copy its brand, icons or layouts. This skill adds the FlowLeap bar on top of [dsh-client-ui-ux](../dsh-client-ui-ux/SKILL.md) (feedback surfaces, overlays, reuse) and [dsh-responsive-ui](../dsh-responsive-ui/SKILL.md) (390 px and touch); copy follows [dsh-prose-standard](../dsh-prose-standard/SKILL.md).

## The gate

1. **Mockup first.** Before code, make HTML mockups from the client tokens ([tokens.md](tokens.md)) and the [components](components.md); start from the [reference mockups](references/mockups/). From the skill folder, run the checks below; each must exit 0. `check-mockups.mjs --shoot <dir>` writes the screenshots: each page and state at 1440 × 900, 1366 × 650 and 390 × 844, light and dark, plus the German pages.
2. **When you are stuck on a design choice, find the matching Linear screen or pattern first**, in linear.app, its docs and changelog, and [references](references/README.md). Note in the PR which one you used and why.
3. **Founder approval.** The founder approves the mockups before any code. Link the approval in the PR.
4. **Build** with the client tokens, `ui-primitives` and the components. A value that is not a client token or in [rules.md](rules.md) needs a new rule first.
5. **Design review before merge.** A reviewer checks the built screen against [review-checklist.md](review-checklist.md) and writes PASS or FAIL for each item in the PR. A blocking FAIL stops the merge; a small visual FAIL becomes a ticket that is fixed after the merge ([review-checklist.md](review-checklist.md#blocking-fail-or-ticket)).

```sh
node scripts/check-css.mjs <mockup dir or CSS> [--pairs]   # R1, R2, R5, R7, R8, R9, R10, R15: client tokens only
node scripts/check-copy.mjs <mockup dir or locales.ts>       # R19: the deny-list; checklist 21: all 8 client languages
node scripts/contrast.mjs contrast.md                       # R10: every pair of the client theme in both themes
node scripts/status-map.mjs [--machines <machines.mjs>]     # R11: atlas states to shapes and words
node scripts/check-mockups.mjs <mockup dir> [--shoot <dir>] # R3, R7, R8, R11, R12, R13, R16, R17, R19 in a browser
node scripts/self-test.mjs                                  # each check fails on its regression defects; run after changing a check
```

The scripts need Node 22 and three inputs outside the skill. `check-css.mjs` and `contrast.mjs` read the client theme from `--theme`, else `$FLOWLEAP_UI_THEME`, else `packages/client/ui-theme/src/styles` in the git root. `check-mockups.mjs` needs Playwright: it uses `$FLOWLEAP_PLAYWRIGHT` (a playwright package directory), else `playwright` in the current directory's `node_modules`, else the flowleap-harness checkout that holds the skill, and it names these three when none works. `status-map.mjs` reads the process atlas from `--machines`, else `$FLOWLEAP_ATLAS_MACHINES`, else `flowleap/docs/process-atlas/check/machines.mjs` in the git root. Outside a flowleap-harness checkout, pass all three.

## Product rules

These hold on every screen. Each has a numbered rule in [rules.md](rules.md).

1. Lists are tables: 44 px rows with no hairlines, grouped by state in sticky tinted headers with a count. A row selects with a checkbox for bulk acts and opens a context menu with the same acts and keys; on a touch screen, the bulk bar's overflow menu of one checked row is that context menu. From 1366 px a queue shows the list and the open item side by side. My work is the one exception (founder decision, 2026-11-07): it groups by due time (Overdue, Today, Later), its rows have no checkbox, no bulk act and no item beside the list, a row opens its decision page, and its context menu holds Open, Open matter and Copy link.
2. One primary action per view, inside the decision bar when there is a decision, with its key from [keys.md](keys.md).
3. Status is an icon shape plus the atlas word in sentence case ([status-map.md](status-map.md)), never the icon alone, and a page shows its subject's status once.
4. No raw IDs, hashes, form codes, record positions, account handles or internal actor names outside Audit. The matter key and the application number are the firm's own references and may show; people show by their display name.
5. English and German copy in sentence case, in the person's words ("Rule 71(3) communication", "FlowLeap", "Client report").
6. A decision is a person's act. The decision bar is docked in view; it names each part and its evidence state, and each statement in the content points to an exact span (quote and page). Missing evidence is a warning that blocks Accept.
7. A board moves a card only on an allowed transition, by a person who may make it; a move that is a decision opens the decision bar.
8. People come only from inside the matter's wall: rows, cards, pickers and Activity never show a person outside it.

## Files

| File | Use |
|---|---|
| [rules.md](rules.md) | The bar: each rule with its number, its check, and its source |
| [tokens.md](tokens.md) | Each role of the rules mapped to its client token |
| [contrast.md](contrast.md) | Contrast of every client token pair in both themes, generated by `scripts/contrast.mjs` |
| [status-map.md](status-map.md) | Shape and word of every process-atlas state, generated by `scripts/status-map.mjs` |
| [keys.md](keys.md) | The one key map |
| [components.md](components.md) | Anatomy and states of each component |
| [review-checklist.md](review-checklist.md) | The merge checklist |
| [client-gaps.md](client-gaps.md) | The client changes that the IPMS screens need: the move into the client, the new parts, the `ui-primitives` extensions, the key layer |
| [references/README.md](references/README.md) | Linear and guide URLs, the live Linear measurements, the reference mockups and screenshots |
