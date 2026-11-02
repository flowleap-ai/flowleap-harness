---
description: "The FlowLeap firm-server layer over dsh-flowleap-web: models run only on the deployment's routes and keys, the Models page is read-only, and the model rows are locked against user patches."
kind: "package-bundle"
---

# @deepseek-ai/dsh-flowleap-firm

## Summary

`dsh-flowleap-firm` fixes the model routes and keys of a FlowLeap firm server (flowleap-harness#61). The shipped `flowleap-web` profile stacks it after [`dsh-flowleap-web`](../flowleap-web/README.md); the `flowleap-desktop` profile of the FlowLeap desktop app stacks [`dsh-flowleap-desktop`](../flowleap-desktop/README.md) there instead, so the attorney adds, tests, and connects model keys on the Models page. The bundle mounts no plugin of its own: it patches three rows and locks them, and turns off the Plugins page (`ui-plugin-manager`), so an attorney sees no Plugins entry and no **Browse other plugins** (flowleap-harness#84).

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

The shipped `flowleap-web` profile lists `dsh-base`, `dsh-web-app`, `dsh-flowleap-web`, and this bundle, in this order. A `flowleap-web` profile that a release before this bundle wrote lists only the first three; app-boot replaces that exact list with the template at the next start. A custom profile adds the bundle after `dsh-flowleap-web`:

```text
dsh plugin --profile <name> add @deepseek-ai/dsh-flowleap-firm
```

### Models only through the firm's keys

| Row | Package | Effect |
|---|---|---|
| `llm-pi-ai` | [`dsh-llm-pi-ai`](../../llm/llm-pi-ai/README.md) | The routes of `dsh-flowleap-web` and `fixedRoutes: true` in place of `subscriptionSignIn: false` |
| `credentials` | [`dsh-credentials-local`](../../credentials/credentials-local/README.md) | `lockedRefs` on `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY` |
| `ui-settings-models` | [`dsh-client-ui-settings-models`](../../client/ui-settings-models/README.md) | `managed: true`: the Models page shows the routes and offers no change |

The Host refuses each way around the deployment's routes and keys, so a hidden control is not the only guard: `llm-pi-ai` `fixedRoutes` refuses a settings change of a route, an endpoint, a key reference, or a model list, registers no subscription sign-in, and offers no endpoint discovery; `credentials` `lockedRefs` refuses a key typed for one of the three references and ignores one stored before; the Models page shows the routes with a notice and offers no change.

The bundle locks the three rows against user patches (`dsh.bundle.lockedRows` in `package.json`). The Loader drops a profile or home `cordis.patch.yml` row that names one of them, or that inserts another row of one of their plugins, and prints which, so a Models page save from before the lock cannot turn it off. The settings editor refuses a change of a locked row. The plugin manager refuses to deselect this bundle, because that would remove the locks.

A firm overlay (`--patch`) is not a user patch, so it can still restate a row. One that sets the gateway base URL restates the whole `llm-pi-ai` row and must restate `fixedRoutes: true`, or the `ui-settings-models` row fails at load. The flowleap-os firm patch does this, and its read-only keys file makes the key references read-only.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`cordis.patch.yml` holds three id-targeted overrides and turns off the `ui-plugin-manager` row. Each override replaces the targeted row's whole `config`, so the `llm-pi-ai` row restates the `dsh-flowleap-web` routes and sets `fixedRoutes: true` in place of `subscriptionSignIn: false`. The flowleap-os firm patch restates every field of this row, and its `test/firm-patch.test.mjs` fails when it does not. [`flowleap-web-models.spec.ts`](../../../apps/cli/tests/flowleap-web-models.spec.ts) composes both shipped FlowLeap profiles and fails when the firm routes differ from the `dsh-flowleap-web` routes in anything else, when the firm profile misses a lock, when the desktop profile has one, or when an old `flowleap-web` profile list does not get this bundle.

### Source map

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | The three row overrides and the Plugins page row off |
| [`package.json`](package.json) | `dsh.bundle.lockedRows` |
| [`src/index.ts`](src/index.ts) | Bundle package entry |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`dsh-flowleap-web`](../flowleap-web/README.md) — the FlowLeap layer that this bundle locks.
- [Shipped profile templates](../../util/official-bundles/src/bundles.ts) — `flowleap-web` and `flowleap-desktop`.

-----

<a id="model-experience"></a>
## Model Experience

None, as the bundle only fixes the model routes and keys and adds no prompt text, tool, or request field.

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
