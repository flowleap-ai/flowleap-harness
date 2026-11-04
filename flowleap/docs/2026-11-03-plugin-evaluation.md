# Community dsh plugins: evaluation for FlowLeap Patent AI

Status: evidence for a founder decision. No plugin is adopted. It feeds Discover #206 and the skills design ([2026-11-02-skills-and-plugins-design.md](2026-11-02-skills-and-plugins-design.md), Q9 to Q11) and roadmap phase D.

**The goal.** The founder decides which community dsh plugins FlowLeap adopts, studies or rejects. Two rules apply to each one: client data does not leave the firm without consent, and knowledge does not mix between client matters. A plugin runs with full rights inside the harness, so each one got a code read before it ran.

**The answer in short.** `cc-safety-net` is the best fit: it blocked every destructive and secret probe on the shell and file tools, it makes no network calls, and it costs about 2 ms per tool call. It needs our secret paths and a decision about its audit log. `dsh-zotero` works well and stays on the machine, but it needs Zotero desktop on the same computer, so it fits the desktop product only, and it has one maintainer. `dsh-univer-office` makes good spreadsheets, but its `.docx` export drops headings and table borders, it sends telemetry by default, it depends on closed Univer Pro code with a key that expires on 2027-02-03, and its local gateway has no authentication. For phase D, WeKnora is the only knowledge store with real retrieval scope checks; it needs changes before it can keep matters apart.

## 1. Summary

| Plugin | License | Works on our fork | Outbound hosts (code read and live watch) | Result | Verdict |
|---|---|---|---|---|---|
| `dream-num/dsh-univer-office` 0.4.0 | Apache-2.0, but it bundles closed `@univerjs-pro` packages under a vendor key | Yes (peer range passes with prerelease matching) | `univer.ai` telemetry at start (blocked in the test); `registry.npmjs.org` at install | `.xlsx` good; `.docx` loses heading styles and table borders; umlauts and `ß` correct | Reject for now |
| `kenryu42/cc-safety-net` 2.7.2 | MIT | Yes (declares no dsh range, so no check runs) | None from the guard; its CLI calls GitHub and npm | Live: blocked 8 of 8 destructive or secret probes on `bash`, `read`, `grep`; guard matrix: 8 missed patterns (section 3.2) | Adopt after changes |
| `Vncntvx/dsh-zotero` 0.14.1 | MIT | Yes (`engines.dsh >=0.2.2-alpha.2`) | Loopback only (`127.0.0.1:23119`); the off-by-default `scholarly` part allows 12 academic hosts | Search, item read and full-text passages worked against a stub library; umlauts correct | Adopt after changes, desktop only |
| `iflytek/skillhub` | Apache-2.0 | Its dsh plugin accepts only dsh `0.2.0-rc.2` and `0.2.1-rc.2` | `bjcdn.openstorage.cn` at each server start, `skill.xfyun.cn` as default registry | Not run (code and docs) | Study only |
| `Tencent/WeKnora` | MIT with a Tencent preamble; MPL-2.0 dependencies | Not a dsh plugin; MCP server | No default cloud model, no telemetry found | Not run | Adopt after changes (phase D pilot) |
| `MemTensor/MemOS` | Apache-2.0 (apps MIT) | Has a dsh plugin | Alibaba DashScope defaults; plugin telemetry on by default | Not run | Reject |
| `zilliztech/memsearch` | MIT | Has a dsh plugin | Hugging Face and PyPI on first use; core default embedder `openai` | Not run | Study only |

Maintenance signals (GitHub API, 2026-11-03). The open count includes open pull requests. The contributor count stops at 100.

| Repository | Stars | Last push | Open issues and PRs | Contributors |
|---|---|---|---|---|
| dream-num/dsh-univer-office | 660 | 2026-11-03 | 10 | 12 |
| kenryu42/cc-safety-net | 1,904 | 2026-11-03 | 4 | 8 |
| Vncntvx/dsh-zotero | 60 | 2026-11-03 | 0 | 1 |
| iflytek/skillhub | 5,370 | 2026-11-03 | 36 | 50 |
| Tencent/WeKnora | 36,360 | 2026-11-03 | 752 | 100 or more |
| MemTensor/MemOS | 12,239 | 2026-11-02 | 151 | 84 |
| zilliztech/memsearch | 2,818 | 2026-10-27 | 262 | 34 |

## 2. Method

