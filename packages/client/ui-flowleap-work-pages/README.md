---
description: "FlowLeap work pages in the dsh web client: the Office actions launcher in the Sidebar and the office action board page. This version shows one sample analysis from a fixture, for a look-first review."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-flowleap-work-pages

## Summary

The **Office actions** entry in the Sidebar opens the office action board: the deadline, the owner, the review count, the run state, and one card for each objection with the claims hit and the cited passages. The attorney sets a review state and an owner on each card. A card opens the side panel with the examiner's text, each claim feature beside its passage, and the response options. **New analysis** opens the form.

This is the look-first stage of [flowleap-harness#81](https://github.com/flowleap-ai/flowleap-harness/issues/81): a **Sample data** banner, an invented fixture, and changes that stay in the browser until a reload.

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

Mount the row in a web composition; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the id `ui-flowleap-work-pages`. The plugin needs only `slots` and `locale`. It calls no Remote, no model, and no connector.

**Write response plan**, **Export Word**, **Open chat**, and **Start analysis** show a notice that says what the button does in a later version. **Share** is disabled; its tooltip says that sharing comes with the artifacts library.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`createBoard` keeps the findings of one analysis apart from the attorney fields. The findings (`OfficeActionAnalysis`: the objections, the cited documents, the comparisons, the response options) are read-only. The browser state (`BoardState`) holds only the attorney fields of each objection, the open objection, the form state, and the last notice. This split follows option A of the [work pages study](https://github.com/flowleap-ai/flowleap-harness/pull/83): the planned `flowleapWorkPages` Remote changes attorney fields only, never findings.

The browser entry creates one board from [`sample-board.ts`](src/client/sample-board.ts) and registers two contributions: the `sidebar.panellist` launcher and the keyed `main` page, both under the panel id `flowleap-office-actions` (order 16, after Needs review). The launcher shows the count of objections in the Needs review state over its glyph. Copy is in the `flowleapWorkPages` namespace in en and zh; the other UI languages fall back to English.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host half: an empty plugin body |
| [`src/client/index.ts`](src/client/index.ts) | dictionaries, the board, and the two registrations |
| [`src/client/board.ts`](src/client/board.ts) | the analysis types, the board store, and its actions |
| [`src/client/sample-board.ts`](src/client/sample-board.ts) | the sample analysis |
| [`src/client/OfficeActionBoard.tsx`](src/client/OfficeActionBoard.tsx) | the page |
| [`src/client/ObjectionCard.tsx`](src/client/ObjectionCard.tsx) | one card with the state menu and the owner field |
| [`src/client/ObjectionPanel.tsx`](src/client/ObjectionPanel.tsx) | the side panel |
| [`src/client/AnalysisForm.tsx`](src/client/AnalysisForm.tsx) | the analysis form |
| [`src/client/WorkPagesPanelIcon.tsx`](src/client/WorkPagesPanelIcon.tsx) | the launcher glyph with its count |
| [`tests/`](tests/) | the board store, the page as rendered, and the registrations with their disposal |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-flowleap-routines](../ui-flowleap-routines/README.md) — the Needs review page, the sibling first-level page.
- [Slots](../../../docs/subsystems/slots.md) — injected hooks and panel contributions.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side surface that registers no model-facing tools or messages.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Sample data only** — the board shows one invented analysis. The `work_page_save` tool, the `flowleapWorkPages` Remote, and the run from the form are the next steps of flowleap-harness#81.
- **Changes are not saved** — the state and owner changes live in the plugin instance; a reload restores the sample.
- **Two UI languages** — the board copy is in en and zh; ja, es, fr, de, ru and pt show English. The sample analysis itself is English data.
- **Launcher count is visual only** — as on the Needs review launcher, the count is not part of the launcher's accessible name.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
