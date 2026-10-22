---
description: "The Patent data connectors settings section and first-run key wizard of the dsh web client: one write-only card per FlowLeap connector with Save, Remove, and Test connection over the flowleapConnectors Remote."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-flowleap-connectors

## Summary

Open **Settings** and select **Patent data connectors** to add the firm's EPO OPS consumer key and secret, USPTO ODP key, Semantic Scholar key, and Mistral key (for OCR of scanned documents and PDFs through `read_pdf` and the file-wrapper reader; Mistral bills per page). Each connector is one card: write-only fields, a **Configured** or **Not configured** tag, **Save**, **Remove**, and **Test connection** with the outcome inline. On a first run with no connector configured, a blocking wizard offers the same fields with **Test**, **Save**, and **Skip for now**, and never returns once saved or skipped. The page calls [`dsh-flowleap-connectors`](../../host/flowleap-connectors/README.md) through `ctx.remote.flowleapConnectors`.

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

Mount the row beside `dsh-flowleap-connectors` in a web composition; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the id `ui-settings-flowleap-connectors`, which is also the settings namespace that holds the wizard dismissal.

### The cards

A card's fields are password inputs with `autocomplete="new-password"`; a stored value is never read into them, and **Save** is enabled only when every field of the connector is filled, because the Host replaces the whole record. **Remove** and **Test connection** appear on a configured card. The test runs the Host's one cheap authenticated call and its result renders under the fields as a status line, passed or failed with the Host's message; a connector without a stored key reports `<Connector> key not configured`. A refused save shows the Host's reason verbatim under the card. When the credential store is read-only the fields are disabled and the card says so. A record written from another browser, or by the wizard, reaches the page through the forwarded `credentials/record-updated` event.

### The wizard

The wizard registers as a `settings.onboarding` step after the welcome notice. It renders nothing while presence and the dismissal are still loading, completes at once when any connector is configured or the dismissal is recorded, and otherwise blocks the page with the four connectors in compact form. **Save** writes every connector whose fields are complete, records the dismissal, and completes; **Test** writes those connectors too and then runs the connection test on each configured one, leaving the results in place; **Skip for now** records the dismissal alone. A failed save keeps the wizard open with the connector's reason under its fields. When the Host cannot report presence at all the step completes without showing, and the settings section remains the diagnostic surface.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host half declares one live Config field, `wizardDismissed`, and calls `settings.configure({ auto: false })` so the row has a namespace but no generated page. The browser half keeps one `ConnectorsStore` over `ctx.remote.flowleapConnectors` (`describe`, `set`, `unset`, `test`) whose snapshot carries a card per connector: presence from the Host, the draft, the operation in flight, the last test outcome, and the last refusal. `WizardStore` follows the row's `ConfigForm` the way the Models welcome notice does and writes the dismissal through `scope.set`. The section registers into `settings.section` with `locale: NS`, so its copy arrives through the framework `t` seat; the wizard step injects the same bound translate. The connector ids and fields are spelled in the browser half because a client bundle imports no Host value; the Host's `describe()` confirms the fields per connector.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host half: the `wizardDismissed` Config and the settings presentation |
| [`src/wizard-settings.ts`](src/wizard-settings.ts) | the namespace and field name both halves share |
| [`src/client/index.ts`](src/client/index.ts) | dictionaries, the stores, the section and wizard registrations, the record invalidation |
| [`src/client/connectors-store.ts`](src/client/connectors-store.ts) | page state and the Remote calls |
| [`src/client/wizard-store.ts`](src/client/wizard-store.ts) | the durable dismissal |
| [`src/client/ConnectorCard.tsx`](src/client/ConnectorCard.tsx) | one card, full or compact |
| [`src/client/ConnectorsSection.tsx`](src/client/ConnectorsSection.tsx) | the settings section |
| [`src/client/ConnectorsWizard.tsx`](src/client/ConnectorsWizard.tsx), [`src/client/OnboardingModal.tsx`](src/client/OnboardingModal.tsx) | the first-run step and its blocking chrome |
| [`tests/`](tests/) | the cards as rendered, the wizard dismissal, the Host Config |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-flowleap-connectors](../../host/flowleap-connectors/README.md) — the Remote this page calls and the records it writes.
- [ui-settings](../ui-settings/README.md) — the settings shell, the `settings.section` and `settings.onboarding` slots, and `ctx.configForms`.
- [ui-settings-models](../ui-settings-models/README.md) — the Models page whose onboarding modal and welcome store this package mirrors.
- [ui-primitives](../ui-primitives/README.md) — `SettingsSecretField`, `Button`, `Tag`, and `Modal`.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side settings surface that registers no model surface.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **English only** — the locale registry requires `{ zh, en }`, so the English dictionary is registered for both locales; a Chinese browser reads English copy here until a translation exists.
- **Whole-record saves** — a connector with two fields (EPO OPS) must have both typed to save, because the Host replaces the record; there is no per-field update.
- **No reveal toggle** — the fields reuse the shared `SettingsSecretField`, not the Models page's package-private `ApiKeyInput`, so a typed value cannot be revealed before saving.
- **Test runs the stored key** — the connection test checks what the Host holds; the wizard's **Test** therefore saves the typed fields first.
- **Dismissal needs the settings scope** — when the Host does not serve this row's namespace the wizard shows again on the next page load; Skip then completes the step for that session only.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
