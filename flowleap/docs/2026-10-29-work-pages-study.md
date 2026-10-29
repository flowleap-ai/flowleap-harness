# Work pages: research and design study

Status: accepted by the founder on 2026-10-29, with the recommended answer to each open decision in section 6. Work: #81 (the office action board, v1) and #82 (the gallery and templates 2 to 4, later).

A **work page** is a page that does one type of legal work as a tool. The attorney fills in a form, the agent runs, and the page shows the result as items that the attorney reviews, assigns and exports. The model for this study is the "Legal artifacts" of Claude (founder screenshots 15 to 22, 2026-10-29).

## 1. What a work page is, in the Claude example

### 1.1 Facts from the screenshots

| Part | What the screenshots show |
|---|---|
| Template | A gallery "Legal artifacts" by Anthropic: Tabular review, Regulatory horizon scan, Cite check, Matter board, Fact chronology, Patent claim comparison, Docket watch wall and more. Each has a preview with sample data. |
| Copy | "Make it yours" makes "Regulatory horizon scan (Copy)". The sample cannot be changed ("Delete sample"). Data from the original is not copied. |
| Form | "New scan": Name, "What should Claude watch?", Sources, optional Documents. A note says everyone who can open the page can read what you add. |
| Run | The page sends a message into the chat beside it ("Sent from …"). The page shows progress ("8 so far"), "Send again", "Cancel request" and "About $2 a scan". |
| Result | A timeline by jurisdiction or topic, and a list with the tabs "To decide", "All", "Unchecked". Each item has a title, an impact tag, a date and actions. |
| Review states | Per item: Needs review, Relevant, Done, Not relevant. In Tabular review, each cell opens its source passage, with a confidence and "Mark checked". |
| Owner | "Owner" sets a person, with "Undo". |
| Outputs | "Brief the business" writes a briefing with key dates and sources; each source says if Claude read it or only found it. "Copy briefing", "Export Word", "Add all actions to plan". |
| Consent | Before a model call: "This artifact uses connectors", a "Use Claude" switch, usage counts toward the user's limits. Before a download: "Let this artifact download a file?" with name and size. |
| Sharing | "Share" in the header. A footer says the output is not legal advice and needs a lawyer's review. |

### 1.2 Facts from public sources

- Artifacts that use Claude ask for permission the first time; usage counts "against each person's own plan limits" ([Claude Help Center](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them)).
- Artifacts have personal or shared text storage, 20 MB for each artifact, and can use the user's connectors; a connector tool that needs approval for each action is not available to artifacts (same source).
- Anthropic's open-source `claude-for-legal` has a `tabular-review` skill (one row per document, each cell cited), a `claim-chart` skill and a scheduled docket watcher ([GitHub](https://github.com/anthropics/claude-for-legal)).

I found no public Anthropic page about the "Legal artifacts" gallery itself. Those facts come only from the screenshots.

### 1.3 Interpretation

A work page has three parts: a **method** (a skill), a **result with a fixed structure** (items with states, owners and sources), and a **view** where the attorney decides on each item. The model works in the chat; the page sends the run into the chat and reads the result back. This matches the v1 scope: the harness does the work, a page shows it.

## 2. How a work page maps onto the harness

