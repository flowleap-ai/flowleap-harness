---
description: "In-process FlowLeap patent-data connectors for the harness: the EPO OPS, USPTO ODP, academic and Mistral OCR clients of @flowleap/connectors over the dsh credential, logging, filesystem and tool seams, with the native compare_claims and read_pdf tools and the flowleapConnectors Remote behind the settings cards and the first-run wizard."
kind: "package-reference"
---

# @deepseek-ai/dsh-flowleap-connectors

## Summary

`dsh-flowleap-connectors` runs the FlowLeap connector library in the attorney's own process with the firm's own keys (ADR 0019). One row registers the library's 39 office tools on `ctx.tools` under their backend names (`search_patents`, no prefix), adds the native `compare_claims` (a claim chart on the firm's EPO OPS key) and `read_pdf` (OCR on the firm's Mistral key), and exposes the `flowleapConnectors` Remote behind the [Connectors settings section](../../client/ui-settings-flowleap-connectors/README.md). Keys live as `ctx.credentials` records under `flowleap-connectors/<id>`; a tool called without its key answers with text naming the settings card. `flowleapMyEpo` reads the firm's MyEPO account with the credentials its card links.

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

Mount the row beside `dsh-tools` and a credential provider; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this. Add the firm's keys in Settings > Connectors (or through the first-run wizard); the next tool call uses them.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-flowleap-connectors'
  config:
    cacheEntries: 500
```

| Field | Default | Meaning |
|---|---|---|
| `cacheEntries` | `500` | Entries the in-memory result cache holds before evicting the least recently used one; each entry expires at the TTL the library sets |
| `opsRequestDeadlineMs` | `60000` | The longest time of one EPO OPS read, its retries included (5000 to 600000 ms). The library retries an EPO 429 or 503 within it and gives each attempt at most 30 s; a register page of 100 rows can take 22 s, so the library's own 20 s, made for a proxy read window, fails a slow page |
| `excludeTools` | `[]` | Office tools from the library this host does not register, by backend name; the FlowLeap profile lists `get_fulltext`, whose US arm needs the `usFulltext` host capability and so stays on the paid MCP row |
| `myepo.baseUrl` | `https://api.apps.epo.org/latest` | The MyEPO API base; the EPO sandbox is `https://api-sandbox.apps-staging.epo.org/latest`. HTTPS, or HTTP to a loopback host for a local double; another value fails the row at load |
| `myepo.tokenUrl` | `https://login.epo.org/oauth2/aus6hh2ns9ORf2PD3417/v1/token` | The OAuth 2.0 token endpoint that issues tokens for `baseUrl`; the sandbox's is `https://login-t.epo.org/oauth2/aus1v8we8qXXwPJd60x7/v1/token` |
| `myepo.requestsPerSecond` | `4` | The most MyEPO requests the row starts in one second, token requests included; the EPO publishes no limit |
| `myepo.timeoutSeconds` | `30` | The deadline of one MyEPO request |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-flowleap-connectors) is the exhaustive source for every accepted field.

### Connectors and their credentials

| Connector id | Record fields | Powers |
|---|---|---|
| `epo-ops` | `consumerKey`, `consumerSecret` | OPS search, bibliographic data, families, legal status, EP register, drawing pages, the Examiner Baseline |
| `uspto-odp` | `apiKey` | US application data, file wrappers, continuity, enriched citations |
| `semantic-scholar` | `apiKey` (optional for the search; raises its rate limit) | academic search beside arXiv, which needs no key |
| `mistral` | `apiKey`, optional `baseUrl` | OCR of scanned documents and PDFs: the `ocr` and `read_pdf` tools and the file-wrapper reader (`read_application_document`); pages billed by Mistral |

