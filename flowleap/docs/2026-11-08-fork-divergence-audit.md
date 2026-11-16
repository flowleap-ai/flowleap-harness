# Fork divergence audit: upstream-owned code in the FlowLeap fork

Status: audit for the founder's approval, 2026-11-08. Read only: this document changes no code and reverts nothing. Each PR in the plan needs the founder's approval before it starts, and each upstream PR needs the founder's approval before anyone sends it.

## Why this audit

On 2026-11-08 the founder decided that FlowLeap must not change the dsh core. Every FlowLeap feature must be a plugin on a documented extension point, so that upstream syncs stay easy. Where an extension point is missing, the fork proposes the smallest slot to upstream and keeps only a marked patch that adds the slot. This audit measures how far the fork has changed upstream-owned code, puts every change into one class, and plans small PRs that move FlowLeap behaviour into plugins.

## Summary

- **Base.** The divergence base is upstream `master` at the commit that PR 292 merged (the merge of `release/dsh-0.2.2-rc.1` into `master`, 2026-11-04). The tag `dsh-v0.2.2-rc.1` is on the release branch. Upstream `master` has 811 more upstream commits than the tag, and the fork contains all of them. A diff against the tag shows upstream work as fork divergence, so this audit uses upstream `master`. On 2026-11-08 upstream `master` and this base are the same commit.
- **Size.** 5,025 files differ between the fork and upstream `master`. 833 are new FlowLeap-owned files. 4,192 are upstream-owned. Of these, 3,398 differ only because of the English-only documentation strip, 271 are new FlowLeap files in upstream folders, and 523 carry feature changes (458 modified or deleted, 65 added). The modified files have 12,932 added and 5,466 removed lines. 149 of them are non-test source files in `packages/`, `apps/` or `native/`, with 6,152 changed lines.
- **Commits.** 691 fork commits are not in upstream. 320 of them touch upstream-owned paths. 315 of these still cause divergence today. 43 of the 320 went to `flowleap` by direct push, without a PR.
- **Classes.** The 523 feature files and the 271 new FlowLeap files make 70 features, plus the English-only strip. By class: plugin 6, slot 27, upstream fix 23, keep 3, revert 2, owned 9 (new FlowLeap files in upstream folders; see [Classes](#classes)).
- **HANDOFF.** HANDOFF lists 9 fork modification sites. This audit finds 61 features that change upstream-owned code (all classes except owned). 52 of them are not in the HANDOFF list. Of the 9 listed sites, 5 have no `FlowLeap fork modification` comment.
- **Largest break of the plugin rule.** The upstream client Remote assembly (`packages/api/remotes/src/client/index.ts`) imports and mounts six FlowLeap Remotes. Every client build of every profile carries FlowLeap code. Each FlowLeap client package can mount its own Remote with `ctx.remote.$mount()` instead.
- **English-only.** Recommendation: restore the upstream documentation byte for byte, and make English-only a configuration of search, Docker and the translation gate. See [The English-only baseline](#the-english-only-baseline).

## Method

1. I fetched `flowleap/flowleap` and `origin/master` and listed the fork commits with `git log --no-merges refs/remotes/flowleap/flowleap --not refs/remotes/origin/master`. For each commit I recorded the upstream-owned paths and the PR that merged it (the first-parent merge whose second parent brings the commit).
2. I measured the current divergence with `git diff --name-status --no-renames origin/master flowleap/flowleap`. A file counts as English-only strip when it is a deleted `.zh.md`, `.i18n.yaml`, `docs/i18n/` or translate-skill file, or when its only changed lines contain the `English | [中文]` header.
3. Four helper agents read the diff hunks of all other upstream-owned files, area by area (core and host packages, client packages, apps and scripts, docs and snapshots). Each agent grouped the hunks into features and classified them. I merged their tables, removed duplicates across areas, and checked the main claims on the fork tip (the Remote imports, the keybinding schema version, the connectors manifest, the missing comments).
4. I compared the result with HANDOFF's list "Fork modifications of upstream code" and with the conflict rows of the five sync decision logs in `flowleap/docs/` (2026-10-26 to 2026-11-05).

## Ownership list

The brief names these FlowLeap-owned paths: package folders whose name contains `flowleap`, `flowleap/`, `HANDOFF.md`, `.agents/skills/flowleap-*` and `.agents/skills/verify`. The tree confirms them: upstream has no `.agents/skills/verify` and no `flowleap-design-language`. The list misses new FlowLeap files in upstream folders. Add these patterns (271 files today):

| Pattern | Files | Note |
|---|---|---|
| `vendor/flowleap-connectors/` | 121 | Hash-pinned copy of the backend connectors |
| `snapshots/*/flowleap-*/` | 71 | Keyless FlowLeap session and web snapshots |
| `packages/client/ui-settings-skills/` | 26 | Fork-added package without the `flowleap` marker; rename it (F70) |
| `deploy/` | 14 | Firm-server image and compose recipe; upstream has no `deploy/` |
| `apps/web/tests/flowleap-*` | 13 | FlowLeap browser tests |
| `apps/cli/tests/flowleap-*` | 9 | FlowLeap profile tests |
| `docs/upgrade-guide/v*/flowleap-*/` | 5 | FlowLeap upgrade guides |
| `apps/desktop/resources/flowleap/` | 5 | FlowLeap icons |
| `scripts/flowleap/` | 5 | Doctor, log bundle, sync and strip scripts |
| `apps/desktop/config/product.flowleap.json` | 1 | FlowLeap desktop product record |
| `.agents/notes/**/*-flowleap-*.md` | 1 | FlowLeap agent note |

Rename the four FlowLeap files that have no marker: the upgrade guides `firm-image-office-rows` and `record-report-quote-spans`, the snapshot `missing-credential-card` and its e2e test. The 65 other added files in upstream folders belong to features that change upstream packages, and the feature table classifies them.

## The English-only baseline

### What it changed

The commit "chore(flowleap): English-only fork baseline" (direct push, 2026-10-21) changed 2,956 files: 1,949 deleted, 1,004 modified, 3 added. In `packages/` it touched 1,210 files, all documentation: 403 `README.md` files lose the `English | [中文]` header line, and 403 `README.zh.md` plus 403 `README.i18n.yaml` files are deleted. One test (`typert/generator/tests/cordis-catalog.spec.ts`) drops a Chinese region check. Outside `packages/` it removes `docs/i18n/`, the `dsh-translate-docs` skill, five translation gates and their `lefthook.yml` jobs and `package.json` scripts, the Chinese outputs of six generators, and the zh-CN locale of the documentation site. It also rewrites the bilingual rules in `AGENTS.md`, `docs/AGENTS.md` and the `.agents/skills`. `scripts/flowleap/strip-zh.sh` repeats the file part after each upstream merge. Carve-outs stay bilingual because hash seals protect them: `docs/persistence-changes/`, the persistence catalogs, `docs/session-format-status.*` and `.agents/notes/archived/`. The Chinese plugin detail pages (`packages/**/docs/DETAIL.zh.md`) stay because the UI reads them.

### What it did not change

The strip changes no runtime behaviour. The 8 UI languages stay (founder rule of 2026-10-26), and no published package contains the deleted files: a package `files` list has `lib/` and `locale/*.json`, and npm adds only `README.md`. The strip does not make the product smaller.

### Why

The commit message and HANDOFF record what the strip removed and which carve-outs stay, but not why. The founder confirmed the rule on 2026-10-26 ("Chinese docs stay stripped"). The likely reason (inferred, not recorded) is agent context: with the twins, each search finds every page twice, and agents read and must keep a Chinese twin in step with each English edit.

### Cost and saving

| Item | Keep the strip | Restore upstream docs |
|---|---|---|
| Divergent upstream files | 3,398 strip files plus about 60 tooling and rule edits | 0 strip files; about 5 small config edits |
| Unmerged paths at a sync (measured in the sync logs) | 151 to 285 per sync, settled by `strip-zh.sh`; 1 or 2 real conflicts (for example `rescope-vendor.spec.ts`, archived triplets) | 0 |
| Recurring tooling conflicts | Each upstream change to a gate, generator or the site config can conflict with the fork edits in 37 script and site files | None |
| The gate in this audit | Needs a special rule for 3,398 deletions and header edits | No special rule |
| Agent search noise | None | Each search finds twins, unless an ignore file hides them |
| Checkout size | Smaller | 4,295 more files, 19.4 MiB |
| Translation gate | Removed | Runs again; FlowLeap docs need an exclusion |
| Runtime behaviour and bundle size | No effect | No effect |
| One-time work | None | One mechanical PR: `git checkout origin/master -- <strip paths>` and a revert of the tooling edits |

### English-only as configuration

1. Agent search: add `*.zh.md` and `*.i18n.yaml` to a new root `.ignore` file. ripgrep reads `.ignore` beside the upstream `.rgignore`, which already hides `.agents/notes/archived/` the same way. A new file causes no merge conflict.
2. Docker: add `**/*.zh.md` and `**/*.i18n.yaml` to `deploy/Dockerfile.dockerignore` (a FlowLeap-owned file).
3. Translation gate: FlowLeap docs stay English only through an exclusion. The upstream gate reads `scripts/translation-pairing.manifest.json`, whose `excluded` list accepts directory entries that end in `/`. Short term, add FlowLeap-owned directories to that list (one marked patch, append-only). Upstream slot: let the manifest accept glob patterns, so one entry such as `**/*flowleap*/` covers every FlowLeap package.
4. Rules: the FlowLeap rules (`flowleap/docs/agents/`, the FlowLeap skills) say "write English only". In the plugin model FlowLeap edits no upstream page, so no FlowLeap change needs a Chinese twin.

**Recommendation.** Restore the upstream documentation and use the four configuration items above. The restore removes about 80% of the upstream-owned divergence and all strip work at each sync, at no runtime risk. The decision is the founder's, because it reverses the rule of 2026-10-21 and 2026-10-26.

## Classes

Each feature has exactly one class. Owned is an extra class for new FlowLeap files in upstream folders: they cause no merge conflict, and the fix is the ownership list or a move.

| Class | Count | Meaning |
|---|---|---|
| plugin | 6 | Can move into a FlowLeap plugin on an existing extension point now |
| slot | 27 | Needs an extension point that the core lacks; propose the slot upstream and keep a marked patch with only the slot |
| upstream fix | 23 | A general fix or improvement; propose it upstream and keep the marked patch until upstream merges it |
| keep | 3 | A real fork necessity; needs the comment and the list entry |
| revert | 2 | Not needed; a rename removes it |
| owned | 9 | New FlowLeap files in upstream folders |
| English-only | 1 | The strip and its tooling edits ([above](#the-english-only-baseline)) |

## Features

Columns: comment means a `FlowLeap fork modification` comment at the code site (yes, partial, no). HANDOFF means an entry in HANDOFF's list. Conflicts means the number of the four sync logs with conflict rows (2026-10-28 to 2026-11-05) in which a file of the feature conflicted. Appendix A lists the commits of each feature.

### Deployment locks and security rules

| ID | Feature | Upstream code | Class | Target | Comment | HANDOFF | Conflicts |
|---|---|---|---|---|---|---|---|
| F01 | Model lock: `fixedRoutes`, live route change refused, `request-headers` cannot change `Authorization`, `x-api-key`, `api-key` | `llm/llm-pi-ai` | upstream fix | Upstream PR "llm-pi-ai: fixedRoutes, a deployment-owned route set" | partial | yes | 1 |
| F02 | Bundle row locks: `dsh.bundle.lockedRows` drops user patches on locked rows | `boot/app-boot`, `util/package-manifest`, `apps/cli`, web test scaffold | slot | Upstream PR "app-boot: `dsh.bundle.lockedRows` locks bundle rows against user patches" | no | no | 0 |
| F03 | Read-only host key file (`readOnlyPath`) and `lockedRefs`; key input disabled for a read-only key | `credentials/credentials-local`, `ui-settings-models` | upstream fix | Upstream PR "credentials-local: readOnlyPath and lockedRefs"; fallback a FlowLeap `CredentialProvider` on the `credentials` seam | no | no | 0 |
| F04 | Managed Models page (`managed: true`): routes and key state only | `ui-settings-models` | slot | Upstream PR "ui-settings-models: `managed` config shows fixed routes read-only", neutral copy | no | no | 0 |
| F05 | Plugin manager deployment switches (`readOnly`, `installBundles`, `offeredBundles`, `withheldBundles`) and the read-only Plugins page | `boot/plugin-manager`, `ui-plugin-manager` | upstream fix | Upstream PR "plugin-manager: deployment switches and read-only page" | no | no | 1 |
| F06 | `subscriptionSignIn: false`: no pi-ai sign-in flows | `llm/llm-pi-ai` | upstream fix | Upstream PR "llm-pi-ai: subscriptionSignIn switch" | partial | no | 0 |
| F07 | Prompt admission refuses a model that its route does not serve | `api/session-controller`, `ui-model-selection` README | upstream fix | Upstream PR "session-controller: refuse a prompt whose model its route does not serve" | no | no | 2 |
| F08 | Sandbox `network: deny`: no IP network for confined commands (bwrap, Landlock seccomp in `native/system` C code, Seatbelt) | `sandbox/sandbox-local`, `native/system`, `shell/bash-sandbox`, `sandbox-windows-acl` tests | upstream fix | Upstream PR "sandbox-local: network deny for confined commands" | no | no | 0 |
| F09 | Upload refusal at low disk: `assertUploadsAccepted()` and `STORAGE_LOW` | `attachment/attachment`, `attachment-local`, `api/session-controller`, `acp/acp`, `client/file-upload`, `ui-attachment`, `ui-conversation` | slot | Upstream PR "attachment: `assertUploadsAccepted()` admission seam and `STORAGE_LOW`"; FlowLeap copy through `ctx.locale.override()` | no | no | 2 |
| F10 | Markdown link protocol allowlist (`http:`, `https:`, `mailto:`) | `ui-primitives` `render.tsx`, its tests, the web e2e | keep | Keep the marked patch; optional upstream slot `linkProtocols` on `MarkdownDelegateProvider` | yes | yes | 0 |
| F11 | Live Share: 23 FlowLeap endpoints are `owner-only` | `experimental/liveshare` | slot | Upstream PR "liveshare: endpoints outside the table are owner-only" or a declaration-merged class map | partial | no | 0 |

### Seams that FlowLeap plugins use

| ID | Feature | Upstream code | Class | Target | Comment | HANDOFF | Conflicts |
|---|---|---|---|---|---|---|---|
| F12 | `schedule/admit` waterfall and `schedule/delivered` event | `schedule/schedule` | slot | Upstream PR "schedule: schedule/admit waterfall and schedule/delivered event" | no | yes | 2 |
| F13 | `schedule.manager.filter` list slot | `ui-schedule` | slot | Upstream PR "ui-schedule: `schedule.manager.filter` list slot" | no | yes | 2 |
| F14 | `newTaskDraft` switch: New task puts the example request in the composer | `ui-schedule` | plugin | `ctx.locale.override('schedule.manager', ...)` in `ui-flowleap-routines`; revert the switch | no | yes | 2 |
| F15 | `sidebar.actions` and `sidebar.sections` list slots | `ui-sidebar` | slot | Upstream PR "ui-sidebar: `sidebar.actions` and `sidebar.sections` list slots" | no | yes | 1 |
| F16 | MCP `tools.include` and `tools.exclude` | `mcp/mcp-client` | upstream fix | Upstream PR "mcp-client: per-server tool filter" | no | yes | 1 |
| F17 | `llm/response-notice` event and route `noticeHeaders` | `llm/llm`, `llm/llm-pi-ai`, `api/remotes` forward list | slot | Upstream PR "llm: `llm/response-notice` event and `noticeHeaders`" | no | no | 0 |
| F18 | Gateway budget notice under the composer | `ui-conversation` | plugin | Occupant of `conversation.composer.dock` in `ui-flowleap-budget`, fed by `ctx.remote.$on('llm/response-notice')` | no | no | 1 |
| F19 | Agent preset `roster-changed` event, `definition(id)`, `agentPreset.menu.actions` slot | `preset/agent-preset-registry`, `ui-agent-preset`, `api/remotes` | slot | Upstream PR "agent-preset-registry: roster-changed event, definition(id), menu actions slot" | no | no | 0 |
| F20 | Webhook rule hooks `started()` and `failed()` | `experimental/webhook` | slot | Upstream PR "webhook: started() and failed() rule hooks" | no | no | 0 |
| F21 | `ctx.locale.override()` partial dictionary layers | `client/locale` | slot | Upstream PR "client-locale: override(ns, locale, dict)" | no | no | 0 |
| F22 | `conversation.chat.running.icon` single slot | `ui-chat` | slot | Upstream PR "ui-chat: running icon slot" | no | no | 2 |
| F23 | `conversation.chat.turn-error.action` keyed slot | `ui-chat` | slot | Upstream PR "ui-chat: turn-error action slot" | no | no | 0 |
| F24 | `uiWorkspace.provideSearch()` | `ui-workspace` | slot | Upstream PR "ui-workspace: provideSearch"; one chained registry also serves F33 | no | no | 1 |
| F25 | Landing panel and `?chat=` / `?page=` addresses | `ui-workspace` | slot | Upstream PR "ui-workspace: provideLanding and bookmarkable addresses" | no | no | 0 |
| F26 | View-scoped key layers and key sequences; keybinding document `schemaVersion: 3` | `client/shortcuts`, `ui-shortcuts` | slot | Upstream PR "client-shortcuts: view-scoped key layers"; fallback a key handler on the records view root | no | no | 0 |
| F27 | Boxed keycaps in menu rows | `ui-primitives`, `ui-context-menu` | slot | Upstream PR "menu rows: boxed keycap shortcuts" (needs F26) | no | no | 0 |
| F28 | Drawer top row for a global panel (`data-frame-top-row`) | `ui-layout` | slot | Upstream PR "ui-layout: a panel's own top row holds the drawer opener" | no | no | 0 |
| F29 | FlowLeap profile templates in `official-bundles`; the CLI depends on FlowLeap bundles | `util/official-bundles`, `apps/cli` | slot | Upstream PR "official-bundles: profile templates declared by bundle manifests" | no | no | 0 |
| F30 | Desktop product record (name, ids, scheme, icons, profile, vendor switches) | `apps/desktop` (16 files) | slot | Upstream PR "desktop: a product record selects brand, ids, icons and vendor switches" | partial | no | 3 |
| F31 | Desktop ships a pinned skill pack | `apps/desktop` | slot | `skillPack` field in the F30 PR | no | no | with F30 |

### FlowLeap code inside upstream packages

| ID | Feature | Upstream code | Class | Target | Comment | HANDOFF | Conflicts |
|---|---|---|---|---|---|---|---|
| F32 | Six FlowLeap Remotes and `skillInventory` mounted by the upstream client assembly; `flowleap-*/changed` forwarded events | `api/remotes` | plugin | Each FlowLeap client package calls `ctx.remote.$mount()` (as `client-ui-forge` and `liveshare` do); change notices become stream methods of the owning Remote | no | no | 2 |
| F33 | Item-scoped command menu (`ctx.commandMenu`) | `ui-commands` | plugin | New `ui-flowleap-command-menu`: `shell.overlay` occupant plus a `provideSearch` registration | no | no | 0 |
| F34 | IPMS UI parts (`Keycap`, `Avatar`, `StatusShape`, `Tag` and `StateDot` shapes) | `ui-primitives` | plugin | A FlowLeap UI kit package; revert the `Tag` and `StateDot` edits | no | no | 0 |
| F35 | `createLazyRemoteSource` | `client/store` | plugin | Move into a FlowLeap client package | no | no | 0 |

### General fixes and improvements

| ID | Feature | Upstream code | Class | Comment | HANDOFF | Conflicts |
|---|---|---|---|---|---|---|
| F36 | Provider failures classified on the HTTP status | `llm/llm-pi-ai` | upstream fix | no | no | 0 |
| F37 | One image-input route check for tools and ACP | `llm/llm`, `core/tools`, `acp/acp`, `fs/tool-fs`, `mcp/mcp-client`, `experimental/cua` | upstream fix (else revert and inline in `flowleap-connectors`) | no | no | 0 |
| F38 | `ToolsService.registeredBy(fiber)`; plugin list shows tools and browser half | `core/tools`, `boot/plugin-manager`, one upstream snapshot | upstream fix | no | no | 0 |
| F39 | Agent loop keeps claimed users when the first preparation fails | `core/agent-loop` | upstream fix | no | no | 0 |
| F40 | MCP plugin description without the product name | `mcp/mcp-client` | upstream fix | no | no | 0 |
| F41 | Shared signed HTTP intake for webhook adapters | `experimental/webhook`, `webhook-github` | upstream fix | no | no | 0 |
| F42 | Skill `inspect()`, `read()`, `SkillFault`, `requireCustomSkillDirs` | `skill/skill`, `skill/skill-filesystem` | upstream fix | no | no | 0 |
| F43 | Snapshot redaction of Schedule task ids | `test-support/session-snapshot` | upstream fix | no | no | 0 |
| F44 | "Set up a model" action and `settingsNavigation` service | `ui-settings`, `ui-settings-models`, `ui-chat` | upstream fix | no | no | 0 |
| F45 | `createPlugin` switch for the More menus | `ui-entry-customization` | upstream fix | no | no | 0 |
| F46 | An open context menu runs an item from its command key | `ui-context-menu` | upstream fix | no | no | 0 |
| F47 | Test budgets for hosted runners; keep-alive slack; Python wheel steps skip without the key | `ptc-runtime-python` and `sandbox-windows-acl` tests, `apps/cli` tests, CI workflow | upstream fix | no | no | 0 |
| F48 | Installed-product isolation finds npm packages named like Node built-ins | `scripts/release` | upstream fix | no | no | 0 |
| F49 | Python runtime: pkg ignore globs anchored at the staging folder | `scripts/build-exe-for-python-sdk.ts` | upstream fix | yes (shared with F56) | no (the entry covers F56 only) | 0 |
| F50 | `Zlib` on the licence allowlist | `scripts/gen-third-party-notices.ts` | upstream fix | no | no | 0 |
| F51 | Pre-push gate set and `pnpm run gen` | `lefthook.yml`, `scripts/`, `docs/development.md` | upstream fix (fallback: a FlowLeap `lefthook-local.yml`) | no | no | 0 |

### Repository gates, lists and generators

| ID | Feature | Upstream code | Class | Target | Comment | HANDOFF | Conflicts |
|---|---|---|---|---|---|---|---|
| F52 | CI on GitHub-hosted runners and the coverage exemption | `.github/workflows`, `scripts/coverage-exempt.ts` | slot | Upstream PR "ci: read the default runner from repository variables" | no | no | 0 |
| F53 | Gate carve-outs: `verify-repository-references`, `verify-concrete-terms`, `verify-md-wrap` | `scripts/` | slot | Upstream PR "gates: read extra exclusions from one repository file" | yes | 1 of 3 | 1 |
| F54 | Package lists inside gates: locale metadata, model-experience map, product policy, workspace file extras, entrypoint drivers, client `INLINE_SAFE`, notices | `scripts/`, `packages/client/tsdown.client.ts` | slot | Upstream PR "gates: read package policy from `dsh.*` fields of each package.json" | partial | no | 2 |
| F55 | Catalog generators with FlowLeap service rows; generated outputs list FlowLeap packages | `scripts/gen-*`, `docs/` catalogs, `cordis-client-runner`, `tool-cordis` | slot | Upstream PR "catalog generators: read doc page and seam record from the package"; until then take upstream and run `pnpm run gen` | no | no | 4 |
| F56 | Python runtime leaves out FlowLeap packages (100 MB PyPI limit) | `scripts/build-exe-for-python-sdk.ts` | slot | Upstream PR "python runtime: extra ignore globs from package.json"; F29 removes the root cause | yes | yes | 0 |
| F57 | Oxlint override for the agent-v2 copies | `.oxlintrc.json`, `scripts/lint-rule-fingerprint.spec.ts` | slot | Nested oxlint config, else upstream PR "pin only the upstream overrides" | partial | no | 0 |
| F58 | Registration rows of FlowLeap packages in upstream lists (tsconfig references, test includes, snapshot adapter list, lockfile, group READMEs) | root config files, `pnpm-lock.yaml`, READMEs | keep | Put all fork rows in one block at the end of each list; regenerate the lockfile | no | no | 2 |
| F59 | Fork identity and fork-only text (AGENTS.md block, README notice, Makefile, `gh signoff` step, design-skill link) | root files, `dsh-pre-push-checks`, `dsh-code-review` | keep | One fork block in root `AGENTS.md`; move the rest to FlowLeap skills | partial | no | 2 |
| F60 | Experimental name exception for `flowleap-ticket` | `scripts/experimental-package-policy.ts` | revert | Rename the package to `dsh-experimental-flowleap-ticket` | no | no | 0 |
| F61 | Release family accepts the `@flowleap` scope | `scripts/release/families.ts` | revert | Rename to `@deepseek-ai/flowleap-connectors` | yes | no | 0 |

### New FlowLeap files in upstream folders (owned)

| ID | Files | Target |
|---|---|---|
| F62 | `vendor/flowleap-connectors/` | Ownership list; add `private: true` (see findings) |
| F63 | `deploy/`, `deploy/officecli/` | Ownership list, or move to `flowleap/deploy/` |
| F64 | `scripts/flowleap/` | Ownership list |
| F65 | Desktop product file and icons | Ownership list; move after F30 takes a path |
| F66 | FlowLeap tests in `apps/cli/tests` and `apps/web/tests` | Ownership list |
| F67 | FlowLeap snapshots (and `missing-credential-card`) | Ownership list; rename the unmarked snapshot |
| F68 | FlowLeap upgrade guides | Ownership list; rename two guides |
| F69 | FlowLeap agent note | Ownership list |
| F70 | `packages/client/ui-settings-skills` | Rename to `ui-flowleap-settings-skills`, or offer it upstream with F42 |

## Behaviour that must not be lost

Each PR in the plan must keep these rules and run their tests before and after the change.

| Rule | Features | Tests that prove it |
|---|---|---|
| Model lock: firm routes and keys are fixed; no user patch, settings page or plugin manager write reaches a locked row; a header listener cannot replace the key | F01, F02, F03, F04, F05 | `packages/llm/llm-pi-ai/tests/config.spec.ts`, `loader-composition.spec.ts`; `packages/boot/app-boot/tests/profile.spec.ts`; `packages/credentials/credentials-local/tests/locked-refs.spec.ts`, `read-only.spec.ts`; `packages/boot/plugin-manager/tests/manager.spec.ts`; `packages/client/ui-settings-models/tests/apply.client.spec.ts`; `apps/web/tests/flowleap-firm-models.e2e.ts`; the `apps/cli/tests/flowleap-*` profile specs |
| A stale model selection is refused at once; the draft stays | F07 | `packages/api/session-controller/tests/session-models.host.spec.ts`; `apps/web/tests/default-model-unlisted.e2e.ts` |
| No subscription sign-in in any FlowLeap profile | F06 | `packages/llm/llm-pi-ai/tests/config.spec.ts` |
| Sandbox network rule: a confined command reaches no IP network, loopback included | F08 | `packages/sandbox/sandbox-local/tests/network.e2e.ts`, `local.spec.ts`; `packages/shell/bash-sandbox/tests/bwrap.e2e.ts`, `seatbelt.e2e.ts` |
| Upload refusal at low disk: no byte stored, `STORAGE_LOW`, retry works after the flag clears | F09 | `packages/attachment/attachment/tests/index.spec.ts`, `attachment-local/tests/index.spec.ts`, `packages/api/session-controller/tests/commands-upload-file.host.spec.ts`, `packages/client/ui-attachment/tests/composer-attachments.client.spec.tsx` |
| Link allowlist: only `http:`, `https:`, `mailto:` stay links | F10 | `packages/client/ui-primitives/tests/markdown-file-links.client.spec.tsx`, `packages/client/ui-chat/tests/chat-view.client.spec.tsx`, `apps/web/tests/markdown-file-links.e2e.ts` |
| Live Share viewers reach no firm keys, agents, budget, routines or work pages | F11 | Only the client compile check (gap) |
| The paid MCP row registers only the paid tools | F16 | `packages/mcp/mcp-client/tests/mcp-client.spec.ts` |
| Routine admission: register watches skip or redirect runs; Run now skips admission | F12 | `packages/schedule/schedule/tests/runtime.spec.ts`; `snapshots/web/flowleap-routine-run` |
| The skill pack folder must exist, or the start fails | F42 | `packages/skill/skill-filesystem/tests/skill-filesystem.spec.ts`; `apps/web/tests/flowleap-skills-dir.e2e.ts` |
| Desktop vendor switches: no DeepSeek account calls, no shell telemetry, no update feed | F30 | No test drives them in `main.ts` (gap) |
| The budget notice never reaches the model or the Session log | F17, F18 | `packages/llm/llm-pi-ai/tests/adapter.spec.ts`; `packages/client/ui-conversation/tests/input-bar.client.spec.tsx` |

## HANDOFF comparison

HANDOFF lists 9 sites. They map to F10, F01, F12, F13, F53 (only `verify-repository-references`), F15, F14, F16 and F56. Four have the comment (F10, F01 only for the header rule, F53, F56). Five have no comment: the schedule seams (F12), the filter slot (F13), `newTaskDraft` (F14), the sidebar slots (F15) and the MCP filter (F16). HANDOFF says that each listed site has a comment, so that sentence is false today.

52 features that change upstream code are not in the list: F02 to F09, F11, F17 to F52, F54, F55, F57 to F61, and the `verify-concrete-terms` and `verify-md-wrap` parts of F53. The undocumented security rules are the most important: bundle row locks (F02), the read-only key file and `lockedRefs` (F03), the managed Models page (F04), the plugin manager switches (F05), `subscriptionSignIn` (F06), the sandbox network rule (F08), the upload refusal (F09) and the Live Share classes (F11).

Proposal: the gate's allow-list file becomes the one list of fork modifications, and HANDOFF links to it instead of keeping its own list (one home per fact).

## Other findings

- **Keybinding file format (F26).** A saved keybinding document now has `schemaVersion: 3`. An upstream build reads version 3 as `future`, so a profile's saved bindings become unreadable after a downgrade or after a sync that drops the feature. No persistence acknowledgement or upgrade guide records it.
- **A fork change that lives only in a merge (F27).** The keycap code in `packages/client/ui-primitives/src/MenuRow.tsx` exists only in a sync merge commit, because an upstream refactor moved the row code. `git log --no-merges` shows no fork commit for this file, so a later merge can drop it without a trace.
- **Context menus (F46).** An open context menu now runs any enabled item whose command binding matches the key. This changes upstream behaviour for every menu.
- **Model lock gap (agent finding, not proven by a test).** `fixedRoutes` does not require `lockedRefs` or `readOnlyPath`. If a deployment sets only `fixedRoutes`, a key typed in the browser can reach a fixed route, and nothing fails at load. A load check should fail in this case.
- **Connectors manifest (F62).** `vendor/flowleap-connectors/package.json` has `publishConfig.access: public` and no `private: true`, and F61 puts it in the dsh release family. A release job could publish it to npm.
- **FlowLeap copy in upstream dictionaries.** `attachment.storageLow`, `model.responseNotice`, the managed Models text and `pluginManager.introReadOnly` hold firm wording in upstream locale files. A plain dsh build shows firm text. `ctx.locale.override()` (F21) can carry this copy.
- **Refactors for one FlowLeap consumer.** The image-input check (F37) and the webhook HTTP intake (F41) refactor 7 upstream files for one FlowLeap user each. If upstream declines them, revert them and put the small helpers in the FlowLeap packages.
- **Untested scripts.** `scripts/flowleap/doctor.ts`, `log-bundle.sh`, `sync-connectors.sh` and `sync-deliverables.sh` have no tests, although the doctor must never print a key value.
- **Small defects.** `tsconfig.host.json` has two duplicate project references (`ui-settings-flowleap-connectors`, `ui-brand-flowleap`). `scripts/verify-concrete-terms.ts` repeats one fork comment line. `vendor/README.md` names a personal repository as the connectors source.
- **Direct pushes.** 43 of the 320 commits that touch upstream-owned paths went to `flowleap` without a PR, among them the English-only baseline. The gate below stops this for upstream-owned paths.

## Gate design

The gate is not built in this PR. It fails when the fork changes an upstream-owned path that the allow-list does not name.

**Allow-list file.** `flowleap/fork-modifications.tsv`, a FlowLeap-owned file, so it never conflicts at a sync. One row per path pattern, with these columns:

| Column | Content |
|---|---|
| `path` | An exact path or a glob, for example `packages/llm/llm-pi-ai/src/index.ts` |
| `status` | `M`, `A`, `D` or `*`; the strip rows, if kept, use `D` |
| `feature` | The feature ID of this audit, for example `F01` |
| `class` | `slot`, `upstream fix`, `keep`, or `debt` (a plan item that has not landed) |
| `reason` | One sentence |
| `upstream` | The upstream PR link, or `none` |

A second section (or a file `flowleap/ownership.txt`) holds the ownership patterns of [Ownership list](#ownership-list). The checker reads only these two inputs.

**Check.** `scripts/flowleap/check-fork-divergence.ts` (FlowLeap-owned):

1. Find the base: `git merge-base HEAD <upstream master>`. After a sync merge this is the synced upstream commit, so the upstream changes that a sync brings never count as fork changes.
2. List `git diff --name-status --no-renames <base> HEAD`. Drop the paths that match an ownership pattern.
3. Fail for each remaining path that no allow-list row matches. The message names the path, the commits that changed it (`git log <base>..HEAD -- <path>`), and the fix: move the change into a plugin, or add a row in the same PR.
4. Fail for each allow-list row that matches no divergent path (a stale row). This keeps the list true when upstream merges a slot or when the fork removes a patch.
5. For rows of class `slot`, `upstream fix` and `keep` on source files, fail when the file has no `FlowLeap fork modification` comment.

**Where it runs.**

- Pre-push (`lefthook`, through a FlowLeap-owned `lefthook-local.yml` or one marked job): it needs only local refs and runs in under a second.
- CI on every PR to `flowleap`: a job fetches upstream `master` with `git fetch --depth=1000 https://github.com/deepseek-ai/deepseek-harness master` (read only) and runs the check. Mark the check as required on the `flowleap` branch, so a direct push cannot skip it.
- `CODEOWNERS` names the founder for `flowleap/fork-modifications.tsv`, so each new row needs the founder's review.

**Upstream syncs.** The sync PR runs the check like any PR. Paths that upstream changed and the fork did not change do not appear, because the base moves to the new upstream commit. When upstream merges a proposed slot or fix, the fork patch disappears in the merge, and the stale-row rule tells the sync PR to delete the row. When a conflict resolution keeps a fork hunk, its row stays.

**Start.** The first version loads this audit as its baseline: every current divergent path gets a row with class `debt` and its feature ID. The check passes on day one and fails on any new divergence. Each plan PR deletes its `debt` rows.

## Plan

Fork-side PRs come first, because they remove divergence at once. Upstream proposals remove divergence only after upstream merges them, so they follow, ordered by the conflicts that the sync logs show. Every PR runs the tests of [Behaviour that must not be lost](#behaviour-that-must-not-be-lost) that its features name, `pnpm run typecheck`, `pnpm run lint` and the affected keyless snapshots. Upstream proposals go to `deepseek-ai/deepseek-harness` only with the founder's approval, from a separate fork of upstream, never by a push to `origin`.

| # | PR | Class | Features | Files and target | Tests that must pass | Risk | Size |
|---|---|---|---|---|---|---|---|
| 1 | Fork divergence gate with the audit baseline | gate | all | `scripts/flowleap/check-fork-divergence.ts`, `flowleap/fork-modifications.tsv`, `flowleap/ownership.txt`, CI job, CODEOWNERS | The check passes on the fork tip and fails on a test commit that edits an unlisted upstream file | low | M |
| 2 | Mark every remaining site and make the allow-list the one list | keep | F01 to F61 | `FlowLeap fork modification` comments at each code site; HANDOFF links to the allow-list | `pnpm run test:docs`; rule 5 of the check | low | M |
| 3 | Restore upstream documentation; English-only as configuration | English-only | E1 | `git checkout <upstream master> -- <strip paths>`; revert the tooling edits; `.ignore`, Docker ignore, manifest exclusions; retire `strip-zh.sh` | `pnpm run doc-sync`, `pnpm run test:docs`, `pnpm run website:build`, the translation gate | low | L (mechanical) |
| 4 | FlowLeap Remotes mount themselves | plugin | F32 | `packages/api/remotes`; each `ui-flowleap-*` package calls `ctx.remote.$mount()`; change notices become stream methods | `packages/api/remotes/tests/remote-events.host.spec.ts`; the FlowLeap web e2e tests; a live run with the `verify` skill | med | M |
| 5 | FlowLeap copy and the New task draft through locale overrides | plugin | F14, FlowLeap copy of F04, F05, F09, F18 | `ui-schedule` (revert `newTaskDraft`), upstream dictionaries back to upstream text; overrides in `ui-flowleap-routines` and `ui-brand-flowleap` | `packages/client/ui-schedule/tests/*`; `apps/web/tests/flowleap-attorney-pages.e2e.ts`; `pnpm run check:i18n` | low | S |
| 6 | Budget notice as a composer dock occupant | plugin | F18 | `ui-conversation` back to upstream; occupant in `ui-flowleap-budget` | `ui-conversation` input-bar specs (moved); budget e2e | low | S |
| 7 | Client helpers out of upstream packages | plugin | F33, F34, F35 | `ui-commands`, `ui-primitives`, `client/store` back to upstream; new FlowLeap UI kit and command-menu packages | the moved specs; `ui-flowleap-records` tests; design-language checks | med | M |
| 8 | Renames that remove carve-outs | revert, owned | F60, F61, F67, F68, F70 | Rename `flowleap-ticket`, `@flowleap/connectors`, two guides, one snapshot, `ui-settings-skills`; add `private: true` to the connectors | `scripts/release/families.spec.ts`; `pnpm run test:snapshot -t flowleap-`; `pnpm run hygiene` | low | S |
| 9 | Upstream proposal: desktop product record and skill pack | slot | F30, F31 | `apps/desktop` | `apps/desktop/tests/product.spec.ts`, `skill-pack.spec.ts`; add a test for the vendor switches first | high | L |
| 10 | Upstream proposal: schedule seams and the filter slot | slot | F12, F13 | `schedule/schedule`, `ui-schedule` | `packages/schedule/schedule/tests/runtime.spec.ts`; `manager-filter.client.spec.tsx`; `snapshots/web/flowleap-routine-run` | med | M |
| 11 | Upstream proposal: running icon slot | slot | F22 | `ui-chat` | `running-status.client.spec.tsx`, `chat-apply.client.spec.tsx` | low | S |
| 12 | Upstream proposal: sandbox network rule | upstream fix | F08 | `sandbox-local`, `native/system` | `network.e2e.ts`, `local.spec.ts`, bwrap and seatbelt e2e | high | L |
| 13 | Upstream proposal: credentials and route lock | upstream fix | F01, F03, F06, F07 | `llm-pi-ai`, `credentials-local`, `session-controller`; add the load check of the model lock gap first | the model-lock tests above | high | M |
| 14 | Upstream proposal: deployment locks | slot, upstream fix | F02, F04, F05 | `app-boot`, `package-manifest`, `plugin-manager`, `ui-plugin-manager`, `ui-settings-models` | `profile.spec.ts`, `manager.spec.ts`, Models and Plugins page specs | high | L |
| 15 | Upstream proposal: gate inputs | slot | F53, F54, F56, F57 | `scripts/`, `tsdown.client.ts` | `run-gates.spec.ts` and each gate's spec | low | M |
| 16 | Upstream proposal: generator ownership | slot | F55 | `scripts/gen-*` | `pnpm run verify-generated` | med | M |
| 17 | Upstream proposal: profile templates from bundle manifests | slot | F29 (removes F56 at its root) | `official-bundles`, `apps/cli` | `official-bundles.spec.ts`; `apps/cli/tests/flowleap-*` | med | M |
| 18 | Upstream proposal: small general fixes | upstream fix | F36, F39, F43, F47, F48, F49, F50 | each package | each named spec | low | M |
| 19 | Upstream proposal: upload admission and response notice | slot | F09, F17 | `attachment`, `llm` | the upload and notice tests above | med | M |
| 20 | Upstream proposal: sidebar slots | slot | F15 | `ui-sidebar` | `sidebar-styles.client.spec.ts` | med | S |
| 21 | Upstream proposal: client and host seams | slot | F11, F19, F20, F21, F23, F24, F25, F28 | `liveshare`, `agent-preset-registry`, `ui-agent-preset`, `webhook`, `client/locale`, `ui-chat`, `ui-workspace`, `ui-layout` | each named spec; add a Live Share test | med | L (split per seam) |
| 22 | Upstream proposal: general improvements | upstream fix | F16, F37, F38, F40, F41, F42, F44, F45, F51 | each package | each named spec | low | L (split per package) |
| 23 | Key layers, keycaps and menu keys | slot, upstream fix | F26, F27, F46 | `client/shortcuts`, `ui-shortcuts`, `ui-primitives`, `ui-context-menu`; first record the keybinding format change, or move the keys to a records-view handler | `layer.client.spec.ts`, `act-keys.client.spec.ts`, records tests | high | L |
| 24 | Collapse the keep sites | keep | F10, F58, F59 | Fork rows in one block at the end of each list; one fork block in root `AGENTS.md`; `gh signoff` and design links into FlowLeap skills | `pnpm run typecheck`, `pnpm run test:docs` | low | S |

If upstream declines a slot, the fork keeps the marked patch that adds only the slot. That patch is much smaller than the current feature patch. If upstream declines an upstream fix, the fork either keeps it (class keep, with comment and allow-list row) or reverts it and puts the code in a FlowLeap package.

## Appendix A: commits by feature

Commit hashes and PRs per feature, from the helper tables. The first table maps 263 of the 320 commits. The second table maps 52 more commits that only add registration rows or regenerate catalogs for FlowLeap packages.

| Feature | PRs | Commits |
|---|---|---|
| F01 | PR 39, PR 64, PR 104, PR 182, PR 202 | 4563b52cba 6358005391 b2fbf1a547 c4939f2e45 cfdf75187e ebfbfaf50a ed8c3472eb |
| F02 | PR 64, PR 65 | 4563b52cba 7089530767 cfdf75187e |
| F03 | PR 39, PR 64 | 8dd7958dc8 bf4f78202e cfdf75187e ebfbfaf50a ed8c3472eb fc31f6130a |
| F04 | PR 64, PR 182, PR 186 | c4939f2e45 cfdf75187e ebfbfaf50a ffd709dce5 |
| F05 | PR 54, PR 64, PR 202 | 0c6e5eaabd 1a20f27ef8 4ab212a0ce 6358005391 7a2a6fe3c4 cfdf75187e e4339f4d8d ec48038831 ff7df348a9 |
| F06 | PR 182, PR 186 | 4da09df6d2 4fa58dccc0 c4939f2e45 |
| F07 | PR 21, PR 186 | 085b229ba9 35977acd76 9b4d26448b ffd709dce5 |
| F08 | PR 41 | a282b97e1e da0243028e |
| F09 | PR 66 | 165823501f b25919e2eb |
| F10 | PR 104 | 4cba1bf60b |
| F11 | PR 54, PR 58, PR 95, PR 96, PR 186, PR 202, PR 203 | 221320a31c 4ab212a0ce 4fa58dccc0 6358005391 857ccba1fc c2dfe62679 c622bcbb54 d0859549a6 e54f969172 |
| F12 | PR 47, PR 49, PR 52, PR 104 | 0da12f8a9c 17bba3dd31 4cc79bc377 5f0a8d78bf 77af2b6eb1 7b919db221 99b34e614c a3a060cdad dca083436c |
| F13 | PR 52, PR 104, PR 209 | 6c21578b4e 92d420efbd c8ba5c500b e65a46a26a e7b4e2bf77 |
| F14 | PR 184, PR 209 | a903ead0a7 cb71af6b1a |
| F15 | PR 88, PR 209 | 43cb2e3e4a 52ff319ac6 |
| F16 | PR 69, direct push | 2d53c2b55d 6e6421c5c0 9dfc448002 |
| F17 | PR 67, PR 69, PR 185 | 0b1e15abb9 540244ea14 57597ece85 eafaa5b08e |
| F18 | PR 67 | 0b1e15abb9 57597ece85 |
| F19 | PR 58 | 2608ea0d7a 30f767faaf 42bbd72579 6994e55d63 6ee424f5a0 8473be8ac0 b0d992accf e0c1d3cd8e |
| F20 | PR 289 | 09a9a9e198 8b0a08fd55 |
| F21 | PR 69, direct push | 119e00d402 c1d1b558eb |
| F22 | direct push | 65ca03531d |
| F23 | PR 186 | d0654906fd |
| F24 | PR 96, PR 290 | 68eeb9b507 da93cfd9af |
| F25 | PR 96 | 0b7a51e8b2 |
| F26 | PR 290 | 260d6b4c08 56b1f991e8 6f7c45a874 81bb44e1a5 857f66155c |
| F27 | PR 290 | 80dd289fe1 bb99233eaa |
| F28 | PR 290 | f9875e7f29 |
| F29 | PR 69, PR 182, PR 186, PR 209, PR 289, direct push | 1bffc7288b 2ba03584ef 4fa58dccc0 8f824be9eb a5e4ee9e63 c4939f2e45 |
| F30 | PR 69, PR 181, PR 186, PR 209, direct push | 240c10d227 36117c1184 43cb2e3e4a 5100ae03ab 77cd205a89 7d8e0c10a7 f11537088f f653a9f05a |
| F31 | PR 181, PR 207 | 9f5439d753 ca7c98c0d9 |
| F32 | PR 52, PR 58, PR 95, PR 96, PR 186, PR 202, PR 203, direct push | 00d3959ac8 0943b32244 139da0cc1d 15010db299 221320a31c 2da7bb3ffe 4ab212a0ce 4e3d60f6b6 4e5a53b81b 4fa58dccc0 6e0a9b68cd 6ee424f5a0 857ccba1fc c2dfe62679 c622bcbb54 d2558b477f |
| F33 | PR 290 | 376373307f 80dd289fe1 a14ddfedc3 da93cfd9af |
| F34 | PR 290 | 5ee4a62c08 80dd289fe1 a8e639db3a d9b8037c89 |
| F35 | PR 96 | a7a1bc1a25 |
| F36 | PR 130 | 3c6e6bff71 |
| F37 | PR 185 | 540244ea14 7367cf7e85 |
| F38 | PR 202 | 0c6e5eaabd 1a20f27ef8 439f4246df 6358005391 c103d3075b f745383196 ff7df348a9 |
| F39 | PR 22 | 77d1c60bea |
| F40 | PR 202 | ff7df348a9 |
| F41 | PR 289 | 280f862653 858289ebf4 |
| F42 | PR 65, PR 203, PR 292 | 00c1acee6d 060b02dff5 07bb1091e6 13160f2afa 7089530767 a760b9feaa c622bcbb54 df434c1e75 |
| F43 | PR 49 | cfeac33b84 |
| F44 | PR 186 | 0de9035ffa 9b4d26448b d0654906fd |
| F45 | PR 184, PR 209 | a903ead0a7 cb71af6b1a ef91e0338f |
| F46 | PR 290 | bbba4bd22b |
| F47 | PR 69, PR 144, PR 145 | 1edef27c80 2793889739 2ec80c8ad8 44a980d72a a46997b325 fdea69287f |
| F48 | PR 98 | ba0d971b21 |
| F49 | PR 183, PR 209 | 0396d4db64 ef91e0338f |
| F50 | direct push | 58ba0c75c6 |
| F51 | PR 205 | 005c25f3d6 169c389f01 3f738eccbc a26d707237 e365a58834 |
| F52 | PR 68, PR 69 | 3337bfe03e de3149bf2a |
| F53 | PR 52, PR 58, PR 69, PR 95, PR 104, PR 183, direct push | 2e16bf726c 4e70720d5b 5722899353 716621c586 7d8113874a 857ccba1fc 87767da363 dd254868ae e0c1d3cd8e e77545d365 |
| F54 | PR 47, PR 54, PR 58, PR 95, PR 183, PR 202, PR 247, PR 249, PR 289, direct push | 102fe96d7a 1bffc7288b 2bf79ac451 2c8da864a3 46b319a4d8 5722899353 6358005391 7a0fa3ae44 857ccba1fc 8f824be9eb c3093b2bd4 d8fe95372a |
| F55 | PR 47, PR 52, PR 54, PR 58, PR 95, PR 96, PR 104, PR 186, PR 203, PR 209, PR 247, PR 249, PR 289, PR 290, PR 333, PR 338, direct push | 0ec2545027 128b7ea794 139da0cc1d 13d85ae7f1 1fb9018b9d 2da7bb3ffe 333050cb25 3402712c40 448034fd80 4650fe4dfc 4cc79bc377 4fa58dccc0 5c11046227 5f0a8d78bf 5f36ccf406 6994e55d63 6f7c45a874 773c19402d 7f7a349ef8 8729b8b7bd 8e1fbe3b5e 8f824be9eb 90e703d8d0 97f32dc36f c5abd891a1 c622bcbb54 |
| F56 | PR 98, PR 183, PR 209 | 0396d4db64 ba0d971b21 bedf76ded8 ef91e0338f |
| F57 | PR 69, direct push | 58ba0c75c6 8d174a93e3 |
| F58 | PR 141, PR 247, direct push | 3402712c40 5e0eba2b18 6753cff9dd 707ca15d45 |
| F59 | PR 50, PR 68, PR 85, PR 104, PR 288, PR 292, PR 295, direct push | 0e861ab585 251e00ff3f 2fe742bed0 2fe8652f9a 322ebc2da4 4c819e7c8d 4deec7cb5d 58d7780540 79803aa4c7 ae4515d477 c8c57a516a d97e131acd |
| F60 | PR 289 | 1bffc7288b |
| F61 | direct push | f653a9f05a |
| F62 | PR 53, PR 183, direct push | 102fe96d7a 151aaa1e86 1534b8ae7e 1fa4191fdf 4c819e7c8d 57204db222 57b70b6c0e 913571eb21 947aa59eab d1972eb6c3 dfa1254454 e4bb9b8733 f51b47086a |
| F63 | PR 39, PR 41, PR 100, PR 103, PR 207, PR 249, direct push | 000775a46c 56aa6d9467 ae4515d477 bd268d8421 c5146ac212 ca6cd5ea2e ca7c98c0d9 e013201434 e33680db2c ed8c3472eb f59776fd57 |
| F64 | PR 39, PR 183, PR 249, direct push | 102fe96d7a 391642a670 4c819e7c8d ae4515d477 b9a30d01ff bd268d8421 e013201434 e57a81cdcd e62b699ffd ed8c3472eb |
| F65 | PR 181, PR 182, PR 207, direct push | 36117c1184 77cd205a89 9f5439d753 c4939f2e45 ca7c98c0d9 dd95f614a2 |
| F66 | PR 52, PR 54, PR 58, PR 64, PR 65, PR 66, PR 67, PR 91, PR 93, PR 95, PR 96, PR 102, PR 129, PR 182, PR 183, PR 184, PR 186, PR 202, PR 203, PR 209, direct push | 01e7a25055 0522a9597f 0b1e15abb9 0e4b848329 165823501f 1c788d744f 25dec8a15f 2b17f37721 2cdc4afaa8 4233b4385e 4563b52cba 4ab212a0ce 4da09df6d2 4e5a53b81b 4e70720d5b 4fa58dccc0 541929e77c 55ff26462a 7089530767 857ccba1fc 8817c5b7da 8dc1bc9427 8f824be9eb a760b9feaa ab8c83b8c7 b43f75785d bbec22a7ba bc1de8a059 c4939f2e45 cfdf75187e e0c1d3cd8e e77545d365 ebe3ab3aaf ebfbfaf50a ec48038831 |
| F67 | PR 49, PR 52, PR 58, PR 69, PR 95, PR 102, PR 104, PR 183, PR 186, PR 209, PR 247, PR 249, PR 289, PR 290, PR 292, PR 333, PR 338, PR 340 | 0283b8386d 04aee12c61 0cdda65024 1908a80e03 2f74ee8385 2fe8652f9a 326c704314 3300119f70 39bb1d7857 3f432470a0 429487a2ca 46c8166a26 4e5a53b81b 4e70720d5b 55ff26462a 66887d563b 8473be8ac0 857ccba1fc 8dc1bc9427 927eb66743 9a188a559b 9b4d26448b c84959212f cfeac33b84 d2b770ae9d e0c1d3cd8e e4d7a29e5b e77545d365 e91e1663b7 f5d11f8899 f926a121e3 ffd709dce5 |
| F68 | PR 41, PR 64, PR 65, PR 91, PR 182, PR 207, PR 249, PR 290 | 0522a9597f 14897877de 429487a2ca 4563b52cba 56aa6d9467 7089530767 a760b9feaa c4939f2e45 cfdf75187e e33680db2c |
| F69 | PR 249 | 3d6cd304fb 8fd802fe1e |
| F70 | PR 203, PR 209 | 07bb1091e6 a903ead0a7 c622bcbb54 |
| E1 | PR 40, direct push | 36b05a5fe7 5a7ff9e784 aaec06384e |

| Feature | PRs | Commits |
|---|---|---|
| F58 (registration rows) | PR 52, PR 58, PR 69, PR 86, PR 96, PR 105, PR 129, PR 183, PR 184, PR 186, PR 203, PR 209, PR 247, PR 249, PR 289, PR 290, direct push | 0827524601 0adbc29445 0c5500866e 0e2853f8f2 165f98dd4f 1f225b9c0d 3bf3f01c08 3e5c4cd811 3f3ba88227 41eb7b7837 51734755b2 5707165de6 577e09d571 6246fd3bc8 624dcfe294 6d1d96c8d7 6d3ec58e14 6f139afc87 6f71573b5b 71b0a8a7d2 7247619e8a 9284787f8b 9d142b6df6 ba7e104c0e bd8a211f60 c76fdf5167 cf525047ad ebc5f7327d ed0e45a824 ef68da2db0 f11a22c9c3 f91072f484 fbea09f0ed |
| F55 (regenerated catalogs) | PR 49, PR 52, PR 58, PR 69, PR 96, PR 129, PR 182, PR 186, PR 247, PR 249, PR 289, direct push | 01d75d0bc4 0f97e68ecb 219d4e92c4 3152668c38 3a14bc20c1 3b7339f2ea 3fc67df09d 40922223fb 4ec5527e91 539633c62e 583fba89cc 64cfba55b2 76a926ff99 a4da6cf9e9 a5559d812c a91cf0fd79 b23fdcef91 d3807285e7 de87aeeff4 |

## Appendix B: fork commits with no divergence today

These 5 commits touched upstream-owned paths, but their change is gone (reverted, or taken over by upstream or a later commit):

| Commit | PR | Subject |
|---|---|---|
| 92be3aaef6 | PR 290 | docs(upgrade-guide): a report statement quotes its letter as { page, quote } |
| bef82a2c66 | PR 144 | Revert "test(ptc-runtime-node): end the hot-loop log case after the program reports" |
| c76e5b9cad | PR 144 | test(ptc-runtime-node): end the hot-loop log case after the program reports |
| b09e51e939 | PR 69 | test(web): drop the language switcher from the plugin-manager expected output |
| 76f40a3169 | PR 69 | test(plugin-manager): retry git-transport temp removal while Git releases it |

The English-only baseline commit is mapped to E1. Its strip files are not in the feature tables.
