---
description: "In-process FlowLeap patent-data connectors for the harness: the EPO OPS, USPTO ODP and academic clients of @flowleap/connectors over the dsh credential, logging and tool seams, with the flowleapConnectors Remote behind the settings cards and the first-run wizard."
kind: "package-reference"
---

# @deepseek-ai/dsh-flowleap-connectors

## Summary

`dsh-flowleap-connectors` runs the FlowLeap connector library in the attorney's own process with the firm's own keys (ADR 0019, slice C2). One row implements the library's `ConnectorHost` over dsh seams, registers the library's 33 office tools (`officeTools()`) on `ctx.tools` under their backend names (`search_patents`, `get_bibliography`, `get_us_grant`, no prefix), and exposes the `flowleapConnectors` Remote that the [Patent data connectors settings section](../../client/ui-settings-flowleap-connectors/README.md) reads and writes. Keys live as records of `ctx.credentials` under `flowleap-connectors/<id>`; a tool called without its key answers with text naming the settings card instead of failing.

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

The 33 definitions of `officeTools()` from `@flowleap/connectors` (its `ToolDefinition`: `name`, `description`, `input: ZodType`, `annotations`, `access`, `handler(input, { connectors, signal?, caller? })`) register in catalog order through the one seam `registerOfficeTools(ctx, connectors, bound, definitions)`: `search_patents`, `get_search_syntax`, `search_register`, the EPO document reads (`get_bibliography`, `get_abstract`, `get_claims`, `get_description`, `get_fulltext`, `get_patent_family`, `get_family`, `get_legal_status`, `get_register_events`, `get_register_biblio`, `get_citations`, `convert_patent_number`), the US file-wrapper reads (`get_us_grant`, `get_us_application`, `get_continuity`, `get_transactions`, `get_assignments`, `get_foreign_priority`, `get_patent_term_adjustment`, `get_attorney`, `get_application_documents`, `read_application_document`, `search_uspto_portfolio_by_customer_number`), the compound reads (`get_patent_summary`, `compare_patents`, `get_prosecution_timeline`, `get_patent_term`), and the literature tools (`search_academic`, `search_npl`, `get_npl_work`). The JSON Schema the model sees is the library's `toolInputJsonSchema` without its `$schema` marker, so both hosts publish the same input. A tool whose `access` is `epoOps` or `usptoOdp` is key-gated before its handler runs and answers `{ error: 'missing_credentials', connector, message }`, rendered to the model as the message alone; `semanticScholar` tools run without a key (slower), `none` tools (OpenAlex, the query grammar) need nothing. A `DataKeysRequiredError`, `ProviderKeyInvalidError`, or `odp_api_key_missing` raised inside a handler (the ODP arm of `search_patents`, the EPO enrichment of an ODP tool) folds into the same answer.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`apply` builds the credential store over `ctx.credentials`, the `ConnectorHost` over it, one `createConnectors(host)` instance for the row's lifetime (one OPS token cache, one throttle), registers the tools as an effect, and mounts the Remote controller as a child plugin. The host is: `fetch` the global `fetch`; `credentials` the stored record as `{ status: 'available', owner: 'user', stored: true }` or `{ status: 'missing' }` (the backend's `required` plan gate never arises here); `cache` an LRU with per-entry TTL; `logger` the plugin logger; `now` `Date.now`; `signal` the caller's `AbortSignal`, carried through `AsyncLocalStorage` so one shared instance serves every tool call and connection test with its own cancellation; no `onOutcome`; no `ocr`.

Each registered tool validates the model's arguments with the definition's Zod schema (the JSON Schema the model sees is the library's `toolInputJsonSchema` minus `$schema`), gates `epoOps`/`usptoOdp` tools on a stored key, runs the handler inside the caller-signal scope, folds a `DataKeysRequiredError`, `ProviderKeyInvalidError`, or `odp_api_key_missing` `ToolError` into the missing-credential result, surfaces every other `ToolError` as `<tool>: <code>: <message>`, and returns the handler's value after one JSON round trip, because the library's results carry `undefined` members the registry does not accept. The canonical output schema is unconstrained JSON; the render shows the message of a missing-credential result and pretty JSON otherwise. `ConnectorHost.usFulltext` and `ocr` stay absent, so `get_claims`/`get_fulltext` report US claims as `not_configured` and `read_application_document` cannot extract scanned text.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Config, `apply`, public exports |
| [`src/types.ts`](src/types.ts) | Client-safe vocabulary: connector ids and fields, `ConnectorPresence`, `ConnectorTestResult` |
| [`src/credentials.ts`](src/credentials.ts) | the record store over `ctx.credentials`, field validation, the library's `CredentialLookup` |
| [`src/host.ts`](src/host.ts) | `ConnectorHost`, `LruCache`, the caller-signal carrier |
| [`src/tools.ts`](src/tools.ts) | `registerOfficeTools`, `modelInputSchema`, the access gate and the missing-credential answer |
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

Thirty-three tool declarations in the request's tool list, the library's `officeTools()` in catalog order from `search_patents` to `get_npl_work`, each with the description text the backend serves and the JSON Schema of its Zod input. The generated tool catalog does not list them: they are registered from the library's definitions, not through `defineTool`, and the row is mounted by the `flowleap-web` profile only. A result is the library's JSON (a search page, a bibliographic record, a ranked paper list) rendered as pretty JSON, or, without a key, one sentence naming the connector and the settings card.

#### Token effect

Fixed per request for the 33 declarations while the row is mounted (the ADR 0018 tool cap is the preset's `toolOrder`/restriction, not this row); result size varies with the data and is capped by the registry's output policy, not by this package.

#### KV Cache effect

Prefix-stable: the schemas do not change between requests of one process. Mounting or unmounting the row changes the tool list and invalidates reuse from the first changed token.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what the row does not do yet; they are current package constraints, not a task backlog.

- **All 33 tools, always** — the row registers the whole `officeTools()` list at the global layer; narrowing the set per preset is the C4 slice.
- **No US full text and no OCR** — `ConnectorHost.usFulltext` and `ocr` are absent, so US claims and descriptions read as `not_configured` and `read_application_document` cannot extract scanned text yet; the Mistral key is stored and reported only.
- **No figure rasterization** — the vendored library's `mupdf` import resolves to a stand-in that throws (AGPL-3.0, see the vendor README), so `ops.getFigurePage*` fails with a clear message.
- **Records only** — keys are not read from environment variables or the backend's key store; the settings cards and the wizard are the one way in.
- **No PTC-friendly output schema** — the canonical value is unconstrained JSON, so PTC programs get `unknown`-typed results until the library's definitions carry output schemas.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

`access` gates `epoOps`/`usptoOdp` before the handler; `semanticScholar` is deliberately not gated because the library's academic search runs keyless. If a tool ever needs the FlowLeap token (paid data stays behind the backend per ADR 0019), the seam is `registerOfficeTools`.

</details>
