---
description: "Budget used and Budget this month on the FlowLeap dashboard: the attorney's model spend and budget of this month over the flowleapBudget Remote, or Unknown and the reason."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-flowleap-budget

## Summary

The dashboard of `flowleap-web` shows the attorney's model spend and budget of this month in the **Budget used** card and the **Budget this month** panel. The figures come from [`dsh-flowleap-budget`](../../host/flowleap-budget/README.md), which reads the firm's model gateway with the runtime's own virtual key. When no gateway answers, as in a local run, both surfaces show **Unknown** and the reason, never a made-up number or $0.

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

Mount the row beside the [dashboard](../ui-flowleap-dashboard/README.md) and `dsh-flowleap-budget`; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the id `ui-flowleap-budget`.

**Budget used** (`dashboard.metric`, order 30) shows the share of the budget used, for example `25 %`, with `$12.50 of $50.00 this month`; without a budget, or with a budget of 0, it shows the spend. **Budget this month** (`dashboard.widget`, order 40) shows the spend, the budget, a meter, and the month. An unknown state shows **Unknown** and the sentence of its reason on both. The surfaces read when the dashboard shows and again at a connection reset. They register only while the current Peer may call `flowleapBudget/month`, an owner-only endpoint. All copy is in the `flowleapBudget` locale namespace in the eight shipped UI languages (en, zh, ja, es, fr, de, ru, pt).

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`createBudgetSource` keeps one shared read: it reads when the first surface observes it and at each `connection/reset`, and it drops an answer that arrives after the last surface stopped observing. A failed or rejected Remote call is the `unreachable` reason.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host half: an empty plugin body |
| [`src/client/index.ts`](src/client/index.ts) | dictionaries and the two registrations |
| [`src/client/budget.tsx`](src/client/budget.tsx) | the shared read, the card, and the panel |
| [`tests/`](tests/) | the shared read, each surface as rendered, and the registrations with their disposal |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-flowleap-budget](../../host/flowleap-budget/README.md) — the gateway read and the `flowleapBudget` Remote.
- [ui-flowleap-dashboard](../ui-flowleap-dashboard/README.md) — the `dashboard.metric` and `dashboard.widget` slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side surface that registers no model-facing tools or messages.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The gateway route** — until the firm's model gateway serves the budget read ([dsh-flowleap-budget](../../host/flowleap-budget/README.md#known-limitations-and-deferred-work)), both surfaces show **Unknown**.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
