---
description: "FlowLeap deliverable tools for the harness: write_patent_results with the Patent AI report templates, evidence validation against the session's recorded tool results, the working record and evidence companion, the evidence ledger recorder, the delivery card and the report-not-written steer; export_draft_docx and inventor_questions with the Application Drafting layer and the Word builders; for users of the FlowLeap profile and maintainers porting the IDE's deliverable code."
kind: "package-reference"
---

# @deepseek-ai/dsh-flowleap-deliverables

## Summary

`dsh-flowleap-deliverables` is the harness side of the Patent AI deliverables (port plan S5, D1 and D2). One row registers `write_patent_results` with the IDE's report templates and validation, records every data-tool result of a Session in an evidence ledger, writes the report with its working record and evidence companion, shows both on the delivery card, judges each saved row with a second read, and steers a turn that ends without its report. The same row registers `export_draft_docx` and `inventor_questions`: the IDE's Application Drafting layer over `ctx.fs`, writing Word files through the host filesystem. [`SOURCE.json`](SOURCE.json) pins the copied `flowleap-agent-v2` commit.

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

Mount the row beside `dsh-tools`, a `ctx.fs` backend and `dsh-working-directory`; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this after the connectors row, so the office tools' results are recorded. `dsh-storage-domain` and `dsh-llm` are optional: without storage the ledger lives in memory for the process, without a model service every second read is a stated skip.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-flowleap-deliverables'
  config:
    secondRead: render
    secondReadModel: ''
```

| Field | Default | Meaning |
|---|---|---|
| `secondRead` | `render` | `off` disables the second read; `log` records the verdicts in `<report>.second-read.json` and in the working record; `render` also names in the tool result what the independent read did not confirm, so the model revises or defends each row |
| `secondReadModel` | `''` | `provider/model` the judge runs on (`openrouter/anthropic/claude-sonnet-5-5`); empty means the session's own logged route |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-flowleap-deliverables) is the exhaustive source for every accepted field.

### `write_patent_results`

The tool name and the input schema are the IDE's (`contributes.languageModelTools` in flowleap-agent-v2 at the pinned commit; `scripts/flowleap/sync-deliverables.sh --check` lists drift). The description carries the contract only; every per-template rule lives in the refusal that names the row and the fix (ADR 0018 decision 4).

| Save | What happens |
|---|---|
| Free-form (no `template`) | `content` is written as given under `filePath`; the result says `Free-form artifact: evidence validation was not performed.` |
| `prior-art-report`, `find-better-report`, `invalidity-claim-chart` with `coverage` | `content` must be empty; the report body is generated from the coverage rows after `validateCandidateReview` checks every anchor and quote against the Session's ledger; the working record, the evidence companion and (when judged) the second-read verdicts are written beside the report; the result carries the chat summary contract, the receipt line and `Working record: <path>` |
| `fto-memo`, `eou-infringement-chart`, `office-action-scaffold`, `patentability-opinion`, `landscape-report`, `portfolio-due-diligence-memo`, `invalidity-claim-chart` without `coverage` | `content` is the body, refused when empty or a placeholder; the template wraps it and appends the generated provenance appendix (figures, dates, quotations and the recorded calls) |
| `draft-application`, `draft-outline` | Refused: `Draft was not saved. The draft-application template is not available in this harness yet …` until S5 D3 ports the Application Drafting layer |

`filePath` is relative to the Session's working directory or absolute inside it; a path outside it is refused before any write (`Error: Patent result writes must stay within the working directory <cwd>.`). Parent folders are created. A refused structured save reads, for example:

```text
Candidate draft was not saved. Correct these issues and retry with the revised content:
- Quotation for EP1000000A1:claims:2:en is not found in its recorded text. Copy the passage verbatim from the get_claims or get_description result; do not paraphrase or merge lines.
```

Every successful save ends with `Delivered to the user; do not call `present` for these files.` The plugin presents the report and the working record itself (see below); the evidence and second-read JSON files are not presented.

### Files beside the report

| File | Name | Replaced by |
|---|---|---|
| Report | `<filePath>` | every save |
| Working record | `<stem>.working-record.md` (PR #372: a stable name, so a refinement save replaces the record of the run it refines) | every structured save |
| Evidence companion | `<report>.evidence.json` | every structured save |
| Second-read verdicts | `<report>.second-read.json` | every judged save |

The IDE writes `<report>.<uuid>.evidence.json` and sweeps superseded companions; `ctx.fs` has no delete, so the harness uses stable names. The receipt binds the report digest and the evidence digest, so nothing is lost.

### `export_draft_docx` and `inventor_questions`

Both tools work on one matter folder, `drafting/<matter>/` under the working directory (the IDE's folder contract, PRD 0020). The tool names and input schemas are the IDE's; `matter` is the folder name under `drafting/`, refused when it is empty, starts with a dot or holds a path separator.

| Call | What happens |
|---|---|
| `export_draft_docx { matter }` | Reads the `approved` gate of `claims.md` (an `approved: true` without `approvedHash` is bound to the claims body; a changed body withdraws the approval and records it), requires `draft-application.md`, `draft-application.generated.md` and `claims.md`, re-runs the validators and writes `findings.md` (waivers kept); refuses while an Error or an Inventor Question is open and unwaived, naming each item and the open steps of `checklist.md`. Else it logs the attorney's edits against the generated snapshot in the Working Record, writes `draft-application.description.docx`, `.claims.docx` and `.abstract.docx` with the office page setup (EPO: Rule 49 EPC, A4, page numbers top, line numbers every five lines; US: 37 CFR 1.52, letter, page numbers bottom), `filing-manifest.md` (claims, drawing sheets, abstract figure, estimated pages) and `draft-application.full.docx` (the review copy, marked not for filing), records the export hash, writes `checklist.md` and presents the five files |
| `inventor_questions { matter, action: "send" }` | Writes `inventor-questions.docx` from `inventor-answers.md`: a heading, one sentence for the inventor and a four-column table (No., Question, Where the answer goes, Your answer) with one row per open question; refuses when no question is open, or when the existing document holds answers not imported yet; presents the file |
| `inventor_questions { matter, action: "import", file? }` | Reads the answered `.docx` (default `drafting/<matter>/inventor-questions.docx`; a `.md` in the format of `inventor-answers.md` is accepted) and copies each answer into the empty current `**Answer:**` slot of its question, never over a filled one; the result names the ids filled, kept and unknown; presents `inventor-answers.md` when it changed |

Every call rewrites `drafting/<matter>/checklist.md` and ends with the Drafting Checklist line (the next step for the attorney, or the open steps after a refusal) and the chat advice (`Stay in this chat.`, or a new chat after the same refusal twice). The gate sentences name the file edit only: `Review \`drafting/<matter>/claims.md:3\`, then change \`false\` to \`true\` on line 3.` The IDE's editor buttons ("click **Approve Claims** at the top of the file", "click **Waive…**") have no counterpart here; the question card and the slash command arrive with S5 D3.