Each connector is one `grant` record, `flowleap-connectors/<id>`, whose payload is the field map; the payload is validated on every read, and a record missing a field reads as not configured. The Mistral record can also carry `baseUrl`, which the card does not ask for: a deployment writes it in its read-only document so OCR and the connection test call a model gateway (for example `http://flowleap-gateway:4000`) instead of `https://api.mistral.ai`. The library validates it on each call (`https`, or `http` to a host name without dots); an invalid value fails the OCR tools and the connection test with a message that names it, and nothing falls back to Mistral's own API. The library asks for a provider's credentials per call, so a key saved in Settings reaches the next call without a restart. Nothing reads keys from the environment: the records are the one source. A host can provide the firm's records read-only through the credential provider's [`readOnlyPath`](../../credentials/credentials-local/README.md#keys-a-host-provides-read-only): such a record wins over a stored one, its card reports it as not writable, and a save or removal from the card is refused with `flowleap-connectors/rejected`, so a key typed in the browser cannot replace a firm key.

### The MyEPO link

The MyEPO card links the firm's own MyEPO account with the OAuth 2.0 client ID and client secret that the EPO sends to the firm's MyEPO company administrator. **Save and test** gets a token (`client_credentials`, scope `mailboxapi`), reads `GET /portfolios` and `GET /communications/folders`, and only then stores one `grant` record, `flowleap-connectors/myepo`, with `clientId`, `clientSecret` and the facts of the passed test (`testedAt`, the portfolio count, whether the Mailbox answered). A refused or unanswered test stores nothing; a test of the stored link updates the facts only when it passed. An account without portfolio permission passes with no portfolio, and the card says so. The record is not one of the four library connectors: the first-run wizard and the key-state prompt section do not list it.

`ctx.flowleapMyEpo` (Host only) reads with the stored link: `portfolios`, `applications` (filters and pages), `bibliographicData`, `communications`, `unhandledCommunications`, `folders`, `downloadCommunication`, `dueDates`, `terms` and `pendingFees`. The token stays in memory and is renewed 60 s before the EPO says it expires, or at once when the stored credentials change; a `401` from the API gets one retry with a new token. Every answer is parsed with zod at the network boundary. A read fails with `MyEpoError`, whose `failure.kind` is `not-linked`, `refused` (the login service refused the credentials), `no-permission` (`403`, `ERR_20`), `not-ready` (the sandbox before its first reset, `ERR_15`), `rejected` (another refusal, with the EPO code), `unreachable` (no answer, a network failure, or a `5xx`), `invalid-response` or `unreadable-download` (a ZIP that holds no one readable PDF). `downloadCommunication` returns the one PDF of the EPO's ZIP with the communication it belongs to; the EPO marks the letter as read in MyEPO at each download, and it stays unhandled there. Nothing in this package marks a letter as handled, moves a letter or sets a file reference.

### The MyEPO letter reader

`readMyEpoLetters` is one pass of the firm's MyEPO letter reader (process atlas sheet 1, section 8). It reads the unhandled letters of the Mailbox (`GET /communications/unhandled`, pages of 50) through a `MyEpoReads` client and its request gate, asks the Firm Record for each letter whether it has it (`GET intake/myepo-letters/<id>`), downloads only a letter that the record does not have, and sends it with its list data and its PDF to `POST intake/myepo-letters` (`createMyEpoLetterIntake`, with the record's intake token). The record, not the reader, files the letter by its application number or gives it to a person; the reader names no matter, team or person. The only download mode is `on-arrival`, so MyEPO marks a letter as read when the reader takes it. No letter is dropped: when the record refuses the PDF (for example `413` above 10 MB), or the download cannot give it for good (`unreadable-download`, `no-permission`, or `rejected` with a status other than `408`, `425` or `429`), the reader sends the list data only with `download.refused`, and the record keeps the letter in its Intake with the reason. A failure that can pass (`unreachable`, `not-ready`, `invalid-response` such as an unreadable token answer, or a `rejected` wait) is tried again at the next pass. A letter whose PDF the record has from the mail (`409 already-stored`) is reported in `alreadyStored` and settled. The caller keeps a `settled` set of ids across passes, so a settled letter costs no request. A refused client secret (`refused`, `not-linked`) and an intake that does not answer (`MyEpoIntakeError` `unavailable`: no answer, a `5xx`, `408`, `425`, `429` or an unreadable answer) stop the pass; a MyEPO failure that can pass and a list-data send that the record refuses are reported in `failed`, and the next pass tries again.

