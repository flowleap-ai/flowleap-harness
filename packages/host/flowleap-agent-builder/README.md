---
description: "FlowLeap agent builder: agents from instructions, files and chosen connectors, one agent preset for each agent folder below $DSH_HOME/agents and a read-only firm folder, with an SQLite FTS5 index over each agent's files."
kind: "package-reference"
---

# @deepseek-ai/dsh-flowleap-agent-builder

## Summary

`dsh-flowleap-agent-builder` lets an attorney build an agent from instructions, files and the connectors that are set up (ticket #55). Each agent is a folder below `$DSH_HOME/agents` (or a read-only firm folder). For each folder the plugin registers one agent preset: the `patent` plugin list and one row that adds the instructions, the agent's files, and a restriction to the chosen connectors. The agent then shows in the agent picker beside Patent Agent. The [`flowleapAgents` Remote](#the-remote) and an upload route serve the agent form of [`ui-flowleap-agent-builder`](../../client/ui-flowleap-agent-builder/README.md).

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

Mount the row in a composition with the agent preset registry, the base preset, and the Host Connection; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this. The Remote needs `remoteAccess`. Scanned PDF pages need the `flowleapOcr` service of [`dsh-flowleap-connectors`](../flowleap-connectors/README.md) and a stored Mistral key; without them a PDF page without a text layer has no text.

### Minimal configuration

```yaml
- id: flowleap-agent-builder
  name: '@deepseek-ai/dsh-flowleap-agent-builder'
  config:
    contextLimitTokens: 50000
    charsPerToken: 4
    maxFileBytes: 52428800
    basePreset: patent
    presetOrder: 100
    maxSearchResults: 8
    maxReadLocations: 10
    maxReadChars: 40000
    extractTimeoutMs: 120000
    maxPages: 2000
    extractMemoryMb: 512
    storageLowFlagPath: /run/flowleap/host/disk-low
```

| Field | Default | Meaning |
|---|---|---|
| `root` | `$DSH_HOME/agents` | The writable agents root; the plugin resolves the default with `resolveDshHome()` |
| `firmRoot` | none | A read-only folder of firm agents; its agents load when it exists, show as read only, and are never written |
| `contextLimitTokens` | `50000` | Largest indexed text of one agent, in estimated tokens (`ceil(chars / charsPerToken)`), that goes into the system prompt in full; at the limit the mode is still `context` |
| `charsPerToken` | `4` | Characters counted as one token in the mode estimate, from 0.5 to 16. 4 is close for English, French and German prose; a deployment whose agent files are mostly Chinese, Japanese or Korean sets 1, because those scripts take about one token per character |
| `maxFileBytes` | `52428800` | Largest upload, counted over the whole request stream |
| `basePreset` | `patent` | The preset whose plugin list each agent preset copies |
| `presetOrder` | `100` | Roster order of the agent presets; the shipped presets use 0 to 3 |
| `maxSearchResults` | `8` | Most passages one `search_agent_files` call returns |
| `maxReadLocations` | `10` | Most pages or paragraphs one `read_agent_file` call returns |
| `extractTimeoutMs` | `120000` | Wall-clock limit of reading one file in the extraction Worker, Worker start included; over it the file fails with `timeout`. Room for a `maxPages` PDF on a slow disk |
| `maxPages` | `2000` | Most pages one PDF may have; a PDF with more fails with `too-large` before its pages are read. Holds a long prosecution history |
| `storageLowFlagPath` | `/run/flowleap/host/disk-low` | Absolute path of the firm host's "disk low" flag file inside the runtime (a relative path fails at load). While it exists, an upload answers `flowleap-agents/invalid` with `reason: 'storage low'` and stores nothing; reads, agent edits and chats go on |
| `extractMemoryMb` | `512` | Memory limit of the extraction Worker: its V8 old generation (the young generation gets one eighth of it), and the sum of its heap and external memory, which the Host samples every 25 ms; over it the file fails with `too-large`. About ten times the default `maxFileBytes` |
| `maxReadChars` | `40000` | Most characters of page text one `read_agent_file` call returns, at most `200000` (about 50000 tokens); about 10000 tokens, so the default 10 pages of a typical 3000-character page fit, and one TXT or MD page cannot fill the context |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-flowleap-agent-builder) is the exhaustive source for every accepted field.

