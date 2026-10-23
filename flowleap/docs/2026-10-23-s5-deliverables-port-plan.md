# S5 plan: port the IDE deliverable tools to the harness

Date: 2026-10-23. Status: plan, no code. Source commit in agent-v2: `33efdf7ebee` (main).
Target: `packages/host/flowleap-deliverables`, package `@deepseek-ai/dsh-flowleap-deliverables`.

## 1. Verdict and shape

**Verdict: port, in one host plugin, in three phases.** About 10,000 lines of the IDE code are
pure TypeScript (templates, validators, the candidate review, the drafting layer) and move with
import rewrites only. The rest is VS Code glue (about 2,000 lines) and is rewritten onto dsh seams.
Three things are not a copy job and carry the risk: the evidence ledger, binary file writes
with the `docx` licence chain, and the gate doctrine without an editor (see "Top risks" in
section 7).

One change to the plan in HANDOFF: **`compare_claims` belongs in `flowleap-connectors`, not in
this plugin.** It is a data tool. It fetches claims on the firm's EPO and USPTO keys, and the
connector library instance (`createConnectors(bound.host)`) lives in that plugin. Register it
there beside `read_pdf`, with the IDE's deterministic claim decomposition copied. The name stays
`compare_claims`.

**Tools in `flowleap-deliverables`** (names fixed by the exported prompt and the IDE):

| Tool | Job |
|---|---|
| `write_patent_results` | Saves reports (free-form and templated), the evidence companion, the working record, and the two drafting files (`draft-application`, `draft-outline`) |
| `start_application_draft` | Reads the two human gates and returns the drafting plan inputs |
| `validate_draft` | Runs the office validators, writes `findings.md` and `checklist.md` |
| `remove_claim` | Removes one claim, renumbers, rewrites dependencies, re-opens the approval |
| `inventor_questions` | `send` writes `inventor-questions.docx`; `import` reads the answers back |
| `export_draft_docx` | Refuses while a gate or a finding is open; else writes the Word files and the manifest |

**Seam map.**

| Capability in the IDE | dsh seam |
|---|---|
| `IFileSystemService` reads and writes, `assertFileOkForTool` | `ctx.fs.resolve` / `contains` / `stat` / `readText` / `readBytes` / `listDir` / `writeText` under `ctx.workingDirectory.ensure(exec.agent, exec.signal)`, the same guard `read_pdf` uses |
| `vscode.open` after a save | Append `deliverables/presented` from this plugin's own `tools/result` listener (the `tool-present` pattern), so the delivery card shows; click opens the right-Sidebar preview |
| Preview-title gate buttons and CodeLens (PRD 0025 S2, S4) | `ctx.userQuestions.ask()` from the tool at the gate, plus slash commands through `ctx.commands.register()` as the no-model path |
| `confirmationMessages` on `remove_claim` | `ctx.approval.request({ agent, toolName, callId, reason, signal })`, proceed only on `'allowed-once'` |
| Reveal `checklist.md` beside the editor | Present the checklist with the drafting result; the next-step line stays in the result text |
| Docx preview | Nothing to build: `ui-sidebar-documentpreview` converts DOCX to PDF through `office-to-pdf` |
| Patent execution ledger (`IPatentExecutionLedger`) | A recorder on `tools/result` plus a per-session store (section 3) |
| Prior-art completion guard in `toolCallingLoop` | `agent/turn-stopping` listener that calls `agent.steer()` |
| Second read via `IEndpointProvider` | `ctx.llm.prepareCall()` on the session's logged route, as `session-title-llm` does |
| Activation telemetry `recordReportSaved` | Dropped (the harness has no FlowLeap telemetry; ADR 0019 self-hosting) |

**VS Code-only, replaced, never ported:** the CodeLens gate files, `showTextDocument`,
`showInputBox`, `showQuickPick`, `vscode.workspace.fs`, `applyEdit`, notifications,
`prepareInvocation`, `l10n.t`, the `pdfPreviewApi` text reader, `patentCitationLink` (a
`vscode.env.uriScheme` link; plain anchors instead), `IConfigurationService` (becomes the
plugin `Config`) and `IInstantiationService`.

## 2. Tool-by-tool table

