---
description: "White-label brand for the Web client from one brand.json: the sidebar mark and name, the blank-session mark, the document title and the product copy; FlowLeap Patent AI by default, for deployments that are not DeepSeek Harness."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-flowleap

## Summary

`dsh-client-ui-brand-flowleap` gives a deployment its own identity from one file. The Host half reads `brand.json` (product name, short name, tagline, mark image, accent colour), the browser half puts the mark and name into the sidebar, the mark into the blank-session hero, the product name into the document title, and layers the product name over the upstream copy that still names DeepSeek Harness. The `flowleap-web` profile mounts it with FlowLeap Patent AI; a firm edits `brand.json` to rebrand. It has no runtime state and does not affect model requests.

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

Mount the row in a Web profile that leaves `ui-brand-official` out, and point it at an absolute `brand.json` path.

### Minimal configuration

```yaml
- id: ui-brand-flowleap
  name: '@deepseek-ai/dsh-client-ui-brand-flowleap'
  config:
    path: /srv/flowleap/brand/brand.json
```

| Field | Default | Meaning |
|---|---|---|
| `path` | required | Absolute path of `brand.json`; a relative path rejects at load |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-client-ui-brand-flowleap) is the exhaustive source for every accepted field. The [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle computes the path as `FLOWLEAP_BRAND_PATH`, else its own `brand/brand.json`.

### The brand file

```json
{
  "productName": "FlowLeap Patent AI",
  "shortName": "FlowLeap",
  "tagline": "Patent research, analysis and drafting on your own keys",
  "mark": "./flowleap-mark.svg",
  "markStyle": "mono",
  "accent": "#2563EB"
}
```

| Field | Required | Meaning |
|---|---|---|
| `productName` | yes | Document title base, sidebar name, and the name used inside the overridden copy |
| `shortName` | yes | Short form kept for narrow surfaces |
| `tagline` | no | Blank-session headline; absent keeps the shell's own headline |
| `mark` | no | Image path relative to the file: SVG, PNG, JPEG or WebP, at most 256 KiB; absent keeps the shell's fallback mark |
| `markStyle` | no | `mono` (default) draws the image as a mask filled with the surrounding text colour, so a black-on-transparent SVG follows both themes; `color` draws the image as is |
| `accent` | no | CSS colour a `mono` mark is filled with instead of the text colour |

The file is read when the row applies; a missing or invalid file fails the row at load, because a deployment that mounts this row owns its brand. Edit the file, then restart or reload the row.

### What the browser shows

The sidebar renders the mark at 24 px and the product name where the shell shows its fish and local-build label; the blank-session hero renders the mark at 34 px before the headline; the tab title becomes `<Session title> — <productName>`, and the served page already carries `<title>productName</title>` before the client mounts. The copy overrides replace, in both shipped locales, the English strings that name DeepSeek Harness or DSH in rows the FlowLeap profile still mounts: the sidebar label and title base (`common`), the blank-session headline (`conversation`, when a tagline is set), the first-run preview notice and key onboarding (`settings.models`), the account model group and the session-lock message (`model`), restart and compatibility notices (`pluginManager`), the office preview notice (`sidebarOffice`), and turn-failure messages (`chat`). Everything else in those dictionaries stays the owning package's text.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host half validates the path, reads and validates `brand.json`, resolves `mark` against the file's directory into a `data:` URL, and keeps the record in memory. It appends `{ kind: 'global', name: '__FLOWLEAP_BRAND__', value }` on every `webserver/index-inject` emit and registers one `webServer.tapIndex()` transform that replaces the served page's `<title>`. The browser half reads the global, re-validates it with the shared `parseBrandRecord`, and installs the three slot occupants as declaration-aware registration sets (nested `ctx.slots.inject()`), each receiving the record through the registration's `inject` face. Copy overrides go through `ctx.locale.override(ns, locale, dict)` for `en` and `zh`, one effect per namespace and locale; the table lives in [`src/client/locales.ts`](src/client/locales.ts). A page without the global, such as one the Host did not render, registers nothing.

### Source map

| File | Role |
|---|---|
| [`src/brand.ts`](src/brand.ts) | The shared `BrandRecord`, the global name, and `parseBrandRecord` |
| [`src/index.ts`](src/index.ts) | Host half: `readBrandFile`, the injection row, the title transform |
| [`src/client/index.ts`](src/client/index.ts) | Browser half: slot occupants and copy overrides |
| [`src/client/Brand.tsx`](src/client/Brand.tsx) | `BrandMark` (mask or image) and the three occupants |
| [`src/client/locales.ts`](src/client/locales.ts) | The overridden namespaces and keys |
| [`tests/brand-file.host.spec.ts`](tests/brand-file.host.spec.ts) | File reading, validation, injection and title rewrite |
| [`tests/brand.client.spec.tsx`](tests/brand.client.spec.tsx) | Slot occupancy, overrides in both locales, mark rendering |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-brand-official](../ui-brand-official/README.md) — the DeepSeek occupants this package replaces.
- [ui-sidebar](../ui-sidebar/README.md) — declares `sidebar.brand.mark` and `sidebar.brand.name`.
- [ui-conversation](../ui-conversation/README.md) — declares `conversation.hero.brand.mark`.
- [locale](../locale/README.md) — `override()` and the lookup order it joins.
- [webserver](../../host/webserver/README.md) — index injections and `tapIndex`.
- [dsh-flowleap-web](../../bundle/flowleap-web/README.md) — the profile layer that mounts this row at its default `brand.json`.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package contributes browser presentation and copy only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what the brand file controls today; they are current package constraints, not a task backlog.

- **The file is not watched** — the record is read when the row applies; an edited `brand.json` reaches the page after the row reloads and the browser refreshes.
- **The favicon and the web manifest stay the shell's** — `apps/web/public` ships them at build time; `brand.json` has no field for them yet.
- **Overrides track upstream keys by name** — a renamed or new DeepSeek-naming key in an upstream dictionary is not covered until `locales.ts` lists it; the override of a missing key is inert, never wrong.
- **English text in both locales** — the overrides write the brand's English text into the `zh` dictionary too; a translated brand needs per-locale fields in `brand.json`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