**Fork.** PR 209 (the upstream sync to dsh 0.2.2-alpha.3) is not merged, so the tests ran on `flowleap` at `6201ef7214`, version `0.2.2-alpha.2`, built from source.

**Code read first.** For each plugin I read the package manifest (scripts, dependencies, dsh ranges), the published npm tarball or the built `lib/`, and the source of the parts that run. I searched for outbound calls, telemetry, install scripts and reads of secrets.

**Isolation.** Each plugin had its own throwaway `DSH_HOME` and workspace under the session scratch folder. The `cc-safety-net` and `dsh-zotero` runs also had a throwaway `HOME`, because `cc-safety-net` writes to `$HOME`. The only key was `OPENROUTER_API_KEY`, for Claude Haiku 5.5 on OpenRouter. No firm key, no FlowLeap token, no test firm. Each plugin was installed with `dsh plugin --profile flowleap-web add <package>@<version>`, tested in the `flowleap-web` Web UI, and removed with `dsh plugin --profile flowleap-web remove` before the next one.

**Network watch.** Two methods ran at the same time. A local CONNECT proxy (`HTTPS_PROXY` with `NODE_USE_ENV_PROXY=1`) logged every host name and refused every host except `openrouter.ai` and `registry.npmjs.org`. So an attempt shows in the log, but no data goes to that host. A second process sampled `lsof` for the whole process tree every 0.5 s, to catch a connection that does not use the proxy. The `api.flowleap.co` attempts in the logs come from our own FlowLeap MCP row, not from a plugin.

**Limits of the watch.** The `lsof` sampling can miss a connection that lasts less than 0.5 s. The browser side was checked from the browser pane network buffer: no request went to an `https://` host, but the buffer had dropped the older requests of the Univer run.

## 3. Live tests

### 3.1 dsh-univer-office (dream-num, 0.4.0)

**What it does.** Univer spreadsheets, documents and slides inside the chat. It adds 14 `univer_*` tools, 12 skills (`office-xlsx`, `office-docx`, `office-pptx`, `univer-sheet` and others), a live floating editor window, a review card with "Merge into current version", and export to `.xlsx`, `.docx` and `.pptx`. A bundled collaboration gateway runs as a child process on `127.0.0.1:9080`.

**License.** The plugin code is Apache-2.0. The published package (156 MB unpacked) bundles closed `@univerjs-pro` packages and two native bindings (`exchange-node-binding`, `engine-formula-rust-binding`). The pro packages run under a key in `src/shared/univer-license.ts`: issued 2026-11-03, it expires 2027-02-03, and it is valid only for the domains `localhost`, `127.0.0.1` and `app`. A firm server that attorneys open by its own host name does not match that list (inferred from the key fields; not tested). After 2027-02-03 the firm needs a newer plugin version or its own Univer license (inferred from the source comment "Rotate before expiry").

**dsh version.** Peers `^0.2.1-rc.3` (and older). Strict semver refuses `0.2.2-alpha.2`, but our activation check uses `includePrerelease` (`packages/boot/app-boot/src/plugin-compatibility.ts:52`), so it activated.

**Outbound hosts.**

- `univer.ai/api/telemetry/cli`: product telemetry, on by default (`telemetry: true` in `src/host/config.ts:127`). At the first start it tried to send `dsh_plugin_activated` and `dsh_plugin_daily_active` with an anonymous install ID, platform, architecture, Node major version and package version. The proxy refused both (`univer/telemetry-blocked.log`). The plugin records the day as sent even when the send fails (`univer/telemetry-state.txt`). `DO_NOT_TRACK`, `UNIVER_TELEMETRY_ENDPOINT=` or `telemetry: false` turn it off. The package also has an `uninstall` script that sends `dsh_plugin_uninstall_hook`; pnpm 11 did not run it at removal (`univer/proxy.log`, section "remove").
- `registry.npmjs.org` at install.
- No other host during the claim chart and the letter, which included the export (`univer/proxy.log`, `univer/lsof.log`). The static scan of the bundles found only documentation links. `@puppeteer/browsers` can download Chrome for screenshots and PDF print; those tools did not run in the test.