The pass runs in a firm process, never in a person's runtime ([ADR 0003](../../../flowleap/docs/adr/0003-firm-state-rule.md)). In this version the only launcher is the development-only [`tests/myepo-reader/bin.ts`](tests/myepo-reader/bin.ts), which the development loop starts with `--myepo-double` and the flowleap-os end-to-end test starts against the double. It reads a host-only folder: `config.json` (the Record URL, the MyEPO endpoint and client ID, the secret file's name, `download` `on-arrival`, `everySeconds`), the client secret and the intake token, each with mode 600, and stops at a refused secret.

### The key-state prompt section

When the composition has a system prompt, the row registers `flowleap:patent-data-keys` at order 1, right after the persona slot. The text says, per connector, only whether a key is stored (`EPO OPS: key is set`), under the heading `Patent-data keys (this host)` that the IDE's prompt export points the model at (agent-v2 `keyStateOwner: 'host'`). It names no office as reachable: the call is the authority. The presence map re-reads on every `credentials/record-updated` event of the `flowleap-connectors` scope, so a key saved in Settings reaches the next turn's prompt. Values never enter the text.

### The Remote

`ctx.remote.flowleapConnectors` on the Client:

| Method | Returns | Behavior |
|---|---|---|
| `describe()` | `Record<ConnectorId, ConnectorPresence>` | `configured`, `source: 'stored'` when configured, `writable`, and the `fields` to collect; never a value |
| `set(id, values)` | `void` | stores every field of the connector; an unknown connector or field is `gateway/bad-request`, a store refusal `flowleap-connectors/rejected` |
| `unset(id)` | `void` | removes the record; absent is a no-op |
| `myEpoDescribe()` | `MyEpoLinkView` | `not-linked`, or `linked` with the facts of the last passed test; never a value |
| `myEpoLink(values, signal?)` | `MyEpoTestOutcome` | tests `clientId` and `clientSecret` and stores them only when the test passed: `passed` with the portfolios, `refused`, `unreachable` or `failed` with the EPO's message; a missing or unknown field is `gateway/bad-request`, a store refusal `flowleap-connectors/rejected` |
| `myEpoTest(signal?)` | `MyEpoTestOutcome` | tests the stored link; `not-linked` without one |
| `myEpoUnlink()` | `void` | removes the link; absent is a no-op |
| `test(id, signal?)` | `{ ok, message }` | without a stored key, `{ ok: false, message: '<Connector> key not configured' }` and no network call; with one, an OPS access-token mint, an ODP lookup of application 15043224 (US 10,000,000), a one-paper Semantic Scholar search, or the library's Mistral key verification (`connectors.ocr.verifyKey()`: one authenticated `GET /v1/models` on Mistral's API, or one OCR page of a 1x1 PNG at a record's `baseUrl`) |

### The tools

