---
description: "The FlowLeap Patent Agent layer over the dsh web profile: the patent preset as default, the FlowLeap brand, DeepSeek rows off, the office connectors, the paid FlowLeap tools, the skill pack, a file-backed patent persona, and Anthropic, OpenRouter and Mistral routes."
kind: "package-bundle"
---

# @deepseek-ai/dsh-flowleap-web

## Summary

`dsh-flowleap-web` turns `dsh web` into the FlowLeap Patent Agent harness. The shipped `flowleap-web` profile stacks it over `dsh-base` and `dsh-web-app`: the `patent` preset is the default, the FlowLeap brand fills the sidebar, hero, title and product copy from `brand/brand.json`, every DeepSeek-specific row is off, the 21 paid FlowLeap MCP tools register beside the in-process office tools and the native `read_pdf`, the flowleap-plugins skill pack joins the catalog, a Markdown file supplies the persona, and Anthropic, OpenRouter and Mistral are the model routes. One process serves one user; the `flowleap` CLI must be on `PATH` and signed in.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### Install into a profile

The shipped `flowleap-web` profile already stacks `dsh-base`, `dsh-web-app`, and this bundle; `dsh --profile flowleap-web web` creates it on first use. A custom profile adds the layer the usual way; in-box bundles resolve from the dsh installation:

```text
dsh plugin --profile <name> add @deepseek-ai/dsh-flowleap-web
dsh plugin --profile <name> remove @deepseek-ai/dsh-flowleap-web
```

The layer patches rows that `dsh-base` and `dsh-web-app` insert, so a profile that lists it without those two bundles has nothing to patch and gains only the inserted rows.

### What you get

| Row | Package | Effect |
|---|---|---|
| `preset-patent` | [`dsh-agent-preset`](../../preset/agent-preset/README.md) | The `patent` composition from `presets/patent.patch.yml`: the `standard` plugin list (bash or pwsh, fs, fs-search, jobs, schedule, skills, goals, planning, compaction, delegation, todo, web, present) without the `dsh-persona` row, named "Patent Agent", first in the picker |
| `agent-preset-registry` | [`dsh-agent-preset-registry`](../../preset/agent-preset-registry/README.md) | `default: patent`; `standard`, `ptc`, `minimal` and `cordis` stay selectable |
| `ui-brand-flowleap` | [`dsh-client-ui-brand-flowleap`](../../client/ui-brand-flowleap/README.md) | The brand from `FLOWLEAP_BRAND_PATH`, else this bundle's `brand/brand.json` (FlowLeap Patent AI, the FlowLeap mark): sidebar mark and name, hero mark, document title, and the product copy that named DeepSeek Harness |
| `mcp-flowleap` | [`dsh-mcp-client`](../../mcp/mcp-client/README.md) | `flowleap mcp` over stdio; `tools.include` narrows the row to the 19 paid tools the backend keeps (PATSTAT, enriched citations, examiner baseline, images, analytics, `get_fulltext` for US full text), registered as `mcp__flowleap__<tool>`, 120 s per call, a failed connection logs and the harness still starts. OCR left this row in C3: `ocr` and `read_pdf` run natively on the firm's Mistral key |
| `flowleap-connectors` | [`dsh-flowleap-connectors`](../../host/flowleap-connectors/README.md) | The 34 office tools of `@flowleap/connectors` minus `get_fulltext` (33 native, `ocr` among them) plus the native `read_pdf`, on the firm's EPO OPS, USPTO ODP, Semantic Scholar and Mistral keys from the credential store |
| `flowleap-deliverables` | [`dsh-flowleap-deliverables`](../../host/flowleap-deliverables/README.md) | `write_patent_results` with the Patent AI report templates, validation against the evidence ledger this row records from the office and paid MCP tool results, the `<stem>.working-record.md` and `<report>.evidence.json` companions, the delivery card, and the one-time report-not-written steer; `export_draft_docx` and `inventor_questions` with the Application Drafting layer, writing Word files through the host filesystem (a local workspace); `secondRead: render` on the session's model |
| `ui-settings-flowleap-connectors` | [`dsh-client-ui-settings-flowleap-connectors`](../../client/ui-settings-flowleap-connectors/README.md) | Settings > Patent data connectors, one card per connector with Test connection, and the first-run key wizard |
| `flowleap-agent-builder` | [`dsh-flowleap-agent-builder`](../../host/flowleap-agent-builder/README.md) | One agent preset for each folder below `$DSH_HOME/agents` (and the read-only `firmRoot` when set), built on `patent` with the agent's instructions, its files in the system prompt up to 50 000 estimated tokens or through `search_agent_files` and `read_agent_file` above it, and only the chosen connectors; the `flowleapAgents` Remote and the upload route of the agent form |
| `ui-flowleap-agent-builder` | [`dsh-client-ui-flowleap-agent-builder`](../../client/ui-flowleap-agent-builder/README.md) | The New agent and Edit agent rows in the agent picker and the agent form |
| `ui-flowleap-routines` | [`dsh-client-ui-flowleap-routines`](../../client/ui-flowleap-routines/README.md) | The Needs review mark of routine runs: a Sidebar row badge, the Needs review page, Mark as done in the chat header, and a Needs review tab on the Automation tasks page |
| `flowleap-prompt` | [`dsh-flowleap-prompt`](../../host/flowleap-prompt/README.md) | The `flowleap:patent-agent` section from `FLOWLEAP_PROMPT_PATH`, else this bundle's `prompt/patent-agent.md` placeholder |
| `system-prompt` | [`dsh-system-prompt`](../../core/system-prompt/README.md) | `includeHarnessIdentity: false`, no persona prefix |
| `llm-pi-ai` | [`dsh-llm-pi-ai`](../../llm/llm-pi-ai/README.md) | `anthropic`, `openrouter`, `mistral` routes keyed by `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY` |
| `agent-default-model` | [`dsh-agent-default-model`](../../core/agent-default-model/README.md) | `anthropic` / `claude-sonnet-5-5` |
| `skill-filesystem` | [`dsh-skill-filesystem`](../../skill/skill-filesystem/README.md) | Re-enabled as the global-layer `flowleap` provider scanning only `FLOWLEAP_SKILLS_DIR`, else the flowleap-plugins checkout path; each preset keeps its own `filesystem` provider for project and user roots |