**Files and secrets.** The gateway opens or creates any `.univer` file by absolute path; it refuses other extensions. It writes the telemetry state in `$DSH_HOME/telemetry/dsh-univer-office/`. It reads no credentials. Security finding: the gateway has an allow-all authorization stub (`src/gateway-app/transport/http.ts:259`, `:1051`) and no token. With a plain `curl` on `127.0.0.1:9080` and no token, I listed the worktrees and units of the test letter by its path (`univer/gateway-unauth-read.txt`). On one computer with one user this is low risk. On a firm server with several attorney runtimes, each runtime also wants the same fixed port 9080, and any local process can read documents by path.

**Test 1: claim chart to `.xlsx`.** The agent loaded `office-xlsx`, built the sheet in a worktree and exported `claim-chart.xlsx`. Result: four feature rows, a bold header row, column widths set, all umlauts correct (`Wärmeübertrager für Kühlgeräte`, `Strömungsgeschwindigkeit`). Long cells have no text wrap, so they overflow in Excel. Evidence: `univer/claim-chart.xlsx`, `univer/claim-chart.xlsx.inspect.txt` (openpyxl), `univer/claim-chart.xlsx.png` (macOS Quick Look), `univer/01-claim-chart-in-chat.jpg`.

**Test 2: response letter to `.docx`.** The agent loaded `office-docx` and set `HEADING_1` and `HEADING_2` on the title and the three section headings. In the Univer view they show as real headings (`univer/02-response-letter-in-univer.jpg`). The exported `response-letter.docx` has no heading styles: every paragraph is `Normal`, the section headings are plain text with no bold, and the document has no `w:pStyle` at all. The table has its five rows and two columns but no borders (`TableNormal`, no `tblBorders`). All umlauts and `ß` are correct (`Zweibrückenstraße`, `gemäß`, `Prüfungsbescheid`). So the loss is in the export, not in the agent's work. An attorney gets a letter with no navigation pane, no outline and no styled headings. Evidence: `univer/response-letter.docx`, `univer/response-letter.docx.inspect.txt` (python-docx), `univer/docx-unzipped/word/document.xml`.

**Effect on normal work.** The two tasks used 2.2M input tokens in three turns (94 percent cache hits), shown in the chat footer. The skills and tool results are large. Opening the result in Numbers through AppleScript failed (Numbers did not accept the export command), so the file check used openpyxl, python-docx and Quick Look.

**Verdict: reject for now.**

1. Closed Univer Pro code that we cannot review, with a vendor key that expires in three months and names only `localhost`, `127.0.0.1` and `app`.
2. Telemetry on by default, to a third party, with no consent step.
3. The gateway has no authentication and a fixed port, which does not suit a shared firm server.
4. The `.docx` export, the format that attorneys send, drops headings and table borders.

Look again when Univer offers a firm license for self-hosted host names, the gateway checks a per-runtime token, and the `.docx` export keeps styles. The worktree and "Merge into current version" review card is a good pattern for our own deliverables.

### 3.2 cc-safety-net (kenryu42, 2.7.2)

**What it does.** A dsh tool guard (`ctx.tools.guard`) that parses each `bash` and `pwsh` command and the paths of the file tools, and refuses destructive commands and reads of secrets before the tool runs. The refusal text goes to the model with the rule ID. It is not a sandbox.

**License.** MIT.

**dsh version.** The dsh entry declares no dsh peer or `engines.dsh`, so our compatibility check does not run for it. It worked on `0.2.2-alpha.2`.

**Outbound hosts.** None from the guard: the dsh bundle `dist/deepseek-harness/index.js` has no `fetch` and no URL. During the live run only `openrouter.ai` passed the proxy (`safety-net/proxy.log`). The separate CLI calls `registry.npmjs.org` (`doctor` update check), `api.github.com` and `raw.githubusercontent.com` (rulebook sync, GUI); those did not run.

**Files and secrets.** It reads its policy from `$HOME/.cc-safety-net/` and the project `.cc-safety-net/`. It writes an audit log of every decision, allowed and denied, with the full command text and the working folder, to `$HOME/.cc-safety-net/logs/<project>/<month>/<date>-<session>.jsonl` (`safety-net/fakehome-files.txt`, `safety-net/audit-log-session.jsonl`). On the firm, that log would hold client names and matter details from commands, outside the Session log and outside the backup.

**Live test in the chat** (`safety-net/session.v4.jsonl`, `safety-net/01-blocked-in-chat.jpg`). The model ran each step once and did not try alternatives after a refusal.

