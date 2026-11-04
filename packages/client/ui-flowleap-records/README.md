---
description: "The Matters row in the FlowLeap sidebar (German Akten) and the Matters page: the Firm Record's pages of flowleap-os, served by the firm proxy at the same origin, embedded in a frame with the client's theme and UI language; an empty state while the firm has no matters."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-flowleap-records

## Summary

An attorney sees one **Matters** row among the app launchers of the `flowleap-web` sidebar (German **Akten**). It opens the Matters page, which embeds the Records pages of the Firm Record (the matter list, the matter with its deadlines, Confirm and Reject) in a frame. The firm proxy serves those pages at `records/` on the same origin, behind the same sign-in, so a confirm goes from the embedded page to the Firm Record, never through the runtime. The frame carries the client's color scheme and UI language. Without the proxy the page shows that the firm has no matters yet.

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

Mount the row; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the id `ui-flowleap-records`:

```yaml
- id: ui-flowleap-records
  name: '@deepseek-ai/dsh-client-ui-flowleap-records'
  config:
    recordsHref: records/
```

`recordsHref` (default `records/`) is the Records pages as a path relative to the document; a value with a scheme, a host, a leading slash, a query or a fragment fails the row at load, so the frame cannot leave the origin of the Web app. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-client-ui-flowleap-records) is the exhaustive source for every accepted field.

The browser asks `GET api/flowleap/records-link` once at start; the Host answers `{ "href": "records/" }`. The browser then registers the **Matters** launcher (`sidebar.panellist`, order 18, an archive glyph) and the Matters page (the keyed `main` slot, panel id `flowleap-records`). For an error status, a failed request, or an answer that it cannot read, the sidebar shows no launcher and no error. The copy is in the `flowleapRecords` locale namespace in the eight shipped UI languages (en, zh, ja, es, fr, de, ru, pt).

### The page

When the page opens it asks `GET <recordsHref>?embedded=1` once. A `200` shows the frame; any other status, a failed request, or an abort shows the empty state **No matters yet** (role `status`). The frame's address is `<recordsHref>?embedded=1&theme=<light|dark>&lang=<locale id>`: `embedded=1` tells the Records pages to render without their own top bar, `theme` is the client's color scheme (`ctx.theme`, followed through `theme/change`), and `lang` is the client's UI language (`ctx.locale`, followed through `locale/change`; the pages fall back to English for a language they lack). The frame fills the main column; a theme or language change reloads it. The test id of the page is `flowleap-records`, and the frame's accessible name is the localized "Matters of the firm".

### What the os side provides

The Records pages of flowleap-os accept `?theme=light|dark` and `?lang=<locale id>` (English when they lack the language) and render without their top bar when `embedded=1` is in the query. The sign-in proxy serves them under `/records/` at the firm address, with the same cookie as the Web app. This package owns nothing of those pages.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host half validates `recordsHref` and registers one exact Fetch route of `ctx.connection.fetch`, so the connection authenticates the request first. The browser half reads the route, keeps the color scheme and the UI language in snapshot stores fed by `theme/change` and `locale/change`, and registers the launcher and the page; `RecordsPage` probes the pages once per mount and renders the frame or the empty state.

| File | Role |
|---|---|
| [`src/route.ts`](src/route.ts) | the route path and its JSON answer, shared by both halves |
| [`src/index.ts`](src/index.ts) | Host half: the config check and the route |
| [`src/client/index.ts`](src/client/index.ts) | Browser half: the request, the probe, the dictionaries, the color scheme, the UI language, and the registrations |
| [`src/client/RecordsPage.tsx`](src/client/RecordsPage.tsx) | the Matters page and the launcher glyph |
| [`tests/`](tests/) | the config rules, the route with its disposal, the registrations with their disposal, the probe, the frame address per theme and language, and the empty state |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-flowleap-record](../../host/flowleap-record/README.md) — the `record_read` tool, the model's read of the same record.
- [ui-flowleap-admin-link](../ui-flowleap-admin-link/README.md) — the same route pattern for a sidebar row.
- [dsh-flowleap-web](../../bundle/flowleap-web/README.md) — the bundle row.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a sidebar launcher, a page, and an authenticated route that register no model-facing tools or messages.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **A theme or language change reloads the frame** — the color scheme and the UI language travel in the frame's address, so a change of either loads the pages again and an unsaved form inside the frame is lost. A message to the frame would keep the form; it waits for a second consumer of the theme.
- **One probe per open** — the page asks the pages' address once when it opens; a Firm Record that starts later shows after the page is opened again.
- **The frame's own navigation is not in the address bar** — the Web app's `?page=` names the Matters page, not the matter inside the frame.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