### Word files and the host filesystem

`ctx.fs` writes UTF-8 text only, so the Word files go through the host filesystem: the target is resolved and fenced through `ctx.fs`, its process path is taken as the host path only when `processPathFromHostPath()` maps it back to the same file (the rule `ui-deliverables` uses before a native open), and the bytes are published atomically with `dsh-atomic-write`, mode `0644`. A Session whose filesystem is not the host's (SSH, a sandbox) is refused: `Word export needs a local workspace: …`. There is no in-browser editor: the attorney opens a presented `.docx` on the delivery card (the right-Sidebar preview converts it to PDF through [`office-to-pdf`](../../document/office-to-pdf/README.md)), edits the exported Word file in Word, or asks the agent to change the draft and export again.

### The evidence ledger

`tools/result` is observed for the data tools, and each settled call becomes one record in the owning Session's ledger (host state in `ctx.storageDomain`, domain `flowleap_deliverables_ledger`, one append-only list per Session id; no Session event). Two modes, decided per result:

| Mode | When | What is recorded |
|---|---|---|
| **structured** | the result carries the connector library's `sources` field (flowleap-backend #611: `anchor`, `reference`, `language?`, `text?`, `retrieval`) | each entry straight into the ledger after the untrusted-record check |
| **derived** | no `sources` field (the vendored library before #611, the paid MCP tools) | sources derived from the result's own `documentReference` fields and claim list with the IDE's `evidenceAnchor`, so the anchors are the IDE's (`EP1000000A1:claims:2:en`); the full result text is kept, capped at 120,000 characters; a `tools/post-execute` projection appends the IDE's `[source anchor: …]` labels to `get_claims`, `get_description`, `get_abstract` and `get_bibliography` results so the model can cite them |

**Active mode today: derived.** The vendored `@flowleap/connectors` copy predates #611; once it is re-synced the recorder switches to structured per result and the label projection falls silent. The first record of each mode is logged at info level.

Recorded tools: `search_patents` (`search`); `get_claims`, `get_description`, `get_abstract`, `get_bibliography`, `get_fulltext` (`details`, with sources); `get_legal_status`, `get_patent_family`, `get_patent_term`, `get_register_events` (`status`, full text); `examiner_baseline`, `patstat_query`, `patstat_portfolio`, the other `patstat_*` (as `patstat_graph`), `patent_analytics` (as `patent_analytics_viz`), `web_fetch` (as `fetch_webpage`), `read_pdf`, `bash`/`pwsh` (as `run_in_terminal`) (`analytics`, full text). The `mcp__flowleap__` prefix of the paid row is dropped before the name is matched.

### The delivery card and the steer

After a successful save the writer queues the report and the working record, and this plugin's own `tools/result` listener appends `deliverables/presented` keyed by the writer's call id: the event type `dsh-tool-present` declares, so the Web card shows the two files and a click opens the Markdown preview in the right Sidebar.

At `agent/turn-stopping`, when the turn asked for a prior-art report, an invalidity chart or a Find Better report and ends without a current structured receipt (or with the report changed on disk, or with research after the save, or an invalidity chart whose receipt lists open points but no Round Report), the plugin steers the IDE's reason into the turn once through `agent.steer()`; the turns are folded from the Session's own events, never read synchronously.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`apply` builds one `PatentLedger`, attaches the storage table when `storageDomain` is mounted (`ctx.inject`), builds the judge when `llm` is mounted, registers the recorder (`tools/result` observer plus the `tools/post-execute` label projection), the delivery listener, the completion guard (`session/event` fold plus `agent/turn-stopping`), and the writer through `registerDeliverableTools` (all or nothing, like the connectors' `registerOfficeTools`).

The writer keeps the IDE's flow: Find Better inputs and the content requirement are checked before any path resolution; the path is resolved through `ctx.fs` against `ctx.workingDirectory.ensure(agent)` and refused outside it; the ledger snapshot materializes numbered claims into the rows; `validateCandidateReview` (and for a chart `roundOrderErrors`/`roundAnswerErrors`) refuses with one line per issue; the second read runs before the write so the receipt covers the final bytes; the evidence companion is written, then the report, then the verdicts, then the working record (a record failure is a warning and an unnamed record); the receipt binds process paths and SHA-256 digests; an invalidity save is marked in the ledger for #725. Telemetry (`recordReportSaved`) is dropped: the harness has no FlowLeap telemetry (ADR 0019).

Three strings differ from the IDE on purpose: the refusals that named `get_patent_details(…, evidenceLookup: {})` and `evidenceLookup` now name `get_claims or get_description`, the Search Round refusal names `web_fetch` instead of `patent_api_request or fetch_webpage`, and the provenance appendix labels a `details` record `get_claims`. Citations render as plain anchors: the IDE's `flowleap://` reader link has no reader pane here.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Config, `apply`, public exports |
| [`src/register.ts`](src/register.ts) | all-or-nothing tool registration |
| [`src/writer.ts`](src/writer.ts), [`src/writer-schema.ts`](src/writer-schema.ts) | the tool shell on `ctx.fs`; the IDE's input schema verbatim and the contract-only description |
| [`src/judge.ts`](src/judge.ts) | the second read on `ctx.llm.prepareCall()` |
| [`src/present.ts`](src/present.ts) | the delivery queue and the `deliverables/presented` append |
| [`src/tools/`](src/tools/) | `export_draft_docx` and `inventor_questions` (the IDE's tool shells on the dsh seams) and what they share (`shell.ts`) |
| [`src/drafting/`](src/drafting/) | the IDE's Application Drafting layer, 22 pure modules copied with import rewrites (`lcs-diff.ts` replaces the VS Code diff module), and `workspace.ts`, the `DraftingWorkspace` file I/O rewritten onto `ctx.fs` |
| [`src/docx/`](src/docx/) | the IDE's Word builders on `docx` (loaded on the first build, see `lib.ts`) and the `mammoth` reader of the answered questions |
| [`src/bytes.ts`](src/bytes.ts) | the guarded host-path byte write |
| [`src/report/`](src/report/) | the IDE's report core: templates, provenance, second-read prompt and parsing, candidate review, Find Better, Fallback Ladder, receipt, document reference, text helpers |
| [`src/ledger/`](src/ledger/) | the IDE's ledger vocabulary (`types.ts`), the per-Session store over `ctx.storageDomain` (`store.ts`), the recorder and its two modes (`recorder.ts`) |
| [`src/guard/`](src/guard/) | the completion check (`completion.ts`), the Session-event fold (`turn-tracker.ts`), the steer (`steer.ts`) |
| [`SOURCE.json`](SOURCE.json), [`scripts/flowleap/sync-deliverables.sh`](../../../scripts/flowleap/sync-deliverables.sh) | the agent-v2 pin per copied file and the drift check |
| [`tests/`](tests/) | the IDE's template, provenance, second-read, fallback-ladder, working-record and completion specs ported; the recorder over a fake `tools/result` stream in both modes; the store across a restart; the writer over the real local filesystem with the refused quote, the corrected retry, the presented event and the steer; the 18 drafting specs and the two Word round-trip specs of the IDE (`drafting-*.spec.ts`, `docx-*.spec.ts`, the pipe-clamp fixture matter); the two drafting tools over the real local filesystem (`drafting-tools.spec.ts`) and the byte write's fence and refusal (`bytes.spec.ts`) |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [S5 port plan](../../../flowleap/docs/2026-10-23-s5-deliverables-port-plan.md) — the seam map, the phases and the acceptance this package answers to.
- [dsh-flowleap-connectors](../flowleap-connectors/README.md) — the office tools whose results the ledger records.
- [dsh-tool-present](../../deliverables/tool-present/README.md) — the `deliverables/presented` event this package reuses.
- [ui-deliverables](../../client/ui-deliverables/README.md) — the delivery card the Web client renders.
- [storage-domain](../../storage/storage-domain/README.md) — the `ctx.storageDomain` facility the ledger persists in.
- [dsh-flowleap-web](../../bundle/flowleap-web/README.md) — the profile layer that mounts this row.

-----

<a id="model-experience"></a>
## Model Experience

### `write_patent_results`

#### What the model sees

One tool declaration: the IDE's 25-property input schema (`filePath` and `content` required; `template`, `coverage`, `concepts`, `classifications`, `rounds`, `baseline`, `tracks`, `limitations`, `stopReason` and the rest) with a description of about 150 words that states the contract: what the tool saves, the `filePath` rule, the template list, that structured templates take empty content and coverage checked against the tools' returned evidence, that the save delivers the files, and that a refusal names each field to fix. The generated tool catalog does not list it: it is registered from the IDE's raw JSON Schema, not through `defineTool`, and the row is mounted by the `flowleap-web` profile only. A result is the IDE's text: `Successfully wrote patent results to <filePath>` with the summary contract, the receipt line and the working record path, or a refusal (`Report was not saved. …`, `Candidate draft was not saved. Correct these issues and retry with the revised content:` followed by one line per issue), always ending a success with `Delivered to the user; do not call `present` for these files.` When a turn ends without its report, the next step opens with the steer text as a user-role message, the agent loop's own steering form.

##### Anchor labels appended to a text tool result in derived mode

```markdown
Source anchors for write_patent_results (cite these in sourceAnchors; quote the returned text verbatim):
[source anchor: EP1000000A1:claims:1:en]
[source anchor: EP1000000A1:claims:2:en]
[source anchor: EP1000000A1:claims:en]
```

#### Token effect

One fixed declaration per request while the row is mounted (the schema is the IDE's, about 3,700 words of JSON). The anchor block adds one line per recorded source to a text tool's result in derived mode and nothing in structured mode. A refusal is one line per issue; a success is about ten lines plus the receipt. The second read costs one model call per coverage row that claims disclosure, at most twelve per save, on the firm's key.

#### KV Cache effect

Prefix-stable: the declaration does not change between requests of one process. The anchor block and the steer are appended to results and turns, never to the prompt prefix.

### `export_draft_docx` and `inventor_questions`

#### What the model sees

Two declarations with the IDE's input schemas: `export_draft_docx` takes `matter`; `inventor_questions` takes `matter`, `action` (`send` | `import`) and an optional `file`. The descriptions carry the contract (about 190 and 200 words): what each call writes, what it refuses and that the written files are delivered. A result is the IDE's text: `Exported the description, the claims and the abstract as separate files: …` with the manifest counts and the kept, changed, deleted and added paragraphs; `Wrote drafting/<matter>/inventor-questions.docx: a table of 8 open Inventor Question(s) (IQ-1, …)`; `Copied 3 answer(s) from … in the inventor's words: IQ-1, IQ-3, IQ-6.`; or a refusal that names the blocking items or the gate edit, each ending with the checklist line and the chat advice. A success ends with `Delivered to the user; do not call \`present\` for these files.`

#### Token effect

Two fixed declarations per request while the row is mounted (about 400 words together). A result is five to twelve lines; a refusal lists one line per blocking finding. No model call is made by either tool.

#### KV Cache effect

Prefix-stable: the declarations do not change between requests of one process.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what the row does not do yet; they are current package constraints, not a task backlog.

- **Derived mode until the vendored library carries `sources`** — the recorder derives anchors from `documentReference` fields and appends the labels itself; re-syncing `vendor/flowleap-connectors` to flowleap-backend #611 switches it to structured mode without a code change.
- **No drafting templates and no gate actions yet** — `draft-application` and `draft-outline` are still refused by `write_patent_results`, and `start_application_draft`, `validate_draft` and `remove_claim` are not registered; the gates are the file edits alone (`confirmed: true`, `approved: true`, `  - Waived: <reason>`), with the question card and the slash commands arriving in S5 D3. A fixture matter whose flags are set by hand exports today.
- **Word files need the host filesystem** — a Session on SSH or in a sandbox gets `Word export needs a local workspace`; the alternative, a `writeBytes` method on the `FileSystem` contract, is not taken for S5.
- **No PDF style exemplars** — `style/*.pdf` is listed and reported as unread; `.md` and `.docx` exemplars are read.
- **No restart advice** — the IDE's "Start a new chat: the app restarted" line is dropped; the harness has no extension host and `ctx.fs` reports no modification time.
- **No web evidence sources** — a `web_fetch` result is recorded as analytics text only; the IDE's `patentWebEvidence` (page text as `textSource: 'web'` sources) is not ported, so a quote from a fetched patent page does not count as a source.
- **No figures** — `get_patent_image` results are not recorded, so a coverage element with `basis: figure` finds no figure source.
- **Plain anchors** — a citation renders as its anchor label, not as a link; the harness has no patent reader pane.
- **Ledger per process until storage mounts** — without `dsh-storage-domain` the records live in memory and a restart loses them; with it, one domain record per Session id grows without bound.
- **Second read needs a logged route** — a save before the session's first model request, or in a composition without `dsh-llm`, judges nothing and says so.
- **Companions have stable names** — `<report>.evidence.json` and `<report>.second-read.json` replace the IDE's `<report>.<uuid>.*` files; an IDE-era receipt whose paths are `file://` URIs still matches by path.
- **Guard reads the Session fold, not the loop** — the steer fires from `agent/turn-stopping`; a turn ended by cancellation is not steered.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The copied IDE modules (`src/report/*` except `receipt.ts` and `text.ts`, `src/ledger/types.ts`, `src/drafting/*` except `workspace.ts` and `lcs-diff.ts`, `src/docx/*` except `lib.ts`) keep the IDE's tabs, semicolons and idioms so a re-port stays a plain diff against agent-v2; `.oxlintrc.json` lists them with the stylistic rules off, and this package's `tsconfig.json` relaxes `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, which the IDE does not set. The copies carry `@param` and `@returns` lines the IDE does not have (`verify-export-jsdoc`). `scripts/flowleap/sync-deliverables.sh --check` lists the IDE files that changed since the pin in `SOURCE.json` (72 files after D2); a listed file is a rule to re-port by hand. The structured-mode test in `tests/ledger.spec.ts` uses the exact field names flowleap-backend #611 returns, so it passes unchanged once the vendored library is re-synced. `docx` is imported on the first Word build, not with the plugin: it touches `localStorage` at import, which Node 25+ reports on stderr and `verify-cli-help` reads as a failure of `dsh flowleap-web --help`. `pako` (`MIT AND Zlib`, under `jszip`) is why `Zlib` is on the licence gate's permissive list (founder decision of 2026-10-23).

</details>
