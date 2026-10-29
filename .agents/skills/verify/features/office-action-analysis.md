# Office action analysis

The attorney asks for the analysis of the newest office action of one EP or US application, in a chat or through a routine. The Patent Agent loads the `recipe-office-action-response` skill of the FlowLeap skill pack, reads the action and the cited documents with the office tools, and saves one report with `write_patent_results` (`office-action-scaffold`). The report has one `### Objection` block for each objection, a claim-by-claim comparison, a response plan for the attorney, and the generated provenance appendix from the evidence ledger. Nothing is filed or sent.

## Sub-features

- `oa-chat-us` analyses the newest USPTO action of a US application from a chat message.
- `oa-chat-ep` analyses the European search report of an EP application from a chat message (no tool serves the text of an EPO communication).
- `oa-routine` runs the analysis from a register watch whose instruction names the application, in the new chat of a due run, with the `Needs review` mark.

## How to get to it (user POV)

- In a new Session, send `Analyse the office action for US 19/043,989.` or `Analyse the office action for EP 4814394.`
- Ask the Patent Agent to watch the application and to analyse each new office action. A due run opens its own chat.

## Driving it with the browser tool

Preconditions:

- The baseline in [README.md](./README.md).
- `FLOWLEAP_SKILLS_DIR` names a pack that holds the skill version under test. For an unreleased skill, copy the `skills/` folder of a flowleap-cli checkout to `<scratchpad>/skills-pack` and start with `FLOWLEAP_SKILLS_DIR=<scratchpad>/skills-pack`.
- The EPO OPS, USPTO ODP and Mistral cards show `Configured`, and doctor shows `PASS flowleap CLI: signed in` (US claims of cited documents come from `mcp__flowleap__get_claims`).
- This feature is about model behavior. Before the first message of a chat, choose `Anthropic: Claude Sonnet 5.5` in the model picker. A routine run opens its chat on the default model, so for `oa-routine` start with `DSH_VERIFY_PATCH` naming an overlay that sets the `agent-default-model` row to `openrouter` / `anthropic/claude-sonnet-5.5`.

- **Chat.** In a new Session, send `Analyse the office action for <application>.` Do not name the skill: the request must select it. Wait until the delivery card of the report shows and the composer is empty. A run takes 3 to 6 minutes.
- **Chat log.** Run the log summary. It shows `skill {"name":"recipe-office-action-response"}` first, a `read` of `references/analysis-layout.md`, the office reads (US: `get_application_documents`, `read_application_document` for the CTNF, the 892 and the CLM listing; EP: `get_bibliography` with `citedReferences` and `get_prosecution_timeline`), the text reads of the cited documents, the legal pages through `web_fetch`, one `write_patent_results` with `"template":"office-action-scaffold"`, and `turn 1: completed`.
- **Second view.** The report is in `$RUN/workspace/deepseek-harness/default-workspace/office-actions/<application>/`. It has `## 2. Objections` with `### Objection` blocks, `## 3. Claim-by-claim comparison`, `## 4. Response plan`, `## 5. Sources and gaps`, and the generated `## Data provenance` list of the recorded tool calls. Copy the folder to `$RUN/evidence/` before the next run: a later run on the same application and date writes the same path.
- **Routine.** In a new Session, send `Call register_watch_create once with applications ["US 19/043,989"], title "Office action watch US 19/043,989", prompt "A new office action event arrived for US 19/043,989. Analyse the newest office action of US 19/043,989 and save the analysis for the attorney.", daily time <a few minutes ahead> time_zone UTC. Then reply with only DONE.` Stop the instance. In `$RUN/home/storages/flowleap_routines.json`, remove the office action event from the watch's `seen` counts (for US 19/043,989, `["2026-10-29","MCTNF"]`); keep a copy of the file in `$RUN/evidence/`. Start the instance again.
- **Routine log.** At the daily time a chat titled `US19043989: Mail Non-Final Rejection (2026-10-29)` opens. Its log has one `user/message` whose source is `schedule` and whose text holds the instruction and `register_events_json`, then the same tool sequence as the chat run and `turn 1: completed`. The chat row shows `Needs review`, and the chat header shows `Mark as done`.
- **Proof.** Save the log summaries, the report folders, and a screenshot of each delivery card in `$RUN/evidence/`.

## Gotchas

- No tool serves the text of an EPO communication or search opinion. Without a file, the EP report analyses the search report categories and passages and labels each objection as inferred. To test the file path, put the communication PDF in the workspace and ask for the analysis of that file (`read_pdf`).
- The native `get_description` serves EP and WO only. A US cited document's description comes only from its public page through `web_fetch`, which the ledger records as `fetch_webpage`; Google Patents often returns a truncated page.
- On 2026-10-29 the `web_fetch` of the epo.org EPC article pages returned only site navigation, so the EP run quoted no article text.
- The template header keeps `Examiner`, `Art Unit`, `Mailing Date` and `Response Due Date` as `_(to be completed)_`; the report's own `## 1. Action` table holds the values.
- A Sonnet run reads 1 to 1.6 million input tokens, most of them from the cache. Run each sub-feature once.