Line counts are the IDE source at `33efdf7ebee`. "Pure" means no `vscode` import.

| Tool | IDE source files | Lines | Moves as-is | Rewrite | dsh seam | Tests to port | Risk |
|---|---|---|---|---|---|---|---|
| `write_patent_results` | `writePatentResultsTool.ts`, `patentReportTemplates.ts`, `patentReportProvenance.ts`, `patentSecondRead.ts`, `patentCandidateReview.ts`, `patentFindBetter.ts`, `patentFallbackLadder.ts`, `priorArtReportCompletion.ts`, ledger types, `draftApplicationSave.ts`, `draftOutlineSave.ts` | 680 + 389 + 784 + 281 + 1,421 + 678 + 568 + 289 + 390 + 172 + 97 = 5,749 | Templates, provenance, second-read prompt and parsing, candidate review, Find Better, Fallback Ladder, receipt text | Tool shell, path resolution, companion sweep (no delete on `ctx.fs`), ledger, judge call, completion guard, present | `ctx.fs`, `tools/result`, `agent/turn-stopping`, `ctx.llm` | `writePatentResultsTool`, `patentReportTemplates`, `patentReportProvenance`, `priorArtReportCompletion`, `patentWorkingRecord`, `patentSecondRead`, `patentFallbackLadder`, `patentExecutionLedger` specs (about 3,300 lines) | High (ledger) |
| `start_application_draft` | `startApplicationDraftTool.ts`, `draftingWorkspace.ts`, `common/drafting/*` | 152 + 664 + 4,977 | All of `common/drafting/` (22 files; only `yaml` and the vs `diff` module are external) | `DraftingWorkspace` file I/O, style exemplars (no PDF text reader), refusal text | `ctx.fs`, `ctx.userQuestions` | `drafting*.spec.ts` (18 files, about 3,000 lines), `applicationDraftingTools.spec.ts` | Medium |
| `validate_draft` | `validateDraftTool.ts` + the drafting layer | 95 | Validators, findings file, checklist | Shell, waiver gate | `ctx.fs`, `ctx.userQuestions` | covered above | Low |
| `remove_claim` | `removeClaimTool.ts`, `claims.ts`, `workingRecord.ts` | 124 | Renumber and dependency rewrite | Confirmation | `ctx.approval.request` | `draftingClaims.spec.ts`, tool cases | Low |
| `inventor_questions` | `inventorQuestionsTool.ts`, `inventorQuestionsDocx.ts`, `inventorAnswers.ts` | 146 + 71 + 337 | Answer parse and fill, docx table builder, mammoth reader | Binary write | binary write helper (section 5) | `draftingInventorAnswers`, `inventorQuestionsDocx` | Medium (licence) |
| `export_draft_docx` | `exportDraftDocxTool.ts`, `draftDocx.ts`, `filingDocuments.ts`, `filingManifest.ts`, `fullReviewCopy.ts`, `draftDiff.ts` | 114 + 118 + 288 + 237 + 152 + 66 | All builders and the manifest | Binary write, present | binary write helper, present | `draftDocx`, `draftingFilingManifest`, `draftingDraftDiff` | Medium (licence) |
| `compare_claims` (in `flowleap-connectors`) | `compareClaimsTool.ts`, part of `patentResponseFormatter.ts` | 331 + about 60 | Decomposition and chart | Claim fetch through `connectors.ops` | `ctx.tools` registration in connectors | `claimAnalysisTools.spec.ts` (compare cases) | Low |

The gate files `draftingGateLens.ts` (181) and `draftingGateContribution.ts` (236) are not
ported. Their pure parts move: `draftingGateEdit` (write the flag line) and
`findingsWaiveChoices` / `draftingWaiverEdit` (write `  - Waived: <reason>`), rewritten to take
text and return text.

The drafting layer imports two drawings helpers (`figureOfSvgFile`, `MatterFiles`). Copy the
pure `figureOfSvgFile`; replace `MatterFiles` with a `ctx.fs.listDir` of `drawings/`. The drawing
tools themselves (`render_figure`, `build_drawing_set`, `propose_figure_part`) stay out of S5.

## 3. The writer in detail