The 39 definitions of `officeTools()` from `@flowleap/connectors` (its `ToolDefinition`: `name`, `description`, `input: ZodType`, `annotations`, `access`, `handler(input, { connectors, signal?, caller? })`) register in catalog order through the one seam `registerOfficeTools(ctx, connectors, bound, definitions)`: `search_patents`, `get_search_syntax`, `search_register`, the EPO document reads (`get_bibliography`, `get_abstract`, `get_claims`, `get_description`, `get_fulltext`, `get_patent_family`, `get_family`, `get_legal_status`, `get_register_events`, `get_register_biblio`, `get_citations`, `get_patent_image`, `convert_patent_number`), the US office-action citations (`search_office_action_citations`, `search_enriched_citations`, `get_citation_stats`), the US file-wrapper reads (`get_us_grant`, `get_us_application`, `get_continuity`, `get_transactions`, `get_assignments`, `get_foreign_priority`, `get_patent_term_adjustment`, `get_attorney`, `get_application_documents`, `read_application_document`, `search_uspto_portfolio_by_customer_number`), the compound reads (`get_patent_summary`, `compare_patents`, `examiner_baseline`, `get_prosecution_timeline`, `get_patent_term`), `ocr` (Mistral Document AI over a base64 file or a URL, on the firm's Mistral key), and the literature tools (`search_academic`, `search_npl`, `get_npl_work`). The JSON Schema the model sees is the library's `toolInputJsonSchema` without its `$schema` marker, so both hosts publish the same input. A tool whose `access` is `epoOps`, `usptoOdp` or `mistral` is key-gated before its handler runs and answers `{ error: 'missing_credentials', connector, message }`, rendered to the model as the message alone (`ocr` without a key names the Mistral card); `semanticScholar` tools run without a key (slower), `none` tools (OpenAlex, the query grammar) need nothing. A `DataKeysRequiredError`, `ProviderKeyInvalidError` (EPO, USPTO or Mistral), `OcrNotConfiguredError`, or `odp_api_key_missing` raised inside a handler (the ODP arm of `search_patents`, the EPO enrichment of an ODP tool, the OCR of a file-wrapper document) folds into the same answer.

### Drawing pages

`get_patent_image` returns the library's result as its canonical value, base64 pages included. The model reads the result as text without the base64 of its PNG and JPEG pages, then, per such page, the line `Page <n> of <docId>` and the page as an image block that the row stores through the mounted `attachments` service. The images reach the model only when the current model route declares image input (`llm.resolveModelInfo`); without that, without an attachment store, or when the store refuses the batch, the text ends with one line `[page images not shown: <reason>]`. A PDF or TIFF page (`format` other than `render: "png"` or `fit: "compact"`) stays base64 in the text. The library renders PDF pages with PDFium (WebAssembly); no other host is called than EPO OPS.

### `compare_claims`

The IDE's claim-comparison tool, native in this package (S5 D1 lane d), registered beside the office tools whenever the row is mounted; it needs no filesystem. Its name, input schema and result text are the IDE's, so the exported Patent Agent prompt's `compare_claims` references resolve in the harness. `excludeTools` does not reach it: it is not an office tool.

| Input | Meaning |
|---|---|
| `userClaim` (required) | the user's claim or invention description |
| `patentNumbers` (required) | publication numbers to compare against, e.g. `EP-1234567-A1`; the first ten are compared |

The tool checks the EPO OPS key first (without one it returns the same missing-key text as the office tools, naming the EPO OPS card), normalises each number to its compact form (`EP-1000000-A1` to `EP1000000A1`) and fetches its claims through `connectors.fulltext.getClaimsRouted`, the path the office `get_claims` takes: EP and WO on the firm's EPO OPS key (a pre-grant Euro-PCT EP falls back to its WO text), a US number answered by the router's paid-route text because this host has no US full-text source. A per-patent failure is reported inline as `<status> - <message>`; a key EPO refuses ends the call with the replace-the-key text. The comparison gives the same output as the IDE's deterministic code: the independent claim of each patent (the first that depends on no other claim) is split into a preamble at the transitional phrase (`comprising`, `consisting of`, …) and limitations on semicolons, and the rows of the chart are the elements of the first patent with claims, each other patent's elements aligned by position. The canonical value is `{ patents: [{ patentNumber, claimCount, failureReason? }], markdown }`; the model reads the Markdown:

````text
## Prior Art Claim Comparison Package

### User Claim
```
A modular battery.
```

### Element-by-Element Claim Chart
Rows are the elements of the reference patent (EP-1000000-A1); `—` means that patent's independent claim has no element at that position. Correspondence is positional — verify it against the full claim text below.

| Claim Element | EP-1000000-A1 | EP-2000000-A1 |
| --- | --- | --- |
| Preamble | A battery pack comprising | An energy storage device comprising |
| Element 1 | a housing | a casing and a set of cells disposed inside the casing |
| Element 2 | a plurality of cells arranged within the housing | — |

### Full Claim Text

#### EP-1000000-A1
```
1. A battery pack comprising: a housing; a plurality of cells arranged within the housing.
```

#### US-7654321-B2
Claims unavailable (404 - This host has no BigQuery source. US claims for US7654321B2 are a paid FlowLeap service, read by the backend's get_claims (not this host's get_claims): call mcp__flowleap__get_claims with this number.). For a US document, try get_us_grant with the bare numeric patent number.

---
### Analysis Instructions
...
````

Each patent's full claim text is bounded at 4,000 characters (whole claims kept in order, a notice for the dropped ones). When no patent returns claims the answer lists every reason and points to `get_claims` and `get_us_grant`. The IDE's text pointed to `get_patent_details`, an IDE-only tool; this host's text points to `get_claims` and `get_description`.

### `read_pdf`

