# FlowLeap Patent AI on DeepSeek Harness: handoff

Read this first, then `AGENTS.md` (the upstream operating guide: commands, gates, architecture).
This file is the FlowLeap state: what this fork is for, what changed, what is open. Last updated
2026-10-21 (first session). Earlier sessions live in `git log -- HANDOFF.md`.

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
3. **`scripts/flowleap/strip-zh.sh`** re-applies the file deletions and header strip. Run it after
   every `git merge origin/master`; it is idempotent and skips the carve-outs. The code edits
   (gates, generators, website, rules) are ordinary commits and merge on their own.
4. **Kept as library code**: `scripts/translation-pairing*.ts` and `scripts/translation-links.ts`,
   because the carve-out tooling imports them.

Verification status is at the end of this file.

## Open decisions

- **UI locale dictionaries.** The web GUI ships `zh` and `en` dictionaries in 220 packages
  (`packages/client/*/locale/{zh,en}.json` and `locales.ts`, where `zh` is the typed key source
  and `en` is checked against it; 290 TypeScript files reference `zh`). They are inert data and
  the GUI is English for an English browser, but every new UI string needs a `zh` entry and
  `ctx.locale.register(ns, { zh, en })` requires both. Options: (a) leave as is; (b) make `zh`
  optional in `packages/client/locale` so new namespaces ship `en` only, a one-package change;
  (c) remove `zh` everywhere, a 290-file refactor with permanent upstream merge conflicts. Start
  with (b) when the first FlowLeap client plugin needs copy.
- **DeepSeek-specific plugins** (`llm-deepseek*`, `credentials/deepseek-account*`,
  `web-search-deepseek`, `ui-brand-official`, `ui-deepseek-model-label-*`,
  `plugin-package-inventory-deepseek`) stay in the tree; the FlowLeap profile just does not mount
  them. Deleting them is a later cleanup, after the profile exists.
- **Branding**: `ui-brand-official` is profile-gated. A FlowLeap brand package occupies the
  sidebar and hero slots; see `packages/client/ui-brand-official/README.md` "Replacing the brand".

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
