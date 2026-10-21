# DeepSeek Harness as a Patent AI web harness: assessment

Research date: 2026-10-21. Source: `deepseek-ai/deepseek-harness` at `master`, pushed 2026-10-17,
MIT, TypeScript monorepo (pnpm, Cordis plugin runtime). Status: developer preview, no security
audit, "THERE WILL BE COMPATIBILITY-BREAKING CHANGES" (README, SAFETY.md).

## Answer

Yes. A Patent AI agent on `dsh` needs no fork and almost no harness code, and the "all models,
all providers" part is already solved by `dsh` itself. The real cost is not the build. It is a
third chat surface to keep in step with the IDE and the CLI, on a harness that changes under us.

## What dsh already is

| Need | dsh package | Fact |
|---|---|---|
| Any model, any provider | `llm/llm-pi-ai` | Ships provider ids `anthropic`, `openai`, `moonshotai`, `zai` and more. Custom providers over three wire protocols: OpenAI Chat Completions, OpenAI Responses, Anthropic Messages. OpenRouter is one custom provider row. |
| BYOK UI | `client/ui-settings-models` | Settings → Models. Keys are write-only, stored in `$DSH_HOME/.credentials.yaml`, env fallbacks shown. |
| External tools | `mcp/mcp-client` | One config row per MCP server, stdio or Streamable HTTP, `headers.Authorization`. Tools appear as `mcp__<server>__<tool>`. |
| Skills | `skill/skill-filesystem` | Reads `<name>/SKILL.md` with `name` and `description` frontmatter from `.agents/skills`, `~/.agents/skills`, `customSkillDirs`, `bundledSkillDir`. Same format as our bundled skills and the plugins pack. |
| System prompt | `core/system-prompt` | `personaPrefix`, ordered sections, `includeHarnessIdentity: false` removes the DeepSeek opener. |
| Web UI | `bundle/web-app`, `client/*` | Sessions, files sidebar, terminal, document preview, deliverables, plan mode, subagents, plugin market. `dsh web` on 127.0.0.1:3080. |
| Public hosting | `docs/user/guide/public-deployments.md` | Reverse proxy with `--public-url` and `--trusted-host`, or native TLS. Auth is a launch token plus a signed session cookie for one process. |
| Eval runner | `bundle/headless`, `bundle/sdk-app`, Python SDK | One-shot runs and JSON-RPC driving of the same profile. |
| DeepSeek-only parts | `llm-deepseek*`, `credentials/deepseek-account*`, `web-search-deepseek`, `ui-brand-official` | All plugins. A profile that omits them is a patch file, not a fork. |

## What a Patent AI profile is

A `dsh` profile is a stack of bundles plus a `cordis.patch.yml`. The Patent AI profile is four
rows on top of `dsh-base` and `dsh-web-app`:

1. `dsh-mcp-client`, `transport: streamable-http`, pointed at the hosted FlowLeap MCP server
   (flowleap-backend, 54 tools, `server_info` verified live today), `Authorization: Bearer
   <FlowLeap token>`. No tool porting. This is the surface ADR 0018 decision 6 already names
   ("the hosted MCP catalog follows the same owner rule").
2. `dsh-skill-filesystem` with `bundledSkillDir` at the flowleap-plugins skill pack. Use the pack
   variants, not the IDE's bundled copies: the pack skills speak the backend facade, so their tool
   references match `mcp__flowleap__*`; the IDE copies name in-app typed tools that do not exist
   here.
3. `dsh-system-prompt` with `includeHarnessIdentity: false` and the Patent Agent prompt as
   `personaPrefix`. The prompt must lose its typed-tool routing lines first. ADR 0018 is already
   moving it there (target under 6,000 words, routing carried by tool descriptions).
4. `llm-pi-ai` providers: `anthropic`, `openai`, plus one custom `openai-completions` row for
   OpenRouter (the trial-provisioned key path of ADR 0015) and one for Mistral.

Nothing above is TypeScript. A first version is a repository with a `package.json` `dsh.bundle`
field, a patch file, and the skills folder.

## What it is not

- **Not multi-tenant.** One `dsh web` process serves one user; the printed URL "carries a
  process credential, so share it only with intended users". Hosting is one process in one
  isolated environment per user behind a Clerk gate. That is exactly ADR 0011 decisions 2 and 4,
  with `dsh web` in the place of `reh-web`. It does not remove the per-user VM.
- **Not the IDE.** No editor, no drafting gate actions (PRD 0025 preview-title buttons), no
  drawings viewer, no Prompts view. dsh has a document preview sidebar and `tool-present`
  deliverables. An attorney gate would be a new Web Client Chat node (`ConversationNodeDefinition`
  plus a renderer), which is harness code.
- **Not stable.** Developer preview, 22,395 commits, breaking changes promised. Pin a version;
  every upgrade is a re-run of our gates.
- **A third surface.** ADR 0011 rejected "a separate web chat page (a third chat surface to keep
  in step, without files or skills)". dsh has files, a terminal and skills, so half the reason
  falls, but the sync cost stands. We already carry four skill copies (memory: sessions skills
  hazard). This adds a fifth place the prompt and the skill list must match.
- **Security.** The model runs shell inside the user's environment. SAFETY.md says do not rely on
  the sandbox. Same stance as ADR 0011: isolation is the control.

## Data over MCP, work as native tools

The 44 typed tools of agent-v2 split in two, and the split decides what the dsh profile needs.

