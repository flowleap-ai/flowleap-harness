# Upstream sync survey: dsh 0.2.1-rc.2 to rc.3 and trunk

Date: 2026-10-25. Read-only survey; nothing merged, nothing committed. Written by a planning agent
from git history only; claims marked "not verified" were not checked by running anything.

## Refs

| Ref | Commit | Meaning |
|---|---|---|
| `master` | `687f282e86` (tag `dsh-v0.2.1-rc.2`, 2026-10-17) | untouched upstream mirror; it is on upstream's first-parent trunk |
| `dsh-v0.2.1-rc.3` | `1f81c047fc` (2026-10-23 11:29 +0800) | release branch: `master` + 6 commits only |
| `origin/master` | `22ddee3792` (2026-10-23 19:48 +0800) | upstream trunk: 1,539 commits past `master`, 1,533 past the rc.3 tag; `package.json` says `0.2.1-rc.3` |
| `flowleap` | `76287f4c45` | our branch, 99 commits past `master` |

Key fact: the rc.3 tag is only rc.2 plus `5ff29190ed` (navigation entry customization), `675164957a`
(analytics for navigation entries), `39d2903841` (navigation pins), `c48f8523f2` (DeepSeek `/models`
listing) and the release commit `d02ea370ee`. Everything else on `origin/master` (1,533 commits,
dated mostly 2026-10-18 to 2026-10-23) is unreleased trunk that carries the rc.3 version string.
Not verified: whether upstream moved past `22ddee3792` since the last fetch.

## 1. Release facts

- No `CHANGELOG.md`. The release notes are the upgrade guides: 30 new guides under
  `docs/upgrade-guide/` on `origin/master` (2 for alpha.2, 2 for alpha.4, 2 for rc.1, 23 for rc.2,
  1 for rc.3). None of them is on `master`. The code they describe is not in the rc.2 tag
  either; for example `master` still allows Node 22. So the version labels on the guides do not
  match the tags (reading of the agent, not verified with upstream).
- The one rc.3 guide: `v0.2.1-rc.3/independent-session-forks` says ordinary forks no longer record a
  parent and older V4 readers may reject new forks.
- Breaking changes that touch us:
  - `node-24`: `engines.node` goes from `^22.19.0 || >=24.0.0` to `>=24.9.0` (`cfb65d3bb2`).
  - `official-bundle-lists`: `PROFILE_TEMPLATES` and the bundle lists move from
    `@deepseek-ai/dsh-app-boot` to the new `packages/util/official-bundles` (`e0e37bfd3d`, `9b4aacb41a`).
  - `tool-executor-plugins`: execution modes move from `dsh-tools` into `tool-executor-native` and
    `tool-executor-ptc` rows (`455686626d`); base inserts them.
  - `conditional-tools`: `system-prompt/assemble` no longer carries tools (`9d0c97b9d2`).
  - `webserver-index-peer`: `webserver/index-inject` gains a `peer` argument (`09899f3a0f`).
  - `pi-ai-model-catalog` / `pi-ai-protocol-replay`: pi-ai 1.1.0 to 1.3.0 (`6b14bac183`).
    `claude-sonnet-5-5` is not on the removed list.
  - `approval-projection-dependency`: custom ApprovalService compositions only; we consume it.
- Toolchain: pnpm `11.28.5` unchanged; no `.nvmrc` on either side; `apps/desktop` Electron
  `^44.7.0`, electron-builder `^26.17.0`, electron-updater `^6.8.9` unchanged. `build:lib:host` now
  runs `scripts/compile-referenced-projects.ts` and tsc with an 8 GB heap (was 4 GB).

## 2. Our eight seams