**Templates.** `patentReportTemplates.ts` holds them all: `prior-art-report`,
`find-better-report`, `invalidity-claim-chart`, `landscape-report`, FTO memo, infringement
chart, office-action scaffold, opinion, due-diligence memo. The two drafting templates are in
the writer. Copy to `src/report/templates.ts` unchanged.

**Validation names the fix (ADR 0018 decision 4).** The IDE description is 670 words and the
input schema is 3,695 words. The harness description carries the contract only, in about
150 words: what the tool saves, the `filePath` rule, the template list in one line, and "a
refusal names each field to fix; correct and retry". Every per-template rule already lives in a
refusal string (`contentRequirementError`, `findBetterMissingInputs`,
`validateCandidateReview`, `roundOrderErrors`, `roundAnswerErrors`). Keep those strings
byte-identical, because the eval gate compares behaviour, and the refusal shape stays "Report
was not saved. <reason>" or "Candidate draft was not saved. Correct these issues and retry with
the revised content:" plus one line per issue.

The input schema is copied verbatim as raw JSON Schema `parameters` (like `read_pdf`). The dsh
registry enforces its keyword subset on `output.schema` only, so `minItems`, `minLength` and
`minimum` in `parameters` pass. A unit test compares the copied schema with
`contributes.languageModelTools` in agent-v2 at the pinned commit, through the sync script.

**The working record.** The PR #372 convention holds: `<stem>.working-record.md`, a stable name
beside the report, replaced on every refinement save, never a `<report>.<uuid>.*` companion.
`workingRecordPath()` moves as-is. The drafting record is
`drafting/<matter>/draft-application.working-record.md` from the folder contract. A failed
record write is a warning and an unnamed record, never a failed save, as in the IDE.

**Evidence companions without delete.** The IDE writes `<report>.<uuid>.evidence.json` and
`<report>.<uuid>.second-read.json`, then deletes superseded ones. `ctx.fs` has no delete. Change:
use stable names `<report>.evidence.json` and `<report>.second-read.json`, overwritten by each
save. The receipt already binds the report digest and the evidence digest, so a stable name
loses nothing. This is the one format change; note it in the plugin README.

**The ledger, the riskiest port.** The structured templates check every quoted passage against
the session's recorded retrievals (`PatentExecutionSnapshot.executions[].sources`, each with an
`anchor` and the exact text). In the IDE, 17 data tools write those records and print
`[source anchor: …]` labels. In the harness the data tools are the 34 vendored office tools and
the 19 paid MCP tools, and none of them prints anchors or records anything. Without a ledger
every structured save refuses.

Plan:

1. **Recorder.** `src/ledger/recorder.ts` listens on `tools/result` (observe-only, frozen
   outcome) for the office and MCP names that carry evidence: `get_claims`, `get_description`,
   `get_abstract`, `get_bibliography`, `get_fulltext`, `search_patents`, `get_legal_status`,
   `get_patent_family`, `get_register_events`, `get_patent_term`, `examiner_baseline`,
   `patstat_*`, `read_pdf`, `web_fetch`. One adapter per tool maps the canonical value to a
   `PatentExecution` with the IDE's caps (`ANALYTICS_RESULT_CAP` 120,000 characters).
2. **Anchors.** The model must cite anchors it can see. Best owner: the connector library
   (ADR 0018 decision 2, "after the call, in the result text"), so the backend's MCP tools gain
   them too. That is a flowleap-backend PR to `packages/connectors` that adds the anchor line to
   `get_claims`, `get_description` and `get_abstract` results, then a vendored re-sync. Fallback
   if the backend PR waits: a `tools/post-execute` content projection in this plugin that adds
   the labels. Use `evidenceAnchor()` from the IDE in both places so anchors are identical.
3. **Store.** `ctx.storageDomain`, one append-only list per session id. Do not add a Session
   event: a new `SessionEventMap` entry fires `verify-persistence-catalog` and the sealed
   bilingual `docs/persistence-changes/**` carve-out.

**Prior-art completion check.** `checkPriorArtReportCompletion` and the Round Report nudge read
the receipts in the turn's tool results. Port them to an `agent/turn-stopping` listener: on a
turn whose user message `requestsPriorArtReport()`, read this turn's `write_patent_results`
results from the session, parse the receipt lines, and when the check returns a reason, call
`agent.steer(reason)` once per turn. The receipt text format does not change.

