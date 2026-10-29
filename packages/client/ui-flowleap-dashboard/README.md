---
description: "The FlowLeap dashboard in the dsh web client: the first screen of flowleap-web with the ask bar and its search, deep links, the dashboard.metric, dashboard.widget, dashboard.link and dashboard.search slots, the Install FlowLeap card, and the OS sidebar layers."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-flowleap-dashboard

## Summary

The dashboard is the first screen of the `flowleap-web` profile (flowleap-harness#60). It shows a greeting, one **Ask the agent or search** bar, the app links, the metric cards and panels that apps register, and an **Install FlowLeap** card. A first sign-in also shows **First steps**. Text in the ask bar shows the search results of each app below the bar; Enter opens a new chat with that text in its composer. The address names the open chat or page, so a link opens that item. The package also adds layers to the OS sidebar: a **Search** action, the **Dashboard**, **Chats** and **Agents** apps, and a **Pinned** section.

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

### Slots for apps

The dashboard page declares four list slots. Each app registers its own surfaces; the dashboard does not read the data of another package.

| Slot | Owner props | The page draws | The occupant draws |
|---|---|---|---|
| `dashboard.metric` | none | the card frame and the registration `label` as the title | the card body |
| `dashboard.widget` | none | the panel frame and the registration `label` as the heading | the panel body |
| `dashboard.link` | none | the link row below the ask bar, only while a link is registered | one button that opens its page |
| `dashboard.search` | `query`, `matches(text)`, `onPicked()` | the results box below the ask bar while it holds text | its group heading and result buttons, or nothing when no result matches |

`order` sets the place in each slot. `matches(text)` is the one match rule of every group: each word of the query is in the text, without regard to case. A group calls `onPicked()` when the user opens a result, so the page clears the bar.

| Surface | Package | Data |
|---|---|---|
| Waiting for review, Needs your review | [`ui-flowleap-routines`](../ui-flowleap-routines/README.md) | `flowleapRoutines.reviews()` |
| Cases watched, Coming up, Routines search group | [`ui-flowleap-routines`](../ui-flowleap-routines/README.md) | `flowleapRoutines.watches()` and `schedule.catalog()` |
| Budget used, Budget this month | [`ui-flowleap-budget`](../ui-flowleap-budget/README.md) | `flowleapBudget.month()` from the firm's model gateway |
| Agents search group | [`ui-flowleap-agent-builder`](../ui-flowleap-agent-builder/README.md) | `flowleapAgents.list()` |
| Agent activity, Chats search group, Chats page, Pinned | this package | the Session list and the Workspace pin set |

### Search

The **Search sessions** command (Cmd+K on the desktop, Cmd+Option+K on the web) and the **Search** row of the sidebar select the dashboard and focus the ask bar; the package registers the command through `uiWorkspace.provideSearch`. Escape clears the bar.

### Deep links

The address query names the open item: `?chat=<SessionId>` for a chat and `?page=<main panel id>` for an app page, for example `?page=flowleap-needs-review`; the address without both shows the dashboard. When the client starts, the package waits until the dashboard page is registered and the Session list is ready. A chat link then opens the chat when the list has it; any other address, and a link to a missing chat, shows the dashboard. A page can register only after its access check, so a page link shows the dashboard first and selects the page when it registers, as long as the dashboard still shows. After the start, each change of the open page or chat replaces the address in the browser history without a new entry, so a reload or a copied address opens the same item. Other query parameters and the fragment stay.

**First steps** shows while the Session list has no chat with content, until the user selects **Hide first steps**; the browser keeps that choice in `localStorage`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser entry registers three keyed `main` pages (`flowleap-dashboard`, `flowleap-chats`, `flowleap-agents`) and their `sidebar.panellist` launchers (orders -100, -90 and 30). The dashboard registration declares the four list slots as its children. The page reads the ordered metadata of each slot from one snapshot store, and renders each entry with `renderSlot(..., { only: id })`. The start selection waits for the `main` slot to list the dashboard entry, because the entry is not listed while the plugin's fiber applies.

The **Search** action goes into the `sidebar.actions` slot and the **Pinned** section into the `sidebar.sections` slot of [`ui-sidebar`](../ui-sidebar/README.md).

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host half: an empty plugin body |
| [`src/client/index.ts`](src/client/index.ts) | dictionaries, slot entry stores, the Search command, and every registration |
| [`src/client/contract.ts`](src/client/contract.ts) | the four slot declarations and the match rule |
| [`src/client/deep-link.ts`](src/client/deep-link.ts) | the start item and the address of the open item |
| [`src/client/DashboardPage.tsx`](src/client/DashboardPage.tsx) | the page, the ask bar with the search results, and the first steps |
| [`src/client/widgets.tsx`](src/client/widgets.tsx) | Agent activity and the Chats search group |
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
- **Office action board link** — the board (flowleap-harness#81) registers its link in `dashboard.link`; until then the link row does not show.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
