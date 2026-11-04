# Tokens

The IPMS screens use the harness client theme as it is ([`packages/client/ui-theme/src/styles`](../../../packages/client/ui-theme/src/styles/)), with its font, its colours, its radii, its motion and its elevation. This skill defines no token. The table maps each role of the rules to the client token; `scripts/check-css.mjs` fails on a `var()` that the client theme does not define, on a `--dsw-static-*` palette value, and on a literal colour. The client has no spacing or size tokens, so R5 and R6 give literal scales, and `check-css.mjs` checks the spacing scale.

| Role | Client token | Use |
|---|---|---|
| App and sidebar | `--dsw-specific-sidebar-fill` | Behind the content panel |
| Content panel | `--dsw-alias-bg-base` | The list and detail surface |
| Raised | `--dsw-alias-bg-layer-2` | Decision bar, file row, result card, composer |
| Overlay | `--dsw-alias-bg-layer-3` | Excerpt popover, selected segment |
| Group header, notice, board column | `--dsw-alias-bg-multi-select` | Tinted surfaces inside the panel |
| Hover | `--dsw-alias-interactive-bg-hover` | Row hover, highlighted menu item, segmented control track |
| Selected | `--dsw-alias-interactive-bg-active` | Selected row, active sidebar item |
| Menu material | `--dsw-specific-menu`, `--dsw-menu-backdrop-filter` | ⌘K, pickers; `Menu` or `MenuSurface` in the client |
| Scrim | `--dsw-alias-bg-mask-2` | Behind ⌘K |
| Skeleton | `--dsw-alias-bg-skeleton` | Loading rows |
| Hairline | `--dsw-alias-border-l2`, `--dsw-alias-border-l3` | 0.5 px neutral borders |
| Primary text | `--dsw-alias-label-primary` | Titles, row titles, values |
| Secondary text | `--dsw-alias-label-secondary` | Labels, times, counts, metadata |
| Icon | `--dsw-alias-label-tertiary` | Icons and separators only, never text (3.71:1 on white) |
| Primary button | `--dsw-alias-button-primary-fill`, `--dsw-alias-button-primary-hover`, `--dsw-alias-label-primary-foreground` | The one primary action |
| Checked checkbox | `--dsw-alias-brand-primary` | As the client `Checkbox` |
| Selection bar, focus | `--dsw-alias-state-business-primary` | The 2 px bar of a selected row; `focus.css` draws the focus ring |
| Status icon | `--dsw-alias-state-warn-primary`, `-success-primary`, `-business-primary`, `-error-primary`, `-idle-primary` | Waits, done, working, refused or stale, no action |
| Status tint | `--dsw-alias-state-warn-tertiary`, `-success-tertiary`, `-business-tertiary`, `--dsw-alias-interactive-bg-hover-danger`, `--dsw-alias-bg-module-platform` | Status pill, evidence quote, missing evidence, mention chip |
| Avatar | `--dsw-alias-bg-overlay` with `--dsw-alias-label-primary` | Initial of the given name |
| Letter drawing | `--dsw-alias-bg-document-preview`, `--dsw-alias-label-document-preview` | A picture of the source document |
| Elevation | `--dsw-elevation-panel`, `--dsw-elevation-prominent` | Buttons and cards; the decision bar, menus and popovers |
| Type | `--dsw-font-family`, `--ds-font-family-code`, `--dsw-font-{xxs-12, xs-13, s-14, l-20, xl-24}-font-size` and `-line-height`, `--dsw-font-xs-13-font-weight` (400), `--dsw-font-xs-strong-13-font-weight` (500) | R1, R2 |
| Radius | `--dsw-radius-xs` 4, `--dsw-radius-sm` 8, `--dsw-radius-md` 12; 999px capsule, 50% circle | R7 |
| Motion | `--ds-transition-duration-fast` 100 ms, `--ds-transition-duration` 200 ms, `--ds-transition-duration-slow` 300 ms, `--ds-ease-in-out` | R15 |