**Second read.** Config `secondRead` (`off`, `log`, `render`; IDE default `render`) and
`secondReadModel`. The judge call uses `ctx.llm.prepareCall()` on the session's logged route,
temperature 0, the IDE's 12-row cap, one network retry and the re-save limit of 2. It never
blocks a save.

**File naming and the folder contract.** Reports go anywhere under the working directory.
Drafting saves accept only `drafting/<matter>/draft-application.md` and `draft-outline.md`
(`matchDraftingPath`). A path outside the working directory is refused as `read_pdf` refuses.
`writeText` creates parent directories.

**What `present` shows.** After a successful save the plugin appends one
`deliverables/presented` event for the report and the working record (descriptions "Report" and
"Working record"), from its own `tools/result` listener, keyed by the writer's `callId`. That
reuses the `tool-present` event declaration, so no new event type exists. The Web card shows two
files; a click opens the Markdown preview in the right Sidebar, which renders the frontmatter as
a key and value list. The result text ends with "Delivered to the user; do not call `present`
for these files." The evidence and second-read JSON files are not presented.

**How failures reach whom.**

| Failure | Model | Attorney |
|---|---|---|
| Template refusal, validation errors | Result text, one line per fix (as today) | The tool row in the chat, expandable; then the model's reply |
| Second-read objections | Result text with the re-save guidance | The working record (presented) |
| Missing round report | `agent.steer()` text at turn end | The model's next step |
| Drafting refusal at a gate | Result text naming file, line and word | A question card (section 4) |

## 4. The attorney gates

**The doctrine and the gap.** ADR 0012 decision 3 says gates are read by code from the files.
PRD 0025 decision 1 says gate actions are editor commands, never tools, because a tool result
carries no button. The harness has no editor: every preview is read-only. So the attorney cannot
hand-edit `false` to `true`, and there is no CodeLens. Two dsh seams keep the rule that the model
never writes a flag:

- **A question asked by the tool, answered by the human.** The tool calls
  `ctx.userQuestions.ask()`. The answer comes from the Web answerer through the waterfall, not
  from the model's arguments. The model can cause the question; it cannot answer it.
- **A slash command.** `ctx.commands.register({ name, description, input, handler })` runs
  without a model round trip, and the run is recorded in the session log. This is the exact
  analogue of the editor command.

Use the question as the main path (it is where the attorney already is) and ship the commands as
the strict path. Do not use `ctx.approval` for the two gates: its policy is `never` in
`danger-full-access` mode in the `flowleap-web` profile, which would reject every gate.

**Gate list (PRD 0025 and ADR 0012) and the dsh form.**

| Gate | Where the tool stops | dsh interaction | File write on "yes" | Command |
|---|---|---|---|---|
| Confirm Feature List | `start_application_draft` when `confirmed` is not `true` | `ask({ agent, signal, wait: { callId }, questions: [{ id: 'confirm-feature-list', header: 'Feature List', question: 'Confirm the Feature List of <matter>?', detail: <the list>, options: [{ label: 'Confirm Feature List' }, { label: 'Not yet' }] }] })` | `confirmed: true` via `writeDraftingFrontmatter` (comments kept, PRD 0025 S2) | `/confirm-features <matter>` |
| Approve Claims | `start_application_draft`, `export_draft_docx` when `approved` is not `true` or the hash changed | Same shape, `detail` = the claims, options `Approve Claims` / `Not yet` | `approved: true` and the approved hash | `/approve-claims <matter>` |
| Waive Errors | `validate_draft` and `export_draft_docx` with unwaived Errors | Two questions in one batch: `waive-items` (`multiSelect: true`, one option per Error, one "All N of rule X" option per rule with more than two) and `waive-reason` (no options, free text in `custom`) | `  - Waived: <reason>` under each chosen item; empty reason writes nothing | `/waive <matter> <rule or line> <reason>` |
| Remove claim N | `remove_claim` | `ctx.approval.request({ agent, toolName: 'remove_claim', callId, reason: 'Removes claim N, renumbers the later claims and re-opens the claims approval' , signal })` | Claim removed, `approved` cleared by the hash check | none |
| Open Inventor Questions | `export_draft_docx` | No question: the refusal names `inventor_questions send` | none | none |