| Seam | Upstream commits on the package source | Our call on origin/master | Mark |
|---|---|---|---|
| system-prompt (`ctx.systemPrompt.section`, `interpolate: false`, `includeHarnessIdentity`) | `9d0c97b9d2` only | `section()`, `interpolate`, `includeHarnessIdentity` (index.ts:265, :436) unchanged. The assemble waterfall now takes `PromptPresentation`, which we do not hook | GREEN |
| mcp-client (`tools.include/exclude`, stdio) | 0 on `src/` (test file only, `455686626d`) | our `src/tools.ts`, `src/index.ts`, `src/connection.ts` patch applies to unchanged files | GREEN |
| skill-filesystem (`customSkillDirs`, `includeDefaultRoots`, `providerName`) | 0 | unchanged | GREEN |
| credentials (`ctx.credentials`, `credentials/record-updated`) | 0 | unchanged | GREEN |
| webserver (`tapIndex`, `register({kind:'exact'})`, `webserver/index-inject`) | `09899f3a0f`, `73931626be` | `tapIndex` (index.ts:519) unchanged; `register` now takes `WebRoute \| WebResourceRoute`; the inject listener gets an extra `peer` that our one-argument listener ignores | GREEN |
| client locale (`override()`, ours) + brand slots | locale: `3f9f36e92d`, `6238020202`, `84edeadc2b`, `1552f524f7` + 6 layout commits; ui-chat: `c538d65adb`, `585d20fc77`, `0e49f443dd`, `9676ff7724` | `sidebar.brand.mark/name` and `conversation.hero.brand.mark` are still declared (`ui-sidebar/.../slots.ts:26,31`, `ui-conversation/.../slots.ts:284`). `register()` now types `Record<BuiltInLocaleId> & Record<LocaleId>`; `lookup()` unchanged, so `override()` should merge. But 6 new languages are added at apply time and `OVERRIDDEN_LOCALES = ['en','zh']` in `ui-brand-flowleap/src/client/index.ts:28` must grow. Our `conversation.chat.running.icon` slot conflicts in 8 ui-chat files (`RunningStatus` gains `paused`) | AMBER |
| questions / commands / approval / `never` | user-questions 9, user-approval 3 (`a9dd195400` persists the policy in a projection), commands 0 | `userQuestions.ask` (index.ts:292) unchanged; the request type becomes a union with a new `kind: 'approval'` arm, so our shape still compiles. `approval.request` (:242), `overrideOf` (:279) and `config.policy` exist; `never` stays in `zod.enum(['ask','never'])`. Re-run the D3 unit tests | GREEN |
| desktop product record (`apps/desktop/config/*.json`, `DSH_DESKTOP_PRODUCT`, packaging) | 58 commits on `apps/desktop/scripts` + `config`; merge `efe44ee17f` (perf/desktop-packaging-cache), `091d6ed6be`, `84edeadc2b`, `9ce74cda96` | our files (`desktop-product.mjs`, `product.*.json`) are ours only, but every packaging file we edited changed upstream (see 3c and section 6) | AMBER |

Count: 6 GREEN, 2 AMBER, 0 RED.

Profile drift outside the eight seams (must edit or the profile does not load):
- `packages/boot/app-boot/src/profile.ts`: our `'flowleap-web'` template sits in the
  `PROFILE_TEMPLATES` block that upstream deleted. Move it to
  `packages/util/official-bundles/src/bundles.ts`.
- `packages/bundle/flowleap-web/presets/patent.patch.yml:96-103`: drop the `tool-subagent-list-agents` row
  (the subpath export is gone, `4df09d37d5`) and replace `modelSelectionSettings: true` with
  `modelSelection: true` + `modelDiscovery: true` (`1448360b66`). Keep `tool-plugin-manager`
  `disabled: true`; upstream standard now turns it on when a profile context exists (`f9ec718a48`),
  which would let the model install plugins.
- All 19 row ids that `cordis.patch.yml` disables or configures still exist upstream.

## 3. Overlaps

Both sides changed 324 files (modified on both sides). Our 1,949 deletions also meet upstream:
533 deleted by us and modified upstream, 4 deleted on both sides, 2 modified by us and deleted upstream.

