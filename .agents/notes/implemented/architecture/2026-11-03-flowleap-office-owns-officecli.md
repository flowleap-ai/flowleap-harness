# Agent Note: FlowLeap Office owns the OfficeCLI process

Status: implemented

## Problem

Attorneys need correct Word and Excel files from the agent: reply letters on the firm template, claim amendments as real Word tracked changes, and Excel claim charts. Client data must not leave the firm server. OfficeCLI makes correct files with no network use, but only when its caller sets three environment switches, never runs some of its verbs, and refuses values that it can fetch. A stock OfficeCLI with defaults checks for updates, can install skills and plugins, starts a background resident process that writes the file seconds after the command returns, and can fetch images and diagrams from web addresses. A model that can call OfficeCLI with free arguments can turn each of these on.

## Decision

The [`dsh-flowleap-office`](../../../../packages/host/flowleap-office/README.md) package owns the OfficeCLI process through one capability seam. The Service Definition `ctx.flowleapOffice` takes and returns file bytes, never workspace paths. The provider row `@deepseek-ai/dsh-flowleap-office/officecli` is the only code that spawns the binary, through `ctx.subprocess`. The five tools are consumers and never see OfficeCLI.

The provider enforces these rules, and its unit tests check each of them:

- At load, the SHA-256 of `binaryPath` must equal `sha256`, and `--version` must print `version`; otherwise the row fails.
- The child environment holds only `HOME` and `OFFICECLI_STATE_DIR` in the provider's state folder, `OFFICECLI_SKIP_UPDATE=1`, `OFFICECLI_NO_AUTO_INSTALL=1`, `OFFICECLI_NO_AUTO_RESIDENT=1`, and `TMPDIR` in the call folder. Every ambient name is removed.
- Arguments come only from a closed command union with one table row per kind. There is no passthrough, and no row runs `install`, `skills`, `mcp`, `plugins`, `watch`, `open`, `close`, `refresh`, `dump`, `import`, a `view` mode other than `text` or `outline`, or the binary without arguments.
- Document changes come only from a closed batch item union with one table row per kind. No item adds a diagram, an image, or a link, and table and sheet cells are written one item per cell, never through the CSV `data` property.
- Every argument, item string, and field value that starts with `http://` or `https://` is refused.
- Each operation works on fixed file names in its own new folder and removes the folder at the end. Each written file must pass `validate`.

Two engine gaps are covered in the provider. A deleted claim gets a deleted paragraph mark, and a new claim gets an inserted paragraph mark, both through `raw-set` after the paragraph's runs, because OfficeCLI has no paragraph-mark deletion and its paragraph-mark insertion copies the mark into later runs. Each tracked change carries `revision.date`. The word-level difference of claim texts is computed in the consumer with the maintained `diff` package.

## Alternatives considered

**A generic `office_cli` tool with free arguments.** The community wrapper `rong-coder/dsh-office-tool` takes this form. It sets none of the three switches, passes `install` through, and runs `watch` for its preview. The model would decide which verbs run, so prompt injection in a client document could start a fetch path.

**OfficeCLI's own MCP server.** It exposes the same verb set to the model and runs outside the harness's subprocess seam, so the environment, the deadline, and the output cap would not be ours.

**A document library in process (for example `docx`).** The harness already uses `docx` for new Word files, but it cannot fill a firm template, write tracked changes with paragraph marks, or accept and reject them. Writing these in our own code would repeat OfficeCLI's OOXML work without its `validate`.

**The paragraph-mark insertion of OfficeCLI (`add paragraph` with `revision.type=ins`).** With OfficeCLI 1.0.160 the inserted runs of that paragraph get an extra `w:ins` in their run properties, and `validate` fails.

## Consequences

Each new OfficeCLI capability that the tools need is a new command kind or batch item kind, with its own review of the network table; this is slower than passing arguments through, and it is the point of the decision. An OfficeCLI update needs a new `version` and `sha256` in the firm configuration, so an unreviewed binary cannot load. The provider confines each call through `ctx.sandbox`, whose `flowleap-web` row has `network: deny`, because a new release can add a fetch path that no environment switch stops.
