---
description: "The FlowLeap desktop layer over dsh-flowleap-web: an OpenAI route beside the Anthropic, OpenRouter, and Mistral routes, and the model step on the Models page (key Test and Connect OpenRouter)."
kind: "package-bundle"
---

# @deepseek-ai/dsh-flowleap-desktop

## Summary

`dsh-flowleap-desktop` is the layer of the FlowLeap desktop app (flowleap-harness#170). The shipped `flowleap-desktop` profile stacks it after [`dsh-flowleap-web`](../flowleap-web/README.md); the firm-server `flowleap-web` profile stacks [`dsh-flowleap-firm`](../flowleap-firm/README.md) there instead and does not get this bundle. It lets the attorney add a model without help: connect OpenRouter, or enter an Anthropic or OpenAI key, and test it on the Models page.

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

### Install into a profile

The shipped `flowleap-desktop` profile lists `dsh-base`, `dsh-web-app`, `dsh-flowleap-web`, and this bundle, in this order. A `flowleap-desktop` profile that a release before this bundle wrote lists only the first three; app-boot replaces that exact list with the template at the next start.

### Rows

| Row | Package | Effect |
|---|---|---|
| `llm-pi-ai` | [`dsh-llm-pi-ai`](../../llm/llm-pi-ai/README.md) | The routes of `dsh-flowleap-web` and an `openai` route on `OPENAI_API_KEY` |
| `flowleap-models` | [`dsh-flowleap-models`](../../host/flowleap-models/README.md) | The `flowleapModels` Remote: the key test, the OpenRouter connect, and the model of new chats per provider (`claude-sonnet-5-5`, `gpt-5.5`, `anthropic/claude-sonnet-5.5`) |
| `ui-settings-flowleap-models` | [`dsh-client-ui-settings-flowleap-models`](../../client/ui-settings-flowleap-models/README.md) | **Connect OpenRouter** and **Test** on the Models page cards |

A key test or a connect goes only to the provider that the attorney chose; nothing goes to a FlowLeap host.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`cordis.patch.yml` holds one id-targeted override and one insert. The override replaces the `llm-pi-ai` row's whole `config`, so it restates the `dsh-flowleap-web` routes and adds `openai`. [`flowleap-web-models.spec.ts`](../../../apps/cli/tests/flowleap-web-models.spec.ts) composes both shipped FlowLeap profiles and fails when the desktop routes differ from the `dsh-flowleap-web` routes in anything but `openai`, when the firm profile mounts the model step, or when an old `flowleap-desktop` profile list does not get this bundle.

### Source map

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | The `llm-pi-ai` override and the model step rows |
| [`src/index.ts`](src/index.ts) | Bundle package entry |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`dsh-flowleap-web`](../flowleap-web/README.md) — the FlowLeap layer under this bundle.
- [`dsh-flowleap-firm`](../flowleap-firm/README.md) — the firm-server layer that takes this bundle's place on a firm.
- [Shipped profile templates](../../util/official-bundles/src/bundles.ts) — `flowleap-web` and `flowleap-desktop`.

-----

<a id="model-experience"></a>
## Model Experience

The `openai` route adds the OpenAI catalog models to the model picker; a chat on one of them sends its requests to OpenAI with the attorney's key. The model step rows add no prompt text, tool, or request field.

#### KV Cache effect

The bundle adds nothing to the request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The `llm-pi-ai` row is a copy** — a change to the `dsh-flowleap-web` `llm-pi-ai` row reaches this bundle only by hand; the composition test names the difference.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