(a) Handled by the re-strip: 256 files where our only change is the removed
`English | [中文](...)` header, plus the 533 delete/modify, the 4 delete/delete and the 2
modify/delete (`.agents/notes/implemented/feature/2026-10-14-built-in-plugin-feature-previews.md`,
`.agents/notes/implemented/process/2026-07-06-node-engine-floor.md`; accept upstream's deletion).

(b) Generated or lockfile, regenerate (10): `THIRD_PARTY_NOTICES.md`, `docs/cli-help.md`,
`docs/config-catalog.md`, `docs/module-graph.md`, `docs/event-producer-consumer.md`,
`docs/capability-seams.md`, `packages/extensions/tool-cordis/src/api-catalog.ts`,
`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`,
`packages/preset/agent-preset/skills/cordis-composition-reference/references/packages.md`, `pnpm-lock.yaml`.

(c) Real overlaps: 58. Each row gives our change, then upstream's (+lines/-lines, commit count).

Agent rules and docs (5)
- `.agents/notes/implemented/process/2026-10-12-local-gate-speedups.md`: we removed bilingual lines; they +4/-12, 1.
- `.agents/skills/dsh-prose-standard/SKILL.md`: we removed the bilingual rule; they +1/-1, 1.
- `.agents/skills/dsh-code-review/SKILL.md`: we removed 2 bilingual review bullets; they +4/-3, 3.
- `AGENTS.md`: our English-only sentence; they +6/-4, 10.
- `docs/development.md`: we removed translation steps; they +10/-7, 11.

Root config (6)
- `package.json`: we removed 3 translation scripts and added `flowleap:doctor` and `flowleap:log-bundle`; they changed the version and engines and added `build:lib:host`, `check:i18n`, `verify-installer-locales`, `verify-locale-metadata` and new deps (+16/-5, 30).
- `tsconfig.base.json` (we added 12 aliases incl. `@flowleap/connectors`, `mupdf` stub; they +37/-2, 71), `tsconfig.client.json` (+2 vs +14, 36), `tsconfig.host.json` (+9 vs +36/-1, 94): alias tables, keep both.
- `apps/cli/package.json`: we added the `dsh-flowleap-web` dep; they changed deps (+9/-2, 22).
- `vendor/README.md`: our `flowleap-connectors` manifest row; they +14/-5, 8.

Desktop and packaging (11)
- `apps/desktop/README.md`: our white-label section; they +20/-10, 35.
- `apps/desktop/package.json`: we added `render:product-icons`; they +7/-2, 7.
- `apps/desktop/scripts/desktop-package-environment.mjs`: our appId from the product record; they added the compression settings and target build paths (+24/-4, 11).
- `apps/desktop/scripts/electron-builder-config.mjs`: we set name, icons, protocol, updates, `CFBundleLocalizations: product.locales` and the microphone text from the product; they generate installer strings from `installer-locales.mjs`, use 8 `CFBundleLocalizations`, and set `copyright` and `uninstallDisplayName` (+12/-5, 9).
- `apps/desktop/scripts/package-target.ts`: our build title and artifact names from the product; they restructured the pack sequence, use `build --profile local` for unsigned builds (`091d6ed6be`) and added Windows concurrency (+67/-29, 10).
- `apps/desktop/src/locale.ts`: our `brandDesktopLocale()`; they added 6 language dictionaries (+1050/-7, 9).
- `apps/desktop/src/main.ts`: our product-record gating of account, Welcome, platform, telemetry and updater; they added file drag and the update window (+37/-6, 16).
- `apps/desktop/src/project-manager.ts`: ours +27/-6; theirs +2/-3, 1.
- `scripts/client-build-environment.ts`: our `DSH_BUILD_CLIENT_TITLE` selector on the `official` profile; they added a `local` profile (+11/-5, 5). Our title must also apply to `local`.
- `scripts/build.ts`: we pass the title selector through; they reordered the Typert step (+8/-10, 2).
- `scripts/release/families.ts`: we allow `@flowleap/` names; they moved the import to official-bundles (+1/-1, 2).

Profile registration (3)
- `packages/boot/app-boot/src/profile.ts`: our `flowleap-web` template; they moved the whole block out (+3/-67, 4). Move ours into `dsh-official-bundles`.
- `apps/cli/tests/profile-mcp.spec.ts`: we expect `mcp-flowleap` for `flowleap-web`; they import `PROFILE_TEMPLATES` from official-bundles (+2/-1, 1).
- `scripts/check-workspace-constraints.ts`: our published-files entry for `dsh-flowleap-web`; they +61/-8, 31.

Remotes (2)
- `packages/api/remotes/package.json` (our connectors dep; their version bump) and `src/client/index.ts` (our `flowleapConnectorsRemote`; their new plugin-detail and update types, +4/-3, 2).

Locale (4)
- `packages/client/locale/src/client/index.ts`: our `override()` (+52/-1); they added 6 languages and the `register` typing (+15/-8, 3).
- `packages/client/locale/tests/locale.client.spec.ts` (+20 vs +19), `packages/client/locale/README.md` (+4/-2 vs +11/-9, 6), `packages/client/README.md` (+2/-2 vs +1).

ui-chat running-icon slot (8)
- `README.md` (+16/-8, 15), `src/client/apply.ts` (+30/-16, 12), `chat/ChatFlow.tsx` (+45/-14, 3),
  `chat/RunningStatus.tsx` (`paused` prop, `585d20fc77`), `contract/slots.ts` (+19/-3, 5),
  `tests/chat-apply.client.spec.tsx` (+2, 4), `tests/chat-view.client.spec.tsx` (+280/-69, 14),
  `tests/running-status.client.spec.tsx` (+15/-2, 1). We added the `conversation.chat.running.icon` slot,
  the "Working" copy and the slot render in each.

mcp-client (1)
- `packages/mcp/mcp-client/tests/mcp-client.spec.ts`: our include/exclude tests (+13); their executor refactor (+46/-43, `455686626d`).

Gates, generators, specs (16)
- `scripts/run-gates.ts`: we removed the 2 translation gates; they added `i18n` mode, `i18nGates()` in hygiene and the Node 24.9 compat leg (+20/-11, 10).
- `scripts/run-gates.spec.ts` (+1/-1 vs +25/-6), `scripts/ci-workflow.spec.ts` (-18 vs +159/-52, 19),
  `scripts/doc-standard.spec.ts` (+6/-28 vs +5/-1, 11).
- `scripts/gen-cli-help.ts` (we dropped zh output; they import from official-bundles), `gen-config-catalog.spec.ts` (-17 vs +25),
  `gen-cordis-catalog.ts` (+18/-40 vs +48/-5, 77), `gen-doc-graphs.ts` (+9/-30 vs +41/-9, 30),
  `gen-official-bundle-catalog.ts` (+2/-2 vs +9/-7).
- `scripts/gen-third-party-notices.ts`: our Zlib on the permissive list; they +20/-6, 1.
- `scripts/rescope-vendor.ts`: we removed zh handling (-17); they +133/-34, 4.
- `scripts/verify-concrete-terms.ts`: our exclusion list; they added `maxBuffer` (1 line).
- `scripts/verify-md-links.ts`, `verify-md-links.spec.ts`, `verify-md-wrap.ts`: our zh-link edits; they changed 1 to 3 lines each.
- `scripts/verify-package-readme-model-experience.ts`: our 3 table rows; they added 11 rows (39 commits). Keep both.

Website (2)
- `website/docs.ts`: we removed the zh-CN root locale (+194/-288); they relabelled one root (zh) label (+1/-1).
- `website/tests/page-markdown-actions.spec.ts`: we removed zh cases; they +69/-5, 2.

Upstream deletions that touch us
- `packages/boot/app-boot/src/official-bundles.ts`, `official-bundle-packages.ts`, `official-bundles.generated.ts`:
  our `scripts/release/families.ts` imports one; upstream fixes the import in the same file.
- `packages/subagent/tool-subagent-control/locale/list-agents/*` with the `list-agents` subpath: our patent preset.
- `packages/core/tools/src/types.ts`, `testing.ts`, `ptc*.ts`: our packages do not import them (checked).
- `apps/desktop/installer/strings.nsh`: now generated from `apps/desktop/installer/locales/*.json`.
- `packages/client/ui-chat/src/client/chat/running-whale@2x.png`: `RunningWhaleTail.tsx`, which we edited,
  still exists upstream.

## 4. New DeepSeek-flavoured rows, packages, gates

New packages (22): `client/ui-entry-customization`, `client/ui-file-drag`, `core/tool-executor-native`,
`core/tool-executor-ptc`, `deliverables/deliverable-file-references`, `session/message-quotes`,
`util/file-drag`, `util/official-bundles`, `util/plugin-detail`, `test-support/tool-testkit`, and in
`experimental/`: `action-cards`, `client-ui-action-cards`, `creation-recommendations`,
`client-ui-creation-recommendations`, `personalized-recommendations`, `plugin-recommendations`,
`client-ui-plugin-recommendations`, `cua-bundle`, `liveshare-protocol`, `subagent-oar`, `tool-subagent-oar`.
No new `web-deepseek`, `account`, `platform` or `ui-brand` package.

New default rows in base/web-app: `tool-executor-native` (required), `tool-executor-ptc` (disabled),
`message-quotes`, `ui-file-drag`, `deliverable-file-references`, `entry-customization`.
Profile decisions: keep the first four. Consider disabling `entry-customization`: it pins launchers
and starts plugin "Creator" drafts, which a firm admin may not want. `personalized-recommendations`
(DeepSeek official-plugin suggestions and generated pages) and `cua-bundle` are in `OPTIONAL_BUNDLES`
and are not mounted by default. Keep them out of the profile.

Home and endpoint reads: no new code reads `~/.agents` or `~/.dsh`. The only new `homedir()` use is
`fs-local` expanding a leading `~` in requested paths (`ae0dfd1003`, `32004176bf`). New
`api.deepseek.com` strings are dictionary copy and `scripts/test-official-listing-guard.ts`. The
DeepSeek `/models` listing (`c48f8523f2`) lives in `llm-deepseek*`, which our profile disables.

New or changed gates:
- `scripts/verify-locale-metadata.ts` (new, `ed783066e6`, in `sharedHygieneGates()` so in
  `check:ci:static`): every `packages/**/locale/` dir and every config-catalog package needs
  `ja/es/fr/de/ru/pt.json` with the keys of `en` and `zh`, and `meta.description` must not equal the
  English text. WILL FAIL on our 6 packages (`host/flowleap-prompt`, `host/flowleap-connectors`,
  `host/flowleap-deliverables`, `client/ui-brand-flowleap`, `client/ui-settings-flowleap-connectors`,
  `bundle/flowleap-web`): 36 missing files.
- `verify-installer-locales` (`apps/desktop/scripts/installer-locales.mjs`, new, static): should pass,
  because the strip does not touch `apps/desktop/installer/locales/zh_CN.json`. Keep that file.
- `check:i18n` mode (not static): `scripts/locale-dictionary-parity.spec.ts`, `scripts/shipped-locales.spec.ts`.
  WILL FAIL on the `en`+`zh`-only dictionaries in `ui-brand-flowleap/src/client/locales.ts` and
  `ui-settings-flowleap-connectors` (estimate).
- `scripts/test-official-listing-guard.ts` (new test setup): harmless.
- Changed `verify-default-product-isolation`, `verify-product-use`, `product-package-policy` (`9b4aacb41a`,
  `e0e37bfd3d`, `f0987e7f31`): may need our packages classified. Not verified.
- `flowleap/docs`, `vendor/` and `deploy/`: no new gate scans them by name. `verify-concrete-terms`
  keeps our exclusions. `verify-locale-metadata` globs only `packages/**`.
- Expected static baseline after the merge, before fixes: 60 of 63 (the old `python/sdk/uv.lock`
  failure, which upstream did not touch, plus `locale-metadata`; `installer-locales` should pass).
  This is an estimate.

## 5. i18n and the strip

Upstream touched 738 doc-pair files: `.zh.md` (274 modified, 104 added, 2 deleted) and
`.i18n.yaml` (266 modified, 90 added, 2 deleted). The strip's patterns cover all of them.
The header line is still the single form `English | [中文](X)` (2,022 pages, no new variant).
`docs/i18n/` changed upstream (README), and the strip removes it. The one new website fixture
`website/tests/expected/table-filter.zh-CN.html` matches `website/tests/expected/*.zh-CN.*`. No new
translation gate script was added; `scripts/translation-pairing.spec.ts` changed and stays as library.

What the strip does not need to learn: nothing for docs.
What is new and outside the strip (UI locales, a policy choice):
- 1,728 new `locale/{ja,es,fr,de,ru,pt}.json` across 288 packages, and 6 `locales/*.ts` in `packages/client/locale`.
- 14 `docs/preview.zh.svg` in experimental packages, `apps/desktop/installer/locales/zh_CN.json`: keep (assets).
- Decision needed: (a) carve our 6 packages out of `verify-locale-metadata` with a FlowLeap list
  (one fork patch, same style as `verify-concrete-terms`), or (b) add 36 metadata files with translated
  `meta.description` (copying English fails the gate). Recommend (a).
- `OVERRIDDEN_LOCALES` in the brand package must list all 8 languages. Otherwise a user who picks
  Deutsch sees the upstream product copy. A later option is a fork patch so the profile can hide
  languages. Not designed.

## 6. Desktop and deploy

- `make desktop-flowleap` runs `package:desktop:mac:arm64:unsigned` with `DSH_DESKTOP_PRODUCT=flowleap`.
  Upstream now builds unsigned packages with `build --profile local` and stages packages through the
  new `apps/desktop/scripts/pack-local-packages.ts` (dsh family only) (`091d6ed6be`). Three things to redo:
  (1) apply `DSH_BUILD_CLIENT_TITLE` in the `local` branch of `scripts/client-build-environment.ts`;
  (2) confirm that the `@flowleap/connectors` tarball still reaches the runtime closure on the local
  path (not verified, it may need the vendor family);
  (3) set `product.deepseek.json` `locales` to upstream's 8 (`en, zh_CN, ja, es, fr, de, ru, pt`) so the
  default product keeps upstream behaviour; ours stays `["en"]`.
- electron-builder: the Windows installer languages now come from `installer/locales/*.json` and
  `strings.nsh` is generated at build time. `copyright` and `uninstallDisplayName` use `${productName}`,
  which suits white-label. Windows signing and token identity got new preflight scripts
  (`32bbe4fc8a`, `d148052e83`, `9ce74cda96`). They only affect milestone 2 (Windows build).
- The perf/desktop-packaging-cache merge (`efe44ee17f`) adds persistent download and pnpm caches
  plus compression settings (`PACKAGE_MACOS_ZIP_COMPRESSION_LEVEL`, `DSH_DESKTOP_WINDOWS_COMPRESSION_LEVEL`).
  None of this is required by our build.
- `deploy/Dockerfile`: `node:26.4.0-trixie` meets `>=24.9.0`; `PNPM_VERSION=11.28.5` is unchanged.
  `python/sdk-runtime/package.json` (the `dsh-python-runtime-closure` we deploy) gained
  `dsh-tool-executor-ptc` (`5935b6b2cc`). `deploy/restore-legacy-hoists.mjs` is ours, so re-run it and
  check after the lockfile changes. Risk: `build:lib:host` now asks for an 8 GB heap, so the Docker
  builder needs more memory (not verified).

## 7. Features worth having

- Image upload when added to the composer: `9be99a0e28`.
- Selected-text quotes and draft restore (`message-quotes`): `0e49f443dd`.
- File drag out of the app with original files: `54eed06c6f`, `9676ff7724`.
- Shared file-link guidance for deliverables (`deliverable-file-references`): `c4b3b4f82e`.
- Answered question batches shown as message bubbles (our gate cards): `0778dec09f`.
- Fixed approval cards (`kind: 'approval'` question): `948f411a70`.
- Plan mode keeps `exit_plan_mode` after first entry: `752cc5c0c0`.
- External subagents through OAR (Claude Code / Codex), relevant to E1: `427e3dcd69`.
- Unattended auto review in headless: `7181effc69`.
- Remote access follows access state per Peer: `09899f3a0f`. Liveshare wire protocol with a viewer upload switch: `27ff469ea5`, `73df748c7f` (protocol only).
- Plugin detail pages, custom markets, registry updates: `9c8522bb64`, `11589ed104`, `b10bd84dfe`.
- Webserver resource routes and in-process `readResource`: `73931626be`.
- Document preview line highlight fade: `dbf7d54a18`.
- Action cards below answers (experimental): `9980af2d48`.

## 8. Recommended procedure

Do this in its own worktree. Another agent may serve a live instance from the main checkout.

1. `git worktree add ../dsh-sync flowleap`, then work on a branch `sync/upstream-<tag>`.
2. In the main repo: `git branch -f master <tag or origin/master>`. This is a fast-forward, because
   `master` is an ancestor of `origin/master`. Push `master` to the `flowleap` remote.
3. In the worktree: `git merge master`. Expect about 600 conflicts.
4. While the merge is open, run `scripts/flowleap/strip-zh.sh`. `git rm` on the unmerged
   `.zh.md`/`.i18n.yaml` paths settles the 533 delete/modify conflicts (expected, not verified). Accept
   upstream's deletion of the 2 notes.
5. For the 10 generated files, take upstream's version now and regenerate in step 8.
6. Resolve the 58 real overlaps from 3c in this order: profile registration (move `flowleap-web` into
   `packages/util/official-bundles/src/bundles.ts`), desktop packaging (11), locale (4), ui-chat (8),
   gates and generators (16), the rest.
7. Re-pin seams and profile: patent preset (`list-agents` out, `modelSelection` + `modelDiscovery`,
   keep `tool-plugin-manager` off, diff against the new `standard.patch.yml`), `OVERRIDDEN_LOCALES` to 8,
   the `local` client profile title, `product.deepseek.json` locales, the `verify-locale-metadata`
   carve-out, and a decision on `entry-customization`.
8. `pnpm install` (new lockfile), then the generators (`gen-cli-help`, `gen-config-catalog`,
   `gen-module-graph`, `gen-doc-graphs`, `gen-cordis-catalog`, `gen-official-bundle-catalog`, the client
   and cordis API catalogs, `gen-plugin-packages`, `gen-third-party-notices`), then
   `sync-connectors.sh --check` and `sync-deliverables.sh --check`.
9. Gates: typecheck, lint, build, `check:ci:static` (new baseline target 62 of 63, with only `uv.lock` failing),
   `docs:check`, the vitest suites of our packages, `test:snapshot` and `test:expected`.
10. Run `pnpm dsh --profile flowleap-web --no-open` and check S3 in the browser (title, mark, hero, the
    running icon, plugin cards, connector cards).
11. `make desktop-flowleap`, launch the app and repeat the S4a checks. Build the Docker image and smoke it.
12. Re-run the three acceptance cases (prior art, dossier, FTO) with the skills folder empty.
    Update `HANDOFF.md` and merge.

Effort: about 4 agent-days (3.5 to 4.5). Merge and overlaps 1.5, seams and profile 0.5 to 1,
regenerate and gates 0.5 to 1, desktop and Docker 0.5, acceptance 0.5.

Risks:
- Trunk is unreleased. The i18n work landed on 2026-10-21 and 10-22 with follow-up fix commits, and the
  tool executor refactor landed on 10-19 to 10-21. More breaking moves may follow before the next tag.
- The desktop local-pack path may drop the `@flowleap/connectors` tarball (unverified).
- The Docker build may run out of memory with the 8 GB tsc heap (unverified).
- Per-Peer index rendering and policy persistence change runtime behaviour without changing signatures.
  Only the live checks catch that.
- New upstream pages may link to `.zh.md` twins outside the header line. `verify-md-links` will report them.
- 6 extra UI languages ship with upstream copy in the FlowLeap product unless the override covers them.

Recommendation: WAIT. The rc.3 tag is rc.2 plus 6 commits and carries nothing the product needs. The
1,533 trunk commits are not in any release, and the trunk is still settling (i18n and executor
refactors with follow-up fixes). Merge the next upstream tag after rc.3 as soon as it appears, or by
2026-11-06 at the latest (the rc.1 to rc.3 cadence suggests about weekly, not verified). Go earlier
only if the founder needs a trunk feature now (OAR subagents for E1, composer image upload). Merging
only the rc.3 tag now is possible (about half a day) but buys only navigation customization.
