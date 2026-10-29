---
description: "FlowLeap deliverable tools for the harness: write_patent_results with the Patent AI report templates, evidence validation against the session's recorded tool results, the working record and evidence companion, the evidence ledger recorder, the delivery card, the report-not-written steer and the office action work page with its flowleapWorkPages Remote; export_draft_docx and inventor_questions with the Application Drafting layer and the Word builders; start_application_draft, validate_draft and remove_claim with the attorney gates as question cards and slash commands; for users of the FlowLeap profile and maintainers porting the IDE's deliverable code."
kind: "package-reference"
---

# @deepseek-ai/dsh-flowleap-deliverables

## Summary

`dsh-flowleap-deliverables` is the harness side of the Patent AI deliverables (port plan S5, D1 to D3). One row registers `write_patent_results` with the IDE's report templates and drafting saves, records every data-tool result in an evidence ledger, writes the report with its working record and delivery card, judges each row with a second read, steers a turn that ends without its report, and writes the office action work page that the `flowleapWorkPages` Remote serves. It also registers the five Application Drafting tools with their attorney gates. [`SOURCE.json`](SOURCE.json) pins the copied `flowleap-agent-v2` commit.

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

Mount the row beside `dsh-tools`, a `ctx.fs` backend and `dsh-working-directory`; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this after the connectors row, so the office tools' results are recorded. `dsh-storage-domain`, `dsh-llm`, `dsh-user-questions`, `dsh-user-approval` and `dsh-commands` are optional: without storage the ledger lives in memory for the process, without a model service every second read is a stated skip, without the question service every gate is a file edit, without the approval service `remove_claim` confirms through the card, and without the command registry the slash commands are absent.

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
| Free-form (no `template`) | `content` is written as given under `filePath`; the result says `Free-form artifact: evidence validation was not performed.` The path is sealed like every saved report (below) |
| `prior-art-report`, `find-better-report`, `invalidity-claim-chart` with `coverage` | `content` must be empty; the report body is generated from the coverage rows after `validateCandidateReview` checks every anchor and quote against the Session's ledger; the working record, the evidence companion and (when judged) the second-read verdicts are written beside the report; the result carries the chat summary contract, the receipt line and `Working record: <path>` |
| `fto-memo`, `eou-infringement-chart`, `office-action-scaffold`, `patentability-opinion`, `landscape-report`, `portfolio-due-diligence-memo`, `dossier`, `invalidity-claim-chart` without `coverage` | `content` is the body, refused when empty or a placeholder; the template wraps it and appends the generated provenance appendix (figures, dates, quotations and the recorded calls). `fto-memo` fills the header's `Jurisdiction(s)` cell with the markets the memo clears, and those come from the user (`src/report/markets.ts`): the first save of a memo in a Session asks one question card, `Markets`, with the model's `jurisdictions` (a harness-only input) as the proposed option and free text for other markets; the answer fills the cell and is reused by a later save of that path in the Session that proposes nothing or the same markets; a different proposal asks again, so only the user changes the markets. The model never sees the card, so the save result states the answer (`Markets: the user answered this save's Markets question card with "DE, FR" (your proposal was "…"); …`) and tells the model to revise the memo body when it covers other markets or leaves one out. An empty answer or a cancelled card refuses the save and writes nothing. When no answer is possible (no `dsh-user-questions`, a delegated caller, no live caller) the model's value fills the cell with the suffix `(not confirmed by the user)`, and without it the save is refused, naming the cell and the input (`src/report/header-cells.ts`; the IDE's practitioner fills the cell in the editor, which this harness has not). Pass 4 of the S5 acceptance (2026-10-26) saw a prompt without markets fill the cell with where the patents are in force, which is not the question an FTO opinion answers. The first live run of the card (2026-10-26) saw a result line that only said "as the user confirmed in chat": the model, which had not seen the card, called the header wrong and tried to replace it. Every other placeholder cell (an unknown matter reference, an examiner, an art unit) stays the practitioner's |
| `dossier` (harness template, S5 acceptance defect C) | The dossier of one publication: Snapshot, Claims, Family, Legal Status, Citations, US Family Chain, Sources and Limitations, with the same provenance appendix as `fto-memo`; the guidance text names what each section holds and no tool. A body with its own sections replaces the scaffold and is refused without a heading that names the US family chain or US continuity (a family with no US member says so under that heading). The save result labels its line `Provenance:`, not `FTO provenance:`. The S5 dossier case saved a free-form file (no appendix, nine direct edits after the card); with this template the save is checked and sealed |
| `draft-application`, `draft-outline` | The drafting saves of the IDE (`draftApplicationSave.ts`, `draftOutlineSave.ts`): `filePath` must be `drafting/<matter>/draft-application.md` or `draft-outline.md` (`matchDraftingPath`; else `Draft was not saved. The draft-application template saves to drafting/<matter>/draft-application.md inside a workspace folder.`); both refuse while `confirmed` or `approved` is not `true`, never on findings; the draft save needs a Draft Outline made for the Approved Claims, writes the draft with its frontmatter, the generated snapshot (once per version), the Working Record and `inventor-answers.md`, and archives the previous version as `draft-application.v<n>.*` when the claims changed; the outline save binds `office` and the claims hash and lists the outline Errors without blocking; the written file is presented |

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
| Work page | `<report>.work.json` | every `office-action-scaffold` save with at least one `### Objection` block; the review fields of each objection id stay |