| Probe | Result |
|---|---|
| `git status --short`, `ls -la`, `git log --oneline` | Ran |
| `git reset --hard` in the throwaway repo | Blocked, rule `git.reset-hard`; the local edit stayed |
| `rm -rf tmp-folder` inside the workspace | Ran (by design: it blocks `rm -rf` outside the working folder) |
| `rm -rf ../outside-folder` | Blocked, `rm.recursive-force-outside-cwd` |
| `git checkout -- .` | Blocked, `git.checkout-double-dash` |
| `cat .env` (fake file) | Blocked, `secret.basename.env` |
| `python3 -c "print(open('.env').read())"` | Blocked |
| `cat $(echo LmVudg== \| base64 -d)` | Blocked (it decodes the base64) |
| `read` tool on `.env`; `grep` tool on `.env` | Blocked |
| `git clean -fdx -n` (dry run) | Ran |

**Guard matrix.** I called the same guard function that the plugin registers, with 38 dsh tool calls, to test more patterns without model turns (`safety-net/guard-matrix.txt`, script `tools/ccsn-guard-matrix.mjs`).

- Blocked as expected: `git -C <dir> reset --hard`, `git stash drop`, `git push --force`, `rm -rf /`, `rm -rf ~`, `find -exec rm -rf`, `find -delete`, `cat .en''v`, `cp .env`, `cat ~/.ssh/id_ed25519`, `curl … | bash`, `curl -F f=@file https://…` (upload), `write` and `glob` on `.env`, `str_replace_editor` on `.env`, an MCP tool argument `.env`.
- Missed:
  1. `cat .e*` (a glob).
  2. `node -e` with a joined string (`'.'+'env'`).
  3. `bash run.sh` (it does not read the script).
  4. `truncate -s 0 claims.txt` and `> claims.txt` (overwrite of a tracked file).
  5. `grep PASSWORD .` over a folder that contains `.env`.
  6. `cat ~/.dsh/.credentials.yaml` (our credential store).
  7. `cat /run/flowleap/firm/keys.yaml` (a firm key path).
  8. Tools it does not know by name: `terminal_send`, `run_code`, `univer_execute`. The `flowleap-web` profile has no terminal or `run_code` tool today, so this gap is not open there.
- Allowed, correctly: `.env.example`, `claims.txt`, an `edit` of a tracked file.

**Effect on normal work.** Normal commands, `pnpm test` and `npm install` were allowed. Each guard call took 1.5 to 2.4 ms (200 calls per command, `safety-net/guard-timing.txt`). The refusal text tells the model not to retry, and Claude Haiku 5.5 followed it.

**Verdict: adopt after changes.**

