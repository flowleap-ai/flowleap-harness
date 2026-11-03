---
description: "The desktop model step on the Models page: Test on the Anthropic, OpenAI, and OpenRouter cards, and Connect OpenRouter, over the flowleapModels Remote."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-flowleap-models

## Summary

`dsh-client-ui-settings-flowleap-models` puts the FlowLeap desktop model step (flowleap-harness#170) into the Models page. It fills the `settings.models.provider-card` slot of [`ui-settings-models`](../ui-settings-models/README.md) for the `llm-pi-ai` cards: the OpenRouter card gets **Connect OpenRouter**, and the Anthropic, OpenAI, and OpenRouter cards get **Test** once a key is saved. The calls go to the `flowleapModels` Remote of [`dsh-flowleap-models`](../../host/flowleap-models/README.md).

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

The [`dsh-flowleap-desktop`](../../bundle/flowleap-desktop/README.md) bundle mounts this row as `ui-settings-flowleap-models` beside `flowleap-models`. The controls register only while the current Peer may call `flowleapModels/test`.

### On the Models page

The step renders inside each `anthropic`, `openai`, and `openrouter` card whose route is configured; other cards, and the add-provider draft of a route that is not configured, show nothing.

- **Connect OpenRouter** (OpenRouter card) starts a connect, opens the OpenRouter page in the attorney's browser, and shows "Waiting for OpenRouter in your browser…" with a link to open the page again and a **Cancel** button. The end shows "OpenRouter is connected." or the reason it is not. The Models page reads the new key state from its own credential events.
- **Test** (once the card's key is saved) shows "The key works." or the reason: no key saved, the key refused with its HTTP status, no answer, or another HTTP error.
- When the step made the provider the default of new chats, the line adds "New chats use <model>."

A Host call that throws shows "The app could not do this:" and the error message. All copy is in the `settings.flowleapModels` dictionaries of [`src/client/locales.ts`](src/client/locales.ts).

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

One `ModelStep` component is registered under the keyed slot entry `llm-pi-ai`, so it receives every card of that settings namespace with the card's directory row and key state. Each card keeps its own busy state and last result in component state; the Host calls come in as the injected `operations`.

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Registration, dictionaries, and the Host calls |
| [`src/client/ModelStep.tsx`](src/client/ModelStep.tsx) | The controls and the result line of one card |
| [`src/client/locales.ts`](src/client/locales.ts) | Copy |
| [`tests/`](tests/) | the controls per card, the connect, and every result line |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-flowleap-models](../../host/flowleap-models/README.md) — the Remote, the key test, and the OpenRouter connect.
- [ui-settings-models](../ui-settings-models/README.md) — the Models page and its extension slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side settings control that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The result line is per card** — a result stays in the card that showed it until the card unmounts; a connect that ends after its card unmounted still stores the key, and the row's key state shows it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