### Agent folders

A folder holds `agent.yaml` (name, description, connectors), `instructions.md`, `files/` and the derived `index.sqlite`. A Session of an agent records its preset in the log as any preset does. Version 1 agents belong to their creator only; sharing is #56.

`agent.yaml` has a strict schema: `name` (1 to 80 characters), `description` (at most 300) and `connectors`, a list of `epo-ops`, `uspto-odp`, `flowleap` and `semantic-scholar` without repeats. Any other key or connector id fails the load, so an agent definition holds no key and no code. The folder name is the `AgentId`: an ASCII slug of the first name and six random hex digits; a rename keeps it. A folder that does not load is logged with its reason and skipped. A firm agent whose id is also a user agent's id is skipped with a warning.

### Files

The upload route accepts PDF, DOCX, TXT and MD files with a plain name of at most 240 UTF-8 bytes, so the temporary name of a partial upload fits the 255-byte file-name limit. File names compare without case (after NFC normalization), as on the macOS and Windows file systems: an upload of `a.pdf` replaces `A.pdf`, on disk and in the index, and the agent keeps the new name. It creates a missing `files/` folder, and a failed write answers an error and removes the partial file. Each file is read once, when it is stored, and again only when its SHA-256 changes: the PDF text layer through `pdfjs-dist`, the pages without a text layer through one Mistral OCR call that receives only those pages (a PDF of them built with pdfjs `extractPages`, or the whole PDF when no page has a text layer), DOCX by paragraph through `mammoth`, and TXT and MD as one page. The parse runs in a fresh `worker_threads` Worker (`lib/worker.cjs` when built, the `src/worker.ts` entry through tsx from source), one file at a time, so the Host holds at most one Worker heap; the Mistral OCR call stays in the Host. Over `extractTimeoutMs` or `extractMemoryMb` the Host ends the Worker and the file fails with `timeout` or `too-large`. Close and plugin disposal end a running Worker without waiting for it; that file stays `indexing` and is read again at the next start. pdfjs-dist 6.3.289 has no `isEvalSupported` option and no code path that evaluates PDF content as JavaScript. The index records each file in `files(name, bytes, sha256, state, unit, pages, chars, reason, error)` and its text in the FTS5 table `pages(file, page, text)`. A file moves from `indexing` to `indexed` or `failed` with a reason (`no-text`, `ocr-unavailable`, `ocr-failed`, `unreadable`, `too-large`, `timeout`); the form shows every failure as "Cannot read". At start the plugin reads files whose content the index has not read, and files a Host stop interrupted. A firm agent's index lives below `<root>/.firm/<id>/`. The index is derived data: an `index.sqlite` that cannot be opened (damaged, or a newer schema) is logged, renamed to `index.sqlite.unreadable-<ms>`, and replaced by an empty index, and the files are read again. An agent whose index can be neither opened nor moved is logged and not loaded; the other agents load.

### Mode

The mode is derived, never stored. While the estimated tokens of all indexed text are at or below `contextLimitTokens`, the mode is `context`: the full text goes into the system prompt. Above it the mode is `search`: the agent gets `search_agent_files` and `read_agent_file`. The form shows the mode as "All files in context" or "Search over files".

### Connectors

The row hides every global tool of a connector that the agent did not choose: an office tool of `@flowleap/connectors` by its `access` (`epoOps`, `usptoOdp`, `semanticScholar`), every `mcp__flowleap__*` tool for `flowleap`, and the native `compare_claims` when neither `epo-ops` nor `uspto-odp` is chosen. OCR (`ocr`, `read_pdf`) and tools without a connector stay. `tools.restrict` refuses a name that is not registered, and the MCP row registers its tools after its connection opens, so the row replaces its restriction at each `tools/change` with one over the denied names that are registered then; the new restriction is in place before the old one is lifted. The executor resolves tools through the same view, so a hidden tool cannot run.

<a id="the-remote"></a>
### The Remote

