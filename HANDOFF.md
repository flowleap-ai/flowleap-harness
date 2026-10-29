# FlowLeap Patent AI on DeepSeek Harness: handoff

Read this first, then `AGENTS.md` (the upstream operating guide: commands, gates, architecture).
This file is the FlowLeap state: what this fork is for, what changed, what is open. Last updated
2026-10-28. Earlier sessions live in `git log -- HANDOFF.md`.

## Current state (2026-10-26)

- **Product:** the `flowleap-web` profile runs the Patent Agent prompt, 34 native office tools on the firm's
  own keys, the paid MCP row, and the deliverables plugin (writer, templates, evidence ledger, Word export,
  drafting gates, the FTO Markets card). All three S5 cases have a current PASS with an empty skills folder
  (dossier, FTO, prior art); the dossier case also passes on the synced code.
- **Base:** `flowleap` is on the upstream release `dsh 0.2.2-alpha.2` (tag `dsh-v0.2.2-alpha.2`, sync branch
  `sync/upstream-dsh-v0.2.2-alpha.2`, 2026-10-28), with all 8 upstream UI languages and the FlowLeap copy
  translated into each. `master` on the org remote equals that release.
- **Next product:** the self-hosted firm OS, decided in
  [flowleap/docs/adr/0001-self-hosted-firm-os.md](flowleap/docs/adr/0001-self-hosted-firm-os.md) (27
  decisions, including off-site access, mobile continuation and support access; on 2026-10-27 a study of
  EveryApp added credential injection in the egress proxy, the MCP door's own OAuth server, tool risk levels,
  argument digests in the audit trail and a security invariant register; decision 27 adds routines, work
  that a register event starts, on top of the existing scheduler) with the architecture and phases P0 to P6 in
  [flowleap/docs/2026-10-26-firm-os-architecture.md](flowleap/docs/2026-10-26-firm-os-architecture.md).
  **P0 is DONE (2026-10-26):** the private repository `flowleap-ai/flowleap-os` has the installer, a release
  pipeline with a loopback-only zot registry and per-firm update keys, the seam A driver with all three S5
  cases, nightly encrypted backups with a tested fresh-VM restore, an updater with automatic rollback, and the
  release gate. The Hetzner test firm runs the gated release. The next step is **P1** (control-plane core).
  Spec: issue flowleap-ai/flowleap-harness#11; work is tracked as sub-issues of it.
- **Known defects:** Settings > Built-in plugins lists the disabled DeepSeek rows by package name; the
  prior-art case takes a long path (free-form saves before the structured one). Token use is 1 to 2.4M per case.
- **Default model rows:** the OpenRouter id of Sonnet 5.5 is `anthropic/claude-sonnet-5.5` (with a dot); the
  Anthropic route id is `claude-sonnet-5-5`. A row that names a model its route does not list shows "Select
  model", and the first send is refused with `session/model-unavailable` (issue 12).
- **Not run on the synced code:** the desktop build. The three S5 cases pass on the synced code through the
  seam A driver on the test firm (P0, tickets 15 and 16).
