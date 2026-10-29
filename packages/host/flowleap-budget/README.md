---
description: "The attorney's model spend and budget of this month from the firm's model gateway: the flowleapBudget Remote reads the gateway with the runtime's own virtual key and returns the figures, or unknown and the reason."
kind: "package-reference"
---

# @deepseek-ai/dsh-flowleap-budget

## Summary

`dsh-flowleap-budget` serves the `flowleapBudget` Remote: the attorney's model spend and budget of this month, read from the firm's model gateway (flowleap-harness#32) with the runtime's own virtual key, so a runtime reads only its own figures. When no gateway answers, as in a local run, the Remote reports `unknown` and the reason, never a made-up number or $0. [`ui-flowleap-budget`](../../client/ui-flowleap-budget/README.md) shows the figures on the dashboard.

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

Mount the row beside the `credentials` service, which reads the key; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the id `flowleap-budget`.

### Configuration

```yaml
- id: flowleap-budget
  name: '@deepseek-ai/dsh-flowleap-budget'
  config:
    url: http://flowleap-gateway:4000/flowleap/budget
    apiKeyRef: ANTHROPIC_API_KEY
    timeoutMs: 5000
```

| Field | Default | Meaning |
|---|---|---|
| `url` | `''` | Address of the gateway's budget read; empty when the runtime has no gateway, and every read then reports `unknown` (`not_configured`). Any other value must be an absolute http or https URL, or the row fails at load |
| `apiKeyRef` | required | Credential reference (environment-variable name) of the runtime's own virtual key, read through `ctx.credentials` and sent as `Authorization: Bearer <key>`; an invalid name fails at load |
| `timeoutMs` | `5000` | Longest time one read may take, in milliseconds (100 to 60000) |

The `flowleap-web` bundle sets `url` from the `FLOWLEAP_BUDGET_URL` environment variable (empty when unset) and `apiKeyRef` to `ANTHROPIC_API_KEY`, the key of the bundle's gateway routes. The generated [configuration catalog](../../../docs/config-catalog.md) is the exhaustive source for every accepted field.

### The gateway read

The Host sends `GET <url>` with the virtual key as a bearer token. The gateway answers `200` with this JSON body for the key's attorney:

```json
{ "month": "2026-10", "spent_usd": 12.5, "budget_usd": 50 }
```

`month` is the UTC calendar month `YYYY-MM`, `spent_usd` the spend of that month (0 or more), and `budget_usd` the monthly budget (0 or more), or `null` when the firm sets none.

### The Remote

`ctx.remote.flowleapBudget.month()` returns a `BudgetMonth`: `{ state: 'known', month, spentUsd, budgetUsd }`, or `{ state: 'unknown', reason }`. The endpoint is owner-only for Live Share viewers.

| Reason | When |
|---|---|
| `not_configured` | `url` is empty |
| `no_key` | the credential of `apiKeyRef` is not set or is empty |
| `refused` | the gateway answers 401 or 403 |
| `unreachable` | the connection fails, the read takes longer than `timeoutMs`, or the gateway answers another error status; the Host logs the cause without the key |
| `invalid_answer` | the body is not JSON or is not the record above |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`FlowleapBudget` is a `TypertRemoteService` under the `flowleapBudget` namespace; the generated Remote client reaches the browser through [`dsh-api-remotes`](../../api/remotes/README.md). The constructor validates `url` and `apiKeyRef`; each call reads the key, sends one request, and validates the answer with a strict schema.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Config, the gateway read, and the `flowleapBudget` Remote |
| [`src/types.ts`](src/types.ts) | the client-safe `BudgetMonth` vocabulary |
| [`tests/`](tests/) | the read against a local gateway double: figures, every unknown reason, and the load checks |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-flowleap-budget](../../client/ui-flowleap-budget/README.md) — the dashboard card and panel.
- [dsh-llm-pi-ai](../../llm/llm-pi-ai/README.md) — the gateway routes and their budget warning header.

-----

<a id="model-experience"></a>
## Model Experience

None, as the gateway read serves the browser only and never reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The gateway route** — the firm's model gateway (flowleap-os `lib/gateway.py`) does not serve the budget read yet, and a runtime's virtual key may call only the model routes. Until flowleap-os serves the read, sets `FLOWLEAP_BUDGET_URL` in each runtime, and allows the route for the key, every read reports `unknown` with the `not_configured` reason.
- **No spend by agent** — the gateway records spend per key, not per agent, so the read has no split by agent.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