`ask()` blocks the tool call while it waits. The turn stays open, the agent does nothing else,
and waiting costs no tokens. Cancellation (`exec.signal`) rejects with `ASK_ABORTED`; the tool
then returns the refusal text unchanged and writes nothing. A live child agent cannot ask
(`DELEGATED_CALLER`); the tool then returns the refusal, so the root agent asks. "Not yet" or a
skipped item writes nothing and returns the refusal with the next-step line.

**The record of the decision.** On "yes" the tool writes the flag first, then one line in
`draft-application.working-record.md` with the IDE labels plus a source, for example
`Claims approved: by the attorney in chat (question card, call <callId>) at <ISO time>; claims
SHA-256 <hash>`. A command writes `(command /approve-claims)` instead. A waiver keeps its reason
in `findings.md` as today and adds one record line per waived rule. The tool reads the flag back
from the file before it continues, so the file remains the only gate.

**Founder ruling needed** (question 1): PRD 0025 decision 1 rejected a chat button "which would
be the model's act". The question card is not the model's act, but it is model-initiated. If the
ruling is "commands only", the tool refuses with the command to type, and D3 acceptance changes
from "answer it in the chat" to "type the command in the chat".

## 5. Docx

**Library.** `docx` 9.9.0, MIT, the version agent-v2 uses. Its dependencies are `jszip`
(`MIT OR GPL-3.0-or-later`, passes on the MIT choice), `hash.js`, `nanoid`, `xml`, `xml-js` (MIT).
**The licence gate fails on `pako` 1.0.11** (`MIT AND Zlib`, pulled by `jszip`): `Zlib` is not
in `PERMISSIVE_LICENSES` in `scripts/gen-third-party-notices.ts`, and `AND` needs every part.
Zlib is a permissive licence; the fix is one entry in that set, which is an owner decision
(question 2). `mammoth` 1.13.0 (BSD-2-Clause; `lop`, `option`, `dingbat-to-unicode` BSD-2,
`@xmldom/xmldom` MIT, `argparse` Python-2.0, `underscore` and `xmlbuilder` MIT) reads `.docx`
for style exemplars and the inventor import; it also needs `jszip` and so the same entry.

**What renders.**

- `export_draft_docx`: `buildDraftDocx` writes `draft-application.description.docx`,
  `.claims.docx` and `.abstract.docx` with the markers stripped, one document type each (EPO
  Online Filing uploads each separately); `buildFullReviewCopyDocx` writes
  `draft-application.full.docx` (review copy, not for filing); `filing-manifest.md` lists
  claims, sheets, abstract figure and estimated pages. The export diffs the edited draft against
  `draft-application.generated.md` and logs changed paragraphs (ADR 0012 decision 6).
- `inventor_questions send`: `buildInventorQuestionsDocx` writes `inventor-questions.docx`, a
  heading, one sentence for the inventor, and a four-column table (No., Question, Where the answer
  goes, Your answer). `import` reads a returned `.docx` with `readInventorQuestionsDocx` and fills
  empty `**Answer:**` slots only.

**Binary writes.** `ctx.fs` writes UTF-8 text only (`writeText`) and has no delete. The plugin
gets one helper, `writeWorkspaceBytes(target, bytes)`: resolve through `ctx.fs`, refuse unless
`ctx.fs.contains(root, target)`, take `ctx.fs.processPath(target)` as the host path only when
`ctx.fs.processPathFromHostPath()` maps it back to the same process path (the same rule
`ui-deliverables` uses for native open), then `writeFileAtomic` from `@deepseek-ai/dsh-atomic-write`. A filesystem without
that mapping (remote or SSH) gets a plain refusal: "Word export needs a local workspace." The
alternative, a `writeBytes` method on the `FileSystem` contract, touches every backend upstream
and is not worth it for S5.

**How the attorney opens it.** The tool presents the files it wrote (the three filing documents
and the review copy; the questions document for `send`). A card click opens the right-Sidebar
preview, which converts DOCX to PDF locally through `office-to-pdf` (LibreOffice kit, already
mounted in `flowleap-web`). The card's open control hands the file to Word on a desktop host; on
the hosted server the attorney downloads it. Note: the docx files do not appear in the
changed-files card (that card is git and file-tool based and needs Coding Tools on); the
delivery card is the surface.

