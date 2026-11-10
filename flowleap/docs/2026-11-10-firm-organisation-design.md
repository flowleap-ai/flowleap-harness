# A firm is an organisation: the state rule, the architecture and the gate

**Status:** approved by the founder on 2026-11-10 ("I approve"), with the eleven [decisions](#10-decisions-for-the-founder) below. The decision record is [ADR 0003](adr/0003-firm-state-rule.md). The facts are in [the audit](2026-11-10-firm-state-audit.md).

## Summary

**The problem.** On a firm installation, flowleap-os runs one app runtime for each person. Features were built and proven where one app instance is the whole firm: the development loop and single-user runs. So 20 of the 63 pieces of state in the audit are wrong on a firm. The MyEPO secret and any connector key that a person saves go into the credential store of one runtime (K1, K2). The real EPO OPS, USPTO ODP and Semantic Scholar keys and the FlowLeap token can be read in every runtime (K3, K4). The firm identity, the firm docket, the opponent index, the client folders, the register watches, the Office outputs and the work-page review state live in one person's `/data` (F1 to F10, U10). Firm roles are a file that root edits by hand, and "administrator" has three meanings that nothing connects (O6). Any signed-in person can change every client's AI rules and unlock cloud runs (O3, O4), and every person reads the unpublished applications that a colleague claimed for a client (F5b). One browser origin serves the runtime, the console and the Record, so a page that a runtime serves can send any command of its person (O17).

**The cause.** The decisions of [ADR 0001](adr/0001-self-hosted-firm-os.md) were right: one isolated runtime for each attorney (decision 3), no key in a runtime (decision 5), a firm skills library (decision 12), firm services that plugins talk to (decision 20). Three things were missing. First, no rule in code says which class each piece of state has, and every upstream store (session, storage, workspace, settings, credentials) has only one scope: the instance. So a plugin that stores anything stores it with one person. Second, the firm services that firm state needs do not exist yet: the egress proxy, a firm process for firm jobs, a firm role model, a home for matter files. Third, no check runs a feature as two persons: the development loop has one app instance, so every fault in this audit is invisible there.

**The rule.** Every piece of state has one class: firm, matter, person or device. A firm fact and a matter fact live in the Firm Record. A firm secret lives on the host, readable only by the firm process that uses it. A person's runtime keeps only that person's state and device state. A firm decision is made in the Records app or the Firm admin console, never inside a person's runtime.

**The recommendation (alternative D).** Keep one runtime for each person. Make the Firm Record the one home of firm and matter facts, with one table of who may send each command. Take the keys out of the runtimes with an office proxy. Add one firm worker: the same image with a profile that has no model, no shell, no chats and no inbound port, which does the firm jobs (MyEPO, the docket, the opponent index, register watches) one time for the firm and writes only observations into the Firm Record. A person's runtime reads facts only from the Firm Record, inside its walls, and never decides. The console and the commands of administrators and partners move to a second browser origin, away from the pages that a runtime serves. The single-user install runs the same code and the same Firm Record as a "firm of one".

**The gate.** Every FlowLeap package declares a plane (person or firm). A check with the TypeScript type checker refuses a call that persists in a person-plane package (a file write, a credential write, any upstream store such as a scheduled task or a settings field) unless the founder's state ledger lists it as person or device state, and refuses a role check in a person-plane package. flowleap-os tests refuse a firm secret in a runtime and a Record command without a role entry. The development loop and a local-firm acceptance case run every feature as two persons. This gate fails on the MyEPO card (`myepo.ts:131`) and on the firm identity save (`identity-store.ts:70`, and the admin check at `index.ts:439`).

**Easy to add, easy to fix (the founder's requirement of 2026-11-10).** A new feature with firm state, such as mailbox intake from MyEPO, touches five places under D, in a fixed order: a Firm Record command with its role entry and its test (flowleap-os), the firm half of the plugin (harness), the person-plane page or tool (harness), and one two-person case. Each forgotten place makes one mechanical check fail. A fix of an existing fault, such as the firm identity, moves the state to the Firm Record, imports the old file from the running firm one time with its hash as evidence, and proves the fix with the same two-person case. The one test surface is the two-person case: it runs in the development loop for each change and on the local firm for each release. The stable base that v1 must get right once is the organisation model, the state classes, the Record command pattern, the firm worker pattern and the gate; the rest can stay rough (section 4, "v1 on solid ground"). This requirement does not change the recommendation, but it adds one part to the v1 base: the harness types of each Record command are generated from one catalog, so that the cross-repository step is one entry.

**What stops now.** No outside firm uses Add client, the MyEPO link or register watches on a firm installation until their migration steps land. No new feature that writes firm or matter state from a runtime merges. No new page that a runtime serves sends an administrator command. The build of the matter memory (M1) waits for the decision on the home of matter files (D4).

**Decisions for the founder.** The founder decided all eleven on 2026-11-10 with the recommended answers; [the last section](#10-decisions-for-the-founder) lists them.

## Contents

- [1. The organisation model](#1-the-organisation-model)
- [2. The state rule](#2-the-state-rule)
- [3. The alternatives](#3-the-alternatives)
- [4. The recommendation](#4-the-recommendation)
- [5. Settings and connectors: two surfaces](#5-settings-and-connectors-two-surfaces)
- [6. Shared files](#6-shared-files)
- [7. The single-user install](#7-the-single-user-install)
- [8. The gate](#8-the-gate)
- [9. The migration](#9-the-migration)
- [10. Decisions for the founder](#10-decisions-for-the-founder)

## 1. The organisation model

| Concept | In the code today | What it must be |
|---|---|---|
| Firm | No id and no record. The firm is the installation: `/etc/flowleap/firm.env` and the `firm` object of the Record's `settings.json` (`OS:lib/record/settings.mjs:89`). The firm identity is a file in one runtime (F1) | The installation, plus firm facts in the Firm Record (identity, roles, clients, rules) and firm configuration on the host. One firm for each installation |
| Person | An Entra object id or `admin` (`OS:lib/record/identity.mjs:12`). Known to the Record at the first request; a runtime is made at the first sign-in (`OS:install.sh:1717-1760`) | The same id. A person's roles come from one source (D2). A runtime belongs to exactly one person and never decides for the firm |
| Role | Three unconnected meanings of administrator: the Entra app role `FlowLeap.Administrator` for the console and the starter (`OS:lib/console/server.mjs:79-90`), `firm.roles.administrator` in a hand-edited file for escalation chains (`OS:lib/record/settings.mjs:62`), and `admin: id === 'admin'` in `GET me` (`OS:lib/record/views.mjs:345`). Partner, attorney and formalities exist only in that file, empty by default. The sign-in proxy already sends the Entra `roles` claim as `X-Flowleap-Roles` (`OS:lib/signin.py:155-157`), but the Record does not read it (`OS:lib/record/identity.mjs`), and the people service asks Graph for no roles (`OS:lib/people.py:101`) | Administrator, partner, attorney, formalities: Entra app roles. The Record reads `X-Flowleap-Roles` on each proxy request and logs a `person/roles-observed` event when the roles change; the people service later adds the roles of persons who never signed in (a new Graph permission). The local administrator `admin` is administrator, and the local accounts of the local firm carry roles in `local-accounts.json`. Every check reads the Record's roles, or the signed header for the console. A Record command names the sender kinds and the roles that may send it |
| Client | Two models: free-text `matters.client` and `client_rules.client`, and the `clients` table with a uuid (`OS:lib/record/schema.mjs:54,236,471`) | One model: `clients.id`. A matter and a client rule refer to it |
| Matter | A Record row with a team, a responsible attorney and a screen (`OS:lib/record/schema.mjs:50-60,317`) | Unchanged. The matter's files get a home (D4) |
| Wall | The matter team, enforced by row-level security (`OS:lib/record/schema.mjs:22`). A screen is a separate column (`schema.mjs:317`), and a screened person cannot be in the team (`OS:lib/record/commands.mjs:92-102`). Person `system` passes every wall (`schema.mjs:23-24`). Client data and events with no matter are visible to every signed-in person. No client wall | Unchanged as the one enforcement point. Every new matter fact and matter file is behind it. A new fact with no matter is visible only to the persons that its command names (for example the intake persons) until a person files it. Client walls stay future work |

## 2. The state rule

| Class | What it is | One home | Who writes |
|---|---|---|---|
| Firm fact | Identity, roles, clients, client AI rules, model-provider contracts, the public application index | Firm Record | The Record service, on a command from a person whose role the command table allows, or an observation of the firm worker |
| Matter fact | A matter, its deadlines, events, documents, decisions, review state and work | Firm Record, behind the matter's wall | The Record service |
| Matter file | Client and matter folders, letters, reports, Office outputs | Decision D4 (section 6) | The service that D4 names, on a person's act |
| Firm secret | Office keys, the FlowLeap token, the MyEPO client secret | A host file that only the process which uses it can read | The administrator, in the Firm admin console |
| Firm configuration | Models, budgets, routes, the plugin set, the skills library, templates, firm agents, the brand | Host configuration, read-only in each runtime | The administrator, in the Firm admin console |
| Firm job state | OPS limits, caches, delta links, the progress of a firm job | The firm worker's home. It can be rebuilt and is never a fact | The firm worker |
| Person state | Chats, drafts, preferences, a person's own agents and skills, personal reminders | That person's runtime (`/data`) | That runtime |
| Device state | Browser storage, temporary files, process caches | The browser or the container | That device |

Two rules follow. First, a person's runtime writes only person and device state; every other change is a command, a proposal or a job request to the Firm Record. Second, a firm decision is never made in a person's runtime: the Records app and the console reach their service through the sign-in proxy with the person's own identity ([ADR 0002](adr/0002-system-of-record.md) F2).

Target home of each wrong row of the audit:

| Row | State | Target home |
|---|---|---|
| K1 | MyEPO link | Secret: host file of the firm worker, entered in the console. Link facts and imported letters: Firm Record, visible to the intake persons until a person files them |
| K2 | Connector key saved by a person | None in a runtime. Firm keys only in the console; on a firm, the cards show "set by your firm" |
| K3, K4 | Office keys, FlowLeap token | Host file of the office proxy |
| F1 | Firm identity | Firm Record, administrator only |
| F2, F3 | Firm docket, opponent index | Firm Record (the application index), read one time by the firm worker; the worker keeps its OPS share and cache |
| F5b | Claimed (not public) applications in the application index | Behind the matter's wall, or visible only to the intake persons while there is no matter |
| F6, F7, F8 | Client folders, Clients list, sources and Trash | Clients list: from the Firm Record. Folders and their files: D4 |
| F9 | Office outputs, finished deliverables of a matter | D4, filed by a person's act |
| F10 | Work-page review state | Firm Record, behind the matter's wall |
| F11, F12 | Firm templates, firm agents | Firm configuration: a read-only firm library mount (ADR 0001 decision 12) |
| U10 | Register watches | Firm worker; findings become observations, and the Record makes tasks from their typed fields |
| O3, O4 | Client AI rules, provider contracts | Firm Record, with a role entry in the command table |
| O6 | Firm roles | The Record's role function: Entra app roles from the sign-in proxy, `admin`, and roles of local accounts; changes logged |
| O17 | One browser origin for the runtime, the console and the Record | A second origin for the console and for administrator and partner commands (D11) |

## 3. The alternatives

**A. Per-person runtimes, and every firm job as a flowleap-os service.** Firm facts go into the Firm Record. The docket, the opponent index, the MyEPO read and the register watches are written again as Node services in flowleap-os, beside the intake (which [ADR 0002](adr/0002-system-of-record.md) F10 already gives the MyEPO credentials). An office proxy takes the keys out of the runtimes.

**B. One multi-user app server for the firm.** One dsh process serves every person. Each store gets a person and a firm scope, and each plugin enforces the walls.

**C. A firm runtime that owns the firm plugins and their state, with thin personal runtimes.** A dsh instance owned by the firm runs the connectors, the docket and the routines, and keeps the firm identity, the docket and the watches in its own home. Personal runtimes call it through one typed seam.

**D (recommended). Per-person runtimes, the Firm Record for every fact, and a firm worker for firm jobs.** As A for facts and keys. As C for firm jobs, but the firm worker keeps no facts and has no inbound port: it runs the firm halves of the harness plugins and writes what it finds into the Firm Record as observations.

**E. Shared folders.** Mount `/data/clients` and `/data/flowleap-folder` of one volume into every runtime.

| | A | B | C | D | E |
|---|---|---|---|---|---|
| Upstream merge | No upstream change | Rewrite of session, storage, workspace, settings and credentials, which have no user scope (audit "Fit"); the fork stops being mergeable | No upstream package change | No upstream package change; the gate lives under `scripts/flowleap/`; a profile with no chat store is not yet probed (step 2) | No upstream change |
| `keys.none-in-runtime` | Proved with the office proxy | Not possible: the agent shares a process with every key | Proved | Proved | No change |
| Walls | Record row security, one point | In every plugin of one process; a shell in one chat reads every person's files | The firm runtime holds firm facts outside the Record's walls and log | Record row security, one point | None: every runtime reads every client folder |
| Single-user, same code | No: firm jobs exist twice, in TypeScript plugins and in flowleap-os Node | Yes | Yes | Yes | Yes |
| 50 people | One read for the firm | One process for 50 agents; no isolation | One read; one more process | One read; one more process | 50 writers on JSON stores with no lock across processes |
| Migration cost | High: rewrite of the firm jobs | Very high | Medium | Medium | Low |
| What breaks | Two implementations drift; MyEPO and docket code exists twice | ADR 0001 decision 3; privileged isolation | "One writer, one log" (ADR 0002 decision 2) for identity and watches | Three mixed packages must split; one new Compose service and one new Record sender kind | The walls, and concurrent writes |

The audit's "Fit of the upstream packages" table shows where the upstream packages fit: they are correct for person and device state, and none of them can hold firm state, because none has a user, a firm, rights or a server. `storage-domain` routes a domain to a backend by configuration, but no firm backend exists, and the JSON backend has no lock across processes. `team` is about agents, not people, and `identity` is an anonymous id. Alternative D uses them only for person and device state.

## 4. The recommendation

Alternative D. The reasons:

1. **It keeps what works.** One isolated runtime for each person stays. Its isolation of files, shell and chats is a security property for privileged work (ADR 0001 decision 3). The Firm Record already has an append-only log, row-level walls, one writer and tests for each invariant (`OS:docs/security-invariants.md:98-161`). D puts every new fact there and adds no second store of facts.
2. **One implementation of each firm job.** The MyEPO client and the register reader exist as harness code. In D they run in the firm worker on a firm and in the app process on a single-user install. The watch run and the docket Host are written again as firm halves, because a watch today is an upstream schedule that sends a prompt to a chat (`H:packages/host/flowleap-routines/src/tool.ts:156-159`) and the docket is part of a UI Host (`H:packages/client/ui-flowleap-folder/src/index.ts:414-445`). A would write all of them a second time in flowleap-os Node, beside the harness code that a single-user install needs, and two implementations of the same firm job drift.
3. **It closes the security fault.** The office proxy and the firm worker are the only holders of office keys, the FlowLeap token and the MyEPO secret. The office-key and FlowLeap-token part of `keys.none-in-runtime` can move to proved; the Microsoft 365 part stays open.
4. **It scales by firm, not by person.** One docket read, one opponent index, one OPS quota and one set of register watches for the firm, also while every attorney's runtime sleeps. Today each runtime reads them again.
5. **It changes no upstream package.** The new parts are FlowLeap packages, a profile, a FlowLeap check under `scripts/flowleap/` and flowleap-os services. Two things are not yet proved: that a profile with no chat store and no agent boots under `dsh` (migration step 2 probes it), and that the worker needs no upstream service that assumes a chat.

How the parts fit:

- **Office proxy (flowleap-os).** The first slice of the egress proxy of ADR 0001 decision 5, on the pattern that the gateway already uses for the Mistral record: the runtime's record holds its virtual key as the key and the proxy's URL as the base URL, and the proxy checks the virtual key and uses the firm key (`OS:lib/firm-keys.py:122-124`). Three rules make it safe. First, the proxy does the EPO OPS token exchange itself (`H:vendor/flowleap-connectors/src/ops/auth.ts:155-170` does it in the runtime today), so no runtime holds an OPS bearer token. Second, the FlowLeap API paths are an allow-list of read tools; token and account paths are refused. Third, a test sends the token paths and checks that no answer of the proxy contains an office token or the FlowLeap token. The proxy keeps the firm's quota for each office service, with a share for each runtime and for the firm worker, because the OPS throttle is in each runtime's process today (`H:vendor/flowleap-connectors/src/host.ts:14`). The base URLs go through the harness `ConnectorHost.fetch` (`H:packages/host/flowleap-connectors/src/host.ts:120-123`), so no vendored file changes ([vendor/README.md](../../vendor/README.md) forbids an edit of `src/`). The proxy gets the gateway's rules as named invariants: its own env file, no Docker, no root.
- **Firm worker (both repositories).** The harness image with a profile `flowleap-firm-worker` that mounts no agent loop, no model provider, no shell or file tool, no chat store and no person. It has no inbound port. It has its own person id `worker`, which no read policy of the Record admits, and a closed list of insert-only commands: observations with their evidence (a MyEPO letter, a register event, a docket row). The Record, not the worker, resolves the matter from the application number; the worker never names a matter, a team or a person (invariant `worker.writes-observations-only`). An observation with no matter is visible only to the intake persons until a person files it, as an unfiled letter is today (`intake.unfiled-letter-readers`); a MyEPO row that is not in the public register never goes into a table that every person reads. The Record's Work router makes a task or a Ticket from typed fields of the observation (application number, event code, date), never from text of the worker, and wakes the routed runtime by the existing mechanism (`ticket.wake-asks-host-by-signin`). The sender kinds are a closed list of four today (`OS:lib/record/store.mjs:31`), so `worker` is a change to the Record's security code with its own invariant. Today's packages mix the two planes: `flowleap-connectors` injects `tools` and holds MyEPO (`H:packages/host/flowleap-connectors/src/index.ts:101`), and `flowleap-routines` injects `agents` and `schedule` (`H:packages/host/flowleap-routines/src/index.ts:55`); each splits into a firm half and a person half.
- **The firm seam is the Firm Record.** A person-plane plugin reads firm and matter facts from the Record with its runtime's record token, inside the walls, through `ctx.flowleapRecord`, and asks for firm work (for example "read the docket again") with a proposal or a job request to the Record. The worker polls the Record for job requests. So no runtime calls the worker, no person's token reaches the worker, and the single-user install uses the same Record client. A call from a runtime is sender kind `runtime-token` and can only read or propose, whatever the roles of its person (`record.agent-cannot-decide`); without this rule a prompt injection in an administrator's runtime could save the firm identity, because the local administrator has a runtime and a record token for person `admin`.
- **Roles (flowleap-os).** One function of the Record gives the roles of a request. On a firm with Entra, it reads the proxy's `X-Flowleap-Roles` header, which the console already reads, and logs each change as a `person/roles-observed` event. The local administrator `admin` is administrator. The local accounts of the local firm and of a firm of one carry a `roles` field in `local-accounts.json` (only under `auth.local-accounts-local-firm-only`), so a two-person case on the local firm can prove a role entry. The Record's existing list of sender kinds for each command (`OS:lib/record/store.mjs:82-88`) grows a list of roles, and a test fails for a command without an entry.
- **One browser origin.** The sign-in proxy serves the runtime at `/`, the console at `/admin` and the Record at `/records` on one origin (`OS:lib/signin.py:134-144`), and the Record and the console refuse only another site (`OS:lib/record/http.mjs:55-61`). So a script that a person's runtime puts into the page can send any command of that person, with all the person's roles. Today the Add client page, which the runtime serves, already sends Record commands with the person's cookie (`H:packages/client/ui-flowleap-folder/src/client/add-client/records.ts:259-290`). D moves more firm decisions behind that cookie, so D11 decides it: the console and every Record command that needs the administrator or partner role move to a second origin whose cookie the runtime's origin cannot send. A person command (a deadline confirmation, a client record) stays where it is. `flowleap-firm` disables the dynamic plugin runners `cordis-host-runner` and `cordis-client-runner` (`H:packages/bundle/web-app/cordis.patch.yml:161,255`).
- **Failure.** When the office proxy or the firm worker is down, a call answers a typed `firm-unreachable` result, and the agent tells the person that the service of the firm is not available. Nothing falls back to a key in the runtime. Under load, the Record fails first: each command takes one advisory lock for the whole firm (`OS:lib/record/store.mjs:87-103`) on a pool of 8 connections (`OS:lib/record/server.mjs:54`). So the worker imports in batches with a size limit, file bytes never go through a command (section 6), and step 6 measures a person's command wait while the worker imports a docket of 5,000 applications. The Work router limits how many runtimes it wakes at one time.
- **Admin surfaces.** Section 5.

### v1 on solid ground

The founder's requirement of 2026-11-10: "v1 should be in solid ground we need to make it easy to add features and fix current features".

**Adding a feature with firm state.** Worked example: mailbox intake from MyEPO (the firm reads new MyEPO letters and files them in the intake). Under D a developer touches these places, in this order:

| # | Repository | Place | What tells the developer that it is missing |
|---|---|---|---|
| 1 | flowleap-os | A Firm Record command and its event (for example `intake/myepo-letter-received`), with its entry in the command table: sender kind `worker`, no person role | The command-table test fails for a command without an entry |
| 2 | flowleap-os | The invariant test of the command (who may send it, what the wall shows) | The release gate's invariant register shows a row without a proof |
| 3 | harness | The firm half of the plugin in the firm worker: the MyEPO read, its delta link as job state, the call of the command | R3 fails if the code is in a person-plane package; R1 fails if it writes a file in one |
| 4 | harness | The person-plane page or tool: the person sees the letter in the intake through the Record | — (a UI that is missing is visible) |
| 5 | flowleap-os | The two-person case: the worker files a letter; the intake person sees it; an attorney outside the intake does not | The case fails until 1 to 4 work together |

The harness reads each Record command through types that are generated from one command catalog in flowleap-os (D10), at the flowleap-os commit that the image and the development loop pin, so step 1 has no second, hand-written copy; a stale copy fails the generated-files check. Count for the other alternatives: A has six places (the MyEPO read is written a second time in flowleap-os Node, and nothing checks that the two copies agree); B has three places in one repository, but each plugin enforces the walls itself and no check covers them; C has four places in one repository, but the fact lives in the firm runtime's home, outside the Record's log and walls; E has two places and no check at all. D has more places than B and C because a firm fact has one writer and one log in another repository. That is the cost of the walls, and the catalog generator keeps it to one entry.

**Fixing an existing feature.** Worked example: the firm identity of Add client (F1).

1. Where the state moves: from `/data/flowleap-folder/identity.json` of the administrator's runtime to the Firm Record event `firm/identity-recorded`, written by an administrator through the Records app on the second origin (D11). `ui-flowleap-folder` reads it through `ctx.flowleapRecord`; `identity-store.ts` is deleted, and the baseline row F1 is removed, so the gate proves that no file write is left.
2. How a running firm keeps its data: the flowleap-os update runs a one-time import. It reads `identity.json` from each runtime volume (the backup already holds every volume, `OS:lib/backup-manifest.py:7-13`). With exactly one non-empty file, it records the event with actor kind `migration` and the file's SHA-256 as evidence. With two or more different files, it records nothing and the console shows them, so the administrator chooses. The import is idempotent by the file hash, and the file stays in place, renamed, until the next release.
3. How the fix is proved: the import test with zero, one and two different files (flowleap-os), and the two-person case "the administrator saves the identity; the attorney's Add client finds the firm docket".

**The one test surface.** The two-person case is the one form in which every firm or matter feature is proved. The same case script runs in two places. The local firm (`scripts/local-firm.sh`) is the proof before a release: a new image takes about 10 minutes and `up` 2 to 5 minutes (`H:flowleap/docs/dev-loop.md:8`), which is too slow for each change. The development loop is the proof for each change: a Host change shows after about 8 seconds (`H:flowleap/docs/dev-loop.md:7`). For this, the development loop must start one app instance for each person and the firm worker, beside the Firm Record that it already runs (migration step 4). The run time of one two-person case in the development loop is not measured yet; step 4 measures it, with a target of under one minute.

**The stable base and the rough parts.** v1 must get these right once, because a change later needs a migration of released data or of every feature:

- The organisation model: person ids, roles from Entra, one client id, the matter and its wall.
- The state classes and the rule of section 2.
- The Firm Record command pattern: command, event, sender kinds, roles, invariant test. The log is append-only, so an event type is permanent.
- The firm worker pattern: no model, no shell, no inbound port; person `worker` with insert-only observations; a runtime never decides.
- The browser origins: which commands need the second origin (D11).
- The gate: the plane of each package, the state ledger, the two-person case format.
- The home of matter files (D4).

These can stay rough in v1 and change later with no migration: the page where the administrator edits a fact (console or Records app), the office proxy's quota method, the firm worker's job state (it is rebuilt from the Record and the offices), the set of firm jobs in the worker, the list of R1 sinks (it grows), the brand, and the template mount.

What would change this recommendation:

- If the firm jobs stay few (only the docket and MyEPO) and the Outlook, Teams and routine work of the roadmap moves into the AI mailbox in flowleap-os, then A is less machinery: three endpoints beside the intake, and no firm worker.
- If upstream adds a user model to sessions, storage and credentials, B becomes cheaper, but it would still put every person's chats and shell in one process.
- If a firm needs agentic work on firm state with no routed person (for example a docket agent for the whole firm), the firm worker needs a model, and it becomes alternative C with an agent loop. That needs its own security review.

## 5. Settings and connectors: two surfaces

The administrator sets a firm secret or firm configuration in the Firm admin console, and a firm fact in the Records app. A person sets only their own preferences in the app, and sees firm values read-only. On a single-user install the person is the administrator, and the same app pages are writable.

| Section or card | Package | Today on a firm | Target on a firm |
|---|---|---|---|
| General | ui-settings-general | Person writes | Person writes |
| Models | ui-settings-models | Read-only (`managed: true`) | Read-only; the administrator sets models in the console Models page (exists) |
| Connectors: EPO OPS, USPTO ODP, Semantic Scholar | ui-settings-flowleap-connectors | Read-only when `firm.env` sets the key, else any person writes into their own runtime (K2) | Person sees "set by your firm" or "not set by your firm"; the administrator sets the keys in a new console page (Keys) |
| Connectors: Mistral | ui-settings-flowleap-connectors | Read-only (virtual key) | Unchanged |
| Connectors: MyEPO | ui-settings-flowleap-connectors | Any person links into their own runtime (K1) | Person sees the link state and the last import; the administrator enters the secret in the console |
| Firm identity | ui-flowleap-folder | Administrator writes into their own runtime (F1) | Administrator writes in the Records app on the second origin; persons see it |
| Skills | ui-settings-skills | Read-only cards | Unchanged; the firm library comes from the host |
| Agents (presets) | ui-agent-preset | Person writes | Person writes |
| Plugins | ui-plugin-manager | Read-only | Unchanged; the plugin set comes from the image and the console |
| Agent builder | ui-flowleap-agent-builder | Person's own agents | Person's own agents; firm agents from the firm library mount |
| Budget | ui-flowleap-budget | Person sees own month | Unchanged; the administrator sets budgets in the console (exists) |
| Brand | ui-brand-flowleap | Image only | Administrator sets in the console (low priority) |
| Roles | — | Hand-edited file | Entra app roles; the console Users page shows them |
| Client AI rules, provider contracts | Records app | Any person writes (O3, O4) | Roles from the command table (D6) |

## 6. Shared files

The files of a client and a matter (the client folder, the matter's letters, Office outputs, reports) are matter state, and today they live in one person's `/data` (F6, F9). This is step M1 of the roadmap, the matter memory. This page does not design M1. It names the decision (D4) and its options:

1. **A shared folder on the firm host, mounted into each runtime.** Simple, and files open in place. But a mount is fixed when a container starts, so a wall change needs a restart, and a mount of the whole tree lets the agent's shell read every client's files. It breaks the walls.
2. **The firm's own file server or SharePoint as the home.** Firms already use it, and ADR 0001 decision 21 plans a Microsoft 365 plugin. But the walls then live in two systems (SharePoint permissions and the Record), and a firm without SharePoint has no home.
3. **The Firm Record's document store as the home, with a working copy in the person's runtime.** The Record already stores content-hashed documents behind the matter wall (`OS:lib/record/schema.mjs:148-152`; `intake.page-images-inside-wall`). A person opens a matter, the runtime gets a working copy of the files that the wall admits, and a person files a new version. SharePoint or a file server is a source that a plugin imports from and exports to.

Recommendation: option 3, because the walls stay in one place and the Record already has the store. Option 3 must meet three rules, which M1 designs:

- **Working copies follow the wall.** The Record lists each working copy it gave (document, person, time). When a person leaves a team or a screen is recorded, the Record opens a task "remove the working copy", which the host side of the starter carries out on the volume, also while the runtime sleeps. Text that a chat already quoted and the backups keep their copy; that is a known limit.
- **A person files what the person saw.** The runtime proposes a document by its content hash. The Records page shows the bytes that the Record stored for that hash, and the person files that hash, as `docket.confirm-names-seen-seq` does for a deadline.
- **Bytes do not go through the log lock.** File bytes go into a content-addressed folder of the Record service before the command, and the command carries the hash only. Today `documents.bytes` is a `bytea` column, and each command holds the firm-wide log lock (`OS:lib/record/store.mjs:87-103`).

## 7. The single-user install

A single-user install (the desktop, a dev install, a flowleap-os install without sign-in) is a firm of one: the local administrator `admin`, who holds every role. It runs the same plugins:

- Both planes are mounted in the app process. No FlowLeap package branches on the composition (no `if (firm)`): only the provider behind a seam differs, and the gate checks this (R7).
- Firm and matter facts: the same Firm Record. On a flowleap-os install without sign-in it is the same Postgres service, which the installer leaves out today (`OS:install.sh:1567-1571`). On the desktop it is the same Record code on an embedded Postgres (PGlite). A first probe on 2026-11-10 ran the Record's schema (version 14) on PGlite: the schema, `SET LOCAL ROLE`, the row-level walls, the append-only triggers and the advisory lock worked; the migrations need `exec` in place of `query`. The full spike runs the Record's test suite on PGlite.
- **The spike comes before any fact moves** (migration step 2). If it passes, the desktop gets the Record when the firm identity moves (step 3), and no plugin ever has "the Record if there is one, else a local file". If it fails, D5 is decided again before step 3, because a local fact store beside the Record is the second code path that hides the fault.
- Identity: the Record knows a person only through the sign-in proxy, a runtime token or the intake token. A firm of one uses a local stand-in for the proxy that sends `admin` with the administrator role; flowleap-os already has one for tests (`OS:lib/record/local-proxy.mjs`).
- Firm secrets: a desktop has no console, so the person enters them in the app, and they go to the store of the firm half in the same process. In a firm composition the same card shows the state only.
- CI runs the snapshot suite on the single-user composition too, so that path stays in use while the development loop runs the firm composition.

## 8. The gate

The gate has three parts. Each part runs in a place that already blocks a merge or a release.

**Part 1: a static check in the harness, `scripts/flowleap/verify-flowleap-state.ts`, run by the fork's CI and by the FlowLeap doc gates.** `scripts/run-gates.ts` is an upstream file, so the check does not live there. Every package that is not an upstream package (the list comes from `origin/master`) declares `"flowleap": { "plane": "person" | "firm" | "composition" }` in `package.json`; the three bundles are `composition`. A missing plane fails, so a new package with any name is checked. The check uses the TypeScript type checker, in the style of `H:scripts/verify-plugin-record-callers.ts`, because a match by name misses aliases: the MyEPO write is `options.credentials.modifyRecord`, the key save is a bare `credentials.set`, and the deliverables use `storeCtx.storageDomain`. The rules:

- R1. In a person-plane package, a call that persists is refused unless it goes through `personState(ctx, entry)`, where `entry` names a row of `flowleap/state-ledger.yml` with class `person` or `device`. "Persists" means: a write symbol of a file or database module, resolved by the checker (`writeFile`, `appendFile`, `rm`, `rename`, `mkdir`, `cp`, `createWriteStream`, `open` with a write flag, `writeFileAtomic`, `DatabaseSync`); a read is allowed. It also means a write method of every upstream service that persists: the credential provider (`set`, `unset`, `modifyRecord`, `deleteRecord`), the storage-domain facility, the workspace registry, the plugin file system `ctx.fs` (which can write outside the chat's folder), the schedule service (`ctx.schedule.create`, which writes `schedule.json`), a chat log append, and the settings and config editor. The list of services is derived from the upstream packages that declare a storage domain, a file path in their config or a Session event, so a new upstream store joins it without a hand edit.
- R2. In a person-plane package, a role check is refused: an access to the service `flowleapAdmin` (by property, `ctx.get` or `inject`), and a read of the `roles` or `admin` field of the Record's `GET me` answer. One display module (the "Firm admin" link) is allowed. A person's runtime has one person, so a role-gated write there is a firm decision in the wrong place.
- R3. Firm secrets, firm job state and the firm halves' Record commands are refused outside firm-plane packages.
- R4. The check resolves the configuration that a firm deploys: the `flowleap-web` profile with the harness overlay `flowleap-firm` and the flowleap-os file `runtime/firm.patch.yml`. In it no firm-plane package is mounted; the worker profile mounts no agent loop, tool or chat store. Today `runtime/firm.patch.yml` disables no FlowLeap package, so the attorney configuration is the single-user one; `flowleap-firm` becomes the place that removes the firm plane from a person's runtime.
- R5. A `Config` field of a person-plane package that the firm patch does not lock needs a ledger row, because the Settings page saves it per person (`firmIdentity` is such a field today, `H:packages/client/ui-flowleap-folder/src/index.ts:130-134`).
- R6. A durable write in a firm-plane package needs a ledger row of class `firm job state` or `firm secret`, and each such row says how the state is built again.
- R7. No FlowLeap package reads which composition it runs in.
- The ledger and the baseline. A pull request that changes `flowleap/state-ledger.yml` or the baseline changes no other file; the check compares the diff with the merge base and prints each added row in its summary, and the founder's `gh signoff` covers that commit. No CODEOWNERS file exists, and the agents commit under the founder's account, so a review rule alone would not hold. Existing violations are in a baseline file by call site (file, symbol, enclosing function), each with its audit row id; the baseline can only shrink.

**Part 2: tests in flowleap-os.** A keys document holds only the virtual key, the record token and the Ticket key (catches K3). No firm secret is on a mount that a runtime shares (catches K4). No answer of the office proxy holds an office token or the FlowLeap token. Each Record command has an entry in the command table with its sender kinds and roles (catches O3, O4). The roles of a request come from the one role function and its sources (catches O6). The worker sends only its insert-only commands.

**Part 3: two persons.** The development loop starts each person in their own app instance, with the firm worker. A local-firm acceptance case (`acceptance/cases/two-persons.mjs`, with local accounts that carry roles) runs each feature whose ledger row is new: A writes, B inside the wall reads, C outside the wall does not. A second run deletes the worker's home first and expects the same result. The release gate already refuses a candidate without its local-firm pass (`release.local-firm-first`).

**It would have caught both faults.**

- The MyEPO card. `flowleap-connectors` runs in the person's runtime, so its plane is `person`. `myepo.ts:131` calls `modifyRecord` on `options.credentials`, whose type is the credential provider (`myepo.ts:84`): R1 refuses it, because the ledger has no person row for `flowleap-connectors/myepo`. To pass, the author must write "the firm's MyEPO secret is person state" into the ledger in a pull request of its own, which the founder signs off, and the two-person case "the administrator links MyEPO, the attorney sees the link" still fails.
- The firm identity save. `ui-flowleap-folder` is a person-plane UI Host. `identity-store.ts:70` calls `writeFileAtomic`: R1 refuses it. The admin check reads the service `flowleapAdmin` (`H:packages/client/ui-flowleap-folder/src/index.ts:29,439`): R2 refuses it, also with a false ledger row. The `firmIdentity` config field fails R5. A rewrite to `ctx.fs`, `node:sqlite`, the workspace registry or a scheduled task fails R1 as well, because R1 checks types and the persisting services.

**Limits.** A static check cannot read meaning: a false ledger row without a role check passes Part 1, so Part 3 is the backstop. A write through a module that is neither upstream nor on the R1 list also passes; the list grows when a review finds one. Files that the agent writes with its tools into a working folder are not code sinks; their home is D4, and Part 3 covers them.

**Checks run on this design.** On 2026-11-10 two adversarial reviewers and one independent reviewer probed the design against the code. Their verified findings changed it: the role sources, the rule that a runtime never decides, the worker's person and its insert-only commands with no inbound port, the visibility of worker observations, the shared browser origin (D11), R1 (by type and by persisting service, not by name or module), R2 (by service, not import), R4 (no attorney profile existed), R5 to R7, the office proxy's token rules, the order of the PGlite spike, and the D4 rules. The PGlite probe of section 7 is from the same review. Rejected: "administrator accounts get no runtime", because in a small firm the administrator is also an attorney, and D11 already keeps firm decisions away from the runtime's origin.

## 9. The migration

Each step is small, ends in a check, and names its repository. Step 4 can run beside steps 1 to 3.

| Step | Repository | What | Check |
|---|---|---|---|
| 0 | test firm | The release owner runs box checks B1 to B7 of the audit | The unknown rows K5, U9, O14 are known |
| 1 | flowleap-os, harness | Office proxy for EPO OPS, USPTO ODP, Semantic Scholar and the FlowLeap API, with the OPS token exchange, the allow-list of FlowLeap read tools and the firm's quota; base URLs through `ConnectorHost.fetch`; the runtime's records hold the virtual key and the proxy URL; the keys document and the shared mount lose the firm values. The MyEPO card and the key cards refuse a write in a firm composition. `firm-keys.py strip` removes person-saved firm records | Keys-document test; proxy token test; the office-key part of `keys.none-in-runtime` proved; B1 and B2 show no secret and no link in a runtime |
| 2 | harness, flowleap-os | Two probes: the Record's test suite on PGlite (D5), and a `dsh` profile with no chat store, no agent and one FlowLeap plugin with a timer and a Record client | Both pass, or D5 and D are decided again before step 3 |
| 3 | flowleap-os, harness | Firm identity as a Record fact (`firm/identity-recorded`), administrator only, on the second origin (D11); the one-time import of `identity.json` (section 4, "v1 on solid ground"); `ui-flowleap-folder` reads it through `ctx.flowleapRecord` | Import test; two-person case: the attorney's Add client finds the firm docket |
| 4 | harness | The gate (Part 1) with its baseline, and person instances in the development loop | The gate fails on `myepo.ts:131` and `identity-store.ts:70` before their fix; one two-person case in the development loop is timed |
| 5 | flowleap-os | The role function and its three sources; roles join the command table; client AI rules and provider contracts restricted; the second origin for the console and administrator commands; the dynamic plugin runners off in `flowleap-firm` | Command-table test; B7 |
| 6 | both | Split `flowleap-connectors`, `flowleap-routines` and the `ui-flowleap-folder` Host into firm and person halves; the worker profile and Compose service, person `worker`, its insert-only commands; the docket and the opponent index move there | R4 passes; one docket read for the firm; a person's command wait measured during an import of 5,000 applications; two-person case |
| 7 | both | MyEPO firm route: the console page for the secret, the worker's read, observations into the Record, letters to the intake (after the process sheet of session S16) | Two-person case; C outside the wall does not see an unpublished MyEPO application |
| 8 | both | Register watches move to the worker; Tickets from typed fields only. Starts after `network.no-direct-internet` is at least partial for the Ticket run | A watch runs while the owner's runtime sleeps |
| 9 | both | After D4: the Clients list from the Record, then matter files, Office outputs and work-page review state | Two-person case for each, including "A leaves the team; A's runtime has no copy after the next start" |
| 10 | flowleap-os | Firm library mount (templates, firm agents); brand in the console | Two-person case |

What must stop until then:

- No outside firm uses Add client, the MyEPO link or register watches on a firm installation before steps 3, 6, 7 and 8. The test firm runs them only as checks that are expected to show the faults.
- No new feature that writes firm or matter state from a runtime merges. Before step 4 a reviewer checks each PR against the state rule; after step 4 the gate does it.
- No new browser code that the runtime serves sends an administrator or partner command before step 5.
- The build of M1 waits for D4.

## 10. Decisions for the founder

The founder answered "I approve" on 2026-11-10 to the question "Do you approve the rule and the recommendation (D1), and what is your decision on D4?". Each decision below is decided with its recommended answer.

| # | Decision | Decided answer | How it was decided |
|---|---|---|---|
| D1 | Approve the state rule (section 2) and alternative D | Yes | Approved by name on 2026-11-10 |
| D2 | One role function in the Record with three sources: Entra app roles (administrator, partner, attorney, formalities) from the sign-in proxy, the local administrator, and roles of local accounts on the local firm and a firm of one; each change logged | Yes. The firm's IT already manages Entra, the proxy already sends the roles, administrator gets one meaning everywhere, and the local firm can prove a role. The cost is four app roles in the firm's Entra app and, later, a Graph permission for the roles of persons who never signed in | Decided by the general approval of 2026-11-10 |
| D3 | Admin surfaces: secrets and host configuration in the Firm admin console, firm facts in the Records app | Yes. A secret never passes through a runtime, and a decision never passes through a runtime (ADR 0002 F2) | Decided by the general approval of 2026-11-10 |
| D4 | Home of matter files (the decision for M1) | The Firm Record's document store with a working copy in the runtime; SharePoint and file servers as plugin sources | Decided by the general approval of 2026-11-10; the founder was asked for D4 by name and gave no separate answer |
| D5 | Single-user is a "firm of one" that runs the same Firm Record (PGlite on the desktop) | Yes. The spike runs before any fact moves (step 2); if it fails, decide again before step 3 | Decided by the general approval of 2026-11-10 |
| D6 | Who may send each firm-level command | Provider contracts and roles: administrator. Client AI rules: partner or administrator. Open a matter: formalities, attorney or partner | Decided by the general approval of 2026-11-10 |
| D7 | A change of the state ledger (`flowleap/state-ledger.yml`) or its baseline is a pull request of its own that the founder signs off | Yes. Each new person-state row is then a visible, owned decision, also when an agent commits under the founder's account | Decided by the general approval of 2026-11-10 |
| D8 | Amend ADR 0002 F10: the firm worker reads MyEPO and hands letters to the intake | Yes. The MyEPO client is harness code; the intake keeps the letters | Decided by the general approval of 2026-11-10 |
| D9 | The pause list of section 9 | Yes | Decided by the general approval of 2026-11-10 |
| D10 | The harness types of each Firm Record command are generated from one command catalog in flowleap-os | Yes. It makes the cross-repository step of a new feature one entry, and a stale copy fails a check | Decided by the general approval of 2026-11-10 |
| D11 | The console and every Record command that needs the administrator or partner role move to a second browser origin | Yes. Today one origin serves the runtime, the console and the Record, so a script in a page that the runtime serves can act with the person's roles | Decided by the general approval of 2026-11-10 |
