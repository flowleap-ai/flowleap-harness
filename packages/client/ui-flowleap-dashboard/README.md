---
description: "The FlowLeap dashboard in the dsh web client: the first screen of flowleap-web with the ask bar, the dashboard.metric and dashboard.widget slots, the Install FlowLeap card, and the OS sidebar layers."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-flowleap-dashboard

## Summary

The dashboard is the first screen of the `flowleap-web` profile (flowleap-harness#60, look-first step). It shows a greeting, one **Ask the agent or search** bar, the metric cards and panels that apps register, a link row, and an **Install FlowLeap** card. A first sign-in also shows **First steps**. Text in the ask bar opens a new chat with that text in its composer. The package also adds layers to the OS sidebar: a **Search** action, the **Dashboard**, **Chats** and **Agents** apps, and a **Pinned** section.

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

Mount the row in a web composition beside `ui-sidebar` and `ui-workspace`; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the id `ui-flowleap-dashboard`. When the client starts, the dashboard is the selected main panel. Selecting a chat shows the conversation; the **Dashboard** row in the sidebar shows the dashboard again. A running chat continues while the dashboard shows.

An app adds a metric card through the `dashboard.metric` list slot and a panel through the `dashboard.widget` list slot. The registration `label` is the card title or the panel heading, and `order` sets the place. The occupant draws only the body and reads its own data. [`ui-flowleap-routines`](../ui-flowleap-routines/README.md) registers **Waiting for review** and **Needs your review** this way.

| Surface | Data |
|---|---|
| Waiting for review, Needs your review | real: `flowleapRoutines.reviews()` through `ui-flowleap-routines` |
| Agent activity, Chats page, Pinned | real: the Session list and the Workspace pin set |
| Coming up, Budget this month, Cases watched, Budget used | sample data from `src/client/sample-data.ts`, each with a **Sample data** tag |

**First steps** shows while the Session list has no chat with content, until the user selects **Hide first steps**; the browser keeps that choice in `localStorage`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser entry registers three keyed `main` pages (`flowleap-dashboard`, `flowleap-chats`, `flowleap-agents`) and their `sidebar.panellist` launchers (orders -100, -90 and 30). The dashboard registration declares the `dashboard.metric` and `dashboard.widget` list slots as its children. The page reads the ordered metadata of both slots from one snapshot store each, and renders each entry with `renderSlot(..., { only: id })`. The first screen selection waits for the `main` slot to list the dashboard entry, because the entry is not listed while the plugin's fiber applies.

The **Search** action goes into the `sidebar.actions` slot and the **Pinned** section into the `sidebar.sections` slot of [`ui-sidebar`](../ui-sidebar/README.md). Search selects the dashboard and focuses the ask bar.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host half: an empty plugin body |
| [`src/client/index.ts`](src/client/index.ts) | dictionaries, slot entry stores, and every registration |
| [`src/client/contract.ts`](src/client/contract.ts) | the `dashboard.metric` and `dashboard.widget` slot declarations |
| [`src/client/DashboardPage.tsx`](src/client/DashboardPage.tsx) | the page, the ask bar, and the first steps |
| [`src/client/widgets.tsx`](src/client/widgets.tsx) | Agent activity, Coming up, Budget this month, and the two sample metric cards |
| [`src/client/InstallCard.tsx`](src/client/InstallCard.tsx) | the Install FlowLeap card |
| [`src/client/sidebar.tsx`](src/client/sidebar.tsx) | the Search action, the app glyphs, and the Pinned section |
| [`src/client/AppPages.tsx`](src/client/AppPages.tsx) | the Chats page and the Agents placeholder |
| [`src/client/sample-data.ts`](src/client/sample-data.ts) | the sample values |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-flowleap-routines](../ui-flowleap-routines/README.md) — the Needs review card and panel.
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

- **Sample data** — Coming up, Budget this month, Cases watched and Budget used show sample values with a **Sample data** tag until the register events (#44) and the gateway budget read method (#32) exist.
- **Copy in seven locales** — the `flowleapDashboard` dictionaries other than English show English text until the founder approves the look.
- **Search shortcut** — ⌘K stays the existing `session.search` command of `ui-workspace`; the dashboard search does not search chats, agents or routines yet.
- **Deep links** — the dashboard is selected at each client start; the web client has no deep link to one chat yet.
- **Agents page** — a placeholder until flowleap-harness#59. The office action board link is a placeholder until flowleap-harness#81 is on the `flowleap` branch.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