## 6. Dependencies and gates

**New runtime dependencies.** `docx` 9.9.0 (MIT), `mammoth` 1.13.0 (BSD-2-Clause), `yaml` 2.8.x
(ISC; check the version the tree already locks and reuse it), `zod` 4.4.3 (already used by the
connectors plugin), `@deepseek-ai/dsh-atomic-write` (workspace). Transitive: `pako` (needs the
`Zlib` decision). Peer dependencies like the connectors plugin: `cordis`, `dsh-tools`, `dsh-fs`,
`dsh-working-directory`, `dsh-user-questions`, `dsh-user-approval`, `dsh-commands`,
`dsh-storage-domain`, `dsh-llm`, `dsh-session`, `dsh-tool-present` (types only).

**Generated catalogs to refresh.** `THIRD_PARTY_NOTICES.md`, tool catalog (six schemas),
config catalog, Cordis catalog, dependency catalog, module graph, plugin packages, official
bundle catalog (the `flowleap-web` row), tsconfig paths.

**Gates likely to fire.** `verify-tool-catalog`, `verify-config-catalog`,
`verify-cordis-catalog`, `verify-dependency-catalog`, `verify-package-dependencies`,
`verify-plugin-packages`, `verify-dsh-package-licenses`, `verify-runtime-closure`, the three
`verify-package-readme-*` gates (Summary, Model Experience, Limitations), `verify-export-jsdoc`,
`verify-no-unknown-casts` (fix any `as unknown as` in the copied code), `verify-concrete-terms`
(the README is outside `flowleap/`), `verify-doc-budgets`. Not expected: `verify-persistence-*`,
because no Session event is declared. The plugin card needs `locale/{en,zh}.json`.

