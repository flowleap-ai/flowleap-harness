---
description: "The Firm Record of flowleap-os in the harness: the flowleapRecord seam that reads one matter's view with its record position, its http provider, and the read-only record_read tool whose JSON result names recordSeq and viewHash in the Session log."
kind: "package-reference"
---

# @deepseek-ai/dsh-flowleap-record

## Summary

`dsh-flowleap-record` connects an attorney's runtime to the Firm Record of flowleap-os, the only writer of the firm's record (design PR 214, phases R0 and R1). A runtime reads and proposes; it never writes a decision. The package is one capability seam: the Service Definition `ctx.flowleapRecord` (a matter's view at one record position, and the run commands of a Ticket), the http Provider `./http`, the read-only `record_read` tool, whose JSON result names `recordSeq` and `viewHash`, and the `./run` entry with `record_propose_report` and `record_finish_run` for a Ticket run.

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

Mount the provider beside the `credentials` service, which reads the record token, and the tool row beside the tool registry; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the ids `flowleap-record-http` and `flowleap-record`. A test composition may provide `flowleapRecord` itself and mount only the tool row.

### Configuration

```yaml
- id: flowleap-record-http
  name: '@deepseek-ai/dsh-flowleap-record/http'
  config:
    baseURL: http://flowleap-record:8091
    apiKeyRef: FLOWLEAP_RECORD_TOKEN
    timeoutMs: 5000

- id: flowleap-record
  name: '@deepseek-ai/dsh-flowleap-record'
```

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | `''` | Base URL of the Firm Record; empty when the runtime has no Firm Record, and every read then reports `not_configured`. Any other value must be an https URL, or an http URL to a loopback address or a single-label host such as `flowleap-record`, or the row fails at load |
| `apiKeyRef` | required | Credential reference (environment-variable name) of the runtime's record token, read through `ctx.credentials` and sent as `Authorization: Bearer <token>`; an invalid name fails at load |
| `timeoutMs` | `5000` | Longest time one read may take, body included, in milliseconds (100 to 60000) |

The run row registers `record_propose_report` and `record_finish_run` for a Ticket run; the opt-in overlay of [`dsh-experimental-flowleap-ticket`](../../experimental/flowleap-ticket/README.md) mounts it beside the Ticket ingress:

```yaml
- id: flowleap-record-run
  name: '@deepseek-ai/dsh-flowleap-record/run'
  config:
    templatesDir: /opt/flowleap/templates
```

| Field | Default | Meaning |
|---|---|---|
| `templatesDir` | required | Absolute folder of the firm's `.docx` templates, the `templatesDir` of the Office tools; a relative path fails at load. The report names the template by its file name (`templateName`), and its `templateVersion` is `sha256:<hex>` of the named template file there |

The run row injects `flowleapRecord`, `tools`, `fs`, and `workingDirectory`. The tool row has no config. The `flowleap-web` bundle sets `apiKeyRef` to `FLOWLEAP_RECORD_TOKEN`, the ref that the keys document of flowleap-os holds for each runtime, and no `baseURL`; the firm patch of flowleap-os sets `baseURL`. A patch replaces the row's whole `config`, so it restates `apiKeyRef` too. The generated [configuration catalog](../../../docs/config-catalog.md) is the exhaustive source for every accepted field.

### The seam

`ctx.flowleapRecord.matterView(fileNumber, signal)` returns a `MatterViewResult`: the `MatterView` (`recordSeq`, `viewHash`, `matter`, `deadlines`), or `{ error }` with a `MatterViewRefusal`. `recordSeq` is the position of the record log the view was read at, and `viewHash` the SHA-256 of the canonical JSON of the view without the hash; the Firm Record rebuilds the view at that position with `GET matters/<fileNumber>/view?at=<recordSeq>`, so an auditor can check what a Session saw. Ids and dates are branded (`MatterFileNumber`, `DeadlineId`, `RuleId`, `RecordSeq`, `ViewHash`, `LocalDate`); the provider brands them when it validates the answer, and the tool brands the file number when it parses the model's argument. The method rejects when `signal` fires.

| Refusal | When |
|---|---|
| `not_found` | the Firm Record answers 404: no matter with this file number inside the reader's wall |
| `not_configured` | `baseURL` is empty |
| `no_key` | the credential of `apiKeyRef` is not set, is empty, or cannot be read; a read failure logs one warning |
| `refused` | the Firm Record answers 401 or 403 |
| `unreachable` | the connection fails, the service redirects, or the answer does not arrive within `timeoutMs`; the Host logs the cause without the token |
| `service_error` | the Firm Record answers another HTTP error status; the Host logs the status |
| `invalid_answer` | the body is larger than 1 MiB, is not JSON, or is not a matter view |

### The http read

The provider sends `GET <origin of baseURL>/records/api/matters/<fileNumber>/view` with the token as a bearer token; the file number is percent-encoded. It does not follow a redirect and reads at most 1 MiB of the body. The Firm Record answers `200` with this JSON body:

```json
{
  "recordSeq": 7,
  "viewHash": "511c7003…",
  "matter": { "fileNumber": "FL-2026-0001", "title": "Heat pump control", "client": "Nordwind Energie GmbH", "responsible": "A. Novak", "state": "open" },
  "deadlines": [{
    "id": "0b2d5a8e-…", "ruleId": "ep.r71-3.grant-communication", "ruleVersion": 1, "due": "2026-03-02", "state": "proposed",
    "trace": [{ "op": "delivery", "from": "2025-10-30", "to": "2025-10-30", "cite": "R.126(2) EPC, OJ EPO 2023 A29" }]
  }]
}
```

The phase R1 view adds four fields, always present (empty lists and `null` when there is nothing):

```json
{
  "clientRules": { "seq": 3, "aiUse": "allowed", "aiLetters": "allowed", "reportEvents": "all-office-actions", "language": "en", "text": "Report every office action in English…" },
  "officeEvents": [{ "id": "oe-1", "seq": 5, "code": "EPO:R71(3)", "documentDate": "2025-10-30", "applicationNumber": "EP23812345.6", "document": "5f2c8a1e…", "state": "observed" }],
  "tickets": [{ "id": "tk-1", "pass": 1, "state": "running", "routedTo": "A. Novak" }],
  "documents": [{ "sha256": "5f2c8a1e…", "fileName": "R71-3-communication.pdf", "mediaType": "application/pdf", "source": "mail" }]
}
```

`matter.state` is `open` or `closed`; a deadline `state` is `proposed`, `active`, or `rejected` (the R0 subset of the deadline state machine); dates are `YYYY-MM-DD`. `clientRules` is `null` when no person recorded the client's rules; its `aiUse` is `not-recorded`, `allowed`, `local-model-only`, or `not-allowed`, its `aiLetters` is `allowed` or `not-allowed`, its `reportEvents` is `all-office-actions` or a list of event codes, and its `language` is `de` or `en`. An office event's `applicationNumber` and `document` are `null` for an event that a person recorded without a document. A Ticket's `state` is one of the eleven states of [atlas sheet 3](../../../flowleap/docs/process-atlas/03-notify-and-run.md), and `routedTo` is the routed person's display name, or `null` before routing. Document hashes are lower-case SHA-256 hex. Unknown fields are dropped; a missing or malformed field is an `invalid_answer`. **An R0 Firm Record** answers no `clientRules`, `officeEvents`, `tickets`, or `documents`: the view then has none of these four keys, not `null` or empty lists, because an empty list would tell the model that the matter has no Tickets or documents and `null` would tell it that no person recorded the client's rules. A view with only some of the four is an `invalid_answer`.

### The run commands

A runtime woken for a Ticket (see [`dsh-experimental-flowleap-ticket`](../../experimental/flowleap-ticket/README.md)) reports to the Firm Record through three seam methods. Each sends `POST <origin>/records/api/tickets/<ticketId>/<action>` with the record token, a JSON body, and an `Idempotency-Key` of `<kind>:<SHA-256 hex of the JSON array of its parts>`, so a repeat of the same command sends the same key:

| Method | Action and body | Key parts | Receipt |
|---|---|---|---|
| `runStarted(ticket, { session })` | `run-started`: `{ session }` | `run-started`: Ticket, Session | `200 { recordSeq }` |
| `proposeReport(ticket, proposal)` | `reports`: `{ fileName, contentBase64, templateName, templateVersion, rulesSeq, statements, session, toolCall }` | `report`: Ticket, Session, tool call | `201 { proposalId, document, recordSeq }` |
| `finishRun(ticket, { session, deadline })` | `finish`: `{ session, deadline: { id, state, seq } }`, where `id` and `state` are both `none-yet` when the event has no deadline | `finish`: Ticket, Session | `200 { recordSeq, outbox: { id, state } }`: the Firm Record queues one reply with the proposed letters attached as drafts to the forwarder of the office letter and the routed person; `state` is `refused` when a recipient is not a firm address. Nothing goes to the client |

A statement is `{ text, evidence: [{ document, span? }] }` with at least one evidence item; a `span` is `{ page, start, end, quote }`. Each method returns the receipt or a `RecordCommandError` `{ error, detail? }`; `detail` is the Firm Record's one-sentence detail, at most 300 characters:

| Refusal | When |
|---|---|
| `not_configured`, `no_key`, `unreachable`, `service_error`, `invalid_answer` | as for the view read |
| `refused` | 401, or 403 without a known code |
| `agent_cannot_decide` | 403 `agent-cannot-decide` |
| `not_routed_person` | 403 `not-routed-person`: the Ticket is routed to another person |
| `not_found` | 404: no Ticket with this id |
| `invalid_body` | 400 `invalid-body` |
| `ticket_not_waking` | 409 `ticket-not-waking`: `run-started` for a Ticket that is not `waking` |
| `ticket_not_running` | 409 `ticket-not-running`: a report or finish for a Ticket that is not `running` |
| `client_rule_forbids_ai_draft` | 409 `report.no-ai-draft-against-client-rule` |
| `statement_without_evidence` | 422 `report.statement-has-evidence` |
| `no_proposals` | 409 `no-proposals`: a finish before a proposal of this Ticket and pass |
| `document_too_large` | 413 `document-too-large`: the letter is above 5 MiB |
| `idempotency_key_reused` | 409 `idempotency-key-reused`: the key came before with another body, such as a second finish of the run with another deadline summary, or a report of the same tool call with another letter |

### The run tools

`record_propose_report` reads the `.docx` letter from the Session working directory (relative path, inside the directory, at most 5 MiB) and the named template from `templatesDir`, and calls `proposeReport` with the letter, the template name, `templateVersion`, `rules_seq`, the statements, the Session id, and the id of the tool call itself (a call inside a PTC program has its own id, so two letters proposed by one `run_code` program are two commands). Each statement needs at least one evidence item `{ document, span? }`; `document` is a lower-case SHA-256, and a `span` has a positive `page`, `start` and `end` with `end` not before `start`, and a `quote` of at most 200 characters. `record_finish_run` calls `finishRun` with the Session id and the summary `{ id, state, seq }` from `deadline_id`, `deadline_state` (`proposed`, `active`, `rejected`, or `none-yet`), and `record_seq`; `deadline_id` and `deadline_state` are both `none-yet` or neither is. An argument that breaks these rules, a missing file or template, or a call outside an agent Session is a tool error, and the seam is not called. A refusal of the Firm Record is a JSON result `{ error, message, detail? }`, where `message` says what the model does next.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`FlowleapRecordHttp` (the `./http` entry) is a Cordis `Service` under the `flowleapRecord` name. The constructor validates `baseURL` and `apiKeyRef` (through `credentialRef`); each call reads the token, sends one request, maps the status to a refusal, and validates the body with a strict zod schema whose transforms brand the ids and dates. `registerRecordReadTool` defines the tool with `defineTool`; the plugin entry registers it through `ctx.effect`, so disposing the row removes the tool.

| File | Role |
|---|---|
| [`src/types.ts`](src/types.ts) | the Service Definition `FlowleapRecord`, the branded ids, the view, the run commands and receipts, and the refusals |
| [`src/http.ts`](src/http.ts) | the http Provider: Config, the read and the commands (bodies through `readBoundedText` of `dsh-flowleap-connectors`), the idempotency key, the refusal-code map, and the answer validation |
| [`src/tool.ts`](src/tool.ts) | the Consumer: the `record_read` schema, the file-number parse, and the refusal messages |
| [`src/index.ts`](src/index.ts) | the function plugin that registers the tool |
| [`src/run/`](src/run/) | the run entry: `record_propose_report` (the letter and template read through the file rules of `dsh-flowleap-office`), `record_finish_run`, their argument rules, and the refusal messages |
| [`tests/`](tests/) | the provider against a local Firm Record double, the tools with their refusals and disposal, and the Loader composition test with a fixture provider |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-flowleap-web](../../bundle/flowleap-web/README.md) — the bundle rows.
- [ui-flowleap-records](../../client/ui-flowleap-records/README.md) — the Matters panel, the IPMS views over the Records API, where a person confirms a deadline.
- [dsh-flowleap-budget](../flowleap-budget/README.md) — the same address, token, and answer rules for the firm's model gateway.

