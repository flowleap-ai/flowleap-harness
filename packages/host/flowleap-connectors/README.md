---
description: "In-process FlowLeap patent-data connectors for the harness: the EPO OPS, USPTO ODP and academic clients of @flowleap/connectors over the dsh credential, logging and tool seams, with the flowleapConnectors Remote behind the settings cards and the first-run wizard."
kind: "package-reference"
---

# @deepseek-ai/dsh-flowleap-connectors

## Summary

`dsh-flowleap-connectors` runs the FlowLeap connector library in the attorney's own process with the firm's own keys (ADR 0019, slice C2). One row implements the library's `ConnectorHost` over dsh seams, registers the office tools on `ctx.tools` under their backend names (`search_patents`, `get_bibliography`, `search_academic`, no prefix), and exposes the `flowleapConnectors` Remote that the [Patent data connectors settings section](../../client/ui-settings-flowleap-connectors/README.md) reads and writes. Keys live as records of `ctx.credentials` under `flowleap-connectors/<id>`; a tool called without its key answers with text naming the settings card instead of failing.

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

Mount the row beside `dsh-tools` and a credential provider; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this. Add the firm's keys in Settings > Patent data connectors (or through the first-run wizard); the next tool call uses them.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-flowleap-connectors'
  config:
    cacheEntries: 500