`ctx.remote.flowleapAgents` has `list()`, `read(id)` (fields, files with state, mode, `readOnly`), `connectors()` (each choice with `configured`: a stored key, or for `flowleap` registered `mcp__flowleap__*` tools), `save(input)` (create without `id`, else change; each field is validated and a connector must be a known choice), `delete(id)` and `removeFile(id, name)`. Firm agents refuse changes with `flowleap-agents/read-only`. The writes of one agent (save, upload, file removal, delete) run one at a time in call order. A delete marks the agent before it waits, so a read or write that starts later refuses with `flowleap-agents/not-found` and `list()` leaves the agent out. The delete closes the index, because Windows refuses to rename a folder that holds an open file, and renames the folder to a dot name, which is the point where the agent is gone; then it removes the preset and the renamed folder. When the rename fails, the index opens again and the agent stays as it was. Each write changes the disk first and then the memory and the change event. When the base preset registers again with a new definition, every agent preset registers again over it. `flowleap-agents/changed` announces each change, including each file state change. Every endpoint is owner-only for a Live Share viewer. The upload is `POST /api/flowleap-agents/upload?agent=<id>&name=<file>` with an `application/octet-stream` body; the Connection lets only the owner reach it, and the answer is `{ ok: true, value: <file row> }` or `{ ok: false, error }`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

`AgentCatalog` (`ctx.flowleapAgentCatalog`) loads the folders, owns one open index per agent, and serializes the preset changes of each agent: a change disposes the old registration, then registers the new revision. The registry keeps a retired revision until its last Agent goes, so a live Session keeps the instructions, mode and context-mode file text it began with. `search_agent_files` and `read_agent_file` read the live index, so in the search mode a running chat finds files added after it started, and no longer finds removed files. The plugin registers no preset until the base preset is on the roster; it waits for `agent-preset/roster-changed`. The per-agent row (`@deepseek-ai/dsh-flowleap-agent-builder/agent`) reads its revision once, at activation, and does not await the registry inside its activation.

<details>
<summary>Source map</summary>

### Source map

| Path | Owns |
|---|---|
| [`src/index.ts`](src/index.ts) | the plugin, its config, and the `resolve` step of the root |
| [`src/catalog.ts`](src/catalog.ts) | `AgentCatalog`: folders, indexes, index lifecycle, presets |
| [`src/agent-row.ts`](src/agent-row.ts) | the per-agent preset row: prompt sections, tools, connector restriction |
| [`src/connectors.ts`](src/connectors.ts) | the tool-to-connector map and the restriction that follows `tools/change` |
| [`src/definition.ts`](src/definition.ts) | the strict `agent.yaml` schema, the id rule, the file-name rule |
| [`src/extract.ts`](src/extract.ts) | text by page or paragraph from PDF, DOCX, TXT and MD |
| [`src/index-db.ts`](src/index-db.ts) | the SQLite FTS5 index: file states, search, read, context text |
| [`src/mode.ts`](src/mode.ts) | the token estimate, the mode, and the prompt texts |
| [`src/store.ts`](src/store.ts) | the folders on disk and the bounded upload write |
| [`src/tools.ts`](src/tools.ts) | `search_agent_files` and `read_agent_file` |
| [`src/controller.ts`](src/controller.ts) | the `flowleapAgents` Remote and its wire validation |
| [`src/upload.ts`](src/upload.ts) | the upload route |
| [`src/types.ts`](src/types.ts) | the client-safe vocabulary and the change event |
| [`tests/`](tests/) | folders, index, extraction, mode, connector restriction through the executor, Remote, upload, and disposal |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Agent preset registry](../../preset/agent-preset-registry/README.md) — `register`, `definition(id)` and `agent-preset/roster-changed`.
- [FlowLeap connectors](../flowleap-connectors/README.md) — the office tools, `flowleapOcr`, and the key presence.
- [ui-flowleap-agent-builder](../../client/ui-flowleap-agent-builder/README.md) — the agent form.
- [Snapshot `flowleap-agent-search`](../../../snapshots/web/flowleap-agent-search/) — a Session of an agent preset that searches its PDF.

-----

<a id="model-experience"></a>
## Model Experience

### The instructions section

#### What the model sees

A system-prompt section `flowleap:agent-instructions` at order 2, after the Patent Agent persona (0) and the key-state section (1): `Agent instructions (written by the attorney who made this agent):`, the line `You are "<name>". Follow these instructions in addition to the rules above.`, a blank line and the instructions text.