| Part | What exists | What is missing | Smallest new piece |
|---|---|---|---|
| Template (method) | Skills (`packages/skill/*`). The FlowLeap pack has `recipe-office-action-response`, `recipe-prior-art-search`, `recipe-infringement-charting`, `recipe-freedom-to-operate`. Firm skills library planned (#71). | A link from a skill to a result structure and a view. | `work-page.yaml` beside `SKILL.md`: form fields, item fields, review states, views. Data, not code. |
| Copy | Agent folders of `flowleap-agent-builder` (writable and read-only firm roots). Decision 9 "Open in my workspace". | A copy with sample data. | A copy is a folder in the workspace with a sample result file. |
| Form | Question cards (`dsh-user-questions`), the agent form, the composer draft of "Create your plugin" (#70). | A form from a schema. | One form renderer that writes a draft prompt into a new chat. |
| Run | A durable chat turn on a preset (`patent` or an agent-builder preset). | Nothing. | The form sends one message that names the skill and inputs. |
| Result | `write_patent_results` (`flowleap-deliverables`): structured templates (`prior-art-report` and `invalidity-claim-chart` with `coverage` rows, `office-action-scaffold`, `fto-memo`, `eou-infringement-chart`), quotes checked against the evidence ledger. | An item file that a page reads and the attorney changes. | A `work_page_save` tool that writes `<name>.work.json` after the same validation. |
| States, owner | "Needs review" per chat (`flowleap-routines`, `ui-flowleap-routines`). | States and owners per item. | Fields in the item file, changed through a `flowleapWorkPages` Remote. |
| View | Keyed `main` slot (Automation tasks, Needs review pages), `sidebar.panellist`, `shell.overlay` (agent and schedule dialogs), `conversation.hero.options`. | A work-page view. | One client plugin: a "Work" page in `main`, a `sidebar.panellist` entry, the form in `shell.overlay`. Generic table, board and timeline views. |
| Outputs | Markdown reports; Word builders in `flowleap-deliverables/src/docx`, used only by `export_draft_docx` and `inventor_questions`; `skill-office`; the delivery card of `ui-deliverables`. | Word export of a report. | `export_report_docx` on the existing builders. |
| Sharing | Artifacts library planned (decision 9). | Not built. | Nothing new: Share the exported file. |
| Consent, cost | Gateway virtual key and budget per attorney (#30, #32); tool approvals. | A cost view on the form. | Show the budget left; no new consent dialog (see 5). |
| Patent tools | `flowleap-connectors`: EPO and USPTO reads, `read_application_document`, `compare_patents`, `get_prosecution_timeline`, `ocr`, `read_pdf`, the register reader; FlowLeap MCP tools such as `search_office_action_citations`. | Nothing for the first templates. | None. |
| Logging | "Model-visible ⟺ logged" (`docs/architecture.md`); tool calls and results are session events. | Page edits are not model-visible. | The model sees the item file only through a logged tool read. |

## 3. Work pages and the planned features

- **Dashboard (OS-1, #60).** "Needs your review" counts work-page items in that state beside routine chats. The "app page" component of #60 (tabs, "make something new" tiles, card gallery) is also the work-page gallery; build it once.
- **Cases (OS-2).** A case holds its work pages. Until OS-2, the workspace folder is the case (decision 8).
- **Artifacts library (decision 9).** Each attorney has a separate runtime, so a live page cannot reach a colleague. The attorney exports a file and Shares it; the library stores that copy. "Open in my workspace" gives a colleague a copy with its origin.
- **Routines (decision 27).** The register watch finds a new office action; the run uses the office action skill; the result goes to the office action board; the chat gets "Needs review".
- **Issue #70.** "New automation task" opens an empty chat. The work-page form renderer (a form that writes a draft prompt) can be its first user.

## 4. The first three patent templates

Ranked by attorney value and reuse.

| Rank | Template | Inputs | Steps | Review states | Outputs |
|---|---|---|---|---|---|
| 1 | **Office action board** (#46) | EP or US application number; optional action PDF. | Office action skill (#46); `read_application_document` or `ocr`; `get_claims`, `get_description` of cited documents; `compare_patents`; `office-action-scaffold`. | Per objection: Needs review, Argue, Amend, Accept, Done; owner; deadline. | Analysis and response plan (Word); objections with cited passages. |
| 2 | **Prior-art tabular review** | Claim or invention text; documents or a search. | `recipe-prior-art-search`; `search_patents`; `get_claims`; `prior-art-report` with `coverage` rows (quotes already checked). | Per cell: Unchecked, Checked. Per document: X, Y, A, Not relevant. | Table (document by claim feature), report, Word. |
| 3 | **Claim chart** | Patent and claim; product description or second patent. | `recipe-infringement-charting` or `recipe-invalidity-analysis`; `compare_patents`; `eou-infringement-chart` or `invalidity-claim-chart`. | Per element: Needs review, Met, Not met, Unclear; owner. | Chart (Word), notes per element. |

Not first: the **FTO matrix** is a legal opinion whose markets the attorney must confirm (the Markets card of `fto-memo`), and it builds on templates 2 and 3; do it fourth. The **register watch wall** has no model run; it is the "Coming up" panel of #60.

## 5. Design options

| | A. Chat plus result file, one generic view | B. New durable entity | C. One plugin per template |
|---|---|---|---|
| Durability | Chat log plus a workspace file; both in backups. | New persistence type: `SCHEMA_VERSION`, catalogue, upgrade guides. | Each plugin owns storage. |
| Model-visible logging | The model reads the file only through a logged tool. | Needs session events for item changes. | Each plugin must get it right. |
| Sharing across runtimes | Export and Share (decision 9). | Same; the store is private to one runtime. | Same. |
| Model calls from the page | None; the page writes chat messages only. | Same if built the same way. | A plugin can call the model outside a chat. |
| New templates | Firm adds a skill and `work-page.yaml`; no release. | Same, after the store exists. | A release each; attorneys cannot add plugins (#61). |
| Cost | One tool, one Remote, one client plugin. | Medium to large. | Large and repeated. |

**Recommendation: option A.** It builds on skills, chats, `flowleap-deliverables` and the `main` slot. Every model call stays in a chat, so the log, the gateway and the budget apply, and no new consent dialog is necessary. It adds no persistence type. Option B can come later if the dashboard needs queries over many pages.

Security rules for option A:
- The page never calls the model or a connector. "Brief", "Send again" and "Fill the plan" each send a message into the page's chat.
- The Remote changes only attorney fields (state, owner, note), never findings or sources.
- A download is a workspace file through the existing delivery card.

## 6. Open decisions for the founder

1. Is a work page a chat plus a file (option A)? Recommended: yes.
2. Does a template live in its skill folder as `work-page.yaml`? Recommended: yes, so the firm skills library (#71) also holds firm templates.
3. Does v1 include "Make it yours" with sample data? Recommended: yes for the FlowLeap templates, one public EP sample each.
4. Where do attorney changes go? Recommended: into the item file through the Remote; the model sees them when it reads the file.
5. Is "owner" a firm user or free text? Recommended: free text until group sharing (#56).
6. Which template is first? Recommended: the office action board, with #46.
7. Is Word export of reports in v1? Recommended: yes (`export_report_docx`).
8. Work pages are not in "v1 supports". Recommended: add the office action board to v1 as the result view of #46; put the gallery and templates 2 and 3 in "Later" with tickets.
9. Does the form show a cost estimate? Recommended: the budget left only, until the gateway has cost data per skill.

## 7. "Look first" proposal

Mock the **office action board** with sample data in the real `flowleap-web` app, before data work, and take screenshots with the verify skill. It shows:
- a header: "EP 3 456 789 · Communication under Article 94(3) EPC", days to the deadline, the owner, the "Needs review" count;
- the form: application number, optional PDF, the agent, the budget left;
- the run state: "Agent is reading the action", with a link to the chat;
- one card for each objection (Article 54, 56, 84): the claims it hits, D1 and D2 with cited passages, a state and an owner;
- a side panel: the examiner's text, the cited passage beside the claim feature, the response options;
- "Write response plan" (a chat message), "Export Word", and "Share" (disabled until the library exists);
- a footer: a draft for the attorney's review.