The IDE writes `<report>.<uuid>.evidence.json` and sweeps superseded companions; `ctx.fs` has no delete, so the harness uses stable names. The receipt binds the report digest and the evidence digest, so nothing is lost.

### The office action work page

A save with `template: "office-action-scaffold"` also writes `<report>.work.json`: the findings that the [office action board](../../client/ui-flowleap-work-pages/README.md) shows, read from the body in the analysis layout of the `recipe-office-action-response` skill (`src/work-page/office-action.ts`). The parser reads the `## 1. Action` table (`Application`, `Office and action`, `Action date`, `Last date without extension`, `Cited documents`), each `### Objection` block under `## 2. Objections` (`Ground`, `Claims hit`, `Examiner's reasoning`, `Source of the objection`, the `Cited documents` table, each `Assessment`, `Options`, `Reply must address`, `Confidence and gaps`, `Sources`, and any other field as a detail), and each claim table of `## 3. Claim-by-claim comparison` whose header starts with `Element`. The file also holds `review`: for each objection id, the attorney's `state` (`needs_review`, `relevant`, `done`, `not_relevant`), `owner` and `note`. A later save of the same report reads the findings again and keeps the review fields of each objection id that the previous file had; a new id starts at `needs_review`. A save without an `### Objection` block, such as a response plan saved with the same template, writes no file, and the result says so without asking for another save. A failed write of the file is a warning and a result line; the report stays saved.

The `flowleap_work_pages` storage domain indexes each page by the digest of its path, with the chat that saved it. A save without a chat (no Agent) writes the file but does not list it. The `flowleapWorkPages` Remote (`src/work-page-controller.ts`) serves the index:

| Method | What it does |
|---|---|
| `list()` | the pages whose chat remote access allows the caller and whose file reads as a work page file, newest save first |
| `read(id)` | one page with its file; `flowleap-work-pages/not-found` for an unknown or hidden page, `flowleap-work-pages/unreadable` for a missing or damaged file |
| `review({ id, objection, state?, owner?, note? })` | changes the review fields of one objection and nothing else; an omitted field keeps its value; `flowleap-work-pages/invalid` for a field outside the schema (an owner of more than 200 characters, a note of more than 4,000, an unknown state or key), `flowleap-work-pages/objection-not-found` for an unknown objection |

The saves and the review changes of one page run one after another, so neither loses the other's write. Each committed save or change emits `flowleap-work-pages/changed`. The board never writes the findings: only a save of the report changes them. The model sees the review fields only when it reads the file with a tool, which the Session log records; the save result names the file and tells the model to read it before it revises the analysis or writes its response plan.

### The drafting tools

