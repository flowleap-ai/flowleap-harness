---
description: "Signed Ticket ingress of a FlowLeap runtime for maintainers composing the R1 AI mailbox run: a Ticket delivery of the Firm Record opens one run Session whose first message starts with the Mandate, and the Session is reported to the Firm Record."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-flowleap-ticket

## Summary

`dsh-experimental-flowleap-ticket` is the runtime side of the Ticket wake of the R1 AI mailbox ([atlas sheet 3](../../../flowleap/docs/process-atlas/03-notify-and-run.md)). The Work router of the Firm Record posts a signed Ticket delivery to one exact route of the runtime's WebServer. The plugin verifies `X-Flowleap-Signature`, parses the delivery, and dispatches it to `ctx.webhookRuntime`; its rule opens one run Session whose first message starts with the Mandate of the task type ("analyse and draft, never file, send or pay"), followed by the delivery as data. After the Session admitted its prompt, the rule records the delivery in a durable ledger and reports `POST tickets/<id>/run-started { session }` through `ctx.flowleapRecord`. A repeat of the same `X-Flowleap-Delivery` opens no second Session, also after a restart. Use it on an attorney's runtime that the Firm Record wakes for Ticket runs.

## Table of Contents

- [Composition](#composition)
- [Configuration](#configuration)
- [HTTP contract](#http-contract)
- [The run Session](#the-run-session)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="composition"></a>
## Composition

The plugin injects `webServer`, `webhookRuntime`, `credentials`, and `flowleapRecord`. Mount it with `@deepseek-ai/dsh-webhook` and the run row `@deepseek-ai/dsh-flowleap-record/run` over the `flowleap-web` profile; the [`examples/local-run/cordis.yml`](examples/local-run/cordis.yml) overlay does this and names the environment it reads. The run also needs the Office tools (`office_letter_from_template`), which the firm image switches on.

The route is on the runtime's own WebServer, where the Work router finds the runtime (`runtimes/<person id>.json` of the starter folder). A WebServer route checks no session cookie: only the Remote API admits a browser connection by its cookie, and every other route owns its own admission. This route admits a request by its HMAC signature alone, as the [GitHub adapter](../webhook-github/README.md) does; unlike that adapter, it needs no second WebServer, because the Firm Record reaches the runtime inside the firm's network.

<a id="configuration"></a>
## Configuration

| Key | Default | Meaning |
|---|---|---|
| `source` | `firm-record` | Adapter instance name carried to the rule; a non-empty trimmed string |
| `path` | `/api/flowleap/ticket` | Exact absolute route, the Work router's `ticket.wake.path`; no trailing slash, query, or fragment |
| `secretRef` | `FLOWLEAP_TICKET_SECRET` | Credential reference of the person's Ticket key, the Firm Record's `RECORD_DIR/ticket-keys/<person id>`; resolved for each request, so a rotation takes effect without a reload |
| `maxBodyBytes` | `65536` | Raw body ceiling in bytes, at most 1 MiB |
| `stateDir` | required | Absolute folder of the delivery ledger; it must outlive a restart |
| `workspacePath` | required | Absolute existing folder of the run Workspace; each run writes its letter there |
| `agentPreset` | required | Agent preset of the run Session, for example `patent` |
| `permissionPreset` | required | Permission preset of the run Session, for example `workspace-write` |
| `template` | required | File name of the firm template of the report letter, a `.docx` name without a folder |

A relative `stateDir` or `workspacePath`, a template name with a folder, or an invalid path or secret reference fails at load.

<a id="http-contract"></a>
## HTTP contract

The Work router sends `POST <path>` with `Content-Type: application/json`, `X-Flowleap-Signature: sha256=<lower-case hex HMAC-SHA256 of the raw body>`, and `X-Flowleap-Delivery: <ticketId>/<pass>`. The body:

```json
{ "ticketId": "tk-1", "pass": 1, "matter": { "fileNumber": "FL-2026-0001", "title": "Heat pump control" },
  "events": [{ "officeEventSeq": 5, "code": "EPO:R71(3)", "documentDate": "2025-10-30", "applicationNumber": "EP23812345.6", "document": "5f2c8a1e…" }],
  "deadline": { "id": "d-1", "state": "proposed", "due": "2026-03-02" }, "recordSeq": 7 }
```

The ingress checks the request in this order: method, media type, bounded body, both headers, the secret, the signature before any parse, the delivery, the delivery id against the body, the task type, then the ledger. `deadline` is `null` when the record has no deadline yet; a deadline `state` is `proposed`, `active`, or `rejected`; `ticketId` has 1 to 128 letters, digits, dots, underscores, or hyphens; `events` has 1 to 20 items; unknown fields are dropped.

| Status | Meaning |
|---|---|
| `202` | The delivery was dispatched; the Ticket stays `waking` until `run-started` arrives |
| `200` | The same delivery id already opened a Session, or its dispatch is in progress; nothing new starts |
| `400` | A header, the JSON, the delivery fields, or the delivery id against the body is invalid |
| `401` | The signature does not match; the Host logs one warning without the body, the signature, or the secret |
| `405` | The method is not `POST` |
| `413` | The body is larger than `maxBodyBytes` |
| `415` | The media type is not `application/json` |
| `422` | No task type has the office event codes of the Ticket (in R1, only `EPO:R71(3)`) |
| `503` | The secret or the webhook runtime is not available |

**At most one Session per delivery.** The ledger claims a delivery id in memory before the dispatch, and the rule writes `<stateDir>/<SHA-256 of the delivery id>.json` (`{ deliveryId, session, at }`) with the exclusive-create flag after the Session admitted its prompt. A repeat finds the file or the claim and gets `200`. A restart keeps the files, so a repeat after a restart opens no Session.

<a id="the-run-session"></a>
## The run Session

The rule returns a `WebhookSessionRequest` with `workspacePath`, `agentPreset`, `permissionPreset`, the title `Report to the client, <file number>`, and the default model. The prompt has five paragraphs: the Mandate of the task type, the steps with the configured template, the line `Ticket: ticket_id "<id>", pass <n>, matter <file number>.`, the line that labels the JSON as data, and `ticket_delivery_json: <the parsed delivery>`. The message source is `webhook` with the provider `flowleap-ticket`, the source, the delivery id, and the rule id `flowleap-ticket-run`, so the Session log alone rebuilds what the model saw.

After the Session admitted its prompt, `started()` records the delivery and calls `flowleapRecord.runStarted(ticketId, { session })`. A refusal is logged as one warning with its code; the Session stays.

-----

<a id="model-experience"></a>
## Model Experience

### The run message

#### What the model sees

One user message with source `webhook` opens the run Session. Its first paragraph is the Mandate of the task type, verbatim below for `epo-r71-3-report`; the steps that follow tell the model to read the matter with `record_read`, to stop when the client rules do not allow an AI letter, to write the letter with `office_letter_from_template` on the configured template, to propose it with `record_propose_report`, and to finish with `record_finish_run`; the Ticket delivery follows as JSON, labelled as data, not instructions. The [`flowleap-ticket-run`](../../../snapshots/session/flowleap-ticket-run/) snapshot pins one run message.

##### The Mandate of epo-r71-3-report

```markdown
Mandate: you work for the responsible attorney of this matter. Analyse and draft; never file, send or pay. You do not decide: each result is a proposal that the attorney decides in the Records app. You do not compute or change a date. Task type: epo-r71-3-report, the report to the client on an EPO communication under Rule 71(3) EPC.
```

#### Token effect

One user message of about 400 tokens plus the delivery JSON, which grows with the number of events (at most 20).

#### KV Cache effect

The message starts a new Session, so it establishes that Session's request prefix.

-----

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **One task type** — only `EPO:R71(3)` has a Mandate; any other code gets `422`, and the Work router's retries end in `run_failed` (`wake-failed`).
- **A crash between the prompt and the ledger file** — a repeat after such a crash opens a second Session; the Firm Record answers its `run-started` with `409 ticket-not-waking`, so the record keeps one Session.
- **A failed Session creation keeps its claim** — when the webhook runtime fails to open the Session, the claim stays until the process restarts, and a repeat of that delivery gets `200`; the Ticket then ends `run_failed` by the Work router's time limit.
- **No retry of `run-started`** — a refused or unreachable `run-started` is logged once; the Ticket then ends `run_failed` by the Work router's time limit.
- **The ledger only grows** — one small file per delivery; pruning is a follow-up.
- **No run time or budget limit in the runtime** — the Work router's `ticket.runTimeLimit` ends a long run; the runtime reports no `run_failed`.
- **The run model is the runtime's default** — the Work router checks the client's AI wishes against its `ticket.runModel` setting, not against the model this runtime uses.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The rule needs the Session id for `run-started`; `WebhookRule.started()` of `dsh-webhook` gives it after the prompt admission.

</details>