```

| Field | Default | Meaning |
|---|---|---|
| `cacheEntries` | `500` | Entries the in-memory result cache holds before evicting the least recently used one; each entry expires at the TTL the library sets |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-flowleap-connectors) is the exhaustive source for every accepted field.

### Connectors and their credentials

| Connector id | Record fields | Powers |
|---|---|---|
| `epo-ops` | `consumerKey`, `consumerSecret` | OPS search, bibliographic data, families, legal status, EP register |
| `uspto-odp` | `apiKey` | US application data, file wrappers, continuity, enriched citations |
| `semantic-scholar` | `apiKey` (optional for the search; raises its rate limit) | academic search beside arXiv, which needs no key |
| `mistral` | `apiKey` | reserved for OCR; stored, not called |

Each connector is one `grant` record, `flowleap-connectors/<id>`, whose payload is the field map; the payload is validated on every read, and a record missing a field reads as not configured. The library asks for a provider's credentials per call, so a key saved in Settings reaches the next call without a restart. Nothing reads keys from the environment: the records are the one source.

### The Remote

`ctx.remote.flowleapConnectors` on the Client:

| Method | Returns | Behavior |
|---|---|---|
| `describe()` | `Record<ConnectorId, ConnectorPresence>` | `configured`, `source: 'stored'` when configured, `writable`, and the `fields` to collect; never a value |
| `set(id, values)` | `void` | stores every field of the connector; an unknown connector or field is `gateway/bad-request`, a store refusal `flowleap-connectors/rejected` |
| `unset(id)` | `void` | removes the record; absent is a no-op |
| `test(id, signal?)` | `{ ok, message }` | without a stored key, `{ ok: false, message: '<Connector> key not configured' }` and no network call; with one, an OPS access-token mint, an ODP lookup of application 15043224 (US 10,000,000), or a one-paper Semantic Scholar search; Mistral reports presence only |

### The tools

Until slice C2a lands, three interim definitions ship in [`src/interim-tools.ts`](src/interim-tools.ts), written to the C2a `OfficeToolDefinition` contract (`name`, `description`, `input: ZodType`, `annotations?`, `access?`, `handler(input, { connectors, signal?, caller? })`). `registerOfficeTools(ctx, connectors, bound, definitions)` is the one seam: when the library exports `officeTools()` and `toolInputJsonSchema()`, `src/index.ts` passes that list instead and the interim module is deleted. A tool whose connector has no key returns `{ error: 'missing_credentials', connector, message }`, rendered to the model as the message alone.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`apply` builds the credential store over `ctx.credentials`, the `ConnectorHost` over it, one `createConnectors(host)` instance for the row's lifetime (one OPS token cache, one throttle), registers the tools as an effect, and mounts the Remote controller as a child plugin. The host is: `fetch` the global `fetch`; `credentials` the stored record as `{ status: 'available', owner: 'user', stored: true }` or `{ status: 'missing' }` (the backend's `required` plan gate never arises here); `cache` an LRU with per-entry TTL; `logger` the plugin logger; `now` `Date.now`; `signal` the caller's `AbortSignal`, carried through `AsyncLocalStorage` so one shared instance serves every tool call and connection test with its own cancellation; no `onOutcome`; no `ocr`.

Each registered tool validates the model's arguments with the definition's Zod schema (the JSON Schema the model sees is `z.toJSONSchema` of the same schema, `io: 'input'`), runs the handler inside the caller-signal scope, folds a `DataKeysRequiredError` or `ProviderKeyInvalidError` thrown by the library into the missing-credential result, and returns the handler's value after one JSON round trip, because the library's results carry `undefined` members the registry does not accept. The canonical output schema is unconstrained JSON; the render shows the message of a missing-credential result and pretty JSON otherwise.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Config, `apply`, public exports |
| [`src/types.ts`](src/types.ts) | Client-safe vocabulary: connector ids and fields, `ConnectorPresence`, `ConnectorTestResult` |
| [`src/credentials.ts`](src/credentials.ts) | the record store over `ctx.credentials`, field validation, the library's `CredentialLookup` |
| [`src/host.ts`](src/host.ts) | `ConnectorHost`, `LruCache`, the caller-signal carrier |
| [`src/tools.ts`](src/tools.ts) | the `OfficeToolDefinition` contract, `toolInputJsonSchema`, `registerOfficeTools`, the missing-credential answer |
| [`src/interim-tools.ts`](src/interim-tools.ts) | INTERIM: the three definitions until `officeTools()` lands |
| [`src/controller.ts`](src/controller.ts) | the `flowleapConnectors` Remote |
| [`tests/`](tests/) | record round trip, host and cache, tool registration and the missing-key answer, the Remote |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [vendored `@flowleap/connectors`](../../../vendor/flowleap-connectors/README.md) — the library, its sync script, and the mupdf decision.
- [ui-settings-flowleap-connectors](../../client/ui-settings-flowleap-connectors/README.md) — the settings cards and the first-run wizard over this Remote.
- [credentials](../../credentials/README.md) — the record half of the credential seam the keys live in.
- [dsh-tools](../../core/tools/README.md) — the registry the office tools join.
- [dsh-flowleap-web](../../bundle/flowleap-web/README.md) — the profile layer that mounts this row.

-----

<a id="model-experience"></a>
## Model Experience

### The office tool declarations

#### What the model sees

Three tool declarations in the request's tool list, `search_patents`, `get_bibliography`, and `search_academic`, each with the description and the JSON Schema derived from its Zod input in [`src/interim-tools.ts`](src/interim-tools.ts). The generated tool catalog does not list them: they are registered from Zod definitions, not through `defineTool`, and the row is mounted by the `flowleap-web` profile only. A result is the library's JSON (a search page, a bibliographic record, a ranked paper list) rendered as pretty JSON, or, without a key, one sentence naming the connector and the settings card.

#### Token effect

Fixed per request for the three schemas while the row is mounted; result size varies with the data and is capped by the registry's output policy, not by this package.

#### KV Cache effect

Prefix-stable: the schemas do not change between requests of one process. Mounting or unmounting the row changes the tool list and invalidates reuse from the first changed token.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what the row does not do yet; they are current package constraints, not a task backlog.

- **Three interim tools** — the library's full office tool set arrives with `officeTools()` (slice C2a); until then only `search_patents`, `get_bibliography`, and `search_academic` are registered, and their input schemas are owned here rather than by the library.
- **No OCR** — the Mistral key is stored and reported but `ConnectorHost.ocr` is absent, so the file-wrapper document reader cannot extract scanned text yet.
- **No figure rasterization** — the vendored library's `mupdf` import resolves to a stand-in that throws (AGPL-3.0, see the vendor README), so `ops.getFigurePage*` fails with a clear message.
- **Records only** — keys are not read from environment variables or the backend's key store; the settings cards and the wizard are the one way in.
- **No PTC-friendly output schema** — the canonical value is unconstrained JSON, so PTC programs get `unknown`-typed results until the library's definitions carry output schemas.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The `access` field of the contract is recorded but not interpreted: ADR 0019 keeps paid tools behind the backend, so every office tool this row registers is key-gated only. If C2a gives `access` a value the harness must act on (hide a tool, require a FlowLeap token), the seam is `registerOfficeTools`.

</details>
