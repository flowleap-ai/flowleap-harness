# Where the state of a firm lives today: an audit

**Status:** audit of 2026-11-10, the facts behind [ADR 0003](adr/0003-firm-state-rule.md) (accepted 2026-11-10) and [the firm organisation design](2026-11-10-firm-organisation-design.md). Harness at `0a03c2dcd6` (branch `flowleap`), flowleap-os at `035c2e8` (`main`).

## Contents

- [Method](#method)
- [Count](#count)
- [How a store path resolves on a firm](#how-a-store-path-resolves-on-a-firm)
- [Keys and connectors](#keys-and-connectors)
- [Firm, client and matter facts in the app](#firm-client-and-matter-facts-in-the-app)
- [Upstream stores in the flowleap-web profile](#upstream-stores-in-the-flowleap-web-profile)
- [flowleap-os services](#flowleap-os-services)
- [Box checks for the release owner](#box-checks-for-the-release-owner)
- [Fit of the upstream packages](#fit-of-the-upstream-packages)

## Method

Four read-only explorers read the code of both repositories, one slice each. The author of this page then read the code again for each security row and for each row that the design depends on (rows K1, K3, K4, F1, F6, F7, O3, O4, O6, O17). An independent reviewer checked 24 rows against their cited lines; its corrections split F5, completed U10 and U11, and added O17. No row was verified by a run: every row is "read in code". A row that only a run on a firm can prove is marked **unknown**, and its check is in [Box checks](#box-checks-for-the-release-owner).

`H:` is a path in this repository. `OS:` is a path in flowleap-os. The class is one of: **firm** (a fact or a secret of the whole firm), **matter** (a fact, file or work product of a client or a matter), **person** (one person's own work and preferences), **device** (a cache, a temporary file or a browser setting). A row is **correct** when its state is in the home of its class with the correct writer. A row is **wrong** when a second person on a firm sees the wrong thing, or when a person can write what the firm's rules give to another role, or when a firm secret is readable inside an attorney runtime (`keys.none-in-runtime`, `OS:docs/security-invariants.md:20`).

## Count

| Mark | Rows |
|---|---|
| correct | 39 |
| wrong | 20 |
| unknown | 4 |
| **total** | **63** |

The 20 wrong rows: K1, K2, K3, K4, F1, F2, F3, F5b, F6, F7, F8, F9, F10, F11, F12, U10, O3, O4, O6, O17. The 4 unknown rows: K5, F16, U9, O14.

## How a store path resolves on a firm

- The image sets `DSH_HOME=/data` (`H:deploy/Dockerfile:166`). Each runtime mounts its own volume `runtime-<id>-data:/data` (`OS:lib/compose.py:128,351`). So every path under `stateDir`, `clientsRoot`, `dshHomePath()` and the storage domains is **one person's**.
- Each runtime also mounts its own credential folder `/var/lib/flowleap/runtimes/<id>` at `/run/flowleap/runtime` (read and write) and its own keys document at `/run/flowleap/keys` (read-only). Three read-only mounts are the same for every runtime: `/run/flowleap/firm`, `/opt/flowleap-os/runtime` and `/run/flowleap/host` (`OS:lib/compose.py:127-136`).
- The only shared stores that a person's work can write are the Firm Record (Postgres volume `record-db`, `OS:lib/compose.py:196`) and the model gateway (`gateway-db`). The runtime reads the Firm Record with its own record token; the browser writes it through the sign-in proxy with the person's cookie.
- Neither `H:packages/bundle/flowleap-firm/cordis.patch.yml` nor `OS:runtime/firm.patch.yml` configures `ui-flowleap-folder`, `flowleap-connectors`, `flowleap-routines`, `flowleap-agent-builder` or `ui-brand-flowleap`. The bundle defaults of `H:packages/bundle/flowleap-web/cordis.patch.yml` apply on a firm.
- The development loop runs one Firm Record with persons that a developer can switch, but only one app instance (`H:flowleap/docs/dev-loop.md:45`). Every row below that is wrong on a firm is correct in the development loop, because there the instance is the firm.

## Keys and connectors

| ID | Owner | State | Stored where | Writes | Reads | Class | Mark | What a second person sees on a firm | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| K1 | flowleap-connectors | MyEPO link: client id, client secret, test facts | Record `flowleap-connectors/myepo` in the runtime's own credential store `/var/lib/flowleap/runtimes/<id>/credentials.yaml`, plain YAML 0600 | Any person who uses that runtime; no role check | That runtime | firm | wrong | MyEPO is "not linked" for every other person; a second person can link a second account | `H:packages/host/flowleap-connectors/src/myepo.ts:130-141`, `controller.ts:156-187`; `OS:runtime/firm.patch.yml:25`; `OS:lib/compose.py:129` |
| K2 | flowleap-connectors | A connector key that a person saves for a service where `firm.env` sets no key | Same file as K1; `firm-keys.py strip` keeps such a record on purpose | Any person in that runtime | That runtime | firm | wrong | The card is "not set" for every other person | `H:packages/host/flowleap-connectors/src/credentials.ts:136-139`; `OS:lib/firm-keys.py:26-30` |
| K3 | flowleap-os installer | Real EPO OPS key and secret, USPTO ODP key, Semantic Scholar key | Keys document of each runtime, `/run/flowleap/keys/credentials.yaml`, read-only, one copy per runtime | Host root, from `/etc/flowleap/firm.env` | Every process in every runtime | firm (secret) | wrong | The same firm secret in every runtime; a revoked attorney keeps the value | `OS:lib/firm-keys.py:47-51,117-121`; `OS:lib/compose.py:130`; `OS:docs/security-invariants.md:20,163` |
| K4 | flowleap-os installer | Firm FlowLeap API token | One file `/var/lib/flowleap/firm/runtime/xdg/flowleap/credentials.toml`, mounted read-only into every runtime | Host root | Every runtime (the `flowleap mcp` child) | firm (secret) | wrong | The same firm token in every runtime | `OS:install.sh:743-752`; `OS:lib/compose.py:121-122,131`; `H:packages/bundle/flowleap-web/cordis.patch.yml:252-258` |
| K5 | sandbox | Read access of the agent's shell to K3 and K4 | The confined shell binds `/` read-only, so the keys files are in its view | — | An agent or a prompt injection in any chat | firm (secret) | unknown | — | `H:packages/sandbox/sandbox-local/src/profiles.ts:25`; `H:packages/bundle/flowleap-web/presets/patent.patch.yml:26-33`. Box check B1 |
| K6 | model gateway | Firm model keys (Anthropic, OpenRouter, Mistral) | `gateway.env`, env file of the gateway container only | Host root, console Keys page | Gateway only | firm (secret) | correct | — | `OS:lib/gateway.py:349-362`; `OS:lib/compose.py:169` |
| K7 | model gateway, Firm Record | Virtual model key, record token, Ticket key of each runtime | Keys document `refs` of that runtime | Host root | That runtime | person | correct | — | `OS:lib/firm-keys.py:112-116`; `OS:lib/gateway.py:400-414` |
| K8 | flowleap-os | Model routes, locked key references, record URL, admin-link key | Rendered firm patch and host flags, read-only, shared | Host root | Every runtime | firm | correct | The same for everyone | `OS:runtime/firm.patch.yml:23-84`; `H:packages/bundle/flowleap-firm/cordis.patch.yml:19-25` |
| K9 | model gateway | Budgets and spend | `policy.json` and the gateway database | Administrator (console Budgets page) | Gateway; each runtime its own month | firm (policy), person (own spend) | correct | Own spend only | `OS:lib/gateway.py:287-317`; `OS:lib/gateway_policy.py:160-186` |
| K10 | console | Provider key state (never a value) | `/var/lib/flowleap/console/keys.json` | Administrator | Administrator | firm | correct | — | `OS:lib/console/server.mjs:318-342`. The page covers only model providers; see the design, section 5 |
| K11 | flowleap-connectors | OPS and MyEPO access tokens, answer cache | Process memory | Plugin | Process | device | correct | — | `H:packages/host/flowleap-connectors/src/host.ts:123`; `myepo-client.ts:257-308` |
| K12 | client connection | Browser-session secret of the runtime | Own credential store | Runtime | Runtime | device | correct | — | `H:packages/client/connection/src/browser-auth.ts:14,187` |

## Firm, client and matter facts in the app

| ID | Owner | State | Stored where | Writes | Reads | Class | Mark | What a second person sees on a firm | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| F1 | ui-flowleap-folder | Firm identity: names, addresses, representatives | `/data/flowleap-folder/identity.json` of one runtime | Administrator, in the administrator's own runtime only | That runtime | firm | wrong | Empty identity; the firm docket is `no_identity`; Add client finds no matter "at your firm" | `H:packages/client/ui-flowleap-folder/src/index.ts:414,437-441`; `src/add-client/routes.ts:291-308`; `README.md:42` |
| F2 | ui-flowleap-folder | Firm docket (EP applications with the firm as representative) | `/data/flowleap-folder/docket.json` of one runtime | That runtime, from its own identity | That runtime | firm | wrong | No docket. Each runtime with an identity reads the whole docket itself, each with its own OPS limit | `H:packages/client/ui-flowleap-folder/src/index.ts:412-422`; `src/add-client/sliced-read.ts:411` |
| F3 | ui-flowleap-folder | Opponent index of the firm's clients | `/data/flowleap-folder/opponents.json` of each runtime | Each runtime, from client names that the browser carries from the Firm Record | That runtime | firm | wrong | Each runtime reads the EP Register again for all firm clients | `H:packages/client/ui-flowleap-folder/src/index.ts:423-433` |
| F4 | ui-flowleap-folder, Firm Record | Client record, names, conflict check, parties | Firm Record tables `clients`, `client_names`, `conflict_checks`, `parties` | A signed-in person, through the proxy | Every signed-in person | firm | correct | The client. Client walls are not built | `H:packages/client/ui-flowleap-folder/src/client/add-client/records.ts:269-282`; `OS:lib/record/clients.mjs:1-5`; `OS:lib/record/schema.mjs:466-529` |
| F5 | ui-flowleap-folder, Firm Record | Application index of a client: rows from the public EP Register (`basis = 'register'`) | Firm Record tables `client_applications`, `application_roles` | A signed-in person, in batches | Every signed-in person (`firm_read USING (true)`) | firm | correct | The applications; the data is public | `OS:lib/record/schema.mjs:497-534`; `OS:lib/record/clients.mjs:256-267` |
| F5b | ui-flowleap-folder, Firm Record | Application index rows that a person claimed (`basis = 'claimed'`), which can be unpublished | Same tables | A signed-in person | Every signed-in person, also a person screened from that client's matters | matter | wrong | Every person and every agent reads the claimed applications of every client | `OS:lib/record/schema.mjs:497-506,530-533`; `OS:lib/record/schema.mjs:17` |
| F6 | ui-flowleap-folder | Client folders and their files | `/data/clients/<name>/` of one runtime | The person who runs Add client | That runtime | matter | wrong | No folder. Add client for the same client makes a second, separate folder | `H:packages/client/ui-flowleap-folder/src/add-client/client-folder.ts:50-75`; `H:packages/bundle/flowleap-web/cordis.patch.yml:426-428` |
| F7 | ui-flowleap-folder, workspace | The rows of the Clients list | Workspace registry of one runtime, filtered to `clientsRoot` | That runtime | That runtime | matter | wrong | An empty Clients list, while the Firm Record holds the client | `H:packages/client/ui-flowleap-folder/src/index.ts:245-257`; `src/client/Panel.tsx:186-200` |
| F8 | ui-flowleap-folder | Source records and Trash origins of folder entries | `/data/flowleap-folder/sources/`, `trash/` of one runtime | That runtime | That runtime | matter | wrong | Nothing | `H:packages/client/ui-flowleap-folder/src/sources.ts:130-158` |
| F9 | flowleap-office, flowleap-deliverables | Office documents and finished deliverables of a matter (letters, reports, working records) | The chat's working folder under `/data` | The agent, in one runtime | That runtime | matter | wrong | A colleague cannot open the letter or the report | `H:packages/host/flowleap-office/README.md:79`; `H:packages/host/flowleap-deliverables/src/writer.ts:425-436` |
| F10 | flowleap-deliverables, ui-flowleap-work-pages | Office-action work page: findings and the attorney's review fields | `<report>.work.json` in the working folder, index in `/data/storages` | The agent and the person of that runtime | That runtime | matter | wrong | No review state of the objection | `H:packages/host/flowleap-deliverables/src/work-page/store.ts:1-18` |
| F11 | flowleap-office | Firm Word templates | `/opt/flowleap/templates`, an empty folder in the image; no mount | Nobody on a firm | Every runtime | firm | wrong | No firm template can exist | `H:deploy/Dockerfile:138-157`; `OS:lib/compose.py:127-136` |
| F12 | flowleap-agent-builder | Firm agents (`firmRoot`) | Not set and not mounted | Nobody on a firm | — | firm | wrong | No firm agent can exist | `H:packages/host/flowleap-agent-builder/src/catalog.ts:132,191`; `H:packages/bundle/flowleap-web/cordis.patch.yml:463-477` |
| F13 | flowleap-agent-builder | Agents that a person builds | `/data/agents/<id>/` | The person | That runtime | person | correct | — | `H:packages/host/flowleap-agent-builder/src/index.ts:153` |
| F14 | ui-brand-flowleap | Brand: name, mark, accent | A file in the image | Image build only | Every runtime | firm | correct | The same brand; no administrator can change it | `H:packages/client/ui-brand-flowleap/src/index.ts:77-100`; `OS:lib/compose.py:112-124` |
| F15 | flowleap-prompt | Persona text of the system prompt | A file in the image | Image build only | Every runtime | firm | correct | The same text | `H:packages/host/flowleap-prompt/src/index.ts:39-62` |
| F16 | — | Matter memory (the firm's files, mails, decisions and instructions of a matter, with an index) | Not built | — | — | matter | unknown | — | `H:flowleap/docs/2026-11-09-client-model.md:19`; no package implements it |
| F17 | ui-flowleap-admin-link | Whether the person is an administrator | Not stored: a header that the starter signs for each request | Starter only | Each runtime | firm | correct | — | `H:packages/client/ui-flowleap-admin-link/src/admin-header.ts:58-69,152-162` |
| F18 | flowleap-record, ui-flowleap-records | Matter view, deadlines, client rules, My work, Records pages | Firm Record, read with the record token or through the proxy | Firm Record service only | Persons inside the walls | matter | correct | The same view, if inside the wall | `H:packages/host/flowleap-record/README.md:10,60-63`; `H:packages/client/ui-flowleap-records/src/index.ts:1-74` |
| F19 | flowleap-office | OfficeCLI scratch folders | `/data/flowleap-office` | Office provider | Office provider | device | correct | — | `H:packages/host/flowleap-office/README.md:30,107` |

## Upstream stores in the flowleap-web profile

| ID | Owner | State | Stored where | Writes | Reads | Class | Mark | What a second person sees on a firm | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| U1 | session | Chats and their logs | `/data/sessions/` | That runtime | That runtime | person | correct | — | `H:packages/bundle/base/cordis.patch.yml:138-141`; the header has no author, `H:packages/core/session/src/types.ts:95-135` |
| U2 | attachment-local | Chat attachments | `/data/attachments/v1` | That runtime | That runtime | person | correct | — | `H:packages/attachment/attachment-local/src/index.ts:188-190` |
| U3 | spill, workspace-changes | Spilled tool output, turn diffs | Container temporary folder | That runtime | That runtime | device | correct | — | `H:packages/spill/spill-local/src/store.ts:36-38`; `H:packages/deliverables/workspace-changes/src/index.ts:136` |
| U4 | session-projection-cache, session-query | Listing checkpoints, search index | `/data/storages/session_projcache/`; search in memory | That runtime | That runtime | person | correct | — | `H:packages/session/session-projection-cache/src/spec.ts:100-107`; `H:packages/bundle/base/cordis.patch.yml:157-161` |
| U5 | workspace | A person's folder list (default workspace) | `/data/storages/workspace.json` | That runtime | That runtime | person | correct | — | `H:packages/workspace/workspace/src/spec.ts:24-30` |
| U6 | settings, config-editor | Settings form values | Profile patch `/data/profiles/flowleap-web/cordis.patch.yml` | The person; a row that the firm patch sets is read-only | That runtime | person | correct | A firm fact saved here would be wrong: the store has no other scope | `H:packages/boot/config-editor/src/index.ts:34,144,146` |
| U7 | plugin-manager | Plugin set | Image; `readOnly: true` on a firm | Nobody on a firm | Every runtime | firm | correct | — | `H:packages/bundle/flowleap-firm/cordis.patch.yml:46-53` |
| U8 | skill-filesystem | FlowLeap methods pack; a person's own skills | Pack: shared read-only mount or image; own skills: `/data/skills` | Image or host root; the person | Every runtime; that runtime | firm; person | correct | — | `OS:install.sh:1054-1056`; `H:packages/skill/skill-filesystem/src/index.ts:309-324` |
| U9 | schedule | A person's scheduled tasks | `/data/storages/schedule.json` | That runtime | That runtime | person | unknown | A runtime stops after 60 idle minutes; no code that wakes it for a due task was found | `H:packages/schedule/schedule/src/storage.ts:134-137`; `OS:install.sh:1699-1703`. Box check B5 |
| U10 | flowleap-routines | Register watches, last reads, "Needs review" marks, and the scheduled task of each watch | `/data/storages/flowleap_routines.json` and `/data/storages/schedule.json` (through `ctx.schedule.create`) | That runtime | That runtime | matter | wrong | No watch and no "Needs review"; a second watch reads the same application again; no run while the owner's runtime sleeps | `H:packages/host/flowleap-routines/src/storage.ts:81-89`; `H:packages/host/flowleap-routines/src/tool.ts:156-159` |
| U11 | flowleap-deliverables | Evidence ledger of a person's chats (the work-page index is row F10) | `/data/storages/flowleap_deliverables_ledger.json` | That runtime | That runtime | person | correct | — | `H:packages/host/flowleap-deliverables/src/ledger/store.ts:1-29` |
| U12 | anonymous-user-id | Random id for feedback | `/data/.anonymous-user-id` | That runtime | That runtime | device | correct | — | `H:packages/identity/anonymous-user-id/src/index.ts:69` |
| U13 | agent-team, jobs-local | Subagent task boards, background jobs | Session events; memory | That runtime | That runtime | person | correct | — | `H:packages/team/agent-team/src/types.ts:175`; `H:packages/jobs/jobs-local/src/index.ts:1-10` |
| U14 | ui-schedule | Task-tab bindings | Browser `localStorage`; all runtimes have one origin | Browser | Same browser | device | correct | On a shared computer the next person's page can read the keys | `H:packages/client/ui-schedule/src/client/task-tab-bindings.ts:187-218`; `OS:lib/compose.py:115` |

## flowleap-os services

| ID | Owner | State | Stored where | Writes | Reads | Class | Mark | What a second person sees on a firm | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| O1 | Firm Record | Append-only log; matters, office events, deadlines, proposals, documents, readings, pages, Tickets, reports, outbox, tasks | Postgres `record-db` | The record service only | Persons inside the matter team (row-level security) | matter | correct | The same rows, inside the wall | `OS:lib/record/schema.mjs:22`; `OS:lib/record/store.mjs:52-60` |
| O2 | Firm Record | Clients, names, parties, application index, conflict checks | Postgres | A signed-in person | Every signed-in person | firm | correct | Client walls are not built (`record.wall-filters-reads` partial) | `OS:lib/record/schema.mjs:471-534` |
| O3 | Firm Record | Client AI rules (`client_rules`), keyed by free-text client name | Postgres | Any signed-in person | Every signed-in person | firm | wrong | Every person can overwrite every client's AI rules | `OS:lib/record/tickets.mjs:356-379`; `schema.mjs:236-240` |
| O4 | Firm Record | Model-provider contract dates (unlock cloud runs) | Postgres | Any signed-in person | Every signed-in person | firm | wrong | Any attorney can unlock cloud runs for the firm | `OS:lib/record/tickets.mjs:381-391` |
| O5 | Firm Record | Persons and display names | Postgres `persons`, `person_profiles` | Record (first request), people service (Entra names) | Inside the walls | firm | correct | — | `OS:lib/record/schema.mjs:136-142,336-341` |
| O6 | Firm Record | Firm roles (formalities, attorney, partner, administrator) | `RD/service/settings.json` `firm.roles`, edited by hand, read at start | Root, by hand | Record service | firm | wrong | Empty by default, so every role chain names nobody; an Entra administrator is not a Record administrator | `OS:lib/record/settings.mjs:62,89`; `views.mjs:337-345`; `OS:lib/console/server.mjs:79-90` |
| O7 | installer | Attorney register; runtime made at first sign-in | `SD/attorneys/<id>` | Spawner, console Users page | Host | firm | correct | — | `OS:install.sh:1717-1760` |
| O8 | installer | `firm.env`, rendered firm patch, host flags | `/etc/flowleap`, `/opt/flowleap-os/runtime`, `SD/host` | Host root, console applier | Host, runtimes read-only | firm | correct | — | `OS:lib/compose.py:120,127-136` |
| O9 | console | Console state and change log | `SD/console/`, `SD/change-log.jsonl` | Administrator through the applier | Administrator | firm | correct | — | `OS:lib/applier.py:79-83` |
| O10 | sign-in proxy, starter | Proxy config and secrets; runtime session cookies | `SD/signin/`, `SD/starter/` | Host root, starter | Proxy, starter, record (read-only) | firm | correct | — | `OS:lib/signin.py:148-160`; `OS:lib/starter.mjs:10-11` |
| O11 | Firm Record | Service secrets, runtime tokens, Ticket keys, database password | `RD/` | Host root | Record service | firm | correct | — | `OS:lib/record/identity.mjs:122-128` |
| O12 | Firm Record | Firm settings other than roles (intake persons, escalation chains, Ticket settings) | `RD/service/settings.json` | Root, by hand | Record service | firm | correct | Correct home; no page writes it (see O6) | `OS:lib/record/settings.mjs:10-139` |
| O13 | backup | Backup of the firm | Restic repository | Backup unit | Host root | firm | correct | Includes each attorney's `/data` | `OS:lib/backup-manifest.py:7-13`; `OS:backup.sh:221-268` |
| O14 | AI mailbox | Mailbox config, delta link, readings, evidence log | `MAILBOX_DIR` | Mailbox process | Mailbox process | firm | unknown | No Compose service, unit or installer step starts the process | `OS:lib/mailbox/config.mjs:63-113`; `OS:install.sh:810-852`. Box check B6 |
| O15 | intake reader | Intake virtual key, OCR and reader settings | `/var/lib/flowleap/mailbox` | Host root | Intake | firm | correct | — | `OS:install.sh:810-852` |
| O16 | Firm Record | Matter opening, with any team | Postgres | Any signed-in person | Team | matter | correct | No role check. No firm rule on who may open a matter exists yet, so no rule is broken; design decision D6 proposes one | `OS:lib/record/commands.mjs:76-90` |
| O17 | sign-in proxy | One browser origin for the runtime (`/`), the console (`/admin`) and the Record (`/records`) | Proxy configuration | Host root | — | firm | wrong | A script in a page that a person's runtime serves can send any Record or console command with that person's roles; the Record and the console refuse only another site | `OS:lib/signin.py:134-144`; `OS:lib/record/http.mjs:55-61`; `H:packages/client/ui-flowleap-folder/src/client/add-client/records.ts:259-290` |

## Box checks for the release owner

Run on the test firm with one administrator account (A) and one attorney account (B). Each check names the rows it proves. Print counts, never values.

| Check | Rows | Do | Expected today |
|---|---|---|---|
| B1 | K5 | In a chat of B, ask the agent to run `grep -c consumerKey /run/flowleap/keys/credentials.yaml` and `grep -c clientSecret /run/flowleap/runtime/credentials.yaml`, and to read `/run/flowleap/firm/xdg/flowleap/credentials.toml` with the file read tool | `1` and a readable file: the agent can read firm secrets. `SANDBOX_UNAVAILABLE` means the shell does not run in the container |
| B2 | K1 | A links MyEPO (double or sandbox credentials) in Settings > Connectors. B opens Settings > Connectors | B sees "not linked" and can link |
| B3 | F1, F2 | A saves Settings > Firm identity. B opens Settings > Firm identity and starts Add client for a known firm client | B sees an empty identity, and Add client shows no matter "at your firm" |
| B4 | F6, F7 | A adds a client with Add client. B opens Clients | B's Clients list is empty; `records/api/clients` lists the client |
| B5 | U9 | B makes a task due in 90 minutes, signs out, waits more than `RUNTIME_IDLE_MINUTES` | The runtime is stopped at the due time, and the task did not run |
| B6 | O14 | On the host: `systemctl list-units 'flowleap*'`, `docker ps --format '{{.Names}}'`, `ls -l /var/lib/flowleap/mailbox` | No mailbox process |
| B7 | O3, O4, O6 | `sudo jq .firm /var/lib/flowleap/record/service/settings.json`; as A and as B `GET /records/api/me`; as B `POST /records/api/clients/<name>/rules` | No `roles`; `roles: []` and `admin: false` for both; B's POST answers 200 |

## Fit of the upstream packages

| Package | What it gives | Firm use |
|---|---|---|
| session | An append-only log per chat, one writer per chat through a file lock (`H:packages/session/session-persistence-jsonl/src/lease.ts:1-13`); the header has no author | Correct for a person's chats. Not a firm store: no author, no rights |
| storage, storage-domain | Named stores over JSON or SQLite; a domain is routed to a backend by configuration (`H:packages/storage/storage-domain/README.md`); no lock across processes (`H:packages/storage/storage-json/README.md:141`) | Correct for person and device state. The routing is the place where a firm backend could go later; no firm backend exists |
| workspace | A list of folders with no owner (`H:packages/workspace/workspace/src/spec.ts:24-30`) | A person's folder list only |
| settings | One settings document per profile and home; rows of a `--patch` overlay are read-only (`H:packages/boot/config-editor/src/index.ts:144`) | Person settings. The firm overlay is the only firm channel, and it is static per installation |
| credentials | Records addressed by plugin scope, one writable file and one read-only document (`H:packages/credentials/credentials-local/src/index.ts:1-23`); the scope is a plugin, not a person | Person and device secrets. A firm secret must not use it on a firm |
| identity | One random id per home, for feedback (`H:packages/identity/anonymous-user-id/src/index.ts:2-9`) | Not a person identity |
| team | Task boards of agents in one subagent tree (`H:packages/team/agent-team/src/types.ts:175`) | Not about people |

None of these packages has a user, a firm, rights or a server. They are correct for the person and device classes and must not hold firm or matter state on a firm.