The five drafting tools work on one matter folder, `drafting/<matter>/` under the working directory (the IDE's folder contract, PRD 0020). The tool names and input schemas are the IDE's; `matter` is the folder name under `drafting/`, refused when it is empty, starts with a dot or holds a path separator.

| Call | What happens |
|---|---|
| `start_application_draft { matter }` | Reads the `confirmed` gate of `feature-list.md` and the `approved` gate of `claims.md` from the files; at a closed gate it shows the card (below) and continues only when the file carries the flag, else refuses with the file edit, the card and the command. When both are open it records the approved claims hash in the Working Record and returns the Feature List, `figures.md`, the Approved Claims, the claim terms to plan, the Draft Outline (or why it is missing or stale) and up to five style exemplars from `style/` as text |
| `validate_draft { matter, advisory? }` | Runs the office validators over `draft-application.md`, adds the model's advisory items as Advisory findings, writes `findings.md` (waivers kept) and records the validated hash; a `claims-changed` Error clears `approved`. With unwaived Errors left (Inventor Questions never) it shows the Waive Errors card; a waiver written through the card is merged by a second validator run. Returns the counts and the blocking list; never says the draft passed |
| `remove_claim { matter, claim }` | Confirms the removal with the attorney (below), removes the claim, renumbers the later claims and their references, records `Claim removed` with the channel and the call id; the body change clears `approved` by the hash check. Refuses, and writes nothing, when another claim refers to the claim, when the number has no claim, or when the attorney does not confirm |
| `export_draft_docx { matter }` | Reads the `approved` gate of `claims.md` (an `approved: true` without `approvedHash` is bound to the claims body; a changed body withdraws the approval and records it), showing the Approve Claims card at a closed gate; requires `draft-application.md`, `draft-application.generated.md` and `claims.md`, re-runs the validators and writes `findings.md` (waivers kept); with unwaived Errors it shows the Waive Errors card and validates again; refuses while an Error or an Inventor Question is still open and unwaived, naming each item and the open steps of `checklist.md`. Else it logs the attorney's edits against the generated snapshot in the Working Record, writes `draft-application.description.docx`, `.claims.docx` and `.abstract.docx` with the office page setup (EPO: Rule 49 EPC, A4, page numbers top, line numbers every five lines; US: 37 CFR 1.52, letter, page numbers bottom), `filing-manifest.md` (claims, drawing sheets, abstract figure, estimated pages) and `draft-application.full.docx` (the review copy, marked not for filing), records the export hash, writes `checklist.md` and presents the five files |
| `inventor_questions { matter, action: "send" }` | Writes `inventor-questions.docx` from `inventor-answers.md`: a heading, one sentence for the inventor and a four-column table (No., Question, Where the answer goes, Your answer) with one row per open question; refuses when no question is open, or when the existing document holds answers not imported yet; presents the file |
| `inventor_questions { matter, action: "import", file? }` | Reads the answered `.docx` (default `drafting/<matter>/inventor-questions.docx`; a `.md` in the format of `inventor-answers.md` is accepted) and copies each answer into the empty current `**Answer:**` slot of its question, never over a filled one; the result names the ids filled, kept and unknown; presents `inventor-answers.md` when it changed |

Every call rewrites `drafting/<matter>/checklist.md` and ends with the Drafting Checklist line (the next step for the attorney, or the open steps after a refusal) and the chat advice (`Stay in this chat.`, or a new chat after the same refusal twice). The gate sentences name the file edit first, then the two ways the harness offers: `Review \`drafting/<matter>/claims.md:3\`, then change \`false\` to \`true\` on line 3, or answer the Approve Claims card in the chat, or type \`/approve-claims <matter>\`.` The IDE's editor buttons ("click **Approve Claims** at the top of the file", "click **Waive…**") have no counterpart here (`withoutEditorButtons` rewrites them).

### The attorney gates (S5 D3)

ADR 0012 decision 3: a gate is read by code from the file; PRD 0025 decision 1: the model never writes a flag or a waiver. The harness has no editor, so two seams keep that rule (port plan section 4, founder ruling of 2026-10-23: both ship).

| Gate | Where the tool stops | The card (main path) | On "yes" | The command (strict path) |
|---|---|---|---|---|
| Confirm Feature List | `start_application_draft` while `confirmed` is not `true` | `confirm-feature-list`: the Feature List body as detail, options `Confirm Feature List` / `Not yet` | `confirmed: true` through `writeDraftingFrontmatter` (comment lines kept), read back from the file, then `Feature List confirmed: by the attorney in chat (question card, call <callId>) at <ISO time>` in the Working Record | `/confirm-features <matter>` |
| Approve Claims | `start_application_draft`, `export_draft_docx` while `approved` is not `true` (also after a withdrawn approval: the card shows the claims as they are now) | `approve-claims`: the claims body as detail, options `Approve Claims` / `Not yet` | `approved: true`, read back; the next drafting read binds `approvedHash`; `Claims approved: … at <ISO time>; claims SHA-256 <hash>` | `/approve-claims <matter>` |
| Waive Errors | `validate_draft`, `export_draft_docx` with unwaived Errors (Inventor Questions are never offered) | two questions in one batch: `waive-items` (multi-select, one option per Error `Line N: <rule>`, one `All N Errors of <rule>` per rule with more than two) and `waive-reason` (free text) | `  - Waived: <reason>` under each chosen item in `findings.md`, read back by the open-Error count, then one `Error waived: <rule> (<n> item(s), findings.md lines …) by the attorney in chat (…)` line per rule; the validators run again so the result and the checklist show the new state | `/waive <matter> <findings.md line or rule> <reason>` |
| Remove claim N | `remove_claim` | `ctx.approval.request({ toolName: 'remove_claim', callId, reason: <the cost> })` under the `ask` policy; the one-option card `Remove claim N` / `Keep it` when the session policy is `never` (the `flowleap-web` profile's `danger-full-access` preset rejects every ask deterministically) or the answerer is unavailable | the claim removed, `Claim removed: <time> claim N of M, on the attorney's confirmation (approval request | question card, call <callId>)`; `approved` cleared by the hash check | none |

The card is asked with `wait: { callId }`, so the Web client keys it to the tool call; the turn stays open while the attorney reads. "Not yet", a skipped question, an empty reason, a cancelled ask (`ASK_ABORTED`), a child agent (`DELEGATED_CALLER`), a dead caller, a missing answerer and a composition without `dsh-user-questions` all write nothing: the tool returns the same refusal it would return without the card. A command writes `(command /approve-claims)` as the source instead of the call id, rewrites `checklist.md` at once and answers in the chat without a model step; a usage error, a missing file, an unknown rule or line, or invalid frontmatter writes nothing and says so. The record line is the only addition to the IDE's files: the IDE's editor save was its record.

Not ported from the IDE's gate files: the CodeLens providers, the editor-title buttons and their context key, the markdown-preview tab detection, the quick pick of the matter (a command names the matter), VS Code's tool confirmation of `remove_claim` (`prepareInvocation`), and the "Waive all N open Errors" first choice (the card lists the items themselves).

### Word files and the host filesystem

`ctx.fs` writes UTF-8 text only, so the Word files go through the host filesystem: the target is resolved and fenced through `ctx.fs`, its process path is taken as the host path only when `processPathFromHostPath()` maps it back to the same file (the rule `ui-deliverables` uses before a native open), and the bytes are published atomically with `dsh-atomic-write`, mode `0644`. A Session whose filesystem is not the host's (SSH, a sandbox) is refused: `Word export needs a local workspace: …`. There is no in-browser editor: the attorney opens a presented `.docx` on the delivery card (the right-Sidebar preview converts it to PDF through [`office-to-pdf`](../../document/office-to-pdf/README.md)), edits the exported Word file in Word, or asks the agent to change the draft and export again.

### The evidence ledger

`tools/result` is observed for the data tools, and each settled call becomes one record in the owning Session's ledger (host state in `ctx.storageDomain`, domain `flowleap_deliverables_ledger`, one append-only list per Session id; no Session event). Two modes, decided per result:

| Mode | When | What is recorded |
|---|---|---|
| **structured** | the result carries the connector library's `sources` field (flowleap-backend #611: `anchor`, `reference`, `language?`, `text?`, `retrieval`) | each entry straight into the ledger after the untrusted-record check |
| **derived** | no `sources` field (the vendored library before #611, the paid MCP tools) | sources derived from the result's own `documentReference` fields and claim list with the IDE's `evidenceAnchor`, so the anchors are the IDE's (`EP1000000A1:claims:2:en`); the full result text is kept, capped at 120,000 characters; a `tools/post-execute` projection appends the IDE's `[source anchor: …]` labels to `get_claims`, `get_description`, `get_abstract` and `get_bibliography` results so the model can cite them |

**Active mode today: derived.** The vendored `@flowleap/connectors` copy predates #611; once it is re-synced the recorder switches to structured per result and the label projection falls silent. The first record of each mode is logged at info level.

Recorded tools: `search_patents` (`search`); `get_claims`, `get_description`, `get_abstract`, `get_bibliography`, `get_fulltext` (`details`, with sources; the bibliography keeps its full text as well, because its dates live in no passage); `get_legal_status`, `get_patent_family`, `get_patent_term`, `get_register_events` and the harness's native status, bibliographic, file-wrapper and term reads `get_patent_summary`, `get_family`, `get_register_biblio`, `get_us_grant`, `get_us_application`, `get_continuity`, `get_transactions`, `get_assignments`, `get_foreign_priority`, `get_prosecution_timeline`, `get_patent_term_adjustment`, `get_citations`, `get_application_documents`, `read_application_document` (`status`, full text, capped at 120,000 characters); `examiner_baseline`, `patstat_query`, `patstat_portfolio`, the other `patstat_*` (as `patstat_graph`), `patent_analytics` (as `patent_analytics_viz`), `web_fetch` (as `fetch_webpage`), `read_pdf`, `bash`/`pwsh` (as `run_in_terminal`) (`analytics`, full text). The `mcp__flowleap__` prefix of the paid row is dropped before the name is matched. The snapshot's limitation sentence (`LIMITATION`) names this scope and the tools outside it (`get_patent_image`, `compare_patents`, `search_register`, `search_npl`, `search_academic`, `convert_patent_number`, `get_search_syntax`, `get_attorney`, `ocr`).

The provenance appendix of a memo looks each figure and date up in that recorded text. A date is matched in every form a tool writes it (`2024-08-01`, `2024-08-01T00:00:00Z`, `20240801`, `01.08.2024`), and a figure that a JSON result lists with a trailing comma (`"adjustmentTotalQuantity": 63,`) counts as found. The S5 acceptance (2026-10-25) saw an FTO memo whose 15 of 19 dates were "not found" because the summary, family, US grant, continuity and PTA results were outside the audit; re-rendered offline over the same session, the memo audits 16 of 18 dates and 10 of 10 figures as found, the two dates left being the model's own expiry arithmetic.

### The delivery card and the steer

After a successful save the writer queues the report and the working record, and this plugin's own `tools/result` listener appends `deliverables/presented` keyed by the writer's call id: the event type `dsh-tool-present` declares, so the Web card shows the two files and a click opens the Markdown preview in the right Sidebar.

At `agent/turn-stopping`, when the turn asked for a prior-art report, an invalidity chart or a Find Better report and ends without a current structured receipt (or with the report changed on disk, or with research after the save, or an invalidity chart whose receipt lists open points but no Round Report), the plugin steers the IDE's reason into the turn once through `agent.steer()`; the turns are folded from the Session's own events, never read synchronously.

### The seal on a delivered file

Every path a save delivers (free-form or templated) is remembered for the Session (`src/guard/seal.ts`, `DeliveredPaths`). The first later `edit`, `write` or `str_replace_editor` (any command but `view`) of that path by the model is steered once per Session, path and outcome, from `tools/post-execute` so the message is queued before the edit's result reaches the model: `` `outputs/dossier.md`: This file was delivered to the attorney with a card. Re-save it through write_patent_results so the record, evidence and card stay true; direct edits leave the card stale. `` A failed edit (for example an `edit` of a file the model has not read) steers its own sentence: `This file was delivered to the attorney with a card, and the edit did not change it. To correct it, re-save the whole file through write_patent_results; a correction given only in the chat does not reach the delivered file.` The edit is not blocked (the attorney may have asked for it); the steer is the seal. The S5 acceptance (2026-10-25) saw the dossier case edit its delivered file nine times after the Report card with nothing said; pass 3 (2026-10-26) saw one failed `edit` of an unread delivered file, after which the model left the garbled sentence in the file and gave the correction only in the chat.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`apply` builds one `PatentLedger`, attaches the storage table when `storageDomain` is mounted (`ctx.inject`), builds the judge when `llm` is mounted, resolves the gate seams when `userQuestions` and `approval` are mounted (the session's effective approval policy is `overrideOf(session) ?? config.policy`), registers the gate commands when `commands` is mounted, registers the recorder (`tools/result` observer plus the `tools/post-execute` label projection), the delivery listener, the completion guard (`session/event` fold plus `agent/turn-stopping`), the edit seal (`tools/post-execute` on the generic file tools), and the six tools through `registerDeliverableTools` (all or nothing, like the connectors' `registerOfficeTools`).

The writer keeps the IDE's flow: Find Better inputs and the content requirement are checked before any path resolution; the path is resolved through `ctx.fs` against `ctx.workingDirectory.ensure(agent)` and refused outside it; the ledger snapshot materializes numbered claims into the rows; `validateCandidateReview` (and for a chart `roundOrderErrors`/`roundAnswerErrors`) refuses with one line per issue; the second read runs before the write so the receipt covers the final bytes; the evidence companion is written, then the report, then the verdicts, then the working record (a record failure is a warning and an unnamed record); the receipt binds process paths and SHA-256 digests; an invalidity save is marked in the ledger for #725. Telemetry (`recordReportSaved`) is dropped: the harness has no FlowLeap telemetry (ADR 0019).

### What differs from the IDE copy

The copied files are the IDE's rules; each divergence below is deliberate, minimal, marked in the file's header comment, and carries the agent-v2 follow-up that would let the next re-sync drop it. `scripts/flowleap/sync-deliverables.sh --check` compares the IDE files against the pin, so a local edit does not show there: this list is the record.

- Three strings (`src/report/candidate-review.ts`, `src/report/provenance.ts`): the refusals that named `get_patent_details(…, evidenceLookup: {})` and `evidenceLookup` now name `get_claims or get_description`, the Search Round refusal names `web_fetch` instead of `patent_api_request or fetch_webpage`, and the provenance appendix labels a `details` record `get_claims`. Citations render as plain anchors: the IDE's `flowleap://` reader link has no reader pane here.
- `src/ledger/types.ts` (S5 acceptance defect A): `PatentStatusTool` and `RECORDED_TOOLS` also name the harness's native status, bibliographic, file-wrapper and term tools (`HARNESS_STATUS_TOOLS`), and `LIMITATION` states that scope. agent-v2 follow-up: the IDE's `patentExecutionLedger.ts` records only `get_legal_status`, `get_patent_family`, `get_patent_term` and `get_register_events`; its `patentApiRequest` results of `get_patent_summary`, `get_family`, `get_us_grant`, `get_continuity` and `get_patent_term_adjustment` carry the same dates and are outside its audit too (file as an IDE issue: "provenance audit scope: record the status and file-wrapper routes").
- `src/writer-schema.ts` (S5 acceptance defect B): one property beside the IDE's 25, `jurisdictions`, the model's proposal for the fto-memo header's `Jurisdiction(s)` cell; the user's answer to the markets card fills the cell. The rule, the card and the refusals live in the harness's `src/report/header-cells.ts`, `src/report/markets.ts` and `src/writer.ts`, the template copy is untouched. agent-v2 follow-up: give `write_patent_results` a `jurisdictions` input and fill the cell in `patentReportTemplates.ts` (`fieldTable([['Jurisdiction(s)', f.jurisdictions]])`); the IDE ships the placeholder cell too when the attorney does not edit the saved memo.
- `src/report/templates.ts` and `src/writer-schema.ts` (S5 acceptance defect C): the `dossier` template (type, list, content requirement, header and scaffold) and its enum entry. agent-v2 follow-up: add the same `dossier` template to `patentReportTemplates.ts` and to `contributes.languageModelTools` in `extensions/copilot/package.json`; the IDE's dossier skill saves free-form today for the same reason.
- `src/report/provenance.ts` (S5 acceptance defect A): `extractFigures` drops a prose reference to one of the memo's own section numbers (`the table in 4.1`), and `containsNumber` accepts a figure followed by a list comma (`63,` in a JSON result) while still refusing a thousands group (`63,000`). `ftoProvenanceResult` takes the document it names (`fto-memo` by default, `report` for every other content template), so a dossier save reads `Provenance:` and "the report". agent-v2 follow-up: port the three into `patentReportProvenance.ts` (`extractFigures`, `containsNumber`, the result label); the IDE's audit has the same two misses on an FTO memo, and labels a patentability opinion's result "FTO provenance".

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Config, `apply`, public exports |
| [`src/register.ts`](src/register.ts) | all-or-nothing tool registration |
| [`src/writer.ts`](src/writer.ts), [`src/writer-schema.ts`](src/writer-schema.ts) | the tool shell on `ctx.fs`; the IDE's input schema verbatim and the contract-only description |
| [`src/judge.ts`](src/judge.ts) | the second read on `ctx.llm.prepareCall()` |
| [`src/present.ts`](src/present.ts) | the delivery queue and the `deliverables/presented` append |
| [`src/tools/`](src/tools/) | the five drafting tool shells on the dsh seams (`start-application-draft.ts`, `validate-draft.ts`, `export-draft-docx.ts`, `inventor-questions.ts`, `remove-claim.ts`) and what they share (`shell.ts`, with the gate seams) |
| [`src/gates/`](src/gates/) | the attorney gates: the pure edits of the IDE's `draftingGateLens.ts` (`edits.ts`), the question cards on `ctx.userQuestions` and the removal confirmation on `ctx.approval` (`questions.ts`), the slash commands on `ctx.commands` (`commands.ts`), the record lines (`record.ts`) |
| [`src/drafting/`](src/drafting/) | the IDE's Application Drafting layer, 22 pure modules copied with import rewrites (`lcs-diff.ts` replaces the VS Code diff module), the two drafting saves (`draft-application-save.ts`, `draft-outline-save.ts`), and `workspace.ts`, the `DraftingWorkspace` file I/O rewritten onto `ctx.fs` |
| [`src/docx/`](src/docx/) | the IDE's Word builders on `docx` (loaded on the first build, see `lib.ts`) and the `mammoth` reader of the answered questions |
| [`src/bytes.ts`](src/bytes.ts) | the guarded host-path byte write |
| [`src/work-page/`](src/work-page/), [`src/work-page-controller.ts`](src/work-page-controller.ts) | the office action work page: the client-safe vocabulary (`types.ts`, exported as `./work-pages`), the parser of the analysis layout (`office-action.ts`), the file, the index and the review change (`store.ts`), and the `flowleapWorkPages` Remote |
| [`src/report/`](src/report/) | the IDE's report core: templates, provenance, second-read prompt and parsing, candidate review, Find Better, Fallback Ladder, receipt, document reference, text helpers; and the harness's `header-cells.ts`, the header cells a save must fill, and `markets.ts`, the fto-memo markets card |
| [`src/ledger/`](src/ledger/) | the IDE's ledger vocabulary (`types.ts`), the per-Session store over `ctx.storageDomain` (`store.ts`), the recorder and its two modes (`recorder.ts`) |
| [`src/guard/`](src/guard/) | the completion check (`completion.ts`), the Session-event fold (`turn-tracker.ts`), the steer (`steer.ts`), the seal on delivered files (`seal.ts`) |
| [`SOURCE.json`](SOURCE.json), [`scripts/flowleap/sync-deliverables.sh`](../../../scripts/flowleap/sync-deliverables.sh) | the agent-v2 pin per copied file and the drift check |
| [`tests/`](tests/) | the IDE's template, provenance, second-read, fallback-ladder, working-record and completion specs ported; the recorder over a fake `tools/result` stream in both modes; the store across a restart; the writer over the real local filesystem with the refused quote, the corrected retry, the presented event, the steer, the fto-memo header cell, the dossier save and the seal; the markets card with an answer, a typed answer, a re-save, an empty answer, a cancelled card and a delegated caller (`fto-markets.spec.ts`); the dossier template and the audit scope of the harness status tools (`harness-templates.spec.ts`, `ledger.spec.ts`); the 18 drafting specs and the two Word round-trip specs of the IDE (`drafting-*.spec.ts`, `docx-*.spec.ts`, the pipe-clamp fixture matter); the two drafting tools over the real local filesystem (`drafting-tools.spec.ts`) and the byte write's fence and refusal (`bytes.spec.ts`); the IDE's `applicationDraftingTools.spec.ts` against the five drafting tools and the two saves (`drafting-gates-tools.spec.ts`, over `gates-test-bench.ts` with programmable fakes of the three seams), the pure gate edits (`gates-edits.spec.ts`), the cards with yes / not yet / skipped / aborted / delegated / no answerer and the removal confirmation under both policies (`gates-questions.spec.ts`), and the commands (`gates-commands.spec.ts`); the work page parser on a report in the skill's layout, the save, the review change, the access filter and the index over the real local filesystem (`work-pages.spec.ts`) |

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

One tool declaration: the IDE's 25-property input schema plus the harness's `jurisdictions` (`filePath` and `content` required; `template`, `coverage`, `concepts`, `classifications`, `rounds`, `baseline`, `tracks`, `limitations`, `stopReason` and the rest) with a description of about 200 words that states the contract: what the tool saves, the `filePath` rule, the template list (`dossier` included), that structured templates take empty content and coverage checked against the tools' returned evidence, that a templated save appends a provenance section, that the save delivers the files and a delivered file is re-saved rather than edited, and that a refusal names each field to fix. The generated tool catalog does not list it: it is registered from the IDE's raw JSON Schema, not through `defineTool`, and the row is mounted by the `flowleap-web` profile only. A result is the IDE's text: `Successfully wrote patent results to <filePath>` with the summary contract, the receipt line and the working record path, or a refusal (`Report was not saved. …`, `Candidate draft was not saved. Correct these issues and retry with the revised content:` followed by one line per issue), always ending a success with `Delivered to the user; do not call `present` for these files.` An `office-action-scaffold` save adds one line before it: `Work page: <filePath>.work.json holds the <n> objections of this analysis for the office action board, where the attorney sets a review state, an owner and a note on each objection. Read that file before you revise this analysis or write its response plan; do not edit it.`, or `Work page: none, because this report has no "### Objection" block; …` (for example a response plan saved with the same template), or `Work page: not written (<reason>); …`. When a turn ends without its report, the next step opens with the steer text as a user-role message, the agent loop's own steering form; the first direct edit of a delivered file opens the next step the same way with the seal sentence.

##### Anchor labels appended to a text tool result in derived mode

```markdown
Source anchors for write_patent_results (cite these in sourceAnchors; quote the returned text verbatim):
[source anchor: EP1000000A1:claims:1:en]
[source anchor: EP1000000A1:claims:2:en]
[source anchor: EP1000000A1:claims:en]
```

#### Token effect

One fixed declaration per request while the row is mounted (the schema is the IDE's, about 3,700 words of JSON). The anchor block adds one line per recorded source to a text tool's result in derived mode and nothing in structured mode. A refusal is one line per issue; a success is about ten lines plus the receipt, and one line (about 50 words) more for an `office-action-scaffold` save. The second read costs one model call per coverage row that claims disclosure, at most twelve per save, on the firm's key.

#### KV Cache effect

Prefix-stable: the declaration does not change between requests of one process. The anchor block and the steer are appended to results and turns, never to the prompt prefix.

### The drafting tools

#### What the model sees

Five declarations with the IDE's input schemas: `start_application_draft` and `export_draft_docx` take `matter`; `validate_draft` takes `matter` and an optional `advisory` list; `remove_claim` takes `matter` and `claim`; `inventor_questions` takes `matter`, `action` (`send` | `import`) and an optional `file`. The descriptions carry the contract (about 150 to 250 words each, no editor or button talk): what each call reads and writes, what it refuses, that a closed gate is asked of the attorney in the chat and opens only through the file, and that the written files are delivered. A result is the IDE's text: `Drafting started for matter "hinge". Office: US. Gates read from the files: …` followed by the Feature List, the figures, the Approved Claims, the claim terms, the outline and the exemplars; `Wrote drafting/<matter>/findings.md (US validators; waivers kept).` with the counts and the blocking list; `Removed claim 4 of 14 from … Claims 5 to 14 are now claims 4 to 13. …`; `Exported the description, the claims and the abstract as separate files: …`; or a refusal that names the blocking items or the gate (`Review \`drafting/<matter>/claims.md:2\`, then change \`false\` to \`true\` on line 2, or answer the Approve Claims card in the chat, or type \`/approve-claims <matter>\`.`), each ending with the checklist line and the chat advice. A card answered with "yes" adds one line to the result (`Claims approved by the attorney in chat (question card).`, `2 Error(s) waived by the attorney in chat (question card); …`). A success that wrote files ends with `Delivered to the user; do not call \`present\` for these files.`

#### Token effect

Five fixed declarations per request while the row is mounted (about 1,100 words together). A result is five to twelve lines, a `start_application_draft` result the matter's inputs (the Feature List, the claims, the outline and up to five exemplars of at most 20,000 characters each); a refusal lists one line per blocking finding. No model call is made by any drafting tool; a card waits for the attorney without spending tokens.

#### KV Cache effect

Prefix-stable: the declarations do not change between requests of one process.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what the row does not do yet; they are current package constraints, not a task backlog.

- **Derived mode until the vendored library carries `sources`** — the recorder derives anchors from `documentReference` fields and appends the labels itself; re-syncing `vendor/flowleap-connectors` to flowleap-backend #611 switches it to structured mode without a code change.
- **Gates need the Web answerer or the command line** — a Session without `dsh-user-questions` (a headless composition) or whose caller is a child agent gets the file edit alone; the record line then comes from no tool, because a hand edit has no tool call to record it. A card asked under the blocking `ask_user_question` schema has no timed continuation: the tool call waits until the attorney answers or the turn is cancelled.
- **`remove_claim` never reaches the approval answerer in the `flowleap-web` profile** — its default preset is `danger-full-access` with the `never` policy, which `ctx.approval.request` rejects deterministically, so the tool asks the card instead; a profile with the `ask` policy gets the approval dialog.
- **No drawings tools** — `build_drawing_set`, `render_figure` and the figure review of the IDE are not registered; `figures.md` is read, the `drawings/` sheets are counted.
- **Word files need the host filesystem** — a Session on SSH or in a sandbox gets `Word export needs a local workspace`; the alternative, a `writeBytes` method on the `FileSystem` contract, is not taken for S5.
- **No PDF style exemplars** — `style/*.pdf` is listed and reported as unread; `.md` and `.docx` exemplars are read.
- **No restart advice** — the IDE's "Start a new chat: the app restarted" line is dropped; the harness has no extension host and `ctx.fs` reports no modification time.
- **No web evidence sources** — a `web_fetch` result is recorded as analytics text only; the IDE's `patentWebEvidence` (page text as `textSource: 'web'` sources) is not ported, so a quote from a fetched patent page does not count as a source.
- **No figures** — `get_patent_image` results are not recorded, so a coverage element with `basis: figure` finds no figure source.
- **Plain anchors** — a citation renders as its anchor label, not as a link; the harness has no patent reader pane.
- **Ledger per process until storage mounts** — without `dsh-storage-domain` the records live in memory and a restart loses them; with it, one domain record per Session id grows without bound.
- **Second read needs a logged route** — a save before the session's first model request, or in a composition without `dsh-llm`, judges nothing and says so.
- **Companions have stable names** — `<report>.evidence.json` and `<report>.second-read.json` replace the IDE's `<report>.<uuid>.*` files; an IDE-era receipt whose paths are `file://` URIs still matches by path.
- **The work page reads only the analysis layout** — a report that renames the field labels or writes an objection outside a `### Objection` block loses that content on the board; the report itself is unchanged.
- **Work page index without deletion** — a page whose file was moved or deleted stays in the index and is left out of `list()`; `ctx.fs` has no delete, and the index has no removal path yet.
- **Guard reads the Session fold, not the loop** — the steer fires from `agent/turn-stopping`; a turn ended by cancellation is not steered.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The copied IDE modules (`src/report/*` except `receipt.ts` and `text.ts`, `src/ledger/types.ts`, `src/drafting/*` except `workspace.ts` and `lcs-diff.ts`, `src/docx/*` except `lib.ts`) keep the IDE's tabs, semicolons and idioms so a re-port stays a plain diff against agent-v2; `.oxlintrc.json` lists them with the stylistic rules off, and this package's `tsconfig.json` relaxes `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, which the IDE does not set. The copies carry `@param` and `@returns` lines the IDE does not have (`verify-export-jsdoc`). `scripts/flowleap/sync-deliverables.sh --check` lists the IDE files that changed since the pin in `SOURCE.json` (82 files after D3); a listed file is a rule to re-port by hand. The three D3 tool shells, `src/gates/edits.ts` and the two saves are copies with their VS Code glue rewritten; `src/gates/questions.ts` and `src/gates/commands.ts` are the dsh form of `draftingGateContribution.ts` and keep its decisions (flag line in place, waiver after the sub-lines, one reason per batch), not its code. The structured-mode test in `tests/ledger.spec.ts` uses the exact field names flowleap-backend #611 returns, so it passes unchanged once the vendored library is re-synced. `docx` is imported on the first Word build, not with the plugin: it touches `localStorage` at import, which Node 25+ reports on stderr and `verify-cli-help` reads as a failure of `dsh flowleap-web --help`. `pako` (`MIT AND Zlib`, under `jszip`) is why `Zlib` is on the licence gate's permissive list (founder decision of 2026-10-23).

</details>