| Group | Count | Examples | In dsh |
|---|---|---|---|
| Backend data reads | about 30 | `search_patents`, `get_legal_status`, `get_patent_family`, `search_register`, `search_citations`, `get_continuity`, `search_academic`, `search_npl`, `patstat_*`, `get_patent_summary`, `compare_patents` | MCP. The hosted server fronts the same backend facade and lists the same operations. The typed shells exist only because VS Code's tool API needs one per tool. |
| Work on the user's machine | about 13 | `write_patent_results`, `read_pdf`, `start_application_draft`, `validate_draft`, `export_draft_docx`, `remove_claim`, `inventor_questions`, `render_figure`, `build_drawing_set`, `propose_figure_part`, `compare_claims`, `patent_analytics_viz`, `patent_search_subagent` | Native dsh tool plugins. A hosted server never sees local files. dsh covers the subagent, PDF reading and a deliverables viewer itself; the writer with validation, the drafting gates and the drawings are the port. |

MCP is correct for the data half because ADR 0018 decision 2 already put data knowledge in the
tool schema, the result text and the backend grammar. An MCP server carries schema and result
text verbatim, so one fix reaches the IDE, the CLI pack and dsh at once. A typed copy in dsh would
be a fourth place to drift.

Gaps and fixes:

- The server lists 54 tools; ADR 0018 targets at most 30. Fix on the backend: a profile parameter
  on the MCP endpoint that returns the default set. The IDE and CLI then share it.
- Names carry the `mcp__flowleap__` prefix. The prompt and the skills must not hard-code bare
  tool names. The pack skills already avoid names (ADR 0018 decision 5).
- The native half is TypeScript: one `dsh-tool-patent-deliverables` plugin for the results writer,
  the drafting state machine with its gates, and the drawings. Phase 2 of the spike.

## Three ways to use it

| Option | What ships | Cost | Why |
|---|---|---|---|
| A. Plugin bundle for the dsh ecosystem | `flowleap-patent-ai` bundle: MCP row, skill pack, prompt. Topic `dsh-plugin`. | Days. No harness code. | 256k-star ecosystem, every provider, BYOK, zero hosting. A distribution and marketing channel, not a product surface we operate. |
| B. Hosted Workspace variant | Option A profile run per user behind the ADR 0011 gate and key proxy. | Weeks. nginx, proxy, Clerk gate already exist for reh-web. | A lighter browser surface than the full IDE for keyless users. Loses editor and gates. |
| C. Replace the IDE agent loop | Patent Agent moves to dsh. | Months. Re-make the gates, the evals, the drafting UI. | No. Decided against by ADR 0009 and PRD 0018 (agent host is the only Claude; the IDE is the product). |

## Recommendation

Run option A as a two-day spike before any PRD. Done when: `dsh web` on the laptop, DeepSeek
rows removed, FlowLeap MCP tools listed, the plugins skill pack in the catalog, the Patent Agent
prompt as persona, one Anthropic and one OpenRouter provider, and the three skill-grounded cases
(prior art, dossier, FTO) run by hand with the result compared against the IDE's trajectory
gate output for the same model. The spike answers the one open question: does the quality the
gates measure survive when the typed tools become MCP tools and the prompt loses its routing.
ADR 0018 decision 1 predicts yes; the spike is the proof. Option B is decided only after that,
and only if the hosted evaluators ask for a lighter surface than the IDE.

## Pointers

- Architecture: `docs/architecture.md` ("Where new behavior goes" table), `docs/cookbook/adding-an-llm-adapter.md`.
- Providers: `docs/user/guide/providers.md`. Hosting: `docs/user/guide/public-deployments.md`.
- MCP: `packages/mcp/mcp-client/README.md`. Skills: `packages/skill/skill-filesystem/README.md`.
- Prompt: `packages/core/system-prompt/README.md`.
- Our side: ADR 0011 (hosted workspace), ADR 0018 (harness is the product), ADR 0006 (plugins monorepo and MCP registry).

## UI: what dsh gives, what it lacks

| Need | dsh | Verdict |
|---|---|---|
| Deliverables | `present` tool, delivery cards, changed-files card with per-file diff review tab, prose path links | Covered |
| Reports | Files the agent writes; DOCX/XLSX/PPTX to PDF on the host (`office-to-pdf`, LibreOffice) | Covered |
| View PDF | Right-sidebar Document Preview, PDF.js, text selection, zoom, auto-refresh on change | Covered |
| View Markdown, code, images, HTML, Excel, Word | Same preview, one renderer per kind, pluggable registry | Covered |
| User edits a file | None. Every preview is read-only; no Monaco or CodeMirror in the client. Desktop offers "open in default app" | Gap. Needs an editor plugin as a right-sidebar tab type |
| Agent edits a file | `write`, `edit`, `str_replace_editor`, bash | Covered |
| Branding | Leave out `ui-brand-official`, mount a package that fills the sidebar and hero slots | Small React package |
| Theme | `ui-theme` tokens, light/dark, CSS Modules, no Tailwind | Covered |
| Custom chat cards (attorney gate buttons) | `ConversationNodeDefinition` + React renderer, documented in `docs/subsystems/conversation.md` | Real TypeScript work |
| Settings pages | Cookbook "adding a settings card" | Covered |
| Layout | Docked tabbed panes, split, drag, undo (`ui-dockkit`) | Covered |

Client plugins are packages with a `dsh.client` declaration and a built browser bundle. Rows
enable or disable in the profile patch and hot-reload. UI changes are rebuild-and-deploy, not file
drops, and a page runs only plugins from the host release it booted with.
