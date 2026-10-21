---
description: "The FlowLeap Patent Agent layer over the dsh web profile: DeepSeek rows off, the FlowLeap MCP server's tools, the flowleap-plugins skill pack, a file-backed patent persona, and Anthropic, OpenRouter and Mistral routes."
kind: "package-bundle"
---

# @deepseek-ai/dsh-flowleap-web

## Summary

`dsh-flowleap-web` turns `dsh web` into the FlowLeap Patent Agent harness. The shipped `flowleap-web` profile stacks it over `dsh-base` and `dsh-web-app`: every DeepSeek-specific row is off, the hosted FlowLeap MCP server's 54 patent tools register through the signed-in `flowleap` CLI, the flowleap-plugins skill pack joins the skill catalog, a Markdown file supplies the persona, and Anthropic, OpenRouter and Mistral are the model routes. Run `dsh --profile flowleap-web web`. The boundary: one process serves one user, and the `flowleap` CLI must be on `PATH` and signed in.

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

The layer patches rows that `dsh-base` and `dsh-web-app` insert, so a profile that lists it without those two bundles has nothing to patch and gains only the two inserted rows.

### What you get

| Row | Package | Effect |
|---|---|---|
| `mcp-flowleap` | [`dsh-mcp-client`](../../mcp/mcp-client/README.md) | `flowleap mcp` over stdio; tools register as `mcp__flowleap__<tool>`, 120 s per call, a failed connection logs and the harness still starts |
| `flowleap-prompt` | [`dsh-flowleap-prompt`](../../host/flowleap-prompt/README.md) | The `flowleap:patent-agent` section from `FLOWLEAP_PROMPT_PATH`, else this bundle's `prompt/patent-agent.md` placeholder |
| `system-prompt` | [`dsh-system-prompt`](../../core/system-prompt/README.md) | `includeHarnessIdentity: false`, no persona prefix |
| `llm-pi-ai` | [`dsh-llm-pi-ai`](../../llm/llm-pi-ai/README.md) | `anthropic`, `openrouter`, `mistral` routes keyed by `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY` |
| `agent-default-model` | [`dsh-agent-default-model`](../../core/agent-default-model/README.md) | `anthropic` / `claude-sonnet-5-5` |
| `skill-filesystem` | [`dsh-skill-filesystem`](../../skill/skill-filesystem/README.md) | Re-enabled as the global-layer `flowleap` provider scanning only `FLOWLEAP_SKILLS_DIR`, else the flowleap-plugins checkout path; each preset keeps its own `filesystem` provider for project and user roots |

Disabled rows: `deepseek-llm-api-extensions`, `session-log-deepseek`, `plugin-package-inventory-deepseek`, `deepseek-account`, `llm-deepseek`, `llm-deepseek-account`, `web-search-deepseek`, `web-deepseek-api`, `ui-settings-account`, `account-controller`, `ui-brand-official`, `ui-deepseek-model-label-1017`. Their packages stay in the installation.

Environment the layer reads: `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY` (through the credential seam), `FLOWLEAP_PROMPT_PATH`, `FLOWLEAP_SKILLS_DIR`. The `flowleap` CLI brings its own session token; `flowleap mcp --check` prints its readiness.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The patch is id-targeted overrides followed by one `insert` list. Each override replaces the targeted row's whole `config`, so the `system-prompt` row restates only `includeHarnessIdentity` and inherits the empty persona defaults. The `flowleap-prompt` row's `path` is a `!!js` expression: `FLOWLEAP_PROMPT_PATH` when set, otherwise `@deepseek-ai/dsh-flowleap-web/prompt/patent-agent.md` resolved with `createRequire` from the launching installation's `installAnchor`, because a bundle row has no notion of its own directory. `src/index.ts` exports only the placeholder's package-relative path; the bundle mounts no plugin of its own.

### Source map

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | The FlowLeap layer over `dsh-base` and `dsh-web-app` |
| [`prompt/patent-agent.md`](prompt/patent-agent.md) | Placeholder persona until the agent-v2 export lands |
| [`src/index.ts`](src/index.ts) | `PROMPT_FILE`, the placeholder's package-relative path |

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
- **The persona is a placeholder and the presets still say "coding agent"** — every shipped preset mounts a `dsh-persona` row with `You are a coding agent powered by the {{model}} model.`, which a bundle layer cannot edit without replacing the preset's whole plugin list; the model sees that line before the `flowleap:patent-agent` section until the S2 `complete: true` export or a FlowLeap preset replaces it.
- **No brand and no account card** — the DeepSeek brand and account rows are off and nothing replaces them; the FlowLeap brand package and settings are the S3 slice.
- **No `openrouter/auto` and no non-catalog gateway** — add a hand-declared route in the profile patch when needed.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