**No coupling to agent-v2.** No import, no path alias, no workspace link. The code is copied
into `src/` with imports rewritten. `packages/host/flowleap-deliverables/SYNC.json` records
`agentV2Repository`, `agentV2Commit` (`33efdf7ebee`), and per copied file the IDE path, the
IDE file's SHA-256 at that commit, and the local path. `scripts/flowleap/sync-deliverables.sh
--check` re-hashes the IDE files at agent-v2 main and lists the ones that changed since the pin,
so a drifted rule shows up as a list to re-port, not as a silent fork. The IDE stays the owner of
these rules until an ADR 0019-style extraction moves `common/drafting` and the report core into
a shared package (the shape `@flowleap/connectors` already has).

**Prompt.** The exported prompt has zero references to the six tools today: agent-v2's
`patentPromptExport.spec.tsx` lists `WritePatentResults` in the excluded set, and #849 gated the
passages on tool availability. One agent-v2 PR moves the deliverable names into the native set,
re-exports, and the bundle copy is refreshed. Harness descriptions are new text: the IDE ones
say "click Approve Claims at the top of the file" and "VS Code shows the attorney the cost".

## 7. Phases with acceptance

**D0, prerequisites (parallel, small).**

| Item | Repo | Effort |
|---|---|---|
| Move the six names into the export's native set, re-export, re-copy | agent-v2 + bundle | 0.5 agent-day |
| Evidence anchor lines in `get_claims`, `get_description`, `get_abstract` results; re-sync vendor | flowleap-backend + harness | 1 agent-day |
| `Zlib` in the permissive set, recorded decision | harness | founder decision, 0.1 day |

**D1, writer, working record, validation, delivery card.** 4 to 5 agent-days.

Files: `package.json`, `README.md`, `SYNC.json`, `src/index.ts`, `src/register.ts`
(all-or-nothing, like `registerOfficeTools`), `src/present.ts`, `src/report/**`,
`src/ledger/**`, `src/guard/completion.ts`, `src/judge.ts`, `src/writer.ts`, the writer schema,
tests, the `flowleap-web` profile row, and `compare_claims` in `flowleap-connectors`.

Parallel lanes on disjoint files: (a) `src/report/**` copy plus its specs, pure; (b)
`src/ledger/**` with one adapter test per data tool; (c) `src/writer.ts`, `present.ts`,
`guard/`, `judge.ts`; (d) `compare_claims` in the connectors package. (c) integrates last.

Acceptance: a prior-art run in the harness on a fresh empty workspace writes
`outputs/<stem>.md`, `<stem>.working-record.md` and `<stem>.evidence.json`; the delivery card
shows report and record and opens the preview; a deliberately broken save (a coverage row that
quotes text no tool returned) is refused with the line that names the row and the fix, and the
corrected retry saves. A turn that ends without the report is steered once.

**D2, docx export and inventor questions docx.** 2.5 to 3 agent-days.

Files: `src/drafting/**` (the 22 pure files copied, plus the drafting specs), `src/drafting/workspace.ts`
(the `DraftingWorkspace` file I/O on `ctx.fs`), `src/bytes.ts`, `src/docx/{draft,inventor-questions}.ts`,
`src/tools/{export-draft-docx,inventor-questions}.ts`, tests.

Parallel lanes: (a) the drafting layer copy and its 18 specs, pure; (b) `docx/` and `bytes.ts`
with round-trip tests; (c) the two tool shells. It can start when D1's `register.ts` and
`present.ts` exist; lane (a) can start on day one of D1.

Acceptance: on a fixture matter with flags set by hand, `export_draft_docx` writes the three
filing documents, the review copy and the manifest, the cards appear, and the description docx
opens in the preview as PDF pages; `inventor_questions send` on eight open questions writes a
table with eight rows that opens in the preview; `import` of a docx with three filled cells
fills three slots and leaves five.

**D3, drafting state machine and gates.** 3 to 4 agent-days.

Files: `src/tools/{start-application-draft,validate-draft,remove-claim}.ts`,
`src/gates/{questions,commands,record}.ts`, the drafting branch of `src/writer.ts`
(`draft-application`, `draft-outline`), the pure parts of the two gate-lens files, tests.

Parallel lanes: (a) `gates/questions.ts` and `gates/record.ts`; (b) `gates/commands.ts`; (c)
the three tool shells. `applicationDraftingTools.spec.ts` (980 lines) is ported last, against
all three.

Acceptance: in a fresh workspace, "draft my application" leads to a Feature List; the start hits
the Confirm gate and a question card appears; answering "Confirm Feature List" in the chat writes
`confirmed: true` and a record line with the call id; the same with Approve Claims; a validation
Error is waived through the two-question card with a reason that lands in `findings.md`;
`/approve-claims` works the same with no model step; the export then runs (D2 path).

**Total:** about 10 to 13 agent-days plus D0, most of it parallel.

**Top risks.**

1. **The ledger.** Without recorded sources and visible anchors, every structured save refuses.
   Mitigation: D0 anchor PR first; adapter tests per tool; a fallback post-execute projection.
2. **Binary writes and the licence chain.** `ctx.fs` cannot write bytes or delete; `docx` and
   `mammoth` bring `pako` under `MIT AND Zlib`, which the gate rejects today. Mitigation: the
   host-path helper with the round-trip check; the `Zlib` decision before D2.
3. **The gate doctrine without an editor.** The question card is model-initiated; PRD 0025 chose
   editor commands for that reason. Mitigation: commands as the strict path, a founder ruling
   before D3, and the file read-back so the file stays the gate.

Also medium: the second-read judge call through `ctx.llm` (cost, route resolution), and
`writeDraftingFrontmatter` comment preservation (PRD 0025 S2), which the round-trip test guards.

## 8. Open questions for the founder

1. **Gate form.** Question cards answered in the chat plus slash commands, or slash commands
   only (PRD 0025 decision 1 read strictly)?
2. **Licence.** May `Zlib` join the permissive set in `gen-third-party-notices.ts`, so `docx`
   and `mammoth` (through `jszip` and `pako`) can ship?
3. **Anchors owner.** Add the evidence anchor lines in the connector library (backend PR, also
   changes the MCP tools' text), or only in the harness projection?
4. **Second read default.** Keep `render` (the IDE default, one model call per coverage row on the
   firm's key), or ship `log` until the harness passes the gate?
5. **Attorney edits.** With no editor, the attorney changes drafts by asking the agent or in Word
   after export. Is that acceptable for v1, or does S5 wait for the in-browser editor tab that
   HANDOFF lists under next steps?
