---
description: "FlowLeap Office tools on OfficeCLI: Word letters on firm templates, claim amendments as Word tracked changes, Excel claim charts, and the reading and review of tracked changes, through the flowleapOffice service whose OfficeCLI provider owns the pinned binary."
kind: "package-reference"
---

# @deepseek-ai/dsh-flowleap-office

## Summary

`dsh-flowleap-office` gives the agent five tools for the attorney's Word and Excel files: `office_letter_from_template`, `office_amend_claims`, `office_claim_chart`, `office_read`, and `office_review_changes`. The tools are the consumers of one capability seam. The Service Definition is `ctx.flowleapOffice` in [`src/types.ts`](src/types.ts). The Service Provider is the `@deepseek-ai/dsh-flowleap-office/officecli` row, which runs the pinned OfficeCLI binary. The service takes and returns file bytes. It never gets a workspace path, and the provider works only in its own private folder. Client documents stay on the firm server: the provider starts no update check, no automatic install, and no background process, and it refuses every value that starts with `http://` or `https://`.

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

Mount two rows. The provider row needs `ctx.subprocess`. The main row needs `ctx.flowleapOffice`, the tool registry, the filesystem, the Agent registry, and the Session working directory. The [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle declares both rows with `disabled: true`; the firm image adds the pinned binary and switches them on.

### Minimal configuration

```yaml
- id: flowleap-office-officecli
  name: '@deepseek-ai/dsh-flowleap-office/officecli'
  config:
    binaryPath: /opt/flowleap/officecli/officecli
    version: 1.0.160
    sha256: baa084b64ec634bd9d41a0592db3ed85f11658b358bab898679537ea7f3e73a9
    stateDir: !!js dshHomePath('flowleap-office')
    timeoutMs: 60000
    maxOutputBytes: 4194304
    tableStyle: FirmTable
    chart:
      featureColumnWidth: 10
      textColumnWidth: 40
      headerFill: 1F3A5F
      headerFontColor: FFFFFF

- id: flowleap-office
  name: '@deepseek-ai/dsh-flowleap-office'
  config:
    templatesDir: /srv/flowleap/templates
    revisionAuthor: FlowLeap
    maxReadChars: 40000
    maxInputBytes: 33554432
```

| Row | Field | Default | Meaning |
|---|---|---|---|
| `officecli` | `binaryPath` | required | Absolute path of the pinned binary. |
| `officecli` | `version` | required | The text the binary must print for `--version`. |
| `officecli` | `sha256` | required | The SHA-256 of the binary, 64 lowercase hex digits. |
| `officecli` | `stateDir` | required | Absolute folder for the binary's `HOME`, its state, and the per-operation folders. |
| `officecli` | `timeoutMs` | `60000` | Longest time of one OfficeCLI call. |
| `officecli` | `maxOutputBytes` | `4194304` | Most stdout bytes of one OfficeCLI call. |
| `officecli` | `tableStyle` | `''` | Word table style of letter tables, as the firm template defines it; `''` writes no style. |
| `officecli` | `chart` | see above | Claim chart column widths in Excel character units and header colors as six hex digits. |
| main | `templatesDir` | required | Absolute folder of the firm's `.docx` templates. |
| main | `revisionAuthor` | `FlowLeap` | Author of tracked changes when the call names none. |
| main | `maxReadChars` | `40000` | Most characters of document text that `office_read` returns. |
| main | `maxInputBytes` | `33554432` | Largest input document or template. |

The provider row fails at load when a path is not absolute, when the SHA-256 of the binary is not `sha256`, or when `--version` does not print `version`. The main row fails at load when `templatesDir` is not an absolute path of a folder. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-flowleap-office) is the complete list of accepted fields.

### The tools

All five tools read and write only in the Session working directory. A model path must be relative and stay inside the working directory. An output must have the tool's extension and must not exist yet, so no tool replaces an attorney's file. A template comes from `templatesDir` by its bare file name; an unknown name gets a refusal that lists the available templates. Each tool that writes files shows them on the delivery card through `deliverables/presented` (the event of [`dsh-tool-present`](../../deliverables/tool-present/README.md)) and ends its result with `Delivered to the user; do not call `present` for these files.`