-----

<a id="model-experience"></a>
## Model Experience

### The `record_read` declaration

#### What the model sees

The generated tool catalog covers the shipped DeepSeek presets only, so the declaration is stated here. Description: "Read one matter of the firm's record: its file number, title, client, responsible attorney, state, and each deadline with its rule, due date, state, and the computation trace with legal citations; the client's recorded rules (AI use, AI letters, the events that need a report, the letter language, and their text); the office events, the Tickets, and the documents of the e-file with their SHA-256. A Firm Record before R1 holds none of clientRules, officeEvents, tickets, and documents: the result then has none of these four fields, and you do not know the client's rules, so you do not assume them. The result names recordSeq, the position of the record log the view was read at, and viewHash, so the view can be rebuilt later. The read is read-only: you cannot change the record, and a proposed deadline becomes active only when a person confirms it in the Records app." One required parameter, `file_number` (the firm's file number, for example `FL-2026-0001`). The result is JSON text: the view with `recordSeq`, `viewHash`, `matter`, `deadlines` (each with its `trace`), `clientRules`, `officeEvents`, `tickets`, and `documents`, where a Firm Record before R1 gives none of the last four; or `error` (`invalid_file_number`, `not_found`, `not_configured`, `no_key`, `refused`, `unreachable`, `service_error`, `invalid_answer`) and `message`. The [`flowleap-record-read`](../../../snapshots/session/flowleap-record-read/) snapshot pins one read over a fixture provider; its `tool/result` line holds `"recordSeq":7` verbatim.

#### Token effect

The schema contributes fixed request-context tokens while the row is mounted. A result grows with the number of deadlines and their trace steps, office events, Tickets, and documents, bounded by the provider's 1 MiB answer limit.

#### KV Cache effect

The declaration is stable while the row is mounted. Results append to history.

### The `record_propose_report` declaration

#### What the model sees

`record_propose_report` description: "Propose the client report letter of this Ticket run to the attorney. The letter is a .docx file in the working directory that office_letter_from_template wrote on a firm template. Give each statement that the letter makes about the office letter, the matter, or the deadline, each with at least one source: the SHA-256 of a document of the record (record_read lists them) and, when you can, the quoted place. rules_seq is the seq of the client rules (clientRules.seq of record_read) that the letter follows. The Firm Record stores the letter as a proposal; the attorney accepts or rejects it in the Records app. Nothing goes to the client before the attorney decides: when the run finishes, the Firm Record attaches the letter as a draft to one reply to firm addresses only, the person who forwarded the office letter and the routed attorney. You do not send the letter." Parameters: `ticket_id`, `file`, `template`, `rules_seq`, and `statements` (each `{ text, evidence: [{ document, span? }] }`), all required. The result is JSON text: `{ proposalId, document, recordSeq }`, or `{ error, message, detail? }`.

#### Token effect

The schema contributes fixed request-context tokens while the run row is mounted. A call grows with its statements; the result is a few hundred characters.

#### KV Cache effect

The declaration is stable while the run row is mounted. Results append to history.

### The `record_finish_run` declaration

#### What the model sees

`record_finish_run` description: "End this Ticket run after you proposed the report letter. Give the deadline summary: the id and state of the deadline of the office event as record_read shows it, and the recordSeq of that read; give none-yet for both id and state when the record has no deadline for the event. You do not compute or change a date: the attorney checks the deadline and decides each proposal in the Records app. The Firm Record then queues one reply to firm addresses only, the person who forwarded the office letter and the routed attorney, with the proposed letters attached as drafts. Nothing goes to the client, and you send nothing." Parameters: `ticket_id`, `deadline_id`, `deadline_state`, and `record_seq`, all required. The result is JSON text: `{ recordSeq, outbox: { id, state } }`, or `{ error, message, detail? }`. The [`flowleap-ticket-run`](../../../snapshots/session/flowleap-ticket-run/) snapshot pins one Ticket run over a fixture provider.

#### Token effect

The schema contributes fixed request-context tokens while the run row is mounted; the result is a few hundred characters.

#### KV Cache effect

The declaration is stable while the run row is mounted. Results append to history.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No decisions** — a runtime never confirms or rejects a deadline or a proposal; the Firm Record answers every decision with a runtime credential with `403 agent-cannot-decide`, and this package offers no tool for one. A person decides in the Records app.
- **No `report/by-hand` or `report/flagged` command** — when the client rules forbid an AI draft, the run can only tell the attorney in the chat; atlas sheet 4 lists `checking_rule → by_hand` and `proposed → flagged` with the agent as actor, but the R1 Firm Record has no command for them.
- **The run tools are on in every Session of the row** — the model of any chat sees them while the run row is mounted; the Firm Record refuses a command for a Ticket that is not running or not routed to the runtime's person.
- **One matter per call** — there is no list or search; the model needs the file number. A list tool comes with a later phase, after the Firm Record serves one inside the reader's wall.
- **No `?at=` read** — the tool reads the current view only; rebuilding the view at a logged `recordSeq` is an auditor's call on the Firm Record, not a model call.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The engine's actor on a `deadline/proposed` event is `{ kind: 'engine', onBehalfOf: person }`; the view does not carry actors, so the seam's types have no actor union. Add one only when a consumer reads it.

</details>