The second tool this package defines itself, registered beside the office tools while `ctx.fs` and `ctx.workingDirectory` are mounted (the `flowleap-web` profile mounts both at the global layer). Its name is the IDE's, so the exported Patent Agent prompt's `read_pdf` references resolve in the harness. The tool does not read a PDF text layer. Its description tells the model to read the text layer first with `pdftotext -layout "<file>" -` in the shell, and to call `read_pdf` only for the pages that print no text, for a page image, or when `pdftotext` is not installed, so a born-digital PDF costs no OCR pages and needs no Mistral key.

| Input | Meaning |
|---|---|
| `path` (required) | the PDF or image, absolute or relative to the session's working directory; `.pdf`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif` |
| `pages` | optional 1-based page or inclusive range, `3` or `1-5`, selecting the pages returned |

The tool checks the Mistral key first (without one it returns the same missing-key text as the office tools, naming the Mistral card), resolves the path through `ctx.fs` against the session's working directory and refuses a target outside it (`ctx.fs.contains`), reads at most 50 MB (`FS_TOO_LARGE` beyond), refuses a PDF whose bytes declare more than 300 `/Type /Page` dictionaries, and sends the file as base64 to `connectors.ocr.runOcr({ file, filename })`. The canonical value is `{ path, model, pageCount, from, to, cached, markdown }`; the model reads

```text
read_pdf: /work/matter-42/office-action.pdf
OCR model mistral-ocr-latest; 12 pages in the document, pages 1-5 of 12 returned.
OCR through the firm's Mistral key; pages billed by Mistral.

--- page 1 ---
# Office Action
...
```

The library caches an OCR result for 24 hours by content hash, so a later call with another `pages` range costs nothing and says `from the 24 h cache`. The whole document is OCRed on the first call whatever the range; the range selects the pages returned. A key Mistral rejects answers the replace-the-key text; a Mistral rate limit or API failure is a tool error prefixed `read_pdf:`.

### The register reader

`ctx.flowleapRegister.read(application, signal?)` returns the current register events of one application as office-neutral entries (`date` as `YYYY-MM-DD`, `code`, `description`), for Host plugins that read the registers without a model call, such as the [register watch](../flowleap-routines/README.md). `parseRegisterApplication` normalizes the application: `EP` and seven digits is an EP publication (a kind code is dropped), read as EP Register events on the EPO OPS key; `US` and eight digits is a US application number, read as USPTO ODP transactions on the USPTO ODP key. A US patent number has the same form, so the reader reads it as an application number. The read throws when the key is missing or the office refuses it; repeated identical events stay in the list.

### The patent data reader

`ctx.flowleapPatentData` reads EP patent data on the firm's `epo-ops` credential record, for Host plugins that need it without a Session or a tool call, such as the "Add client" flow of the client folder plugin. Every method throws `PatentDataError` with a `code` and the original error as `cause`: `no-key` when the firm stored no EPO OPS key (checked before any call) or the EPO refused the key, `unreachable` for a network fault, a 5xx, a rate limit or any other library failure, and `malformed` when an answer misses a field this service uses. A range or count that no caller should send (a register range under 1 or over 100 rows, a `maxRows` that is not a positive integer, a name without a letter or digit) throws `RangeError`.

| Method | Returns |
|---|---|
| `findApplicantNames(name, { maxRows }, signal?)` | the applicant names of the EP Register that match a typed company name, each with its count of EP applications (high first, then by name), and `truncated` when the read stopped at `maxRows`; the search is `pa=<name>` in pages of 100 rows, a name matches when its `normalizeName` key holds every word of the typed name's key, and spellings with one key are one name: the spelling the register uses most, with each application of the key once |
| `searchRegister(query, { begin, end }, signal?)` | one page (`total`, `begin`, `end`, `rows`) of an EP Register search in register CQL; one OPS call for at most 100 rows |
| `registerRecord(application, signal?)` | the `RegisterRow` of one EP application (`ap=<number>`), or `undefined` when the register lists none |
| `family(application, signal?)` | the family through the earliest EP publication: priority filings (earliest first, each once, as `US 10374408`; a member with an office code over 4 characters or a number over 32 is `malformed`) and the citable publication of each family member, any office; empty when the application has no EP publication or the EPO has no family for it |
| `publication(publication, signal?)` | title, abstract and claims of an EP publication, each absent when the EPO holds no text; for a pre-grant Euro-PCT EP publication, which has no text of its own, the abstract and the claims of its WO publication through the library's text router (`connectors.fulltext.getClaimsRouted`), and `textFrom` names that WO publication |