- `office_letter_from_template` takes `template`, `output`, `fields`, and `blocks`. The template's `{{name}}` placeholders get the field values; a placeholder without a value is a refusal (`missing_fields`). The blocks follow the template text: headings of level 1 or 2 with the Word styles `Heading1` and `Heading2`, paragraphs, and tables with a bold header row that repeats on each page and the `tableStyle` style.
- `office_amend_claims` takes `claims` (`number`, `before`, `after`), `output`, and optionally `clean_output`, `heading`, `template`, and `author`. It writes a new marked copy; it never edits an existing file. The word-level difference is computed in code with `diffWordsWithSpace` of the `diff` package. Each inserted or deleted run is a tracked change with the author and the date. A deleted claim also gets a deleted paragraph mark, and a new claim gets an inserted paragraph mark, so accepting or rejecting all changes leaves no empty paragraph. The author is the `author` argument, or else `revisionAuthor`. `clean_output` also writes a clean copy with the texts after the amendment as plain paragraphs.
- `office_claim_chart` takes `output`, `sheet`, `header`, and `rows`. Every cell is text, so the feature number `1.10` stays `1.10`. The chart has borders, wrapped text, top alignment, a bold filled header, the column widths, a row height for each row from its text length, a filter, a frozen header row, and a landscape print one page wide.
- `office_read` takes `path`, a `.docx` or `.xlsx` file. It returns the text (Word tables one row per line with tab-separated cells, Excel cells as `A1=value`), the Word headings, the Word tracked changes with id, type, author, date, and text, or the Excel sheets. The text is cut at `maxReadChars`.
- `office_review_changes` takes `path`, `output`, `action` (`accept` or `reject`), and optionally `author` or `ids`. It writes a new copy with all changes, the changes of one author, or the named changes accepted or rejected, and it returns how many changes it removed.

### The Service Definition

`FlowleapOffice` has five methods: `letter`, `amendClaims`, `claimChart`, `read`, and `reviewChanges`. Each takes a request with file bytes and an `AbortSignal`, and each rejects with a `FlowleapOfficeError` whose `code` is one of `url_refused`, `invalid_request`, `missing_fields`, `invalid_document`, `invalid_output`, `engine_failed`, `timeout`, `output_too_large`, or `aborted`. The tools give the error message to the model. A `RedlineParagraph` is the difference output: its `mark` is the change of the paragraph mark (`same`, `ins` for a new claim, `del` for a deleted claim), and its `segments` are the runs with their change. A `ReviewSelection` is `all`, one `author`, or a list of `ids`. Another provider, for example a fixture in a test, provides the same `flowleapOffice` key.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The provider owns the OfficeCLI process. [`OfficeCliRunner`](src/officecli/runner.ts) is the one place that spawns it, through `ctx.subprocess`. The child environment holds only `HOME=<stateDir>/home`, `OFFICECLI_STATE_DIR=<stateDir>/state`, `OFFICECLI_SKIP_UPDATE=1`, `OFFICECLI_NO_AUTO_INSTALL=1`, `OFFICECLI_NO_AUTO_RESIDENT=1`, and `TMPDIR=<call folder>`; every ambient name of the Host is removed. The call folder is also the working directory of the child. Each call has the `timeoutMs` deadline and the `maxOutputBytes` stdout cap.

Arguments come only from the closed `OfficeCommand` union in [`src/officecli/command.ts`](src/officecli/command.ts): `version`, `create`, `merge`, `batch`, `validate`, `view` with the `text` or `outline` mode, and `query` with the `revision` or `cell` selector. One table row per kind builds the arguments. There is no passthrough, and no row runs `install`, `skills`, `mcp`, `plugins`, `watch`, `open`, `close`, `refresh`, `dump`, `import`, another `view` mode, or the binary without arguments. Every call except `--version` uses `--json`, and a zod schema parses each reply.

Document changes go through one `batch` call per document, in OfficeCLI's default atomic mode. The closed `BatchItem` union in [`src/officecli/batch.ts`](src/officecli/batch.ts) is the only way to write a batch, and one table row per item kind gives its OfficeCLI JSON. No item kind adds a diagram, an image, a link, or a table from the CSV `data` property: table and sheet cells are written one item per cell. Before a batch, the provider refuses each string of each item, each argument, and each field value that starts with `http://` or `https://` after trimming, in any letter case. A line feed in Word text becomes a line break in the same paragraph, because OfficeCLI starts a new paragraph at a line feed.

