# Word and Excel files

The attorney asks the Patent Agent for a reply letter on a firm template, a claim amendment as Word tracked changes, or an Excel claim chart. The agent calls an `office_*` tool of `dsh-flowleap-office`, the pinned OfficeCLI binary writes the file in the working directory, and the delivery card shows it. The agent can also read a document and accept or reject its tracked changes.

## Sub-features

- `office-letter` writes a `.docx` letter from a firm template with `office_letter_from_template`.
- `office-amend` writes a marked claims copy with `w:ins` and `w:del` changes and a clean copy with `office_amend_claims`.
- `office-chart` writes an `.xlsx` claim chart with `office_claim_chart`.
- `office-read` reads the marked copy and lists its tracked changes with `office_read`.
- `office-review` accepts all tracked changes of the marked copy into a new file with `office_review_changes`.

## How to get to it (user POV)

- Open a new Session on the `Patent Agent` preset and ask for the document in the composer. The first page is the dashboard, whose textbox is `Ask the agent or search`; a new Session (`New Session`) has the textbox `Describe what you want to build, / commands, @ files or sessions`, and an open Session has `Message or run a task, / commands, @ files or sessions`. Each written file shows on the delivery card of the turn.

## Driving it with the browser tool

Preconditions:

- The baseline in [README.md](./README.md).
- The rows are off in `flowleap-web`. Start the instance with `DSH_VERIFY_PATCH=.claude/skills/verify/features/office.patch.yml`, `DSH_VERIFY_OFFICECLI` set to the absolute path of the OfficeCLI 1.0.160 binary of this Mac, `DSH_VERIFY_OFFICECLI_SHA256` set to its SHA-256 (`shasum -a 256`), and `DSH_VERIFY_OFFICE_TEMPLATES` set to an absolute folder that holds a `.docx` template. Copy `packages/host/flowleap-office/tests/fixtures/firm-template.docx` into that folder as `reply-letter.docx`.
- `web.sh start` prints `ready:`. When the binary hash or version does not match, the provider row fails at load and the server log names the mismatch.

- **Amend.** Send `Call office_amend_claims once. Output claims.marked.docx with a clean copy claims.clean.docx. Claim 1 before: "A device comprising a sensor." after: "A device comprising a pressure sensor and a housing." Claim 2 is new: "The device of claim 1, wherein the housing is sealed." Claim 3 is deleted, before: "The device of claim 1, made of steel." Then reply with only DONE.` The delivery card shows both files.
- **Read and review.** In the same Session, send `Call office_read on claims.marked.docx, then office_review_changes to accept all changes into claims.accepted.docx. Reply with only the number of tracked changes.`
- **Letter and chart.** In a new Session, send `Call office_letter_from_template with template reply-letter.docx, output letter.docx, and one paragraph "Thank you for the office action." Then call office_claim_chart with output chart.xlsx, header Feature, Claim text, Prior art D1, and rows 1.1 and 1.10 with short texts. Reply with only DONE.`
- **Log.** Run `node .claude/skills/verify/scripts/session-log.mjs "$RUN/home" > "$RUN/evidence/office.session.txt"`. It shows each `office_*` tool call with a result that ends with the delivered line, and `turn N: completed`.
- **Second view.** In `$RUN/workspace/deepseek-harness/default-workspace/`, run the pinned binary on each file: `validate <file> --json` succeeds, `query claims.marked.docx revision --json` lists `ins`, `del` and paragraph-mark revisions with author `FlowLeap` and a date, `view claims.accepted.docx text` shows exactly the after texts, and `query chart.xlsx cell --json` keeps `1.10` as text.
- **Proof.** Save a screenshot of each delivery card in `$RUN/evidence/`.

## Gotchas

- Haiku 5.5 can answer `DONE` with no tool call when one message asks for two tools. The log then shows no `office_*` call. Send `You did not call any tool.` and name each tool with its exact arguments.
- A template with merge fields refuses a letter without them (`missing_fields`), and the result names the fields. The fixture template needs `datum`, `ihr_zeichen` and `zeichen`.
- When the deleted claim is the last paragraph, `view claims.accepted.docx text` shows one empty last paragraph. The README records this as a known limitation.
- The `office_*` tools are Word and Excel tools. The patent office tools, such as `get_bibliography`, are a different plugin.
- An output file that exists is refused. Use new names for each run.
- A template comes only from `DSH_VERIFY_OFFICE_TEMPLATES` by its bare file name. A workspace path is refused.
- Run the binary for the second view with `OFFICECLI_SKIP_UPDATE=1 OFFICECLI_NO_AUTO_INSTALL=1 OFFICECLI_NO_AUTO_RESIDENT=1` and a scratch `HOME`, as the provider does.
