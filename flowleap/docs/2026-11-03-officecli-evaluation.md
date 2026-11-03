# OfficeCLI: evaluation as the engine of a FlowLeap Office plugin

Status: decided on 2026-11-03. The founder accepted the verdict "build after changes": FlowLeap builds its own FlowLeap Office plugin on OfficeCLI, with the changes in section 6. Nothing is built yet. It follows the method of the community plugin evaluation ([2026-11-03-plugin-evaluation.md](https://github.com/flowleap-ai/flowleap-harness/blob/claude/plugin-eval-f24cdf/flowleap/docs/2026-11-03-plugin-evaluation.md), PR 211), where `dsh-univer-office` was rejected.

**The goal.** The founder decides whether FlowLeap Patent AI builds its own "FlowLeap Office" dsh plugin on OfficeCLI (github.com/iOfficeAI/OfficeCLI, Apache-2.0, one C# binary). Attorneys need correct Word and Excel files: reply letters on the firm template, claim amendments as real Word tracked changes (the EPO wants a copy with the amendments marked), and Excel claim charts. Client data must stay on the firm server.

**The answer in short.** Build on it, after changes in our plugin. OfficeCLI v1.0.160 made all three attorney files correctly: the letter keeps the firm template, the heading styles and the table borders; the claim amendment has real `w:ins` and `w:del` elements by "FlowLeap", and accept and reject give the right claims; the claim chart has a header row, borders, text wrap and a filter. All of it ran on the Linux x64 build with `--network none`. None of the four Univer rejection reasons applies. But the binary is not offline by default: it checks for updates, it starts background processes, it fetches any `http(s)://` value that it gets as input, and its diagram and HTML paths start headless Chrome, which contacted Google and tried `d.officecli.ai` and `cdn.jsdelivr.net` in the test. So our plugin must own the process: fixed environment switches, typed tools only, no URL values, no browser paths, and no network for the process on the firm server.

## 1. Summary

| Test | Result | Evidence |
|---|---|---|
| 1. Code read | 12 kinds of outbound call found. `OFFICECLI_SKIP_UPDATE=1` stops the update check, the mermaid cache refresh and the skill refresh. Remote image and file URLs, mermaid diagrams, Word HTML rendering and screenshots can still reach the network. No telemetry SDK. | `code-read.md` |
| 2. Network watch | Letter, claims and chart tests: no host contacted (proxy log and `lsof` empty). Probe with a default `diagram`: tried `d.officecli.ai` and `cdn.jsdelivr.net` (refused by the proxy); headless Chrome opened direct connections to Google hosts. | `net/proxy.log`, `net/lsof.log` |
| 3. Reply letter on a firm template | Pass. Template header, footer, Heading 1 and 2 and the custom "Firm Table" style with borders kept. Umlauts and `ß` correct. `validate` passed. LibreOffice PDF correct. One trap: the table `data` property splits on a decimal comma unless the cell is quoted. | `word/`, `render/reply-letter.pdf.png` |
| 4. Claim amendment as tracked changes | Pass, with two gaps. Real `w:ins` and `w:del`, author FlowLeap; accept and reject give the right text; LibreOffice shows underline and strikethrough. Gaps: no paragraph-level deletion through the typed API, so accept leaves an empty paragraph; the inserted run has no `w:date`. | `claims/`, `render/claims-amended-parmark.pdf.png` |
| 5. Excel claim chart | Pass after two fixes. Header row, borders, wrap, filter, freeze pane, umlauts correct. Fixes: CSV import made feature numbers `1.1` into numbers; rows need explicit heights to show wrapped text in LibreOffice. | `excel/`, `render/claim-chart-fixed.pdf.png` |
| 6. Agent use | Pass. Claude Haiku 5.5 on OpenRouter, shell only, no skill: 16 steps, 4,378 output tokens, 544,857 total tokens (486,038 cache reads), correct file. It needed 5 trial runs to find the insert method. Only `openrouter.ai` contacted. | `agent/` |
| 7. Server fit | Linux x64 binary 35.5 MB, self-contained; it needs `libicu` and `libssl3` in the image. 0.53 to 0.61 s and 55 to 59 MB per call on the Mac (native arm64). Apache-2.0 with a NOTICE file; two bundled MIT components. | `linux/`, `docker/` |

Maintenance signals (GitHub API, 2026-11-03): 32,966 stars, last push 2026-10-30, 141 open issues and pull requests, 20 contributors, five releases from 2026-10-09 to 2026-10-30.

## 2. Method

**Version.** Release v1.0.160 (2026-10-30), the latest. I downloaded `officecli-mac-arm64`, `officecli-linux-x64` and `SHA256SUMS` from the GitHub release with `gh release download`; both checksums matched. The source is the release tag tarball (commit `c56512c`). I did not run `officecli install`.

**Process environment.** Every call ran through a wrapper (`tools/oc`) with `HOME` set to a throwaway folder, `OFFICECLI_SKIP_UPDATE=1`, `OFFICECLI_NO_AUTO_INSTALL=1` and, from test 4 on, `OFFICECLI_NO_AUTO_RESIDENT=1`. Test 3 ran without the last switch, which showed the resident behavior in section 3.3.

**Network watch.** The same two methods as PR 211. A local CONNECT proxy (`HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY`) logged each host and refused all of them. A sampler ran `lsof` on the process tree of each test script every 0.5 s. Limits: the sampler can miss a connection that lasts less than 0.5 s; it did miss the short OfficeCLI connections to the proxy itself in the probe. The OfficeCLI SSRF guard refuses a proxy on `127.0.0.1`, so a remote URL fetch fails before it reaches the proxy log. For that reason the Linux run with `--network none` is the strongest proof (section 3.7).

**Independent checks.** `python-docx`, `openpyxl` and `lxml` in a separate venv; my own revision reader (`tools/inspect_revisions.py`) computes the accepted and rejected text from the XML without OfficeCLI; LibreOffice (the Debian bookworm package) headless in a Docker container with `--network none` rendered each file to PDF, and macOS Quick Look made the PNG files.

**Firm template.** I made the template with `python-docx`, not with OfficeCLI, so that the test shows what OfficeCLI does to a template that another program made: header with the firm name and address, footer, Arial body, Heading 1 and 2 in the firm color, a custom table style "Firm Table" with all borders, and the placeholders `{{zeichen}}`, `{{ihr_zeichen}}` and `{{datum}}`.

## 3. Evidence for each test

### 3.1 Code read

A subagent read the source for network and side effects, and I checked the main claims in the code: `ImageSource.cs:37-38` and `FileSource.cs:31-33` fetch `http(s)://` values, `SsrfGuard.cs:40-52` refuses only non-public addresses, `ResidentServer.cs:342-344` creates pipes without `CurrentUserOnly`, `WordHandler.Add.Diagram.cs:51-58` uses a browser when one is found, and `WatchServer.cs:2100-2106` accepts a POST with no `Origin` header. The full table, with file and line for each claim, is `code-read.md` in the evidence folder.

| Call | Host | Trigger | Off switch |
|---|---|---|---|
| Update check, self-update | `d.officecli.ai`, then `github.com` | Any command, once per 24 h, in a background process | `OFFICECLI_SKIP_UPDATE=1` |
| Skill refresh into other agents' folders | Local only | First command after a version change | `OFFICECLI_SKIP_UPDATE=1` |
| Self-install, skills, MCP config | Local only | A bare `officecli` call with no arguments, from outside `~/.local/bin` | `OFFICECLI_NO_AUTO_INSTALL=1` |
| Remote image or file | Any public host in the input | `src=`, `path=`, `image=`, `icon=`, `preview=`, table `data=` with `http(s)://`, also in `batch` | None; the plugin must refuse URL values |
| mermaid.js download, mermaid ESM | `d.officecli.ai`, `cdn.jsdelivr.net` | `add diagram` without `render=native` when Chrome, Edge or Chromium is installed | `render=native` |
| Web fonts, KaTeX, three.js in HTML | `d.officecli.ai`, `fonts.googleapis.com`, `cdn.jsdelivr.net` | Word HTML render, `view screenshot`, `view stats --page-count`, `refresh` (these run headless Chrome on the server) | None; do not use these commands |
| Chrome background traffic | Google hosts | Each headless Chrome start (no `--disable-background-networking`) | None |
| Resident server | Named pipe, no TCP, no client authentication | Each mutating command starts one (60 s idle) | `OFFICECLI_NO_AUTO_RESIDENT=1` |
| Watch preview server | `127.0.0.1` only, no token | `officecli watch` | Do not run it |
| MCP server | stdio only | `officecli mcp` | Do not run it |

**Installer.** `officecli install`, `officecli skills install`, `officecli mcp <target>` and the bare call write SKILL.md files into 13 agent folders, `~/.dsh/skills` among them, write MCP configuration for Claude Code, Cursor, VS Code, opencode and LM Studio, copy the binary to `~/.local/bin` and append a PATH line to the shell start files. On the firm server this must never run.

**Files outside the document.** `~/.officecli/` (config, log when on, mermaid cache, resident markers), pipe sockets and lock files in `$TMPDIR`, and temporary copies with document content for previews, screenshots and repairs. Some temporary copies are not deleted (preview HTML, screenshots).

**Telemetry.** None found. The update check sends `User-Agent: OfficeCLI/<version>`, and the source comment says that the mirror counts versions and devices from its access log. The web-font path sends the names of missing document fonts to `d.officecli.ai`.

### 3.2 Network watch

| Section | Proxy log | `lsof` (non-loopback) |
|---|---|---|
| Letter (two runs) | none | none |
| Claims (four runs) | none | none |
| Excel (two runs) | none | none |
| Probe: remote image | none (the SSRF guard refused the proxy address) | none |
| Probe: `add diagram` with default `render` | `d.officecli.ai:443` and `cdn.jsdelivr.net:443`, both refused | 211 samples from process `Google`, to Google IPv4 and IPv6 addresses on ports 443 and 80 |
| Agent run (dsh) | `openrouter.ai:443` only | none |

So with the update check off, the letter, claims and chart work contacted no host. The diagram path did. The Chrome connections went around the proxy, because Chrome does not read `HTTPS_PROXY`; they carried no document content that I can show, but they are outbound traffic from the firm server. Chrome ran with `--no-sandbox` and stopped after the call. The diagram still went into the document as a PNG image.

### 3.3 Reply letter on a firm template

**Steps.** `merge firm-template.docx reply-letter.docx --data letter-data.json` filled the three placeholders. One `batch` call with 11 items added the address, a Heading 1, two Heading 2 sections, the body text, a 4 × 3 table with `style=FirmTable`, and the closing. Then `validate`, `view outline` and `view text`.

**Result** (`word/reply-letter.inspect.txt`, python-docx):

- Header "Kanzlei Muster & Partner Patentanwälte mbB" with the address line, and the footer, unchanged.
- `Heading 1` on the title, `Heading 2` on the two section headings; `document.xml` has `w:pStyle` `Heading1` and `Heading2`.
- The table has `w:tblStyle FirmTable`, and the style in `styles.xml` keeps its `w:tblBorders`. OfficeCLI also wrote direct table borders, so the borders show even in a program that ignores table styles.
- Umlauts and `ß` correct: `Zweibrückenstraße`, `gemäß`, `Prüfungsbescheid`, `Grüßen`, `Weiß`.
- `validate` passed. `view outline` shows the heading tree.
- LibreOffice PDF (`render/reply-letter.pdf.png`): letterhead right-aligned, blue headings, table with all borders, footer centred.

**Trap 1: decimal comma.** The first run gave a table with 5 columns, because the table `data` property is CSV and split `1,5–3,0 mm` into three cells (`word/reply-letter.v1.inspect.txt`). The help says that a cell in double quotes keeps its comma; the second run quoted the cell and gave 3 columns. German claim text has many decimal commas, so the plugin must build table cells itself and never pass free text to `data`.

**Trap 2: background writes.** Without `OFFICECLI_NO_AUTO_RESIDENT=1`, the first mutating command started a detached `__resident-serve__` process for each file (one for the template after a `query`, one for the letter). The batch reported "11 succeeded", but python-docx read the file one second later and found no headings and no table. Some seconds later the resident wrote the file and it was correct. The processes stay for 60 s after the last command, have parent PID 1, and listen on named pipes with no client authentication. A plugin that hands a file to another program (deliverables, download, python-docx) must set `OFFICECLI_NO_AUTO_RESIDENT=1`, or call `close` after each change.

### 3.4 Claim amendment as tracked changes

**Start file.** `claims-original.docx` with a heading and claims 1 to 3 in German (python-docx).

**First try: find and replace.** `set /body/p[2] --prop find=… --prop replace=… --prop revision.author=FlowLeap` makes a tracked change, but it deletes the matched phrase "angeordnet sind." and inserts the longer phrase. The result is correct after accept, but the marked copy shows more change than the amendment (`claims/claims-amended.v1-findreplace.docx`). `set /body/p[4] --prop revision.type=del` was refused: "revision.type=del on paragraph is not supported via set".

**Method that works.** Three typed calls:

1. `set /body/p[2] --prop range=134:135 --prop italic=false` splits the run, so that the final period is its own run.
2. `add /body/p[2] --type run --before /body/p[2]/r[2] --prop text=", wobei der Lamellenabstand zwischen 1,5 mm und 3,0 mm liegt" --prop revision.type=ins --prop revision.author=FlowLeap`.
3. `set /body/p[4]/r[1] --prop revision.type=del --prop revision.author=FlowLeap`.

**XML** (`claims/revisions.inspect.txt`, lxml):

```xml
<w:ins w:author="FlowLeap" w:id="1048585"><w:r><w:rPr /><w:t xml:space="preserve">, wobei der Lamellenabstand zwischen 1,5 mm und 3,0 mm liegt</w:t></w:r></w:ins>
<w:del w:author="FlowLeap" w:date="2026-11-03T12:27:24.937264Z" w:id="1048587"><w:r><w:delText>3. Wärmeübertrager nach Anspruch 1 oder 2, wobei die Strömungsgeschwindigkeit der Luft höchstens 2 m/s beträgt.</w:delText></w:r></w:del>
```

**Accept and reject.** `set /revision --prop revision.action=accept` gave claim 1 with the new feature and no claim 3 text. `reject` gave the original three claims. My XML reader computed the same texts. `validate` passed on all three files. LibreOffice shows the insertion underlined and the deletion struck through, with change bars (`render/claims-amended-parmark.pdf.png`), and a LibreOffice round trip to `.docx` kept both changes with the author.

**Gaps.**

- The deletion marks the run, not the paragraph mark, so accept leaves an empty paragraph where claim 3 was. I added the paragraph-mark deletion with `raw-set` (`<w:pPr><w:rPr><w:del …/></w:rPr></w:pPr>`); `validate` passed and my reader drops the paragraph on accept. OfficeCLI's own accept still left the empty paragraph (`claims/run-claims-parmark.log`). Word and LibreOffice accept were not tested (section 5).
- The insertion written by `add` has no `w:date`; the deletion has one. The plugin should pass `revision.date`.
- Character offsets for `range` are 0-based and count code points. My first try used a wrong offset and put the insertion inside the word "angeordnet". The plugin must compute positions in code, never let the model count characters.

### 3.5 Excel claim chart

**Steps.** `create`, rename the sheet to "Anspruch 1", `import` a CSV with five columns (feature, claim text, D1, D2, assessment) and quoted cells, then one `batch` with 31 items: `border.all=thin`, `alignment.wrapText=true` and `alignment.vertical=top` on each cell, bold white text on a dark fill in row 1, column widths, `autoFilter=A1:E5` and `freeze=A2`.

**Result** (`excel/claim-chart.inspect.txt`, openpyxl): every cell has four borders and wrap; row 1 is bold with fill `1F3A5F`; filter `A1:E5`; freeze pane `A2`; widths 10, 40, 45, 40, 22; umlauts, `ß` and the German quotation marks correct. `validate` passed.

**Two fixes.**

- `import` typed `1.1` to `1.4` as numbers (`excel/claim-chart.v1.inspect.txt`). Feature `1.10` would become `1.1`. Setting the cells with `type=string` fixed it.
- In the LibreOffice PDF the rows did not grow for wrapped text and the text was cut (`render/claim-chart.pdf.png`). Explicit row heights fixed it (`render/claim-chart-fixed.pdf.png`). Excel may grow the rows itself; I could not test Excel.

Columns D and E print on a second page in landscape; a fit-to-width page setting would keep the chart on one page.

### 3.6 Agent use

**Setup.** The headless `dsh` profile from the PR 211 worktree (`flowleap` at `da6f12bc3e`, run from source), a throwaway `DSH_HOME`, an overlay (`agent/agent.patch.yml`) that adds the OpenRouter provider and selects `anthropic/claude-haiku-5.5`, and the proxy that allows only `openrouter.ai`. The workspace had `claims-original.docx` and an `./officecli` script that sets the three switches. The agent had the shell tool and no OfficeCLI skill. The task asked for the same amendment as test 4.

**Result.** The agent read `help docx` and `help docx revision`, tried find and replace, a regex look-ahead, and three `range` splits on scratch copies, then used the same `range` and `add --before` method as section 3.4, and a regex find with empty replace for the deletion. The file is correct: pure insertion, deletion of claim 3, author FlowLeap, accept and reject correct (`agent/claims-amended.inspect.txt`). It has the same two gaps as section 3.4.

**Cost.** 16 model steps; 34 uncached input, 4,378 output, 54,407 cache-write and 486,038 cache-read tokens; 544,857 tokens in total. Most of the tokens are the growing context read again at each step. A typed tool such as `office_amend_claims` would make this one call.

**Side effect.** The agent wrote scratch copies to `/tmp`, outside the workspace, and deleted them at the end. On the firm server, the shell sandbox (#27) must keep this inside the matter folder.

### 3.7 Server fit

- **Size.** Linux x64 binary 35.5 MB, macOS arm64 33.9 MB; self-contained .NET with trimming, no runtime to install. The test image `debian:bookworm-slim` plus `libicu72`, `libssl3` and `time` is 119 MB.
- **Dependencies.** On plain `debian:bookworm-slim` the binary stopped at start: first "Couldn't find a valid ICU package", then "No usable version of libssl was found", even for local work (`linux/run.v1-no-libssl.log`). With both libraries, every test passed (`linux/run.log`).
- **No network.** With `docker run --network none`, the letter, the tracked changes, the chart and `validate` all passed. The remote image probe failed with "Resource temporarily unavailable (example.com:443)", which shows the attempt. With no browser in the image, `add diagram` used the native shape renderer and needed no network.
- **Time and memory.** On the Mac (arm64, native) one call takes 0.53 to 0.61 s and 55 to 59 MB resident memory. Under x86 emulation in Docker a call took 1.6 to 3.1 s and 91 to 143 MB; these numbers include the emulation and are not a measure of a real x64 server. Each call is a new process, so a letter with a template, a batch and a validation costs about three process starts.
- **Licenses.** OfficeCLI is Apache-2.0 with a NOTICE file that must ship with the binary. `THIRD-PARTY-NOTICES.txt` lists `DocumentFormat.OpenXml` 3.4.1 and `System.CommandLine` 3.0.0-preview, both MIT. The source also ships `install.sh`, an npm package, an SDK and skills; we need only the binary, NOTICE and the third-party notices.
- **Release speed.** Five releases in three weeks. Each new version needs our review of the network table above before the firm image takes it.

## 4. The four Univer reasons

| Univer reason | OfficeCLI |
|---|---|
| Closed Pro code with an expiring vendor key | All code Apache-2.0; two MIT libraries; no key |
| Telemetry on by default | No telemetry; the update check is off with `OFFICECLI_SKIP_UPDATE=1` |
| Gateway with no authentication on a fixed port | No network server by default. The resident pipes have no authentication but are off with `OFFICECLI_NO_AUTO_RESIDENT=1`; `watch` (loopback, no token) is opt-in |
| `.docx` export drops heading styles and table borders | Edits the `.docx` in place: template, styles, header, footer and borders kept; `validate` checks the schema |

## 5. Not tested

- Microsoft Word and Excel: not installed on the test Mac. So "accept all" in Word, row-height growth in Excel and the look of the files in Office are not proven. LibreOffice and the XML checks stand in for them.
- Accept and reject in LibreOffice itself (only the render and a round trip were checked).
- A real firm template made in Word, with fields, numbering, a logo image and section breaks.
- A native Linux x64 host: the Linux runs were x86 emulation on arm64, so the time and memory numbers there are not representative.
- The access mode of the resident pipe sockets on a multi-user Linux server.
- Windows, `.pptx`, `watch`, `mcp`, `refresh`, `view html` and `view screenshot`: they are out of scope or excluded by the plugin outline.
- The direct remote image fetch on the Mac: the SSRF guard refused the proxy, and I did not let it call a public host. The Linux run shows the attempt.
- An agent turn with a typed plugin tool: only the shell path was measured.

## 6. Verdict and plugin outline

**Verdict: build after changes.** OfficeCLI makes correct attorney files and runs with no network. The changes are in how our plugin runs it, plus two small engine gaps that the plugin can cover.

**Changes before the first firm use.**

1. Run the binary only through the plugin, with a fixed environment: `OFFICECLI_SKIP_UPDATE=1`, `OFFICECLI_NO_AUTO_INSTALL=1`, `OFFICECLI_NO_AUTO_RESIDENT=1`, and `HOME` and `OFFICECLI_STATE_DIR` in a per-runtime folder. Never put the binary on the attorney's PATH and never call it with no arguments.
2. Expose typed tools only, no command passthrough. Refuse every property value that starts with `http://` or `https://`; set `render=native` on diagrams; do not offer `install`, `skills`, `mcp`, `plugins`, `watch`, `open`, `refresh`, `view html`, `view screenshot` or `view stats`.
3. Do not install Chrome, Edge or Chromium in the firm image, and run the office tool with no network (its own network namespace or an egress rule). This is the only complete control, because new releases can add new fetch paths.
4. Pin the binary by version and SHA-256 in the firm image, add `libicu` and `libssl3`, ship NOTICE and THIRD-PARTY-NOTICES, and review the network table for each update.
5. In the tracked-change tool, add the paragraph-mark deletion for a deleted claim and a `revision.date` on each change. Report both gaps upstream.
6. In the claim-chart tool, write feature numbers as strings and set row heights and a print setup.
7. Build table cells in code, not through the CSV `data` property, so that decimal commas stay in their cells.

**Plugin outline.** A `flowleap-office` host plugin that owns the OfficeCLI process (one capability seam: the Office service definition, an OfficeCLI provider, and the tools as consumers). Each tool writes into the matter workspace and hands the file to `flowleap-deliverables`.

| Tool | What it does | OfficeCLI calls inside |
|---|---|---|
| `office_letter_from_template` | Makes a letter from a firm template: placeholders, headings, paragraphs, tables with the firm table style | `merge`, one `batch`, `validate` |
| `office_amend_claims` | Takes the old and new claim texts, computes a word-level diff in code, and writes a marked copy with tracked insertions and deletions by the attorney or "FlowLeap", plus an optional clean copy | `range` splits, `add --before` with `revision.type=ins`, run deletions, `raw-set` for paragraph marks, `validate`; accept on the clean copy |
| `office_claim_chart` | Takes feature rows and prior-art columns and writes the `.xlsx` chart with header, borders, wrap, filter, freeze pane, row heights and print setup | `create`, one `batch`, `validate` |
| `office_read` | Gives the model the text, the heading outline, the tables and the existing tracked changes of a `.docx` or `.xlsx` | `view text`, `view outline`, `query revision` |
| `office_review_changes` | Accepts or rejects tracked changes by author or by change, on a copy | `set /revision --prop revision.action=…` |

The firm templates come from the firm administrator (a template folder in the firm configuration), not from the model. The model gives content and structure; the plugin turns it into OfficeCLI calls. The community wrapper `rong-coder/dsh-office-tool` (MIT, 7 stars, last push 2026-08-17) has good ideas for the process seam: a JSON result for each call, structured error codes, a deadline and an output cap per call. It does not set any of the three switches, it passes any command through (`office_cli`, which includes `install`), it runs `watch` for its preview, and it declares dsh `0.1.0-rc.6` peers, so we take ideas only.

## 7. Evidence

The evidence is in `~/.local/share/flowleap-os/evidence/officecli-eval/` on the test Mac, outside the repository:

- `bin/`: the two binaries and `SHA256SUMS` from v1.0.160.
- `src/`: the v1.0.160 source tarball, unpacked.
- `code-read.md`: the full code read with file and line for each claim.
- `net/`: `proxy.log` and `lsof.log` for all Mac runs, by section.
- `word/`: template, data, batch files, letter, logs and python-docx inspections (first and second run).
- `claims/`: original, amended (find-and-replace try, typed method, paragraph-mark version), accepted and rejected copies, logs, `revisions.inspect.txt`.
- `excel/`: CSV, batch files, chart before and after the fixes, logs and openpyxl inspections.
- `probe/`: the remote image and diagram probe.
- `linux/`: the Linux x64 runs with `--network none`, including the failed start without `libssl`.
- `docker/`: the two Dockerfiles.
- `render/`: LibreOffice PDFs, Quick Look PNGs, and the LibreOffice round trip of the claims.
- `agent/`: task, overlay, run script, run events, the Session log, proxy and `lsof` logs, the agent's file and its inspection.
- `wrapper/`: the `dsh-office-tool` source that I read.
- `tools/`: the wrapper script, the proxy, the `lsof` sampler, the template and claims makers, and the inspection scripts.