Disabled rows: `deepseek-llm-api-extensions`, `session-log-deepseek`, `plugin-package-inventory-deepseek`, `deepseek-account`, `llm-deepseek`, `llm-deepseek-account`, `web-search-deepseek`, `web-deepseek-api`, `ui-settings-account`, `account-controller`, `ui-brand-official`, `ui-deepseek-model-label-1017`, `ui-settings-web-search`, `ui-settings-session-log`. Their packages stay in the installation.

### The budget warning of the model gateway

The firm's model gateway sends `x-flowleap-budget-warning` from 80 % of a monthly budget (flowleap-harness#32). The `anthropic` and `openrouter` routes name it in `noticeHeaders`, so `llm-pi-ai` emits `llm/response-notice` for the Session, the Host forwards it to the peers that may read that Session, and the composer shows "Notice from the model gateway: <text>" in the attorney's language. The gateway text itself is English. The model never sees the warning and the Session log does not hold it. A firm overlay that restates the `llm-pi-ai` row restates `noticeHeaders` too.

Environment the layer reads: `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY` (through the credential seam), `FLOWLEAP_PROMPT_PATH`, `FLOWLEAP_SKILLS_DIR`, `FLOWLEAP_BRAND_PATH`. The `flowleap` CLI brings its own session token; `flowleap mcp --check` prints its readiness.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The bundle declares two patch files in `dsh.bundle.patch`, applied in order. `cordis.patch.yml` is id-targeted overrides followed by one `insert` list. Each override replaces the targeted row's whole `config`, so the `system-prompt` row restates only `includeHarnessIdentity` and inherits the empty persona defaults, and the `agent-preset-registry` row restates only `default`. The `flowleap-prompt` and `ui-brand-flowleap` rows' `path` values are `!!js` expressions: the environment variable when set, otherwise the package resource (`prompt/patent-agent.md`, `brand/brand.json`) resolved with `createRequire` from the launching installation's `installAnchor`, because a bundle row has no notion of its own directory. `presets/patent.patch.yml` inserts the `patent` declaration the same way `dsh-web-app` inserts its presets; it omits `dsh-persona` because `deployment:persona-prefix` and `flowleap:patent-agent` both sit at order 0 and tie-break by name, so an empty prefix is what puts the patent identity first. `src/index.ts` exports only the two data files' package-relative paths; the bundle mounts no plugin of its own.

### Source map

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | The FlowLeap layer over `dsh-base` and `dsh-web-app` |
| [`presets/patent.patch.yml`](presets/patent.patch.yml) | The `patent` agent preset declaration |
| [`brand/brand.json`](brand/brand.json), [`brand/flowleap-mark.svg`](brand/flowleap-mark.svg) | The default brand and its mark |
| [`prompt/patent-agent.md`](prompt/patent-agent.md) | The Patent Agent prompt export from agent-v2 |
| [`src/index.ts`](src/index.ts) | `PROMPT_FILE` and `BRAND_FILE`, the data files' package-relative paths |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Bundle package map](../README.md) — the surfaces built on the same core.
- [dsh-web-app](../web-app/README.md) — the browser layer this bundle patches.
- [app-boot profiles](../../boot/app-boot/README.md) — how layers compose and where the profile's own patch goes.
- [FlowLeap handoff](../../../HANDOFF.md) — the slices this bundle is the first of.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-mcp-client` and `dsh-flowleap-prompt`, which own the `mcp__flowleap__*` tool schemas and the `flowleap:patent-agent` section; this bundle only composes their rows.

#### KV Cache effect

The bundle adds no request tokens of its own; the mounted rows' packages state their prefix behavior.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits are what the layer needs from its host and what later slices replace.

- **Needs the `flowleap` CLI on `PATH`, signed in** — without it the MCP row logs a connection error and the agent has no patent tools; the harness still starts.
- **The skill-pack default is a checkout path** — `FLOWLEAP_SKILLS_DIR` must point at the pack on any other machine; a release will vendor the pack.
- **The shipped presets still say "coding agent"** — `standard`, `ptc`, `minimal` and `cordis` keep their `dsh-persona` row, so a user who selects one of them puts `You are a coding agent powered by the {{model}} model.` ahead of the patent prompt; only `patent` omits it.
- **The patent preset duplicates standard's plugin list** — a change to `dsh-web-app/presets/standard.patch.yml` reaches `presets/patent.patch.yml` only by hand; compare the two after an upstream merge.
- **DeepSeek text remains in served bundles** — the disabled rows' client bundles and the dictionaries of mounted rows still contain the vendor name; the brand package replaces only what renders in this profile, and the favicon and web manifest stay the shell's.
- **No `openrouter/auto` and no non-catalog gateway** — add a hand-declared route in the profile patch when needed.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