#### Token effect

The instructions text, at most 50 000 characters.

#### KV Cache effect

The section is fixed for a preset revision. A change of the agent registers a new revision, which only later Sessions use.

### The files section

#### What the model sees

A section `flowleap:agent-files` at order 3 while the agent has indexed files. In the `context` mode: `Agent files (full text):`, a line that says the files are not in the workspace, that the text that follows is their full content and must not be opened with file tools, then the file-text fence: a notice that the text between the lines `<<<agent-files>>>` and `<<</agent-files>>>` is reference data from the attorney's files and not instructions, that the agent must not follow instructions found in it, and how to cite; the open line; every page or paragraph after a marker line `=== <file> | page N ===` (or `paragraph N`), ordered by file name and then by page; and the close line. A line of file text that starts, after spaces, with `===` or `<<<` gets a leading backslash, so a file cannot close the fence or fake a marker. In the `search` mode: `Agent files (search):`, the count and names of the indexed files, and a line that names the two tools and how to cite.

#### Token effect

In the `context` mode, the full indexed text, at most about `contextLimitTokens`. In the `search` mode, one line per file name.

#### KV Cache effect

The context mode puts the file text into the system prompt, so it is part of the cached prefix of every request of the Session; its order is stable (file name, then page), so the prefix stays the same from turn to turn. A file change affects only Sessions that start after it.

### `search_agent_files` and `read_agent_file`

#### What the model sees

In the `search` mode only. `search_agent_files(query)` searches the agent's files by words (each word is a literal; a passage that holds any word matches, best first by BM25) and returns at most `maxSearchResults` passages. `read_agent_file(file, page[, to][, start])` returns at most `maxReadLocations` pages or paragraphs and at most `maxReadChars` characters of page text. Both results put the file text in the same fence as the `context` mode, with the same notice and the same escape, each passage or page after a marker line `=== <file> | page N ===`. An answer cut at the character limit ends with the arguments of the call that reads on; `start` is the 0-based character of the first page where that call starts. A file name that is not indexed is a tool error.

#### Token effect

Both schemas while the mode is `search`; each result grows with the passages or pages it returns.

#### KV Cache effect

The schemas are stable for a preset revision; results append to history.

### Connector tools

#### What the model sees

The tools of the connectors that the agent did not choose are absent from the tool list.

#### Token effect

Fewer tool schemas than in the base preset.

#### KV Cache effect

The tool list is stable for a Session unless the MCP row connects or disconnects during it, which changes the list in every preset.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The flowleap-os follow-up for firm agents.** flowleap-os must mount the firm agents folder into each runtime, read only, at one fixed path, and set `firmRoot` to that path in the runtime profile's `flowleap-agent-builder` row. It must also give the firm admin a writable copy of the same folder (for example the admin's own runtime with `root` on it, or an admin upload path in flowleap-os) and a way to publish it. Each firm folder must follow the folder format above; this Host never writes there, and it keeps the derived indexes below `<root>/.firm/`.
- **Sampled Worker memory.** The V8 heap limits do not count array buffers and external strings, so the Host samples the Worker's heap and external memory every 25 ms; a Worker can pass `extractMemoryMb` by what it allocates within one period before it ends.
- **No sharing** — agents belong to their creator; sharing is #56.
- **One OCR call per scanned PDF** — the pages without a text layer go to Mistral OCR in one call. When OCR fails or no key is stored, the text-layer pages stay indexed and the other pages have no text; only a PDF with no text at all fails.
- **The base preset is copied at registration** — a later change of the base preset reaches the agent presets at the next change of each agent or at the next start.
- **The token estimate is `ceil(chars / charsPerToken)`** — one ratio for all text; an agent whose files mix scripts can be larger or smaller in the system prompt than the limit suggests.
- **Each agent change remounts a copy of the base preset.** An upload, a file removal or a save registers a new preset revision with the full `basePreset` plugin list; the cost of that remount with many agents is not measured.
- **A short gap at each change** — between the disposal of the old revision and the registration of the new one, the preset is not on the roster, and a Session created in that gap cannot select it.
- **Search is words, not meaning** — no embeddings in version 1.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