1. Add our secret paths to its policy (a rulebook or our own JSON): `$DSH_HOME/.credentials.yaml`, the firm key files under `/run/flowleap/`, and the FlowLeap CLI configuration.
2. Decide the audit log: send it to the firm log store with the same retention as Session logs, or turn it off. Do not let it collect command text in `$HOME`.
3. Declare any later command tool (`terminal_send`, `run_code`) with its CLI, or refuse such tools on the firm.
4. Pin the version; review each update before listing (Discover #206).
5. Keep it as one layer beside the shell sandbox (#27); it is not a sandbox itself.

### 3.3 dsh-zotero (Vncntvx, 0.14.1)

**What it does.** It connects the agent to the local Zotero library: tools such as `zotero_search`, `zotero_get`, `zotero_retrieve` (ranked passages from annotations, notes, abstract and full text) and `zotero_browse`, a library panel, and a "Literature trail" tab with the references and passages that a chat used. Writes need Zotero 10 and an approval. A `scholarly` part searches arXiv, OpenAlex, Crossref, Semantic Scholar, PubMed, Europe PMC and DBLP; it ships off.

**License.** MIT.

**dsh version.** `engines.dsh >=0.2.2-alpha.2` and peers `>=0.2.2-alpha.2`. It matches our fork exactly.

**What it needs.** Zotero 7 or later desktop on the same computer, with "Allow other applications on this computer to communicate with Zotero" on. No Zotero account and no key for reads. Zotero is not installed on the test Mac, and an install is a download that needs approval, so I did not install it. Instead I made a stub of the Zotero Local API on `127.0.0.1:23119` with three fake NPL papers (one German) and one full-text attachment (`tools/zotero-stub.mjs`).

**Outbound hosts.** The library part accepts only a loopback `baseUrl` and fails at load for any other address (`src/config.ts:323-352`). It makes no background calls: the stub log was empty until the first tool call. During the live run only `openrouter.ai` passed the proxy, and all sockets were loopback (`zotero/proxy.log`, `zotero/lsof.log`). The `scholarly` part, when an attorney turns it on, sends search terms to the 12 academic hosts in `zotero/lib-hosts.txt`.

**Files and secrets.** It reads the Zotero library through the Local API and full text through Zotero. It wrote no file outside `DSH_HOME` and no credential record (`$DSH_HOME/.credentials.yaml` held only the harness browser session, the same as in the other runs).

**Test.** The agent searched, read the item metadata and retrieved the passage "Fin pitches between 1.5 mm and 3.0 mm were tested" with its source (`zotero://user/0/attachment/ATTA0001`, Section 3), and it noted that the abstract gives another range. A search for `Wärmeübertrager` found the German paper with the title and author exactly as stored (`Jürgen Müller`). Two multi-word searches returned nothing because my stub matches the whole phrase; real Zotero matches each word. Evidence: `zotero/session.v4.jsonl`, `zotero/zotero-stub-requests.log`, `zotero/01-umlaut-search.jpg`, `zotero/02-literature-trail.jpg`.

**Verdict: adopt after changes, desktop only.**

1. It fits the desktop product, where Zotero runs on the attorney's Mac. On the firm OS the runtime is on a server, and the plugin reaches only a Zotero on that same server, so it does not apply there.
2. One maintainer and 60 stars: pin a version and review each update, or keep a FlowLeap copy.
3. Keep `scholarly` off; our own NPL connectors already cover those sources.
4. Test once against a real Zotero 7 with a firm library before listing.

## 4. Code and docs study

These sections come from a read-only study of the four repositories by a subagent. The full notes, with path and line evidence for each claim, are in the evidence folder (`study-skillhub-memory.md`). I checked five key claims against the code myself: the WeKnora tenant viewer rule (`internal/application/access/context.go:86`), the WeKnora MCP endpoint scope (`internal/types/mcp_endpoint.go:34-36`), the WeKnora optional vector filter (`internal/application/repository/retriever/postgres/repository.go:375`), the MemOS `/search` route with no auth dependency (`src/memos/api/routers/server_router.py:112`), and the skillhub dsh version list (`plugins/dsh/src/host/compatibility.ts:3`). All matched.

### 4.1 skillhub (iflytek)

**What it is.** A self-hosted skill registry: publish, review, version, search and download of `SKILL.md` packages, with a web portal, a CLI, a scanner and a dsh plugin. Java 21 and Spring Boot, PostgreSQL, Redis, local disk or S3, and a Python scanner sidecar.

**Against our design.**

| Our decision | skillhub has | We can reuse | Missing |
|---|---|---|---|
| Q10 private and shared | Scopes `PRIVATE`, `NAMESPACE_ONLY`, `PUBLIC`; a wider scope needs a review | The data model: one namespace per firm, `PRIVATE` for "mine", `NAMESPACE_ONLY` for "shared with the firm" | A `PRIVATE` skill is readable by the namespace admin; we must decide if a firm admin may read it |
| Q11 "Add" with a fixed version | Versions cannot change; a version compare API with file hunks; the client records version and hash | The compare response fields for our "what changed" view | "Add" is a local file install with no version on the server; no "Make my own copy" |
| Q9 structure check | A package validator lists many faults; a dry run returns errors and warnings | The fault list and the dry run | Frontmatter faults stop at the first one; the name is slugified, not refused, but our reader refuses a non-kebab-case name |
| Q10 client-data check | A secret check that only warns | The `PrePublishValidator` interface | No client-data check; it does not refuse |
| Q10 hide and firm standard | Hide with who, when and an audit row; promotion copies a version into a global namespace | The audit idea; "firm standard" as a reviewed copy | Hide is a platform role; the promoted copy does not follow new versions |

**Outbound hosts.** Each server start downloads 25 built-in skills from `bjcdn.openstorage.cn` (default on). The CLI and the dsh plugin use `skill.xfyun.cn` as the default registry. It can run with no internet after `SKILLHUB_BUILTIN_SKILLS_ENABLED=false`, mirrored images and a firm registry URL. No telemetry found.

**Verdict: study only.** The data model is close to Q10 to Q12, but the parts we need most are missing (client-data check, a strict check that matches our reader, a version link on "Add", own copy). It adds five services to the firm server. Its dsh plugin accepts only dsh `0.2.0-rc.2` and `0.2.1-rc.2`, is anonymous only, and has a Chinese-only UI. Copy the ideas into our own firm skill store (design section 5, open point 2).

### 4.2 Firm knowledge and memory (phase D)

The question for each: can a retrieval for matter A return a chunk from matter B?

**WeKnora (Tencent).** A document knowledge base and RAG service with agents and a built-in MCP server.

- Separation: a knowledge base belongs to a tenant (workspace). The service authorizes each knowledge base for the caller, and the agent search tool refuses unknown knowledge base IDs. But every member of a tenant can read every knowledge base of that tenant. An MCP endpoint with an empty knowledge base list covers all of them (fails open). The vector rows have no tenant column, and the store filter applies only when the caller passes a list. So matter A can see matter B if both are in one tenant. With one tenant per matter and no shares, the service code keeps them apart.
- License: MIT with a Tencent preamble (the likely reason that GitHub shows NOASSERTION); some Go dependencies are MPL-2.0. The default database image `paradedb/paradedb` includes `pg_search`, which is AGPL-3.0 (not confirmed in the repository; check before shipping it in a firm appliance).
- Data flow: no default cloud model; the firm configures models, and Ollama works. No telemetry found. Optional parts (skill installer `clawhub.ai`, E2B sandbox, web search) run only when configured.
- Fully local: yes, with local storage, pgvector and Ollama. Five services by default; a "Lite" mode runs in one process with SQLite.
- **Verdict: adopt after changes, as the phase D pilot.** Changes: one tenant per matter or a knowledge base access list inside a tenant; refuse an MCP endpoint or API key with an empty list; a matter column with a required filter in the vector store, or one vector store per matter; turn off `clawhub.ai`, E2B and web search; pin a release.

**MemOS (MemTensor).** A memory server with graph and vector stores and a dsh plugin.

- Separation by convention only: the `/search` and `/add` routes have no default authentication, the caller names the "cube", and filters can be widened or skipped.
- Data flow: the example configuration sends memory text to Alibaba DashScope; the local dsh plugin has telemetry on by default and downloads an embedding model from Hugging Face.
- License: Apache-2.0 (apps MIT).
- **Verdict: reject.** It fails both rules in its defaults.

**memsearch (Zilliz).** A small Python library that indexes Markdown memory files into Milvus Lite, with a dsh plugin.

- Separation by convention: one collection per project, but one global setting merges all projects, and the agent writes the collection name in a shell command. The "memory to skill" feature installs a skill into `~/.agents/skills`, which every project then loads.
- Data flow: local ONNX embeddings in the dsh plugin when unconfigured; the core default embedder is `openai`; `uvx` fetches packages from PyPI at run time. No telemetry found.
- License: MIT. Very light.
- **Verdict: study only.** It is personal memory, not a firm knowledge base. Good ideas to copy: Markdown as the source of truth with a rebuildable index, and a collection name derived from the workspace path.

## 5. Not tested

- Zotero desktop itself: not installed (a download needs approval). The test used a stub of the Local API.
- `dsh-univer-office` slides (`.pptx`), screenshots and PDF print (the Chrome download path), and the `.univer` file after "Merge into current version".
- The browser-side network of the Univer run: the browser buffer had dropped those requests. The server side was watched for the whole run.
- `cc-safety-net` with a terminal or `run_code` tool in a live profile: `flowleap-web` has neither.
- The four study projects: code and docs only, nothing installed or run.
- Opening the exported files in Microsoft Office: no Office on the test Mac; Numbers scripting failed. The files were checked with openpyxl, python-docx and macOS Quick Look.

## 6. Evidence

The evidence is in `~/.local/share/flowleap-os/evidence/plugin-eval/` on the test Mac, outside the repository:

- `univer/`: install and remove logs, proxy and `lsof` logs, telemetry attempts and state, the exported `claim-chart.xlsx` and `response-letter.docx` with their inspections and Quick Look renders, the unzipped XML, the gateway probe, screenshots, the Session log.
- `safety-net/`: install and remove logs, proxy and `lsof` logs, the Session log, the guard matrix and timing, the audit log, a screenshot.
- `zotero/`: install and remove logs, proxy and `lsof` logs, the stub request log, the Session log, the host list of `lib/`, screenshots.
- `tools/`: the logging proxy, the `lsof` sampler, the run script, the evaluation patch, the guard matrix and timing scripts, the Zotero stub.
- `study-skillhub-memory.md`: the full study notes for section 4.