A `RegisterRow` holds the application number, the earliest EP publication (without a kind code: the library reads the kind from the register but drops it), the English title, the applicants, the professional representatives with address lines, the day the representatives were recorded, the opponents, the status and the filing and publication days (`YYYY-MM-DD`). `parseEpApplication` (`EP` and eight digits; a check digit after a dot is dropped) and `parseEpPublication` (`EP`, seven digits, optional kind code) brand the numbers, and `normalizeName` is the company key: Unicode NFKC, lower case, punctuation removed, spaces collapsed.

Only company names and EP application or publication numbers go to the EPO. Everything else stays in the firm.

**PATSTAT.** The applicant search answers from the EP Register (`source: 'ep-register'`, no edition) because PATSTAT is the model-facing MCP row `mcp-flowleap` of the profile, not a Host service. A Host plugin can call a registered MCP tool outside a Session through `ctx.tools.execute({ calls, signal })` without `agent` (the documented standalone call), but the call runs the full tool pipeline and its MCP result is text for a model, so this service does not use it. `ApplicantNames.source` already allows `'patstat'` for a later provider.

`ctx.flowleapOcr.pages(bytes, filename, signal?)` returns the Markdown text of each page of one document (PDF or image) through Mistral OCR on the firm's key, for Host plugins that index files without a tool call, such as the [agent builder](../flowleap-agent-builder/README.md) for PDF pages without a text layer. Without a stored key, or when Mistral refuses the key, it answers `{ kind: 'not-configured' }` and makes no further call; another upstream failure throws.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`apply` builds the credential store over `ctx.credentials`, the `ConnectorHost` over it, one `createConnectors(host)` instance for the row's lifetime (one OPS token cache, one throttle), registers the office tools and `compare_claims` as effects (`read_pdf` as a third once `fs` and `workingDirectory` are mounted), and mounts the Remote controller as a child plugin. The host is: `fetch` the global `fetch`; `credentials` the stored record as `{ status: 'available', owner: 'user', stored: true }` or `{ status: 'missing' }` (the backend's `required` plan gate never arises here); `cache` an LRU with per-entry TTL; `logger` the plugin logger; `now` `Date.now`; `signal` the caller's `AbortSignal`, carried through `AsyncLocalStorage` so one shared instance serves every tool call and connection test with its own cancellation; no `onOutcome`; no `ocr`.

Each registered tool validates the model's arguments with the definition's Zod schema (the JSON Schema the model sees is the library's `toolInputJsonSchema` minus `$schema`), gates `epoOps`/`usptoOdp` tools on a stored key, runs the handler inside the caller-signal scope, folds a `DataKeysRequiredError`, `ProviderKeyInvalidError`, or `odp_api_key_missing` `ToolError` into the missing-credential result, surfaces every other `ToolError` as `<tool>: <code>: <message>`, and returns the handler's value after one JSON round trip, because the library's results carry `undefined` members the registry does not accept. The canonical output schema is unconstrained JSON; the render shows the message of a missing-credential result and pretty JSON otherwise. `ConnectorHost.usFulltext` stays absent, so `get_claims`/`get_fulltext` report US claims as `not_configured`. `ConnectorHost.ocr` stays absent on purpose: the library's `resolveOcr` then falls through to its own Mistral client on the stored `mistral` record, so `ocr`, `read_pdf` and `read_application_document` all spend the firm's key through one client and one 24 h cache.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Config, `apply`, public exports |
| [`src/types.ts`](src/types.ts) | Client-safe vocabulary: connector ids and fields, `ConnectorPresence`, `ConnectorTestResult` |
| [`src/credentials.ts`](src/credentials.ts) | the record store over `ctx.credentials`, field validation, the library's `CredentialLookup` |
| [`src/bounded-body.ts`](src/bounded-body.ts) | `readBoundedText`: the bounded read of a firm service answer that `dsh-flowleap-budget` and `dsh-flowleap-record` share |
| [`src/host.ts`](src/host.ts) | `ConnectorHost`, `LruCache`, the caller-signal carrier |
| [`src/tools.ts`](src/tools.ts) | `registerOfficeTools`, `modelInputSchema`, the access gate and the missing-credential answer |
| [`src/compare-claims.ts`](src/compare-claims.ts) | the native `compare_claims` tool: the EPO OPS key gate, the claims fetch through the text router, the IDE's claim decomposition and chart |
| [`src/read-pdf.ts`](src/read-pdf.ts) | the native `read_pdf` tool: working-directory fence, size and page caps, the OCR call, page markers and the cost line |
| [`src/key-state.ts`](src/key-state.ts) | the `flowleap:patent-data-keys` prompt section: key presence per connector, refreshed on record changes; the persona export points at its heading |
| [`src/controller.ts`](src/controller.ts) | the `flowleapConnectors` Remote |
| [`src/patent-data.ts`](src/patent-data.ts) | the `flowleapPatentData` service: EP number parsing, the EP Register, family and text reads, and the zod checks of every library answer |
| [`src/myepo.ts`](src/myepo.ts) | the MyEPO link record, the link and test of the card, and the `flowleapMyEpo` service |
| [`src/myepo-client.ts`](src/myepo-client.ts) | the MyEPO API client: token cache, request gate, typed failures, the reads, the ZIP download |
| [`src/myepo-wire.ts`](src/myepo-wire.ts) | the zod schemas of the MyEPO answers and their mapping into FlowLeap records |
| [`src/myepo-reader.ts`](src/myepo-reader.ts) | the firm's MyEPO letter reader: one pass over the unhandled letters, and the client of the Firm Record's MyEPO intake paths |
| [`src/ocr.ts`](src/ocr.ts) | the `flowleapOcr` service: page text of one document through Mistral OCR |
| [`src/register.ts`](src/register.ts) | the `flowleapRegister` service: application normalization and the EP Register and USPTO transaction reads |
| [`tests/`](tests/) | the MyEPO reads on recorded sandbox answers ([`tests/fixtures/myepo/`](tests/fixtures/myepo/README.md)) and the link in the headless profile against the [MyEPO double](tests/myepo-double/README.md) (the recorded sandbox data, and the seed firm's public sample data), record round trip, host and cache, tool registration and the missing-key answer, `compare_claims` over a recorded text router (the IDE's compare cases, the US paid-route answer), `read_pdf` over the real local filesystem with a recorded OCR answer, the Remote |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [vendored `@flowleap/connectors`](../../../vendor/flowleap-connectors/README.md) — the library and its sync script.
- [ui-settings-flowleap-connectors](../../client/ui-settings-flowleap-connectors/README.md) — the settings cards and the first-run wizard over this Remote.
- [credentials](../../credentials/README.md) — the record half of the credential seam the keys live in.
- [dsh-tools](../../core/tools/README.md) — the registry the office tools join.
- [dsh-flowleap-web](../../bundle/flowleap-web/README.md) — the profile layer that mounts this row.
- [Snapshot `flowleap-drawing`](../../../snapshots/web/flowleap-drawing/) — a drawing request without the paid data plugin: `get_patent_image` reads page 6 of EP4831432A1 from EPO OPS on the stored key, and the page reaches an image-input model route as an image block.

-----

<a id="model-experience"></a>
## Model Experience

### The office tool declarations

#### What the model sees

Thirty-nine tool declarations in the request's tool list, the library's `officeTools()` in catalog order from `search_patents` to `get_npl_work`, each with the description text the backend serves and the JSON Schema of its Zod input, plus `compare_claims` with the IDE's schema (`userClaim`, `patentNumbers`) and a description that names the EP/WO coverage and the paid US route, and `read_pdf` with this package's own schema (`path`, `pages`) and a description that names the cost and puts `pdftotext` in the shell before OCR. The generated tool catalog does not list them: they are registered from the library's definitions, not through `defineTool`, and the row is mounted by the `flowleap-web` profile only. A result is the library's JSON (a search page, a bibliographic record, a ranked paper list) rendered as pretty JSON (a `get_patent_image` result without the base64 of its PNG and JPEG pages, followed by `Page <n> of <docId>` and the page as an image block per page; a route without image input gets `[page images not shown: <reason>]` instead), the Markdown comparison package of `compare_claims`, or, without a key, one sentence naming the connector and the settings card.

#### Token effect

Fixed per request for the 39 office declarations, `compare_claims` and `read_pdf` while the row is mounted (the ADR 0018 tool cap is the preset's `toolOrder`/restriction, not this row); result size varies with the data and is capped by the registry's output policy, not by this package.

#### KV Cache effect

Prefix-stable: the schemas do not change between requests of one process. Mounting or unmounting the row changes the tool list and invalidates reuse from the first changed token.

### The MyEPO link

#### What the model sees

Nothing of the link: it adds no tool, no prompt section and no Session event, and its credentials never reach a request.

#### Token effect

No tokens: linking, testing or unlinking MyEPO adds nothing to a request.

#### KV Cache effect

Prefix-stable: a link, a test or an unlink changes no request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what the row does not do yet; they are current package constraints, not a task backlog.

- **The MyEPO letter reader has no production launcher.** A firm runs it only after the firm worker profile of migration step 6 of the [firm organisation design](../../../flowleap/docs/2026-11-10-firm-organisation-design.md#9-the-migration); until then `tests/myepo-reader/bin.ts` runs it for the development loop and the tests, with the intake token in place of the sender kind `worker`. Its credentials come from a host folder, not from the console card.
- **The reader downloads every new letter at arrival.** The atlas default `on-open` (download when a person or a task opens the letter) needs a Firm Record document without bytes; it is not built, and the launcher refuses another `download` value.
- **A letter whose PDF the Firm Record has from a forward stays the forward.** The record answers `already-stored`; the join of a MyEPO letter with a forwarded copy (atlas sheet 1, section 8) is not built. The launcher settles the letter for as long as it runs and downloads it once more after a restart.
- **A letter that a person marks as handled on the MyEPO website before the next read is not read.** The pass reads the unhandled list only; the nightly full reconcile of atlas sheet 6 is not built.
- **A MyEPO letter has no text layer in the Firm Record.** An agent's report cannot quote it (`report.quote-not-in-letter`).

- **All 39 tools, always** — the row registers the whole `officeTools()` list at the global layer (minus `excludeTools`); narrowing the set per preset is not done.
- **No US full text** — `ConnectorHost.usFulltext` is absent, so US claims and descriptions read as `not_configured`; the profile leaves `get_fulltext` to the paid MCP row, and `compare_claims` reports a US patent's claims as unavailable with the paid route named inline.
- **The text layer depends on the shell** — `read_pdf` has no local text extraction. Its description sends the model to `pdftotext` first, so a host or image without poppler's `pdftotext` (the harness `deploy/Dockerfile` runtime stage installs none) sends a born-digital PDF through OCR, which costs Mistral pages; text extraction inside the tool is a later slice. The 300-page guard counts `/Type /Page` dictionaries in the bytes and undercounts a PDF that keeps them in compressed object streams; the `pages` range selects pages after the whole document was OCRed.
- **`read_pdf` needs `fs` and `workingDirectory`** — a composition without them registers the office tools and `compare_claims` alone.
- **`compare_claims` is gated on the EPO OPS key for every call** — like `get_claims`; a US-only comparison without an EPO key answers with the EPO OPS card, not the paid route.
- **Records only** — keys are not read from environment variables or the backend's key store; the settings cards and the wizard are the one way in.
- **MyEPO reads only** — `flowleapMyEpo` has no write operation (mark handled, move, set a file reference) and no consumer yet: the docket import and the Mailbox intake are later steps with their own decisions, and no tool gives the agent MyEPO data. Whether `GET /applications` lists unpublished applications is not known: the sandbox rows carry no publication data.
- **The MyEPO link facts live in the credential record** — the record holds the time, the portfolio count and the Mailbox answer of the last passed test beside the secret, so the card can say "Linked" without a call; a read-only firm document without these facts reads as not linked.
- **No PTC-friendly output schema** — the canonical value is unconstrained JSON, so PTC programs get `unknown`-typed results until the library's definitions carry output schemas.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

`access` gates `epoOps`/`usptoOdp` before the handler; `semanticScholar` is deliberately not gated because the library's academic search runs keyless. If a tool ever needs the FlowLeap token (paid data stays behind the backend per ADR 0019), the seam is `registerOfficeTools`.

</details>
