---
description: "The desktop model step: the flowleapModels Remote tests the attorney's stored Anthropic, OpenAI, or OpenRouter key at that provider only, and connects OpenRouter through its OAuth PKCE flow with a loopback callback."
kind: "package-reference"
---

# @deepseek-ai/dsh-flowleap-models

## Summary

`dsh-flowleap-models` serves the `flowleapModels` Remote of the FlowLeap desktop model step (flowleap-harness#170). It tests the attorney's stored Anthropic, OpenAI, or OpenRouter key with one free authenticated read at that provider, and it connects OpenRouter through OpenRouter's OAuth PKCE flow, so the attorney gets a key without copy and paste. Every call goes only to the provider that the attorney chose; nothing goes to a FlowLeap host. When the default model of new chats has no key, the first provider that works becomes the default. [`ui-settings-flowleap-models`](../../client/ui-settings-flowleap-models/README.md) shows the controls on the Models page.

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

Mount the row beside the `credentials` service; the [`dsh-flowleap-desktop`](../../bundle/flowleap-desktop/README.md) bundle does this under the id `flowleap-models`. The firm-server profile does not mount it.

### Configuration

```yaml
- id: flowleap-models
  name: '@deepseek-ai/dsh-flowleap-models'
  config:
    providers:
      anthropic:
        model: claude-sonnet-5-5
      openai:
        model: gpt-5.5
      openrouter:
        model: anthropic/claude-sonnet-5.5
    openRouterKeyLabel: FlowLeap Desktop
```

| Field | Default | Meaning |
|---|---|---|
| `providers.<id>.baseURL` | `https://api.anthropic.com`, `https://api.openai.com/v1`, `https://openrouter.ai/api/v1` | API base URL of the `llm-pi-ai` route of the same id; the test and the OpenRouter code exchange use it |
| `providers.<id>.apiKeyRef` | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY` | Credential reference of the route's key, the route's `apiKeyEnv`; an invalid name fails at load |
| `providers.<id>.model` | required | Model id that new chats use when this provider is the first one that works |
| `openRouterAuthURL` | `https://openrouter.ai/auth` | The OpenRouter authorization page |
| `openRouterKeyLabel` | `''` | The label OpenRouter prefills for the new key; empty sends none |
| `requestTimeoutMs` | `10000` | Longest time one key test or code exchange may take, in milliseconds (100 to 60000) |
| `connectTimeoutMs` | `600000` | Time the attorney has to authorize on OpenRouter, in milliseconds (1000 to 3600000) |

### Test a key

`ctx.remote.flowleapModels.test(provider)` reads the stored key of `anthropic`, `openai`, or `openrouter` and sends one authenticated `GET` that costs nothing: `<baseURL>/v1/models?limit=1` with `x-api-key` for Anthropic, `<baseURL>/models` with a bearer token for OpenAI, and `<baseURL>/key` with a bearer token for OpenRouter (its model list answers without a key, so it cannot test one). The Host does not follow a redirect and does not read the body. An unknown provider throws `gateway/bad-request`.

| Result | When |
|---|---|
| `{ ok: true }` | the provider answers 2xx |
| `{ ok: false, reason: 'no_key' }` | no key is stored, or it cannot be read; no request is sent |
| `{ ok: false, reason: 'refused', status }` | the provider answers 401 or 403 |
| `{ ok: false, reason: 'provider_error', status }` | the provider answers another HTTP error status |
| `{ ok: false, reason: 'unreachable' }` | the connection fails, the provider redirects, or the answer does not arrive within `requestTimeoutMs`; the Host logs the cause without the key |

### Connect OpenRouter

1. `startOpenRouter()` opens a loopback listener on a free port of `127.0.0.1` (and the same port on `::1` when the host has it), and returns the authorization page: `openRouterAuthURL` with `callback_url=http://localhost:<port>/callback`, an S256 `code_challenge`, a random `state`, and `key_label` when set. A new start ends an attempt that has not ended as `cancelled`.
2. The client opens the page in the attorney's browser. The attorney signs in to OpenRouter and approves.
3. OpenRouter redirects to the callback. A callback without a code ends the attempt as `denied`. A code with another `state` gets HTTP 400 and the attempt keeps waiting. A code with this attempt's `state` is exchanged once: `POST <openrouter baseURL>/auth/keys` with the code and the PKCE verifier. The key goes to `ctx.credentials.set` under the OpenRouter `apiKeyRef` and never into a result or a log. The browser tab shows whether the connect worked.
4. `awaitOpenRouter()` returns the end of the current attempt. `cancelOpenRouter()` ends it as `cancelled`.

| Result | When |
|---|---|
| `{ state: 'connected' }` | the key is stored |
| `{ state: 'cancelled' }` | `cancelOpenRouter()`, a new start, the end of the caller's call, or the plugin's disposal ended the attempt |
| `{ state: 'failed', reason: 'denied' }` | the callback carried no code |
| `{ state: 'failed', reason: 'exchange_refused' }` | OpenRouter answered the exchange with an HTTP error, or without a key |
| `{ state: 'failed', reason: 'unreachable' }` | OpenRouter was not reached for the exchange in time |
| `{ state: 'failed', reason: 'store_refused' }` | the credential store refused the key, for example a firm `lockedRefs` entry |
| `{ state: 'failed', reason: 'timeout' }` | no usable callback arrived within `connectTimeoutMs` |
| `{ state: 'failed', reason: 'not_started' }` | `awaitOpenRouter()` found no attempt |

The listener closes when the attempt ends. Every endpoint of the Remote is owner-only for Live Share viewers.

### The default model of new chats

After a successful test or connect, the Host reads `agentDefaultModel.currentSelection()`. When the default cannot run, because its provider is another of the three providers without a key or its route is not registered in `ctx.llm`, the Host saves `{ provider, model }` with this provider's configured `model`, and the result carries it as `adopted`. A default on this provider, on a provider with a key, or on another registered route stays. Without the `agentDefaultModel` service, or when the save fails (logged), nothing is adopted and the result is still a success.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`FlowleapModels` is a `TypertRemoteService` under the `flowleapModels` namespace; the generated Remote client reaches the browser through [`dsh-api-remotes`](../../api/remotes/README.md). One `OpenRouterAttempt` owns one connect: its listeners, its deadline, its single exchange, and the promise of its end. The service holds at most one attempt and cancels it at disposal.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Config, the key test, the default model step, and the `flowleapModels` Remote |
| [`src/openrouter.ts`](src/openrouter.ts) | One OpenRouter connect attempt: PKCE, the loopback listener, and the code exchange |
| [`src/types.ts`](src/types.ts) | the client-safe result vocabulary |
| [`tests/`](tests/) | the test against a provider double for each provider and result, and the connect from the callback to the stored key |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-settings-flowleap-models](../../client/ui-settings-flowleap-models/README.md) — the controls on the Models page.
- [dsh-flowleap-desktop](../../bundle/flowleap-desktop/README.md) — the desktop layer that mounts both.
- [dsh-llm-pi-ai](../../llm/llm-pi-ai/README.md) — the routes whose keys this package tests and stores.

-----

<a id="model-experience"></a>
## Model Experience

None, as the key test and the connect serve the browser only and never reach a model request.

#### KV Cache effect

None; this package neither assembles nor sends a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The connect needs the browser on the Host's machine** — the callback goes to a loopback port of the Host, so the connect works in the desktop app, where the Host and the browser share one machine, and not from a browser on another machine.
- **A changed base URL needs the same change here** — the test reads `providers.<id>.baseURL` of this row, not the route's endpoint, because no service exposes the configured route endpoint.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