A tracked-change claim is one paragraph with one run per segment, each `ins` or `del` run with `revision.author` and `revision.date`. OfficeCLI has no paragraph-mark deletion, and its paragraph-mark insertion copies the mark into later runs, which fails validation. So the provider writes both marks with a `raw-set` item into `w:pPr` of the last paragraph after the paragraph's runs. The mark ids count up from 1, below the ids OfficeCLI assigns from 1048576; a template that holds tracked changes is refused (`invalid_document`), so no id can collide. Each operation runs `validate` on each written file and fails with `invalid_output` when it does not pass.

Each operation makes a new folder under `<stateDir>/calls`, writes the input bytes there with fixed file names, and removes the folder at the end. At load the provider removes `<stateDir>/calls`, because a folder that a stopped process left holds client documents.

### Source map

| File | Role |
|---|---|
| [`src/types.ts`](src/types.ts) | the Service Definition: requests, results, error codes, and `ctx.flowleapOffice` |
| [`src/error.ts`](src/error.ts) | `FlowleapOfficeError` |
| [`src/redline.ts`](src/redline.ts) | the word-level difference of claim texts as `RedlineParagraph` values |
| [`src/officecli/index.ts`](src/officecli/index.ts) | the provider row: Config, the binary check, `apply` |
| [`src/officecli/command.ts`](src/officecli/command.ts) | the `OfficeCommand` union, its argument table, and the web-address refusal |
| [`src/officecli/batch.ts`](src/officecli/batch.ts) | the `BatchItem` union, its JSON table, and the item builders of letters, claims, and charts |
| [`src/officecli/runner.ts`](src/officecli/runner.ts) | the spawn with the fixed environment, the bounds, and the reply parse |
| [`src/officecli/provider.ts`](src/officecli/provider.ts) | `OfficeCliProvider`: the call folders and the five operations |
| [`src/index.ts`](src/index.ts) | the main row: Config, the template folder check, the tool registration |
| [`src/tools/`](src/tools/) | the five tools, the file rules, and the delivery card |
| [`tests/`](tests/) | unit tests with a scripted OfficeCLI child, the tools over the real filesystem and tool pipeline, and [`officecli.e2e.ts`](tests/officecli.e2e.ts), which runs the real binary when `FLOWLEAP_OFFICECLI` names it |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [FlowLeap deliverables](../flowleap-deliverables/README.md) — the binary write through the host filesystem that these tools reuse.
- [Subprocess seam](../../subprocess/subprocess/README.md) — how the provider spawns the binary.
- [Process ownership decision](../../../.agents/notes/implemented/architecture/2026-11-03-flowleap-office-owns-officecli.md) — why the plugin owns the OfficeCLI process.

-----

<a id="model-experience"></a>
## Model Experience

### The five tool declarations

#### What the model sees

The generated tool catalog covers the shipped DeepSeek presets only, so the declarations are stated in [`src/tools/`](src/tools/) and pinned by the `flowleap-office` recorded-session snapshot. Each description names what the tool writes or reads, states that a value must not start with `http://` or `https://`, and states that the tool writes only new files. The parameters are the ones listed under [The tools](#the-tools).

#### Token effect

The five schemas add fixed request-context tokens while the main row is mounted.

#### KV Cache effect

The declarations are stable for one release; no Config field appears in their text.

### Tool results

#### What the model sees

A writing tool returns one sentence that names the written files and counts, then `Delivered to the user; do not call `present` for these files.` `office_amend_claims` names the author and the number of amended, added, deleted, and unchanged claims. `office_read` returns the document text, a cut notice when the text is longer than `maxReadChars`, the headings, the tracked changes, or the sheets. A refusal is an error result with the reason, for example the missing placeholder names or the refused value.

#### Token effect

A writing result is one or two lines. An `office_read` result is at most `maxReadChars` characters of text plus the headings and the tracked changes, which have no separate cap.

#### KV Cache effect

Each result appends to history and does not change earlier messages.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The provider does not confine the child's network** — the environment switches stop the known fetch paths, and the provider refuses web addresses, but only the firm image can block all network access of the process (its own network namespace or an egress rule); a new OfficeCLI release can add a new fetch path.
- **Word and LibreOffice accept were not tested on the marked copy** — OfficeCLI's accept and reject give the after and the before texts; the evaluation tested LibreOffice rendering of an earlier marked copy only.
- **The row height of a claim chart is an estimate** — it counts characters per line from the column width at the default 11 pt font; another font or many wide characters can still cut text in print.
- **`office_read` lists tracked changes without a cap** — a document with very many changes returns a long result.
- **A crash during an operation leaves its call folder** — the folder holds client documents until the provider row loads again and removes `<stateDir>/calls`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
