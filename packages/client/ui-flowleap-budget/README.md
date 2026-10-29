---
description: "The attorney's model spend and budget of this month on the FlowLeap dashboard: the flowleapBudget Remote reads the firm's model gateway with the runtime's own virtual key, and the Budget this month panel and the Budget used card show the figures, or Unknown and the reason."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-flowleap-budget

## Summary

The dashboard of `flowleap-web` shows the attorney's model spend and budget of this month in the **Budget used** card and the **Budget this month** panel. The Host half reads the figures from the firm's model gateway (flowleap-harness#32) with the runtime's own virtual key, so a runtime reads only its own figures. When no gateway answers, as in a local run, both surfaces show **Unknown** and the reason, never a made-up number or $0.

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

Mount the row beside the [dashboard](../ui-flowleap-dashboard/README.md); the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the id `ui-flowleap-budget`.

### Configuration

```yaml
- id: ui-flowleap-budget
  name: '@deepseek-ai/dsh-client-ui-flowleap-budget'
  config:
    url: http://flowleap-gateway:4000/flowleap/budget
    apiKeyRef: ANTHROPIC_API_KEY
    timeoutMs: 5000
```

| Field | Default | Meaning |
|---|---|---|
| `url` | `''` | Address of the gateway's budget read; empty when the runtime has no gateway, and every read then reports `unknown` (`not_configured`). Any other value must be an absolute http or https URL, or the row fails at load |
| `apiKeyRef` | required | Credential reference (environment-variable name) of the runtime's own virtual key, read through `ctx.credentials` (else the launch environment) and sent as `Authorization: Bearer <key>`; an invalid name fails at load |
| `timeoutMs` | `5000` | Longest time one read may take, in milliseconds (100 to 60000) |

The `flowleap-web` bundle sets `url` from the `FLOWLEAP_BUDGET_URL` environment variable (empty when unset) and `apiKeyRef` to `ANTHROPIC_API_KEY`, the key of the bundle's gateway routes.

### The gateway read

The Host sends `GET <url>` with the virtual key as a bearer token. The gateway answers `200` with this JSON body for the key's attorney:

```json
{ "month": "2026-10", "spent_usd": 12.5, "budget_usd": 50 }
```

`month` is the UTC calendar month `YYYY-MM`, `spent_usd` the spend of that month (0 or more), and `budget_usd` the monthly budget (0 or more), or `null` when the firm sets none.

### The Remote

`ctx.remote.flowleapBudget.month()` returns a `BudgetMonth`: `{ state: 'known', month, spentUsd, budgetUsd }`, or `{ state: 'unknown', reason }`.

| Reason | When |
|---|---|
| `not_configured` | `url` is empty |
| `no_key` | the credential of `apiKeyRef` is not set or is empty |
| `refused` | the gateway answers 401 or 403 |
| `unreachable` | the connection fails, the read takes longer than `timeoutMs`, or the gateway answers another error status; the Host logs the cause without the key |
| `invalid_answer` | the body is not JSON or is not the record above |

### On the dashboard

**Budget used** (`dashboard.metric`, order 30) shows the share of the budget used, for example `25 %`, with `$12.50 of $50.00 this month`; without a budget, or with a budget of 0, it shows the spend. **Budget this month** (`dashboard.widget`, order 40) shows the spend, the budget, a meter, and the month. An unknown state shows **Unknown** and the sentence of its reason on both. The surfaces read when the dashboard shows and again at a connection reset. They register only while the current Peer may call `flowleapBudget/month`, an owner-only endpoint. All copy is in the `flowleapBudget` locale namespace in the eight shipped UI languages (en, zh, ja, es, fr, de, ru, pt).

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package has a Host face (`tsconfig.host.json`: `src/index.ts`, `src/types.ts`) and a Client face (`tsconfig.client.json`: `src/client/`). The Host face is the `FlowleapBudget` service, a `TypertRemoteService` under the `flowleapBudget` namespace; the generated Remote client reaches the browser through [`dsh-api-remotes`](../../api/remotes/README.md). The Client face keeps one shared read (`createBudgetSource`): it reads when the first surface observes it and at each `connection/reset`, and it drops an answer that arrives after the last surface stopped observing. A failed or rejected Remote call is the `unreachable` reason.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Config, the gateway read, and the `flowleapBudget` Remote |
| [`src/types.ts`](src/types.ts) | the client-safe `BudgetMonth` vocabulary |
| [`src/client/index.ts`](src/client/index.ts) | dictionaries and the two registrations |
| [`src/client/budget.tsx`](src/client/budget.tsx) | the shared read, the card, and the panel |
| [`tests/`](tests/) | the read against a local gateway double, each surface as rendered, and the registrations with their disposal |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-flowleap-dashboard](../ui-flowleap-dashboard/README.md) — the `dashboard.metric` and `dashboard.widget` slots.
- [dsh-llm-pi-ai](../../llm/llm-pi-ai/README.md) — the gateway routes and their budget warning header.

-----

<a id="model-experience"></a>
## Model Experience

None, as the gateway read serves the browser only and never reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The gateway route** — the firm's model gateway (flowleap-os `lib/gateway.py`) does not serve the budget read yet, and a runtime's virtual key may call only the model routes. Until flowleap-os serves the read, sets `FLOWLEAP_BUDGET_URL` in each runtime, and allows the route for the key, the surfaces show **Unknown** with the `not_configured` reason.
- **No spend by agent** — the gateway records spend per key, not per agent, so the panel shows no split by agent.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