- **Test firm:** Hetzner CPX22 in Falkenstein (SSH key only, ufw: SSH only); details in issue 13. Backups go to
  Storage Box u702313 (the restic key is in the founder's password manager). Its default model route is
  OpenRouter (`DEFAULT_MODEL` in `/etc/flowleap/firm.env`), because the founder's Anthropic credits are limited.
- **Merge gate while GitHub Actions cannot run** (a billing stop on the organisation): the coordinator's review
  plus local checks, reported as a comment on each PR (founder decision 2026-10-26).

## What this is

A fork of `deepseek-ai/deepseek-harness` (dsh, MIT, TypeScript, Cordis plugins) used to build a
browser harness for the FlowLeap Patent Agent that runs on any model through any provider. The
decision record and the surface map are in
[flowleap/docs/2026-10-21-assessment-dsh-as-patent-ai-web-harness.md](flowleap/docs/2026-10-21-assessment-dsh-as-patent-ai-web-harness.md).
Short form: data tools come from the hosted FlowLeap MCP server (flowleap-backend, 54 tools);
skills come from the flowleap-plugins skill pack; the Patent Agent prompt is the persona; the
writer, drafting gates and drawings become one native dsh tool plugin; dsh itself already covers
Anthropic, OpenAI, OpenRouter, Mistral and any OpenAI- or Anthropic-protocol gateway.

The product decisions this fork must respect live in the main app repo `flowleap-agent-v2`:
ADR 0018 (the harness is the product, skills are optional methods), ADR 0011 (hosted workspace,
one isolated instance per user), ADR 0006 (plugins monorepo and MCP registry).

## Repository state

- `master` tracks upstream `origin/master` and is never edited. Base: the merge of upstream
  `release/dsh-0.2.1-rc.2` on 2026-10-17 (dsh 0.2.1-rc.2).
- Hosted at https://github.com/flowleap-ai/flowleap-harness (private, default branch `flowleap`) since
  2026-10-23. Remotes: `origin` = upstream deepseek-ai/deepseek-harness (fetch only, for `master`),
  `flowleap` = the org repository (push `master` and `flowleap` there). The pre-push hook runs the
  typecheck.
- `flowleap` is the working branch. Everything FlowLeap lands here. Keep history shared with
  upstream so `git merge origin/master` works. (The August 2026 attempt at
  `../flowleap-patent-harness` was a snapshot import with no shared history, based on rc.7, and
  cannot merge upstream; see "Prior art" below.)
- Node 26, pnpm 11. `pnpm install` then `pnpm run build` then `pnpm dsh web` (Web UI on
  127.0.0.1:3080). `pnpm run dev:web` rebuilds on edit.

## What this session changed on `flowleap`

1. **English only.** The upstream repo is bilingual by contract: every page has a `.zh.md` twin,
   a `.i18n.yaml` pairing record, five translation gates, a lefthook job and a translate skill.
   Removed outside the carve-outs below: 1,949 files (`*.zh.md`, `*.i18n.yaml`, `docs/i18n/`,
   `.agents/skills/dsh-translate-docs/`, the translation gate scripts), the `English | [中文]`
   header line in 957 pages, the translation rows in `scripts/run-gates.ts`, `lefthook.yml` and
   `package.json`, the Chinese outputs of the generators (`gen-cli-help`, `gen-config-catalog`,
   `gen-module-graph`, `gen-doc-graphs`, `gen-cordis-catalog`, `gen-official-bundle-catalog`),
   the zh-CN root locale of the VitePress site (`website/docs.ts`, `website/.vitepress/config.ts`,
   `scripts/project-doc-site.ts`), and every bilingual instruction in `AGENTS.md`/`CLAUDE.md`,
   `docs/AGENTS.md` and the `.agents/skills`.
2. **Carve-outs that stay bilingual** because their tooling is bilingual by design and sealed by
   hash: `docs/persistence-changes/**`, `docs/persistence-catalog.*`,
   `docs/experimental-persistence-catalog.*`, `docs/session-format-status.*`,
   `.agents/notes/archived/**` (976 Chinese files). Removing them means rewriting
   `scripts/persistence-*.ts` and `scripts/archived-agent-notes.ts` with their specs. Not worth it
   until it hurts.
   Also kept: `packages/**/docs/DETAIL.zh.md`, the Chinese plugin detail pages that
   `locale/zh.json` `meta.detail` names (UI resources, not documentation twins).
3. **`scripts/flowleap/strip-zh.sh`** re-applies the file deletions and header strip. Run it after
   every `git merge origin/master`; it is idempotent and skips the carve-outs. The code edits
   (gates, generators, website, rules) are ordinary commits and merge on their own.
4. **Kept as library code**: `scripts/translation-pairing*.ts` and `scripts/translation-links.ts`,
   because the carve-out tooling imports them.

Verification status is at the end of this file.

## Open decisions

- **Upstream sync to `dsh 0.2.2-alpha.2` (2026-10-28):** 637 upstream commits after the merge of upstream PR #7075, merged on
  branch `sync/upstream-dsh-v0.2.2-alpha.2` with the same procedure and language rules as the trunk sync
  below; every decision is in `flowleap/docs/2026-10-28-upstream-alpha2-sync-decisions.tsv`. 15 content
  conflicts, 221 Chinese delete/modify rows (settled by `strip-zh.sh`), 1 upstream package deletion
  (`ui-deepseek-model-label-1017`, its disabled row left `flowleap-web`). Seams: `schedule/admit` and
  `schedule/delivered` did not change upstream; the running-icon Slot, the issue 12 model admission and
  the product-branded desktop locale are kept beside the new upstream behaviour; upstream `liveshare`
  (not mounted) now classifies the 6 FlowLeap Remote endpoints `owner-only`. No new upstream package is
  mounted in `flowleap-web`, and no new default outbound call. Gates: typecheck, lint, build,
  `docs:check`, `check:i18n`, `test:snapshot`, `test:expected`, the FlowLeap suites, desktop tests pass;
  `check:ci:static` 63 of 64 and `doc-sync` 40 of 41 (only `python/sdk/uv.lock`). Live smoke with the
  verify skill passed (Haiku turn on OpenRouter, Automation tasks page, EPO OPS connection test). Not
  run: desktop build, Docker image, S5 cases.

- **Upstream sync to trunk as of 2026-10-26 (upstream PR #7075, founder decision): DONE, merged into
  `flowleap` and pushed on 2026-10-26** (fast-forward from branch `claude/sync-upstream-trunk-06e46b`). Procedure from
  `flowleap/docs/2026-10-25-upstream-rc3-sync-survey.md` section 8; every decision is in
  `flowleap/docs/2026-10-26-upstream-trunk-sync-decisions.tsv`. Real conflicts were 22, not 58 (git
  auto-merged the rest). Gates: typecheck, lint, build, docs:check, test:snapshot, test:expected, the
  FlowLeap suites pass; check:ci:static 63 of 64 (only `uv.lock`). Live smoke on `flowleap-web` passed.
  Not done: desktop build, Docker image, the FTO and prior-art S5 cases (survey steps 11 and 12); the
  dossier case passed on the synced build before the merge.
  Language rules (founder, 2026-10-26): Chinese docs stay stripped; all 8 upstream UI languages stay
  (en, zh, ja, es, fr, de, ru, pt); the brand copy, the tagline and the connector settings are translated
  in all 8; `verify-locale-metadata` keeps the FlowLeap carve-out; the desktop product declares the 8.
  Open: keep or disable `entry-customization` (it also lists folded Conversation Views); Settings >
  Built-in plugins still lists the disabled DeepSeek rows by package name in every language; the new
  upstream skill `dsh-pr-description` still names Chinese level and stage labels.

- **Business model refinement (founder, 2026-10-25, before the next acceptance pass):** one-time
  payment for the on-premises install plus an optional support retainer; the firm must get ALL the
  data on its own keys. Open: US claim and description text is the one route still behind the backend
  (BigQuery): move it firm-side (USPTO bulk or the public BigQuery dataset on the firm's Google
  account) or keep it as the single hosted text route. PATSTAT stays hosted on the founder's server.
  Until settled, the MCP row is "the paid set", not "the subscription". ADR 0001 decision 18 (2026-10-26)
  plans PATSTAT and the other paid data as "FlowLeap Data", a separate paid service with one firm key;
  the EPO PATSTAT licence terms for offering it as a service must be checked first.

- **UI locale dictionaries (settled 2026-10-26).** Upstream trunk ships 8 UI languages (en, zh, ja, es,
  fr, de, ru, pt) and the founder kept all 8. Every new FlowLeap UI string needs a real translation in all
  8; `check:i18n` rejects a copied English string. The documentation stays English only.
- **DeepSeek-specific plugins** (`llm-deepseek*`, `credentials/deepseek-account*`,
  `web-search-deepseek`, `ui-brand-official`, `ui-deepseek-model-label-*`,
  `plugin-package-inventory-deepseek`) stay in the tree; the FlowLeap profile just does not mount
  them. Deleting them is a later cleanup, after the profile exists.
- **Branding**: `ui-brand-official` is profile-gated. A FlowLeap brand package occupies the
  sidebar and hero slots; see `packages/client/ui-brand-official/README.md` "Replacing the brand".

## Requirements (founder, 2026-10-21)

1. **Deployable to the web.** `dsh web` is already a browser app served by a Node process; deploying
   it means running that process on a server behind nginx with TLS, `--public-url` and
   `--trusted-host` (`docs/user/guide/public-deployments.md`), with the FlowLeap Session (Clerk)
   gate in front. One process serves one user and gives that user a terminal and a file system,
   so hosting is one isolated instance per user, exactly ADR 0011; a spawner comes when there are
   more users than hands. This is not a multi-tenant SaaS process and must not be sold as one.
2. **The same Patent Agent as agent-v2.** The system prompt is
   `extensions/copilot/src/extension/prompts/node/agent/patentAIPrompt.tsx` in agent-v2
   (12,913 words of TSX, 27 typed-tool references, sections such as `jurisdictionClarification`
   and `toolDecisionTree`). It must have one owner: agent-v2 renders it to a text artifact with
   the MCP tool names (`mcp__flowleap__search_patents` and so on) and dsh loads that artifact as a
   `complete: true` system-prompt section with `includeHarnessIdentity: false`. Tools come from the
   hosted FlowLeap MCP server, skills from the flowleap-plugins pack, deliverable tools from the
   native plugin. ADR 0018 is shrinking the prompt toward 6,000 words; the export inherits that.

## Slices

| # | Slice | Done when |
|---|---|---|
| S1 | DONE 2026-10-21. `packages/bundle/flowleap-web` + `packages/host/flowleap-prompt`; run `pnpm dsh --profile flowleap-web --no-open` (not `... web`: `web` is a profile name). MCP over stdio via `flowleap mcp` (54 tools), skill pack via `FLOWLEAP_SKILLS_DIR` (32 of 33 skills), providers anthropic + openrouter + mistral by env key | Live run passed: Sonnet 5.5 via OpenRouter called `get_legal_status`, `get_register_biblio`, `get_bibliography` and answered EP2110298B1 correctly with caveats; 157K tokens for the turn |
| S2 | DONE 2026-10-21 as draft PR agent-v2#847: `patentPromptExport.spec.tsx` renders `PatentAIInstructions` with the 15 MCP-twin tools and writes `extensions/copilot/assets/prompt-export/patent-agent.{md,json}`; the same spec is the drift gate. The bundle carries a copy at `prompt/patent-agent.md`; re-copy after each export (source commit in the git log) | 8,010 words; 56 references to tools the harness lacks remain (`vscode_askQuestions` 8, `fetch_webpage` 8, `get_patent_details` 8, `uspto_api_guide` 8, citations 12, guides 6, coding tools 4, `write_patent_results` 1): the TSX passages render unconditionally and need gating on tool availability in agent-v2 |
| S3 | DONE 2026-10-22. `patent` preset (standard's plugin list, no `dsh-persona`) is the registry default; `packages/client/ui-brand-flowleap` renders `brand/brand.json` into the sidebar, the hero, the `<title>` and the product copy through a new `ctx.locale.override()` seam; `ui-settings-web-search` and `ui-settings-session-log` rows off; plugin cards titled and iconed | Probe: default preset `patent`, assembled prompt starts with `<patentAIIdentity>`, no persona prefix; served index.html has 0 "DeepSeek"/"DSH Local Build" (was 1); served bundles 50 unique "DeepSeek" (was 92), all in dictionaries of still-mounted rows or in the disabled-row-free preload combo |
| S4 | Deploy recipe: one VM, nginx + TLS + Clerk gate, `dsh --profile flowleap-web web --public-url --trusted-host`, the ADR 0011 key proxy | an invited attorney signs in from a browser and runs a prior-art search |
| S5 | `dsh-tool-patent-deliverables`: results writer with validation, drafting gates, drawings | the three skill-grounded cases pass the same gate as the IDE |

## Next steps (the spike from the assessment, option A)

Done when `dsh web` on the laptop runs a profile with: DeepSeek rows removed, the FlowLeap MCP
server's tools listed, the flowleap-plugins skill pack in the catalog, the Patent Agent prompt as
persona with `includeHarnessIdentity: false`, one Anthropic and one OpenRouter provider; and the
three skill-grounded cases (prior art, dossier, FTO) run by hand with results compared against the
IDE's trajectory gate for the same model.

1. Profile: a `flowleap` profile (bundle `package.json` with `dsh.profile`, `cordis.patch.yml`).
   Rows: `dsh-mcp-client` (streamable-http to the hosted FlowLeap MCP server, Bearer token),
   `dsh-skill-filesystem` with `bundledSkillDir` at the plugins pack, `dsh-system-prompt`
   persona, `llm-pi-ai` providers. Read `docs/architecture.md` "Profiles and bundles" and
   `packages/bundle/web-app/README.md`.
2. Backend: a profile parameter on the MCP endpoint that returns the default tool set (at most
   30), shared with the IDE and CLI (ADR 0018 decision 4). Lives in flowleap-backend.
3. Native tool plugin `dsh-tool-patent-deliverables`: results writer with validation, drafting
   state machine with attorney gates, drawings. Port from `flowleap-agent-v2`
   `extensions/copilot/src/extension/patentai`. Read `docs/cookbook/adding-a-tool.md`.
4. Client: attorney gate cards as a `ConversationNodeDefinition` (`docs/subsystems/conversation.md`);
   an in-browser editor tab type (dsh has none; every preview is read-only).
5. Hosting: ADR 0011 shape, one `dsh web` process per user behind the Clerk gate and the key
   proxy; `docs/user/guide/public-deployments.md`.

## Prior art in this folder

`../flowleap-patent-harness` (GitHub `abdullahatrash/flowleap-patent-harness`, 38 commits,
2026-08-16 to 2026-08-21) is an earlier fork of dsh rc.7 with: `packages/patent/patent-data`
(capability seam), `patent-data-flowleap`, `patent-data-tools`, `packages/client/ui-patent-conversation`,
`ui-patent-project`, `packages/host/patent-project`, `patent-capabilities`, a FlowLeap patent
agent preset and a desktop host loop. It has no shared git history with upstream and is two
months behind. Mine it for design (the capability seam and the project model), do not merge it.
Its `apps/desktop/HANDOFF.md` describes an even older Electron/Bun shell and is not about dsh.

## Verification status (2026-10-21, on the `flowleap` branch after the strip)

| Check | Result |
|---|---|
| `pnpm run typecheck` | 5 of 5 pass |
| `pnpm run lint` | clean (one pre-existing unused-directive warning in `experimental/client-ui-cot-translation`) |
| `pnpm run check:ci:static` | 61 of 62 pass. The one failure, `verify-repository-references` on `python/sdk/uv.lock:113`, is pre-existing: the file is byte-identical to upstream |
| `pnpm run docs:check` | pass; the built site has one English locale at `/` |
| `pnpm run verify-archived-agent-notes` | pass, 2,772 sealed artifacts; a new English-only note is now accepted |
| Generators (`gen-cli-help`, `gen-config-catalog`, `gen-module-graph`, `gen-doc-graphs`, `gen-cordis-catalog`, `gen-official-bundle-catalog`) | regenerate English pages only; `--check` forms pass |
| Script specs (`run-gates`, `ci-workflow`, `doc-standard`, `project-doc-site`, `gen-config-catalog`, `gen-doc-graphs`, `verify-md-links`, `archived-agent-notes`, website tests) | 643 tests pass |
| `pnpm run build` | 9 of 9 pass |
| `pnpm dsh web --no-open` | serves `http://127.0.0.1:3080` after 4 s |

Not run: the unit suite (`pnpm test`, needs the native build), `test:snapshot`, `test:web`, e2e. The
header strip also touched `snapshots/**/*.md` where a snapshot contained the bilingual line, so run
`pnpm run test:snapshot` and `pnpm run test:expected` before relying on those suites.

Also done this session: 28 stale untracked package directories left from the rc.7 checkout (no
`package.json`, no tracked files) were deleted; they made `constraints` and `verify-tool-catalog`
fail. A fresh clone does not have them.

## Open after S1 + S2 (2026-10-21)

- **Preset persona.** CLOSED by S3: `presets/patent.patch.yml` in the bundle is standard's plugin list
  without `dsh-persona`, and `agent-preset-registry.default: patent`. `deployment:persona-prefix` and
  `flowleap:patent-agent` both sit at order 0 and tie-break by name, so the empty global prefix is what
  keeps the patent identity first; the other shipped presets still say "coding agent" when selected.
- **Prompt gaps.** Closed: agent-v2 #847 (export + drift gate) and #849 (gated passages) are merged to
  main on 2026-10-22; the bundle copy equals the artifact on main. Re-copy after any prompt change.
- **Tokens.** One turn cost 157K tokens: the 8,010-word prompt plus 88 tool schemas (54 MCP + 34
  dsh) plus results. ADR 0018 decision 4 (at most 30 tools) applies here first: a backend profile
  parameter on the MCP endpoint, and `toolOrder`/tool restriction in the preset.
- **Skill pack defect.** `flowleap-patstat-graph/SKILL.md` has an unquoted `: ` in its description,
  so the dsh frontmatter parser skips it (32 of 33). One-line fix in flowleap-plugins.
- **Keys.** The laptop shell has only `OPENROUTER_API_KEY`; the default model row names
  `anthropic/claude-sonnet-5-5`, so the picker shows OpenRouter models only until `ANTHROPIC_API_KEY`
  is set. Consider making an OpenRouter model the default for the hosted tier (ADR 0015 keys). A patch that
  selects OpenRouter names `provider: openrouter`, `model: anthropic/claude-sonnet-5.5`.
- **Package scope.** The toolchain forces `@deepseek-ai/dsh-*` names and `main: lib/index.js`; the
  FlowLeap packages are `@deepseek-ai/dsh-flowleap-web` and `@deepseek-ai/dsh-flowleap-prompt`.

## Direction set by the founder on 2026-10-22 (ADR 0019 ACCEPTED 2026-10-22: https://github.com/abdullahatrash/flowleap-agent-v2/pull/854; C1 MERGED: flowleap-backend #606 on 2026-10-22, merge 91696e26fe2, not yet deployed)

- **Decouple the data path.** Office connectors run inside the app with the firm's own keys: EPO OPS
  (consumer key + secret), USPTO ODP key, Semantic Scholar key, DPMA later. Build them by extracting
  the backend's TypeScript clients (`src/lib/ops`, `src/lib/uspto-odp`, academic search) into one
  shared package used by two hosts, the backend and the dsh plugin. No Python.
- **OCR runs on the user's Mistral key.** FlowLeap does not provide OCR for this harness; it is a
  bring-your-own connector like the offices.
- **Paid, stays behind the backend with the FlowLeap token:** PATSTAT, US full text (BigQuery),
  enriched citations and examiner baseline, patent images.
- **White label.** One brand package driven by a `brand.json` (name, logos, accent colour), FlowLeap
  by default, no DeepSeek text anywhere in the GUI. Package identifiers stay `@deepseek-ai/dsh-*`
  internally; MIT notices stay in `THIRD_PARTY_NOTICES.md`.
- **Skills stay methods** (ADR 0018); each connector carries its data knowledge in its tool schemas
  and result text.
- **Business model.** Self-hosted by the firm; FlowLeap installs and configures, gives 15 days of
  initial support, then a monthly retainer. Every slice must be operable by a firm admin who is not
  FlowLeap: installer, first-run key wizard, a doctor command, a log bundle, an update channel.
- **Focus.** Patent workflows over chat: open and read PDFs (born-digital locally, scanned via the
  Mistral OCR connector), deliverables as files, and the firm's own tools (DMS, docketing, Drive,
  SharePoint) over MCP rows configured by the admin.
- **C2 in flight (2026-10-22).** C2a MERGED (flowleap-backend #608, a3704e9): 33 office tools defined in `@flowleap/connectors`
  (`ToolDefinition`, `officeTools()`, `toolInputJsonSchema()`), 19 paid or transport tools stay in
  the backend, US full text is a host capability `usFulltext?`, catalog byte-identical (52 tools),
  270 package tests + 2,111 backend tests green; deployed by the push-to-main workflow. C2b/c DONE on `flowleap` (4 commits): `vendor/flowleap-connectors` with
  `scripts/flowleap/sync-connectors.sh --check` (hash-pinned to a backend commit), host plugin
  `dsh-flowleap-connectors` (ConnectorHost over dsh credential records `flowleap-connectors/<id>`,
  LRU cache, remote `describe/set/unset/test`), client `ui-settings-flowleap-connectors` (four
  cards with Test connection, first-run wizard with Skip). mupdf (AGPL) is excluded by the
  third-party-notices gate, so figure rasterisation is unavailable in the harness until the owner
  authorises it. Wiring of the 33 package tools follows C2a.
- **C2 wiring DONE (2026-10-22, the "register the 33 office tools" commit on this branch).** The host plugin registers the 33 office tools from
  `officeTools()` (vendored copy synced to flowleap-backend `43fe5c9`, the #608 branch); static gates
  61 of 62 (only `uv.lock`). Checked in the browser on a fresh home: the first-run wizard shows the
  four connectors with write-only fields, Test, Save and Skip; Settings has a "Patent data connectors"
  section with one card each. Not yet exercised with real keys: the founder's EPO OPS, USPTO ODP and
  Semantic Scholar keys are entered through the wizard, then one `search_patents` and one
  `get_us_grant` prove the in-process path.
- **Now urgent, C4.** The MCP row still serves all 54 backend tools beside the 33 native ones, so the
  model sees `search_patents` twice (native and `mcp__flowleap__`). Narrow the MCP row to the paid set
  (PATSTAT, enriched citations, examiner baseline, images, US full text) by a backend profile
  parameter or a client-side allowlist on the row, and re-export the prompt (C6) with the native names
  so `mcp__flowleap__search_patents` becomes `search_patents` in the text.
- After #608 merges: `scripts/flowleap/sync-connectors.sh` against the sibling checkout, so SYNC.json
  points at a main commit.
- **C4 + C6 DONE (2026-10-22).** `dsh-mcp-client` gained `tools.include`/`tools.exclude`; the
  `mcp-flowleap` row lists the 22 paid tools (two names first listed,
  `reference_search` and `get_legal_jurisdictions`, were retired under ADR 0017 step 3 and answer 410; they are removed). The host plugin gained `excludeTools`
  and the profile leaves `get_fulltext` to the MCP row, so no tool exists in both forms: 32 native
  office tools + 20 paid MCP tools + 4 harness tools. The prompt export now keeps native office
  names and prefixes only paid tools (agent-v2 draft PR #857; the bundle copy is from that branch,
  2 `mcp__flowleap__` mentions left). agent-v2 #854 (ADR 0019) and #857 are MERGED; the bundle copy equals agent-v2 main; SYNC.json points at backend main.
- **Market note (2026-10-22): patent-connector.com** (Funktionslust GmbH, Munich, patent.dev) sells
  the connector layer alone: self-hosted Docker or binary, MCP server + JSON API + free CLI,
  official APIs with the firm's keys, flat fee per organisation. Offices: EPO OPS, USPTO, DPMA,
  EUIPO, JPO, IP Australia, TIPO, INPI, Global Dossier (EP/JP/KR/CN wrappers), PRS, The Lens.
  Lesson: connectors are not the moat; the agent, PATSTAT and the workflows are. Candidate: add it
  as an MCP row scoped by `tools.include` to the offices we lack, after a one-day trial.

## S3 (2026-10-22): the harness looks and speaks FlowLeap

- **Brand file** `packages/bundle/flowleap-web/brand/brand.json`, read by the Host half of
  `@deepseek-ai/dsh-client-ui-brand-flowleap` (`FLOWLEAP_BRAND_PATH` overrides): `productName`,
  `shortName`, optional `tagline` (hero headline), optional `mark` (SVG/PNG/JPEG/WebP path relative to
  the file, published to the page as a data URL), `markStyle` `mono` (mask in the text or accent colour,
  default) or `color`, optional `accent`. The browser half occupies `sidebar.brand.mark`,
  `sidebar.brand.name` and `conversation.hero.brand.mark`, the Host rewrites the served `<title>` through
  `webServer.tapIndex()` and injects the record as the `__FLOWLEAP_BRAND__` boot global.
- **Copy override seam.** `packages/client/locale` gained `override(ns, locale, partial)` (one method, one
  test): layers over a registered dictionary, newest first, before or after the owner. The brand
  package's `src/client/locales.ts` lists the overridden keys (`common.brand.localBuild`,
  `conversation.hero.headline`, `settings.models` welcome and onboarding, `model`, `pluginManager`,
  `sidebarOffice`, `chat`) for `en` and `zh`.
- **Still served with the vendor name** (the grep of the served bundles after S3): the dictionaries of
  `ui-settings-models` (33, the DeepSeek card copy and the original welcome text that the override hides
  at render), `ui-chat` (5), `ui-attachment` (4), `ui-model-selection`, `ui-plugin-manager`,
  `ui-sidebar-documentpreview`, `cordis-client-runner` (2 each), and the locale package's own
  `DSH Local Build` fallback. None of it renders in the profile; removing it means editing upstream
  dictionaries. `apps/web/public/manifest.webmanifest` (name "DeepSeek Harness", short_name "DSH") and the
  fish favicons are build-time assets with no runtime seam yet.
- **Left for a human:** the visual check in a browser (sidebar mark and name, hero mark and tagline, the
  preview notice text, Settings → Built-in plugins titles and icons); a FlowLeap accent colour in
  `brand.json` if wanted (the mark follows the text colour today); the favicon and web manifest; keeping
  `presets/patent.patch.yml` in step with `dsh-web-app/presets/standard.patch.yml` after upstream merges.
- **Knowledge Pool design (2026-10-22):**
  [flowleap/docs/2026-10-22-knowledge-pool-design.md](flowleap/docs/2026-10-22-knowledge-pool-design.md).
  Shared firm memory as one MCP server per firm (the only writer), Markdown pages in git partitioned by
  wall (one repository for the firm tier, one per client), SQLite FTS5 search, per-caller index in the
  server instructions, deterministic write screens, compile job inside the service with a nightly cost
  cap, 33 edge cases, MVP = firm tier with human review. Eight open questions for the founder in
  section 13; the ADR follows the answers.
- **S3 verified in the browser (2026-10-22):** tab title, sidebar mark, hero tagline, "Patent Agent"
  default preset, FlowLeap-voice Preview notice. Later the same day: the running indicator is a slot
  (`conversation.chat.running.icon`), the brand package fills it with the pulsing FlowLeap mark and the
  copy reads "Working for Ns ···"; verified live on a scratch instance. Favicon and web manifest now come from `brand.json` (the Host serves the mark at `/brand/mark` and
  a FlowLeap manifest; verified in the served index). Left: `brand.json` has no `accent` yet, the
  other presets keep the coding persona.
- **C3 in flight (2026-10-22).** C3a = flowleap-backend draft PR #609: the Mistral OCR client lives in
  the package on the host's `mistral` credential (REST call through `host.fetch`, no SDK),
  `verifyKey()`, `resolveOcr()` order host → package client → none, `ocr` is office tool 34; catalog
  byte-identical; CI pending. C3b = harness agent: vendored sync to the #609 branch, 34 native tools,
  real Mistral key test on the card, native `read_pdf` (workspace file → Mistral OCR, page markers,
  cost line), `ocr` removed from the MCP include list.
- **C3b DONE on `flowleap` (2026-10-22).** Vendored library synced to the #609 branch (78c1545; no new
  dependency, mupdf still excluded). The host plugin registers the 34 office tools (`ocr` is
  `access: 'mistral'`, gated like the offices: without a key it names the Mistral card) and the native
  `read_pdf` (`{ path, pages? }`, registered inside `ctx.inject(['fs', 'workingDirectory'])`: the file
  is read through `ctx.fs` and refused outside the session's working directory, 50 MB and 300-page caps,
  base64 to `connectors.ocr.runOcr`, result = header line with model and page count, the line "OCR
  through the firm's Mistral key; pages billed by Mistral", then `--- page N ---` blocks; the `pages`
  range selects pages of the whole-document OCR, cached 24 h by the library). `host.ocr` stays absent so
  `resolveOcr` falls through to the package client on the firm's key for `read_application_document`
  too. The Remote `test('mistral')` calls `connectors.ocr.verifyKey()` (GET /v1/models). `ocr` left
  the `mcp-flowleap` include list (21 names, 19 live). Card and wizard copy: "Mistral API key for OCR of
  scanned documents and PDFs (read_pdf, file-wrapper documents). Billed by Mistral per page."
  Left: born-digital PDFs also go through OCR (local text extraction is a later slice; mupdf is
  excluded by licence); the live test with a real key in the browser is the founder's.
- **C3 status (2026-10-22 evening).** C3b DONE on `flowleap`: 34 office tools native (`ocr` included,
  `get_fulltext` excluded), `read_pdf` for workspace files through the firm's Mistral key (50 MB,
  300 pages, page markers, cost line, 24 h cache), real `verifyKey` on the Mistral card, MCP row at 19
  paid tools, no tool in both forms. Gates: 61 of 62 after the concrete-terms gate learned to skip
  `flowleap/`. C3a MERGED (flowleap-backend #609); the vendored library is pinned to backend main. The backend deploys automatically
  on every push to main (`deploy.yml`); #606, #608 and #609 each deployed green, the last at 15:02 UTC. Live OCR test PASSED 2026-10-22: the founder created a workspace `ocr-project` in Downloads, saved a
  Mistral key in the connectors card, and the agent read a scanned PDF through `read_pdf`. The same run
  proved the office tools on the firm's EPO and USPTO keys (native calls, one paid MCP call to
  `examiner_baseline`). Fixed and MERGED (flowleap-backend #610, deployed by push-to-main): a host without a US full-text
  source names the paid `get_fulltext` route in the message and in an additive `paidRoute` field;
  the vendored library is pinned to that main commit.
  Later: born-digital PDF text extraction without OCR (needs a permissive PDF parser).
- **Computer use (2026-10-23):**
  [flowleap/docs/2026-10-23-computer-use-cua-assessment.md](flowleap/docs/2026-10-23-computer-use-cua-assessment.md).
  trycua is already inside dsh (`computer-use-cua-driver-*` pin `@trycua/cua-driver` 0.28.0, MIT; `cua-macos`
  is dsh's own Swift driver), none of it is mounted in `flowleap-web`, and dsh's approval policy does not
  cover MCP, computer-use or browser tool calls. Of 11 patent use cases, 8 have an API or a connector.
  Plan: slice **B1 after S4 and S5**, a read-only headless browser (dsh's Playwright MCP provider, fresh
  profile per session) behind a new policy plugin (domain allowlist, deny-list of filing and payment
  hosts, ask before every click or type), for DPMAregister and national-office pages until connectors
  ship and for firm web tools without an API. Never a filing portal (MyEPO, Online Filing, Patent
  Center, ePCT: 2FA and legal deadlines; EPO filing has an API). Desktop computer use is not useful on a
  headless firm server.
- **Planned after S4 (2026-10-23):**
  - **S4c Terraform**: one module per cloud (AWS EC2+EBS, GCP Compute+PD, Azure VM+disk) that creates one
    VM per firm with a `/data` disk, no public ingress, cloud-init that installs Docker, joins Tailscale
    and starts the compose file, daily snapshots; outputs the tailnet hostname and per-attorney login
    URLs. Needs a pullable image (private GHCR with a per-firm token) and never carries office or model
    keys in variables or state. No Kubernetes.
  - **Auth**: v1 = Tailscale identity header (`tailscale serve`) checked against the instance owner,
    auto-exchanging the launch token; v2 = an OIDC proxy (oauth2-proxy or Pomerium) in the compose file
    against the firm's IdP, which also feeds the Knowledge Pool's walls; v3 = a FlowLeap gateway with
    login, identity-to-instance routing and a spawner (ADR 0011's deferred piece). The per-instance
    token and cookie stay as the second lock in every variant.
    YubiKey (founder question 2026-10-23): sign-in via the IdP's FIDO2 comes free with v1/v2; later
    plugins if a firm asks: WebAuthn step-up before gate actions or key changes (same seam as B1's
    policy plugin), receipt signing with a PIV/OpenPGP key, age-plugin-yubikey for the key store.
  - **B2 desktop computer use**: laptop shape only, reusing B1's policy plugin, when a firm names the
    desktop application it needs driven; the headless browser (B1) runs identically on both shapes.
- **S4a DONE, milestone 1 (2026-10-23).** `make desktop-flowleap` builds an unsigned macOS arm64 app and
  dmg (256 MB) from `apps/desktop/config/product.flowleap.json` (`DSH_DESKTOP_PRODUCT=flowleap`): product
  name, appId `co.flowleap.patent-ai`, protocol `flowleap-patent-ai://`, FlowLeap icons, profile
  `profiles/flowleap-desktop` from the `flowleap-web` template; DeepSeek account, Welcome window,
  platform pages, telemetry, mandatory update policy and the updater are gated off by the product record
  (upstream default record keeps upstream behaviour). Verified launched: no sign-in window, FlowLeap
  title, mark, hero, patent preset, FlowLeap plugin cards, connector cards. Milestone 2: Developer ID
  signing and notarisation in the org repo's CI, Windows build, an update feed and publisher, release
  workflow.
- **S3 follow-up (founder, 2026-10-23):** Settings → Built-in plugins shows raw module ids
  (`@deepseek-ai/dsh-*`) and package descriptions that say "DeepSeek Harness"; a firm admin reads that
  as a data-flow concern. Fix in the brand package: display labels without the scope (full id behind an
  advanced toggle for support), product-name substitution in descriptions at render, and one honest
  About line "Built on DeepSeek Harness (MIT)" as the licence attribution. Also observed: one desktop
  session cost 671K tokens over five turns; preset-level tool narrowing (ADR 0018 d4) is still open.
- **S4b DONE (2026-10-23).** `deploy/`: three-stage `Dockerfile` (Node 26 slim runtime, `flowleap` CLI
  v0.12.0 pinned by tag with checksum, skill pack from flowleap-plugins, `DSH_HOME=/data`, health check,
  boot smoke in the build), `docker-compose.yml` with one `harness-<name>` + `ts-<name>` Tailscale sidecar
  pair per attorney (loopback only, HTTPS via `tailscale serve`, Funnel off), `entrypoint.sh`,
  `healthcheck.sh`, `tailscale-serve.json`, `.env.example`, and `deploy/README.md` for the firm's IT.
  Support tooling: `pnpm run flowleap:doctor` (`scripts/flowleap/doctor.ts`, `--json`, never a value) and
  `scripts/flowleap/log-bundle.sh` (scrubbed tarball, refuses credential paths, aborts if a key pattern
  survives). Verified: image `flowleap-harness:dev` 945 MB builds in 4 to 6 min warm; container serves
  the FlowLeap index behind the token-cookie exchange; doctor and bundle run locally and in-container
  with zero raw key hits. Not live-verified: the Tailscale leg (Host passthrough and cookie flags on a
  real tailnet). Open: a tag on flowleap-plugins for a reproducible pack pin, image dedupe, no pnpm in
  the image.
- **Model hosting options (founder, 2026-10-23), to document in `deploy/README.md`:** (1) the firm's own
  keys to a cloud model provider; (2) the firm's cloud model service (`amazon-bedrock`, Azure, Vertex are
  pi-ai providers reading the provider's credential files); (3) a local box such as an NVIDIA DGX Spark
  (Ubuntu, 128 GB unified memory, about 7,400 EUR) running vLLM or Ollama behind the OpenAI protocol as a
  custom provider, with the S4b compose on the same machine. Measure tool-calling quality at 70B-class
  before promising "local AI". The Knowledge Pool's open questions stay open until the first firm answers
  them; the MVP (firm tier, human review, no walls) does not depend on them.
- **E1 "bring your subscription" (founder, 2026-10-23), after S5:** attorneys use the Claude or ChatGPT
  seat they already pay for, through the vendor's own tools only (Claude Code, Codex installed and signed
  in on the machine), never by borrowing a claude.ai login token (dsh's pi-ai can, Anthropic has cut
  off harnesses that did; the firm would carry the risk). Phase 1 exists: the `subagent-claude-code`
  and `subagent-codex` bundles on the Plugins page. Phase 2: an engine provider plugin that drives Claude
  Code or Codex for the whole turn (headless or ACP), our 34 office tools offered to it as a local MCP
  server from the connectors package, our prompt appended as system prompt; option in Settings → Models
  with one sentence on whose terms apply; API keys and the firm's cloud stay the default. One to two
  weeks; risks: two stacked prompts, less tool-routing control, vendor terms.
- **S5 plan (2026-10-23):**
  [flowleap/docs/2026-10-23-s5-deliverables-port-plan.md](flowleap/docs/2026-10-23-s5-deliverables-port-plan.md).
  One plugin `dsh-flowleap-deliverables` with six tools (`compare_claims` joins the connectors plugin);
  ~10,000 lines move with import rewrites, ~2,000 lines of VS Code glue are rewritten onto `ctx.fs`,
  `tools/result`, `ctx.userQuestions.ask()`, `ctx.commands`; delivery card via the existing
  `deliverables/presented` event. Phases: D0 prerequisites (prompt export adds the six names; evidence
  anchors in the connector library's `get_claims`/`get_description`/`get_abstract`; Zlib on the licence
  gate's permissive list), D1 writer + record + validation + card (4-5 days, 4 lanes), D2 docx + inventor
  questions document (2.5-3 days), D3 drafting state machine + gates as question cards (3-4 days).
  Riskiest: the evidence ledger (no tool records retrievals in the harness yet), binary writes and the
  `pako` Zlib licence, gates without an editor. Five founder questions in section 8.
- **S6 skills UX (founder, 2026-10-23), after S5 or in parallel:** a `/create-skill` skill (asks purpose and
  tier, drafts to the pack rules, saves, confirms the catalog), a Settings → Skills page grouped by root
  (pack, firm, workspace, personal) with path, model-invocable flag, Open folder, Disable, New skill;
  the same grouping in the `/` picker. Firm tier = a shared read-only volume in `customSkillDirs` on the
  server shape; laptops need a pull (git or the Knowledge Pool). About two days.
- **Skills must stay methods (founder, 2026-10-23).** Measured on the loaded pack: of 33 skills, 19 name
  harness tools and 20 name CLI commands (`flowleap patstat portfolio` and so on); 9 are pure method. A
  CLI-naming skill can push the agent into bash instead of the typed tool. S5 ports tools, not skills,
  and is the ADR 0018 harness side; the pack clean-up is ADR 0018's programme in flowleap-plugins (one
  PR per heavy skill, method only, no tool or command names). S5 acceptance adds: the three
  skill-grounded cases pass in the harness with the skills folder empty.
- **S5 STARTED (2026-10-23) with the founder's defaults:** gates as question cards plus slash commands;
  Zlib allowed on the licence list (apply with D2); evidence anchors in the connector library; second
  read stays on render; no in-browser editor in v1. D0 done as drafts: D0.1 agent-v2 #858 (export adds `write_patent_results` and
  `compare_claims` passages, 7,601 words, gaps empty; copy into the bundle together with D1), D0.2
  flowleap-backend #611 (`anchor` and `sources[]` on `get_claims`, `get_description`, `get_abstract`,
  `get_bibliography`; format `<pub>:<section>[:<claim>][:<lang>]`; re-sync the vendored library after
  merge). D1, D2 and D3 done; S5 code complete
  `packages/host/flowleap-deliverables` (writer, templates, validation, working record, ledger,
  delivery card) and `compare_claims` in the connectors plugin.
- **S5 D1 DONE + acceptance PASSED (2026-10-23).** `packages/host/flowleap-deliverables` (10,207 lines:
  templates, provenance, candidate review, Find Better, Fallback Ladder, second read, receipt, evidence
  ledger with structured and derived modes, `write_patent_results`, delivery card via
  `deliverables/presented`, steer once) + `compare_claims` native in the connectors plugin. Live run on
  the founder's keys, Sonnet 5.5 via OpenRouter, prior art on EP2110298B1 claim 1: first save refused
  ("Candidate draft was not saved … Feature support for …"), the agent read more evidence and the retry
  saved `outputs/acceptance-s5/ep2110298b1-prior-art.md`, `.working-record.md`, `.evidence.json`,
  `.second-read.json`; Report and Working record cards shown; second read judged 11 elements, 1 not
  confirmed, recorded in the working record; 2 min 43 s, 15 steps, 1.9M tokens of usage (89% cache
  hits). Observed: the agent reported US claims as paid but did not call `mcp__flowleap__get_fulltext`
  (the #610 hint is in the vendored copy; the prompt's US routing may need one line). Vendor README
  manifest row fixed and tracked by the sync script; THIRD_PARTY_NOTICES regenerated; prompt artifact
  from agent-v2 #858 in the bundle. Next: D2 (docx + inventor questions, Zlib on the licence list),
  then D3 (drafting state machine and gates).
- **S5 D2 DONE (2026-10-23).** `export_draft_docx` and `inventor_questions` registered in
  `dsh-flowleap-deliverables` (six commits, 81 files, +11,265). The IDE Application Drafting layer is
  copied (22 modules, 18 specs, the pipe-clamp fixture; `SOURCE.json` pins 72 IDE files at agent-v2
  `33efdf7ebee`, `sync-deliverables.sh --check` clean); `lcs-diff.ts` (60 lines) replaces the VS Code
  diff module; `drafting/workspace.ts` is the `ctx.fs` adapter with the `contains` fence; `bytes.ts`
  writes Word bytes only into a local workspace (refusal `Word export needs a local workspace`);
  `docx` is lazy-loaded (a static import broke `dsh flowleap-web --help`, localStorage touch at
  import); mammoth reads answers back. Gate sentences name the file edit only (`withoutEditorButtons`
  strips the IDE's Approve/Waive button clauses; D3 adds the card/command sentence). Not ported on
  purpose: VS Code reveal, "app restarted" advice, drawings files, PDF exemplar reader (reported
  unread), multi-root. Licence gate: `Zlib` on the permissive list (founder decision 2026-10-23);
  deps docx 9.9.0, mammoth 1.13.0, yaml, jszip (dev); notices regenerated. `verify-concrete-terms`
  now skips `packages/host/flowleap-deliverables/`, the sync script and this file ("provenance" is a
  copied module name). Acceptance (`tests/drafting-tools.spec.ts`, real fs): export on the approved
  pipe-clamp matter writes description/claims/abstract/full Word files + filing manifest + checklist
  and one `deliverables/presented` event with five files; a closed gate refuses and writes only the
  checklist; `inventor_questions send` writes 8 rows, Word-filled answers are refused by `send` and
  copied by `import` (3 of 8), second `send` writes the 5 left; `office-to-pdf` converts all three
  exports (6/2/1 pages, no missing fonts). Gates: typecheck 5/5, lint clean, build 9/9, vitest 30
  files / 309 tests, notices up to date, `check:ci:static` 61/62 (baseline). Next: D3.
- **S5 D3 DONE + live acceptance PASSED (2026-10-23).** `start_application_draft`, `validate_draft`,
  `remove_claim` registered beside the D1/D2 tools (seven commits, 37 files, +4,176). Gates: question
  cards as the main path (`src/gates/questions.ts`: Confirm Feature List, Approve Claims, Waive Errors
  as a two-question batch), slash commands as the strict path (`src/gates/commands.ts`:
  `/confirm-features`, `/approve-claims`, `/waive <matter> <line or rule> <reason>`, no model step),
  `remove_claim` through `ctx.approval.request` when the policy is `ask`, a one-option card when it is
  `never`. On yes the tool writes the flag with `writeDraftingFrontmatter` (comments kept), reads it
  back from the file, then writes one record line with the source (`question card, call <id>` or
  `command /approve-claims`). Not yet / abort / delegated caller / no answerer: nothing written, the
  refusal names the edit, the card and the command. The writer saves `draft-application` and
  `draft-outline` through the IDE save modules (`SOURCE.json` pins 82 IDE files at agent-v2
  `33efdf7ebee`). Live run (port 3095, fresh empty workspace, Sonnet 5.5 via OpenRouter, browser):
  Confirm card -> yes -> `confirmed: true` + record line; Approve card -> Not yet -> refusal;
  `/approve-claims pipe-clamp` with no model step; Waive card with a reason that landed in
  `findings.md`; claims changed -> approval withdrawn -> new Approve card; export wrote and presented
  the four Word files + filing manifest (seven-file card). One defect found live and fixed
  (the first draft save dropped the gate record lines; fixed in the D3 commit series). Cost: 4 turns, 52 steps, 6.4M
  tokens (97% cache). Gates: typecheck 5/5, lint clean, build 9/9, vitest 34 files / 366 tests,
  notices up to date, `check:ci:static` 61/62 (baseline), sync check clean. Observed: the Web UI
  default access mode is Workspace Write, not `danger-full-access`, so the approval dialog is the
  live path for `remove_claim`. Founder veto list (agent decisions): (1) the IDE's `findingKey` strips
  line numbers, so one waived Error transfers to every same-message Error on the next run (agent-v2
  rule, now visible at once through the card); (2) `validate_draft` asks the Waive card on every run
  with unwaived Errors (friction while the agent is still fixing; alternative = ask only in export);
  (3) a withdrawn approval is askable again on the new claims; (4) record-line carry-over across the
  first draft save is a harness-only rule inside the copied save module; (5) no bulk "Waive all open
  Errors" first option. Not run live: `remove_claim`, `/confirm-features`, `/waive` (unit-covered).
  Evidence in the session scratchpad `acceptance-d3/`. Open for the full S5 acceptance: the three
  skill-grounded cases (prior art, dossier, FTO) with the skills folder EMPTY; the D3 run already
  reached the export with no `application-drafting` skill loaded (`FLOWLEAP_SKILLS_DIR` unset).
- **S5 acceptance, three cases with the skills folder EMPTY (2026-10-25): 1 PASS, 2 PARTIAL, 0 FAIL.**
  Port 3096, Sonnet 5.5 via OpenRouter, fresh workspace, `FLOWLEAP_SKILLS_DIR` AND `DSH_AGENTS_HOME`
  pointed at empty folders (the preset's own `skill-filesystem` provider still mounts `~/.agents/skills`
  when only `FLOWLEAP_SKILLS_DIR` is empty; proof: no Skills section in the `/` menu, `skill prior-art`
  -> unknown). Each case 1m46s to 3m02s, 1.3M to 1.6M tokens, 90 to 93% cache. Prior art PARTIAL:
  structured save after one refusal and one free-form detour (the steer message forced the template),
  report + record + evidence + second read, X/Y/A tags, no fabricated numbers, but US4763957A from the
  examiner baseline silently omitted. Dossier PASS: 12 claims, independents 1/6/10, "at least three
  lobes" verbatim, DE/FR/GB/NL lapse dates exact, zero forward citations with routes named, US family
  chain right; one wording slip (OPS docdb id printed as a US serial beside the real one); CH shows a
  PG25 event in today's OPS data, so the old answer key is stale there. FTO PARTIAL: memo saved first
  time, DE/FR lapsed from legal-status data, US grant in force, element mapping, risk per market,
  design-around, limitations; but US expiry asserted from own arithmetic + Google Patents without a
  term lookup, "comprising" reasoning applied but never named. **Defects to fix (harness side):**
  (1) the connectors' paid-route hint names `mcp__flowleap__get_claims`, which the `mcp-flowleap` row
  does not include (only `get_fulltext`), so every US claims read died on "unknown tool" in all three
  cases: add `get_claims` and `get_description` to `tools.include` (ADR 0019 d5 intends the same-name
  paid tool) or map the hint; (2) the prompt export carries the STATIC key-state line "EPO OPS key is
  not set; USPTO ODP key is not set" (agent-v2 `patentAIPrompt.tsx` line ~213 rendered with no keys):
  the export must omit that paragraph and `dsh-flowleap-connectors` must contribute the live key
  presence as its own system-prompt section; (3) free-form `write_patent_results` saves get no second
  read, record or evidence and the file was edited 9 times after the card (no seal); no dossier
  template; (4) `get_claims` description still says "US claims come from BigQuery" and the word leaks
  into memos; (5) uspto `range_filters` -> 400; (6) FTO template field "Jurisdiction(s)" left as a
  placeholder; provenance audit covers only three tools and reports found dates as "not found" (ISO vs
  yyyymmdd). Evidence in the session scratchpad `acceptance-s5/` (EVIDENCE.md, per-case transcripts,
  session logs, outputs). Verdict against the rule: the harness carries the three workflows without
  skills; the misses are route and precision defects, not knowledge gaps.
- **Acceptance defects 1 and 2 FIXED (2026-10-25).** (1) `get_claims` joined the `mcp-flowleap`
  `tools.include` (20 names): the connectors' only paid text route is US claims via BigQuery, named
  `mcp__flowleap__get_claims`; `get_description` has no US source on either host and stays native
  only. (2) `dsh-flowleap-connectors` registers `flowleap:patent-data-keys` (order 1, heading
  "Patent-data keys (this host)") from its credential records, re-read on `credentials/record-updated`
  of its scope; values never enter the text. agent-v2 draft PR #859 adds `keyStateOwner: 'host'` to the
  prompt and the export now renders a pointer to that heading instead of the static "Key presence
  only" line; the regenerated artifact (7,376 words) is in the bundle and byte-identical to the merged
  agent-v2 main artifact (#859 MERGED 2026-10-25). Gates: typecheck 5/5, lint clean, connectors 6 files / 30 tests,
  `check:ci:static` 61/62 (baseline). **Re-run live 2026-10-25 (FTO case, port 3097, empty skills):
  both fixes PASS.** The system prompt carries the host section (`EPO OPS: key is set`, `USPTO ODP: key is
  set`, `Mistral: key is set`) and the persona pointer; "Key presence only" has 0 hits. The native
  `get_claims` answered `not_configured` naming `mcp__flowleap__get_claims`; the agent called it for
  US7722129B2 (16 claims) and US8056987B2 (19 claims) and the memo maps the PRINTED claims verbatim; no
  file-wrapper detour, no web fetch. Cost fell from 10 steps / 17 calls / 1.3M tokens to 5 steps / 14
  calls / 581K tokens, 1m27s. Case verdict stays PARTIAL on one line: US expiry = PTA lookup
  (`get_patent_term_adjustment`, 63 days) + declared own arithmetic, `get_patent_term` not called;
  "comprising" applied but not named. Unchanged defects: template "Jurisdiction(s)" placeholder;
  provenance audit covers only `get_claims`/`get_legal_status` so it flags grounded dates as "not
  found" (15 of 19) in every run; native hint says "no BigQuery source". Recipe gotcha: the dsh
  workspace registry (`~/.dsh/storages/workspace.json`) keeps an earlier workspace of the same display
  name selected; `working-directory.defaultDirectory` does not override it; add the new workspace
  through the picker (Add workspace > Edit path). Evidence: scratchpad `acceptance-s5-rerun/`.
- **Acceptance defect wave 3 to 6 (2026-10-25): harness side DONE, backend side in draft.** (A) The
  provenance audit now records 14 more native reads (`get_patent_summary`, `get_family`,
  `get_register_biblio`, `get_us_grant`, `get_us_application`, `get_continuity`, `get_transactions`,
  `get_assignments`, `get_foreign_priority`, `get_prosecution_timeline`, `get_patent_term_adjustment`,
  `get_citations`, `get_application_documents`, `read_application_document`), a figure before a JSON
  list comma counts as found, and a memo's own section numbers are no longer figures; offline re-render
  of the re-run FTO memo: dates 4 found / 14 not found -> 16 / 2 (the two left are the model's own
  expiry arithmetic, declared as such), figures 8/2 -> 10/0. (B) An fto-memo save fills the
  `Jurisdiction(s)` header cell from a new `jurisdictions` input or is refused before any write. (C) A
  `dossier` template (Snapshot, Claims, Family, Legal Status, Citations, US Family Chain, Sources and
  Limitations) and the seal: the first `edit`/`write`/`str_replace_editor` of a delivered file steers
  once per session and path ("re-save it through write_patent_results"); the edit is never blocked.
  Four copied IDE files now diverge on purpose (ledger types, provenance matcher, writer schema, templates);
  each divergence is marked in its header and listed in the README with the agent-v2 follow-up to port.
  Gates: typecheck 5/5, lint clean, build 9/9, vitest 35 files / 372 tests, `check:ci:static` 61/62
  (baseline). `verify-repository-references` now skips `flowleap/docs/` (research notes cite upstream
  commits by hash). (D) Wording: flowleap-backend draft PR #612 replaces "BigQuery" with "FlowLeap US
  full text (paid)" in the connector library's model-facing text; `paidRoute`, `mcpTool` and the
  internal source id are unchanged. After the founder merges it: `scripts/flowleap/sync-connectors.sh`
  and commit the re-vendored copy. Not re-run live; the next acceptance pass should check that the model
  sets `jurisdictions` from the refusal and picks `template: dossier` from the description.
- **Connector library re-vendored twice (2026-10-25):** backend #612 (product wording) and #611 (evidence
  anchors) are merged and deployed; `vendor/flowleap-connectors` is at backend main `9c1db3c533`
  (`sync-connectors.sh --check` clean). What #611 gives the harness: `get_bibliography`, `get_abstract`,
  `get_claims` (section and every claim) and `get_description` results carry `anchor`
  (`<pub>:<section>[:<claim>][:<lang>]`), the same string the ledger derives, so the model now sees the
  anchor it must quote under. What it does NOT give: no `sources[]` array on results, so the ledger's
  structured mode stays dormant and derived mode (byte-identical anchors, full result text captured)
  remains the live path. No harness change needed; structured mode switches on by itself if the library
  ever emits `sources[]`. Specs after the re-sync: 41 files / 402 tests across connectors, deliverables
  and the vendored copy.
- **S5 acceptance pass 3 (2026-10-26): wave 3 to 6 checks PASS.** Branch `flowleap` after the #859 docs commit,
  `build:artifacts` rerun first, port 3098, Sonnet 5.5 via OpenRouter, fresh workspace `matter-review`,
  `FLOWLEAP_SKILLS_DIR` and `DSH_AGENTS_HOME` empty (no Skills section in the `/` menu); the same prompts
  as 2026-10-25. Dossier (6 steps, 14 calls, 1.5M tokens, 1m38s): the FIRST save is `write_patent_results`
  `template: "dossier"` with no refusal; the file has Snapshot, Claims (12, verbatim), Family and where in
  force, Legal status, Who cites it, Sources and limitations, and the generated provenance (dates 64/64
  found, figures 42/43; the one miss is an HTTP `404`). FTO (5 steps, 12 calls, 1.3M tokens): the FIRST
  save is `template: "fto-memo"` with `jurisdictions: "DE, FR, US"`, so the header cell reads
  `Jurisdiction(s) | DE, FR, US`; no refusal happened, so the refusal-then-retry path stays covered by
  `tests/writer.spec.ts` only. `mcp__flowleap__get_claims` read both US grants; dates 12/13 found (the miss
  is the model's own expiry, 2028-04-16 + 63 days PTA). New findings: (1) the dossier has no own "US Family
  Chain" heading (the chain sits in section 3) and the template did not refuse; (2) after the save the
  model tried to `edit` a garbled sentence, the edit failed on read-before-write (not the seal), and the
  model left the sentence in the delivered file and gave the correction in chat instead of re-saving
  through `write_patent_results`; (3) the provenance line on a dossier save starts "FTO provenance:"
  (`report/provenance.ts` `ftoProvenanceResult`). Evidence: session scratchpad `s5-pass3/` (session logs,
  dumps, outputs).
- **S5 acceptance pass 4 (2026-10-26): the three pass 3 fixes, 2 PASS live, 1 not reached.** Branch `flowleap`
  at the pass 3 fix commit, `build:artifacts` rerun first, port 3099, Sonnet 5.5 via OpenRouter, fresh
  workspace `matter-pass4`, `FLOWLEAP_SKILLS_DIR` and `DSH_AGENTS_HOME` empty (no Skills section in the `/`
  menu). Dossier (the pass 3 prompt; turn 1 7 steps, 931K tokens): the FIRST save was refused with the new
  "dossier needs a US Family Chain section" message; the model then called `get_us_grant` for US7722129B2 and
  US8056987B2 and the retry saved with "## 5. US Family Chain"; the result line reads `Provenance:` (was
  "FTO provenance:"). Correction turn ("rename the heading … change nothing else"; 45 s): the model did NOT
  call `edit`; it read the file and re-saved the whole body through `write_patent_results` (the writer
  description already says a delivered file is re-saved), so the failed-edit seal sentence was not reached
  live and stays covered by `tests/writer.spec.ts` only. FTO without a markets line (8 steps, 1.2M tokens):
  the FIRST save set `jurisdictions` to "EP (all 35 designated states, incl. DE, FR, GB, NL), US", taken
  from where the patents are in force, so the `jurisdictions` refusal again did not fire; `FTO provenance:`
  stays on the fto-memo result. New observation: with no markets named, the model neither asked for the
  user's markets nor marked the Jurisdiction(s) cell as an assumption (its product assumptions A1 to A3 are
  marked); decide whether the cell should mean "markets cleared" (ask) or "where the patents are in force".
  Recipe gotcha: a new Web session opens with "Select model" even with `agent-default-model` patched, and
  Return in an empty-model composer sends nothing; select the model in the picker first. Evidence: session
  scratchpad `s5-pass4/` (session logs, dumps, outputs).
- **FTO markets come from the user (founder decision 2026-10-26, option 1 of the pass 4 observation).** An
  fto-memo save asks the user one `Markets` question card before it writes
  (`packages/host/flowleap-deliverables/src/report/markets.ts`): the model's `jurisdictions` is the proposed
  option, the user may type other markets, the answer fills `Jurisdiction(s)` and is reused for the Session and
  path while the model proposes nothing or the same markets (a different proposal asks again). An empty answer
  or a cancelled card refuses the save; with no possible answer (no question service, a delegated caller) the
  proposal is written with "(not confirmed by the user)". The save result states the answer to the model, which
  never sees the card. Live, FTO prompt without markets, answer typed "DE, FR" against the proposal "US; EP
  (all designated states)": run 1 (result line only "as the user confirmed in chat") failed: the model called
  the header wrong, tried `edit` (failed on read-before-write; the pass 3 failed-edit seal sentence fired live
  and the model re-saved through the writer) and told the user the header was wrong. Run 2, with the result line
  naming the card answer and the proposal: the model narrowed the analysis to DE and FR, re-saved with
  `jurisdictions: "DE, FR"` (no second card), moved the US patent to an annex "outside confirmed markets", and
  told the user the memo covers "the two markets you picked in the memo's question card". Known limit: the model
  writes the memo body before the card, so a market change costs one re-save. Evidence: session scratchpad
  `s5-pass4/markets-run/` and `markets-run2/`.
- **S5 prior-art re-run (2026-10-26): PASS.** `flowleap` at the FTO markets card commits, port 3101, Sonnet 5.5 via
  OpenRouter, fresh workspace `matter-priorart`, `FLOWLEAP_SKILLS_DIR` and `DSH_AGENTS_HOME` empty, the
  2026-10-25 prompt (claim 1 "hitch pin with at least three lobes", X/Y/A, client report). 1 turn, 19 steps,
  2.4M tokens (93% cache), about 6 minutes. The 2026-10-25 miss is closed: the model called
  `mcp__flowleap__examiner_baseline` early and the report names US4763957A (1988-08-16) as A, with the note that
  the examiner's X and A categories were given against earlier claim sets. The final save is the structured
  `prior-art-report` (report, working record, evidence, second read: 10 elements judged, 2 not confirmed), no X
  assigned, Y for the Montague family, US5135330A and US4964287A. The path to it is still long: two free-form
  saves first, two direct `edit` calls on the delivered file (both failed on read-before-write, and the
  failed-edit seal sentence fired each time), the "no successful structured finalization" steer, two
  refusals naming unknown claim anchors, then the save. Still open: the USPTO `range_filters` input answers
  `400: Bad Request` in both forms the model tried (`"applicationMetaData.filingDate 1900-01-01 2008-04-16"`
  and the comma form); this is S5 defect 5 of 2026-10-25, in the connector library
  (flowleap-backend). With this run, all three S5 cases have a current result: dossier PASS, FTO PASS on the
  markets card run 2, prior art PASS. Evidence: session scratchpad `s5-priorart/`.
- **Upstream trunk sync merged (2026-10-26).** `flowleap` fast-forwarded to the sync branch (its first commit merges
  upstream trunk at PR #7075); details in the sync entries above. Live check on the synced build before the merge:
  the S5 dossier case (port 3102, fresh workspace, skills folders empty) took the same path as pass 4 (US Family
  Chain refusal, `get_us_grant` for both US grants, retry saved with "## 4. US Family Chain", `Provenance:` line,
  Report card), 7 steps, 933K tokens. The "Select model" default defect is still present on trunk. Not run on
  the synced code: FTO, prior art, the desktop build and the Docker image. Evidence: session scratchpad
  `s5-sync-dossier/`.
- **Connector library re-vendored for the USPTO range fix (2026-10-26).** flowleap-backend PR #613 is merged:
  `search_patents` with `provider: "uspto"` now sends `range_filters`, `sort` and `facets` to the Open Data
  Portal as arrays, and refuses a malformed value with the expected form (`"<field> <from> <to>"`, for example
  `"applicationMetaData.filingDate 1900-01-01 2008-04-16"`) instead of passing it on to a bare 400 (S5 defect 5).
  `vendor/flowleap-connectors` is at backend main after the merge (`sync-connectors.sh --check` clean); vendored,
  connectors and deliverables specs 42 files / 406 tests pass. Not yet checked live in a harness run.
- **Self-hosted firm OS designed (2026-10-26).** A design interview with the founder (52 questions)
  settled the infrastructure: a firm control plane (Entra sign-in, vault, model gateway with budgets,
  egress proxy, spawner, scheduler, Artifacts library, Knowledge Pool, firm skills library, audit,
  updates, backups) in front of one isolated dsh runtime per attorney, on one host the firm owns.
  Decisions: [flowleap/docs/adr/0001-self-hosted-firm-os.md](flowleap/docs/adr/0001-self-hosted-firm-os.md)
  (the first record of this product's own ADR series; agent-v2 ADR 0011 does not apply here).
  Architecture, data map, flows and the build phases P0 to P6:
  [flowleap/docs/2026-10-26-firm-os-architecture.md](flowleap/docs/2026-10-26-firm-os-architecture.md).
  The control plane goes into a new repository `flowleap-os`; this repository stays the attorney runtime.
  Later the same day: everything the agent does is a dsh plugin in the runtime (ADR 0001 decision 20), and
  Microsoft 365 is the `dsh-flowleap-m365` plugin with a token broker, using each attorney's own permissions
  and writing emails and calendar entries as drafts only (decision 21); the MCP door for Claude Desktop,
  Claude Code and Codex is behind the same sign-in (decision 19).
  Next: P0 (repository, a Hetzner test firm, installer with restore, release pipeline, S5 cases automated).
- **Issue 12: a new Web session starts with the default model (2026-10-26).** Root cause of "Select model": the
  S5 acceptance patches named `openrouter` / `anthropic/claude-sonnet-5-5`, but the OpenRouter route lists
  `anthropic/claude-sonnet-5.5`; the profile's own default (`anthropic` / `claude-sonnet-5-5`) needs
  `ANTHROPIC_API_KEY`. With a listed model the composer shows it before the first message and Return starts the
  turn (live, port 3152: "Anthropic: Claude Sonnet 5.5", turn completed in 3 s). The old "Return sends nothing" was
  upstream's composer block for an unroutable model, removed upstream on 2026-09-23 ("isolate provider authentication and preserve model selections") and gone since the trunk sync.
  One defect remained: a prompt to a model its route does not list was claimed from the inbox and then lost when
  the step failed with `UNKNOWN_MODEL` (no `user/message` in the log). The session controller now refuses such a
  prompt at admission with `session/model-unavailable`; the composer shows the reason and keeps the draft. A route
  without its key still reaches request execution (`MISSING_CREDENTIAL`, message logged). Tests: Host spec in
  `session-models.host.spec.ts` and the web e2e `apps/web/tests/default-model-unlisted.e2e.ts`.
- **Firm OS P0 DONE (2026-10-26).** Coordinated as one session per ticket, each reviewed and merged by the
  coordinator on local checks (GitHub Actions do not run in the organisation). Harness: #12 (a new Web session
  refuses a prompt to a model its route does not serve; PR #21) and the agent-loop follow-up (PR #22).
  flowleap-os (private, flowleap-ai): #14 installer for one attorney runtime (about 250 MB RAM per runtime),
  #18 release pipeline with checks, a zot registry and per-firm update keys with revoke (PR #2), #15 and #16
  seam A driver judging dossier, FTO and prior art from session logs and saved files (PRs #1, #3; live 11/11,
  11/11, 12/12; prior art used 4.5M tokens), #17 nightly encrypted restic backups to a Hetzner Storage Box and a
  runbook-only restore on a fresh VM, boot to passing dossier in 20 min 31 s (PR #4), #19 updater that waits
  for idle, backs up first and rolls back a broken release in 41 s (PR #5), #20 release gate on the founder's
  cheaper design: OpenRouter, dossier on every candidate, FTO and prior art only on stable promotion, a monthly
  manual fresh-VM restore until a Hetzner API token exists (PR #6; candidate 1835 PASS with 854,560 tokens, a
  broken candidate blocked with 0 tokens). Open: issue 13 (firm address name, Hetzner Cloud Firewall), issues
  23 and 24 (runtime gaps: image patch overlays, a read-only firm key source, doctor key path, default
  workspace on first visit, admission pause before restart, data rollback, page reconnect, no shell sandbox
  in the container). P1 also inherits the public registry host and automated restore VMs.
