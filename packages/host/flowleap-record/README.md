---
description: "The Firm Record of flowleap-os in the harness: the flowleapRecord seam that reads one matter's view with its record position, its http provider, and the read-only record_read tool whose JSON result names recordSeq and viewHash in the Session log."
kind: "package-reference"
---

# @deepseek-ai/dsh-flowleap-record

## Summary

`dsh-flowleap-record` connects an attorney's runtime to the Firm Record of flowleap-os, the only writer of the firm's record (design PR 214, phase R0). A runtime reads; it never writes a decision. The package is one capability seam: the Service Definition `ctx.flowleapRecord` (one matter's view at one record position), the http Provider `@deepseek-ai/dsh-flowleap-record/http`, and the Consumer `record_read`, a read-only tool whose JSON result names `recordSeq` and `viewHash`, so the Session log holds the record position a model answer rests on.

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

The tool row has no config. The `flowleap-web` bundle sets `apiKeyRef` to `FLOWLEAP_RECORD_TOKEN`, the ref that the keys document of flowleap-os holds for each runtime, and no `baseURL`; the firm patch of flowleap-os sets `baseURL`. A patch replaces the row's whole `config`, so it restates `apiKeyRef` too. The generated [configuration catalog](../../../docs/config-catalog.md) is the exhaustive source for every accepted field.

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

`matter.state` is `open` or `closed`; a deadline `state` is `proposed`, `active`, or `rejected` (the R0 subset of the deadline state machine); dates are `YYYY-MM-DD`. Unknown fields are dropped; a missing or malformed field is an `invalid_answer`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`FlowleapRecordHttp` (the `./http` entry) is a Cordis `Service` under the `flowleapRecord` name. The constructor validates `baseURL` and `apiKeyRef` (through `credentialRef`); each call reads the token, sends one request, maps the status to a refusal, and validates the body with a strict zod schema whose transforms brand the ids and dates. `registerRecordReadTool` defines the tool with `defineTool`; the plugin entry registers it through `ctx.effect`, so disposing the row removes the tool.

| File | Role |
|---|---|
| [`src/types.ts`](src/types.ts) | the Service Definition `FlowleapRecord`, the branded ids, the view, and the refusals |
| [`src/http.ts`](src/http.ts) | the http Provider: Config, the read (its body through `readBoundedText` of `dsh-flowleap-connectors`), and the answer validation |
| [`src/tool.ts`](src/tool.ts) | the Consumer: the `record_read` schema, the file-number parse, and the refusal messages |
| [`src/index.ts`](src/index.ts) | the function plugin that registers the tool |
| [`tests/`](tests/) | the provider against a local Firm Record double, the tool with its refusals and disposal, and the Loader composition test with a fixture provider |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-flowleap-web](../../bundle/flowleap-web/README.md) — the bundle rows.
- [ui-flowleap-records](../../client/ui-flowleap-records/README.md) — the Matters page that embeds the Firm Record's pages, where a person confirms a deadline.
- [dsh-flowleap-budget](../flowleap-budget/README.md) — the same address, token, and answer rules for the firm's model gateway.

-----

<a id="model-experience"></a>
## Model Experience

### The `record_read` declaration

#### What the model sees

The generated tool catalog covers the shipped DeepSeek presets only, so the declaration is stated here. Description: "Read one matter of the firm's record: its file number, title, client, responsible attorney, state, and each deadline with its rule, due date, state, and the computation trace with legal citations. The result names recordSeq, the position of the record log the view was read at, and viewHash, so the view can be rebuilt later. The read is read-only: you cannot change the record, and a proposed deadline becomes active only when a person confirms it in the Records app." One required parameter, `file_number` (the firm's file number, for example `FL-2026-0001`). The result is JSON text: the view with `recordSeq`, `viewHash`, `matter`, and `deadlines` (each with its `trace`); or `error` (`invalid_file_number`, `not_found`, `not_configured`, `no_key`, `refused`, `unreachable`, `service_error`, `invalid_answer`) and `message`. The [`flowleap-record-read`](../../../snapshots/session/flowleap-record-read/) snapshot pins one read over a fixture provider; its `tool/result` line holds `"recordSeq":7` verbatim.

#### Token effect

The schema contributes fixed request-context tokens while the row is mounted. A result grows with the number of deadlines and their trace steps, bounded by the provider's 1 MiB answer limit.

#### KV Cache effect

The declaration is stable while the row is mounted. Results append to history.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Reads only** — a runtime never confirms, rejects, or proposes a deadline; the Firm Record answers every command with a runtime credential with `403 agent-cannot-decide`, and this package offers no tool for one. A person decides in the Records app.
- **One matter per call** — there is no list or search; the model needs the file number. A list tool comes with a later phase, after the Firm Record serves one inside the reader's wall.
- **No `?at=` read** — the tool reads the current view only; rebuilding the view at a logged `recordSeq` is an auditor's call on the Firm Record, not a model call.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The engine's actor on a `deadline/proposed` event is `{ kind: 'engine', onBehalfOf: person }`; the view does not carry actors, so the seam's types have no actor union. Add one only when a consumer reads it.

</details>
