---
description: "The FlowLeap dashboard in the dsh web client: the landing page of flowleap-web with the ask bar and its search groups, the dashboard.metric and dashboard.widget slots, the Install FlowLeap card, and the OS sidebar layers."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-flowleap-dashboard

## Summary

The dashboard is the first screen of the `flowleap-web` profile (flowleap-harness#60). It shows a greeting, one **Ask the agent or search** bar, the metric cards and panels that apps register, and an **Install FlowLeap** card; a first sign-in also shows **First steps**. Text in the bar shows the search results of each app; Enter opens a new chat with that text. The dashboard is the landing page of [`ui-workspace`](../ui-workspace/README.md#landing-page-and-address-links), so the address names the open chat or page and a link opens that item. The package also adds sidebar layers: **Search**, the **Dashboard**, **Chats** and **Agents** apps, and **Pinned**.

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

Mount the row in a web composition beside `ui-sidebar` and `ui-workspace`; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the id `ui-flowleap-dashboard`. Selecting a chat shows the conversation; the **Dashboard** row in the sidebar shows the dashboard again. A running chat continues while the dashboard shows, and **Agent activity** and the **Chats** page list it as running.

### Slots and search groups for apps

The dashboard page declares two list slots, and it provides the `dashboardSearch` service for the search. Each app registers its own surfaces; the dashboard does not read the data of another package.

| Seat | The page draws | The app gives |
|---|---|---|
| `dashboard.metric` slot | the card frame and the registration `label` as the title | the card body |
| `dashboard.widget` slot | the panel frame and the registration `label` as the heading | the panel body |
| `dashboardSearch.register(group)` | while the ask bar holds text: the group heading from `group.label()`, the first five results with their glyph, title and detail, and the pick (clear the bar, then `result.open()`) | `results(query)`, the matching results as data, and `subscribe(listener)` for the data behind them |

`order` sets the place in each slot and among the groups. `query.matches(text)` is the one match rule of every group: each word of the query is in the text, without regard to case. The page subscribes to the groups only while the bar holds text, so an app reads its data for the search only then. An app registers its group as an effect under `ctx.inject(['dashboardSearch'], ...)`, so without the dashboard the group waits and does nothing.

| Surface | Package | Data |
|---|---|---|
| Waiting for review, Needs your review | [`ui-flowleap-routines`](../ui-flowleap-routines/README.md) | `flowleapRoutines.reviews()` |
| Cases watched, Coming up, Routines search group | [`ui-flowleap-routines`](../ui-flowleap-routines/README.md) | `flowleapRoutines.watches()` and `schedule.catalog()` |
| Budget used, Budget this month | [`ui-flowleap-budget`](../ui-flowleap-budget/README.md) | `flowleapBudget.month()` from the firm's model gateway |
| Agents search group | [`ui-flowleap-agent-builder`](../ui-flowleap-agent-builder/README.md) | `flowleapAgents.list()` |
| Agent activity, Chats search group, Chats page, Pinned | this package | the Session list and the Workspace pin set |

### Search

The **Search sessions** command (Cmd+K on the desktop, Cmd+Option+K on the web) and the **Search** row of the sidebar select the dashboard and focus the ask bar; the package registers the command through `uiWorkspace.provideSearch`. Escape clears the bar.

### Landing page and links

The package provides the dashboard to `uiWorkspace.provideLanding`. `ui-workspace` then shows the dashboard at the start, opens the chat (`?chat=<SessionId>`) or page (`?page=<main panel id>`, for example `?page=flowleap-needs-review`) that the start address names, and keeps the address equal to the open item; see [landing page and address links](../ui-workspace/README.md#landing-page-and-address-links). The local access-token address of `dsh web` (`?token=`) redirects to the plain address and drops the other parameters, so a link works in a browser that already has its session cookie.

**First steps** shows while the Session list has no chat with content, until the user selects **Hide first steps**; the browser keeps that choice in `localStorage`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser entry registers three keyed `main` pages (`flowleap-dashboard`, `flowleap-chats`, `flowleap-agents`) and their `sidebar.panellist` launchers (orders -100, -90 and 30). The dashboard registration declares the two list slots as its children. The page reads the ordered metadata of each slot from one snapshot store, and renders each entry with `renderSlot(..., { only: id })`. `createSearchRegistry` keeps the search groups ordered in a snapshot store that the page reads; the page draws every group, so the groups share one look, one row limit, and one pick.

The **Search** action goes into the `sidebar.actions` slot and the **Pinned** section into the `sidebar.sections` slot of [`ui-sidebar`](../ui-sidebar/README.md).

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host half: an empty plugin body |
| [`src/client/index.ts`](src/client/index.ts) | dictionaries, slot entry stores, the search registry, the Search command, the landing page, and every registration |
| [`src/client/contract.ts`](src/client/contract.ts) | the two slot declarations, the search group data, and the match rule |
| [`src/client/DashboardPage.tsx`](src/client/DashboardPage.tsx) | the page, the ask bar with the search results, and the first steps |
| [`src/client/widgets.tsx`](src/client/widgets.tsx) | Agent activity and the chat rows of the Chats page and the Chats search group |
| [`src/client/InstallCard.tsx`](src/client/InstallCard.tsx) | the Install FlowLeap card |
| [`src/client/sidebar.tsx`](src/client/sidebar.tsx) | the Search action, the app glyphs, and the Pinned section |
| [`src/client/AppPages.tsx`](src/client/AppPages.tsx) | the Chats page and the Agents placeholder |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-flowleap-routines](../ui-flowleap-routines/README.md) — the review, watch, and routine surfaces.
- [ui-flowleap-budget](../ui-flowleap-budget/README.md) — the budget surfaces.
- [ui-sidebar](../ui-sidebar/README.md) — the `sidebar.actions` and `sidebar.sections` slots.
- [Slots](../../../docs/subsystems/slots.md) — list slots, labels, and injected hooks.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side surface that registers no model-facing tools or messages. The ask bar only fills the composer of a new chat; the user sends it.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Chat search reads titles** — the Chats group matches chat titles; the content search of the sidebar (`session.search`) is not part of the dashboard search.
- **Copy in seven locales** — the non-English `flowleapDashboard` dictionaries are machine translations; a native speaker has not checked them.
- **Agents page** — a placeholder until flowleap-harness#59.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
