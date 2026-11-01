# dsh-superagent and a firm docket agent: study

Status: study of 2026-11-01. No ticket exists yet; section 8 proposes tickets for the founder to approve. Related: the matter memory and docket trigger study #123, ADR 0001 decision 27 (routines), and the [roadmap](2026-10-29-roadmap.md).

**The goal.** A patent office event or a mail about a matter becomes one unit of work for that matter. An agent prepares the analysis and a draft. The responsible attorney only sees what needs a person. The founder asked if DeepSeek's dsh-superagent prototype is a good base for this "docket agent", and if its pattern helps our own development process.

**The answer in short.** Do not install the bundle. Take its domain model: a recorded Decision for each event, a Ticket with an immutable Mandate, the accept modes `off`, `observe` and `auto`, and an outbox with fixed ids. Build them into our routines plugin in the attorney runtime, where the register watch, the run chat and the "Needs review" mark already exist. Do not take its execution model: its workers run every command without approval, as the operator's OS user, with no sandbox.

## 1. Sources and method

- The prototype: [deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype) at commit `6337fc823ce20251c8de8085948165c81aaa701e` (2026-10-31), MIT licence. Its README calls it a "research prototype for reference only", not an official DeepSeek product (`README.md:3-5`). Product page: <https://www.deepseek.com/en/harness/>. All `path:line` references in sections 2 and 3 are to that commit.
- A subagent read `docs/000` to `docs/008`, `cordis.patch.yml` and `src/`. I read the key claims again myself: `danger-full-access` (`src/app/sessions.ts:152`), the observe rule (`src/policy.ts:55-58`), the Mandate type (`src/core/model.ts:124-133`), the OS user caution (`docs/006-deployment.md:19`) and the settings tool (`src/app/tools/main.ts:249-251`).
- Our side: branch `flowleap` at `4160e08076` (DSH `0.2.2-alpha.2`, Cordis `4.0.6-alpha.1`), the READMEs of `dsh-flowleap-routines`, `dsh-flowleap-agent-builder` and `dsh-flowleap-deliverables`, ADR 0001, and `flowleap-os` at `e72ee2e` (read only).
- I ran no model call, used no credentials, and connected nothing to GitHub or Feishu.

## 2. What dsh-superagent is

A DSH bundle (`package.json` `dsh.bundle.patch`) for one GitHub repository on github.com, with an optional Feishu chat (`README.md:7`). One main Session (the router) reads requests. One worker Session per Ticket does the work.

### 2.1 Domain model

| Term | What it is | Reference |
|---|---|---|
| Source | A plugin that reads one external system and produces Triggers. GitHub polls the agent account's notifications every 60 s or more; Feishu streams through `lark-cli event consume`. Neither takes an inbound webhook. | `src/sources/github.ts:25`, `src/sources/feishu-loops.ts:70-71` |
| Trigger | One immutable incoming message: id, Source, Threads, actor, `human`, `addressed`, time, text, meta. Text and meta are untrusted. | `src/core/model.ts:22-39` |
| Thread | A conversation key (an issue, a pull request, a chat topic). At most one Eval runs for a Thread at a time; new Triggers join the next batch. | `src/core/model.ts:157-182`, `docs/001-domain.md:29` |
| Eval | The check of a Trigger batch: first a deterministic gate in code, then a model assessment in the main Session. | `docs/001-domain.md:90-91` |
| Decision | The recorded result of an Eval: `accept`, `stop`, `ignore` or `unavailable`, with reasons, the Policy version and an audit record. | `src/core/model.ts:190-209` |
| Ticket | One unit of work. Only an accept creates one. It has a Mandate, channels for replies, Assignments, inputs, and an end with an outcome. | `src/core/model.ts:277-308`, `docs/001-domain.md:35` |
| Mandate | The authorization of a Ticket: strength (`explicit` or `inferred`), Policy version, basis, actor and scope. "Immutable ... it never changes". A wider scope needs a new Ticket. | `src/core/model.ts:124-133`, `docs/001-domain.md:34` |
| Assignment, Report | One run of a worker on a Ticket, and its status report (`progress`, `waiting`, `ready`, `blocked`, `failed`, `dropped`). | `src/core/model.ts:216-233` |
| Stage | What the panel shows, first match wins: `person/delivery`, `person/answer`, `person/review`, `person/blocked`, `person/failed`, `working/queued`, `idle`, `working`. | `src/core/stage.ts:9-21` |

### 2.2 Authorization rules

- **The gate is code.** Per Source an allowed list of people, an admission table, and a list of bots (`src/policy.ts:191-211`). A listed person who addresses the agent gives an `explicit` request. Other cells give `inferred` or `ignore` (`src/admission.ts:9-13`). Message text cannot change the gate or a Mandate (`docs/002-authorization.md:5`).
- **The model decides inside the gate.** The main Session routes with `orchestrator_route` (accept, attach, stop, ignore). A direct accept or a stop needs `explicit` strength (`src/core/evals.ts:151-154`, `src/core/evals.ts:297-298`). An `inferred` candidate needs a structured assessment: every enabled rule judged once, at least one rule matched, and intent evidence (`src/policy.ts:40-61`).
- **Accept modes.** `off` admits no inferred candidate. `observe`, the default, records a positive assessment as an ignore with `would_accept: true` and the proposal, and starts no work. `auto` accepts it (`src/policy.ts:55-58`, `docs/002-authorization.md:95-101`).
- **Policy version.** A hash of the rules, the accept mode and the Source settings (`src/policy.ts:111-118`). A change requeues running Evals and sends `policy-changed` to live Tickets. A Mandate is checked again only when its Ticket resumes (`src/policy.ts:213-240`).
- **A weak point.** The main Session can save the Policy and the accept mode itself through `orchestrator_settings_save`. Only the prompt text says "on an explicit human configuration request" (`src/app/tools/main.ts:249-251`). The code calls its origin check "not an OS security boundary" (`src/app/settings.ts:143`).

### 2.3 Execution rules

- Each Ticket gets the Session `worker-<ticket id>` through `sessionController.create`, in its own folder below the state folder, and the permission preset `danger-full-access` (`src/app/sessions.ts:138-155`, `src/executor/dsh.ts:24`).
- Workers "run commands without approval" as the operator's OS user. Command shims and a git config are "defaults, not a security boundary"; a worker can run a program by its path and read the operator's home folder (`docs/003-execution.md:27`, `docs/003-execution.md:78-80`, `docs/006-deployment.md:19`).
- Limits: 3 worker slots by default (1 to 16), plus one more slot for a person's message (`src/executor/dsh.ts:186-196`); a foreground command moves to a background job after 5 s; background work ends 30 minutes after a turn; an Eval times out after 120 s and becomes `unavailable` after two requeues. There is no token or cost budget (`src/app/sessions.ts:222-226`).
- Durability: one SQLite file with tables for triggers, threads, tickets, decisions, effects and the outbox (`src/app/store.ts:72-80`). Each side effect is stored first and done after the commit. Replies use fixed ids, so a retry does not post twice (`src/app/outbox.ts:26-32`). A restart starts interrupted Assignments again with a recovery note (`src/executor/dsh.ts:524-535`). No record is ever deleted (`docs/007-architecture.md:484`).
- Model-visible input: candidates and inputs enter Sessions as `user/message` events, so they are in the Session log (`src/app/delivery.ts:76-81`). The Policy text of the system prompt is built again on each request from the current settings; only its revision number is stored in kv (`src/app/sessions.ts:244-249`). To rebuild one request you must join the Session log with the settings history. Our rule "model-visible ⟺ logged" does not allow this.
- The management API refuses to start unless the web server listens on `127.0.0.1`, and has no user identity (`src/app/http.ts:232`, `docs/006-deployment.md:163`).
- A new Source is a Cordis plugin that registers a `SourceKind` with `ctx.orchestrator.sources.register` (`src/sources/kind.ts:85-113`, `docs/008-cookbook.md:255-266`).

## 3. Does it build and load on our fork

| Check | Result | Evidence |
|---|---|---|
| Package names | Every `@deepseek-ai/*` peer of the bundle exists in our workspace at `0.2.2-alpha.2` | `package.json` names in `packages/` and `vendor/` |
| DSH version check | Passes. Our loader matches `engines.dsh` `^0.2.1-alpha.2` against `0.2.2-alpha.2` with prereleases included, so it admits the bundle | `packages/boot/app-boot/src/plugin-compatibility.ts:52` |
| Cordis | The bundle pins `4.0.5-alpha.1`; our vendor copy is `4.0.6-alpha.1` | `vendor/` manifest |
| Typecheck against our packages | Fails: 12 errors, 6 in `src/` | `tsc --noEmit` in a scratch copy linked to our built workspace |
| Bundle build and its tests | Not run. The session's permission check refused to run the prototype's own build and test code; I did not work around it | none |

The typecheck errors that matter are API drift, not our fork's changes. The bundle was written against DSH `0.2.1-alpha.2` (2026-10-09). Upstream later removed `SessionController.inspect` (upstream commit `0c23ad233d`, 2026-10-23) and `ModelSelectionRef` (`e39b5f58c2`, 2026-10-15). Upstream `master` lacks them too. The prototype calls `inspect` to read a worker transcript for the panel (`src/app/resources.ts:115`), and its settings form reads `ConfigFormSnapshot.mode`, which our client type does not have (`src/client/deployment.tsx:49`). My guess, not checked: the bundle loads, and those panel paths fail at run time.

Two more facts block it on a firm host even after a port. Our runtimes bind the web server to the container address (`BIND_HOST=auto` in `flowleap-os/lib/compose.py:101`), so the management API throws when it registers its routes (`src/app/http.ts:232`). And its presets use `danger-full-access`, which our sandbox rules (#27) must not allow.

## 4. FlowLeap as a docket agent

### 4.1 What FlowLeap has today

- **Register watch (#44).** A routine in one attorney's runtime reads the EP Register or USPTO transactions of named applications once a day without the model, and runs only when an event is new. Seen events are counted per date and code, so the office's repeats are not new ([routines README](../../packages/host/flowleap-routines/README.md#the-register-watch)).
- **A new chat for each run, and "Needs review" (#45).** A run opens a titled chat, and a finished run marks it. The mark clears when the attorney answers or clicks Done. The run chat survives a crash and a repeat admission.
- **Agent builder (#55).** An attorney's own agent preset from instructions, files and chosen connectors.
- **Deliverables.** `write_patent_results` writes the report with its evidence ledger and the delivery card; the office action work page shows it (#81).
- **The firm host.** One isolated runtime per attorney, asleep when idle (ADR decision 3); a sandbox with Landlock and no network for shell commands (#27); models only through the gateway with a budget per attorney.
- **Not there yet.** Mail as an event (needs the Microsoft 365 plugin, decision 21), a docketing system (ADR "Not decided here"), a matter record that names the responsible attorney (#123), and a control plane that wakes a runtime for a routine (decision 27, "later").

### 4.2 Where the router lives

The prototype puts the router and every worker in one process under one OS user. ADR decision 3 rejects that for a firm: per-attorney isolation of files, sessions and terminal is a security property. So the docket agent splits into two parts:

1. **Intake and routing, without a model where possible.** An office event already has a code and an application number. A table in code (event code → routine skill, or ignore) is the gate. The model is needed only for free text, such as a mail. In the first version the intake runs in the attorney's own runtime, as the register watch does now. A firm-level intake (a shared mailbox, a docketing system) belongs to the control plane later. It then needs the matter record of #123 to find the attorney, and the wake API of decision 27.
2. **The work, always in the responsible attorney's runtime.** Each Ticket is a run chat there. It runs on that attorney's budget, with that attorney's connectors and sandbox, and its input is a logged `user/message`.

### 4.3 Reuse, adapt, do not take

| Prototype part | FlowLeap | Choice |
|---|---|---|
| Source plugin interface | The register reader of `dsh-flowleap-connectors`; later mail and docketing | **Adapt.** Keep our reader. Use the same rules: stable Trigger ids, a read position that moves only after the event is stored |
| Deterministic gate | Event code table in `flowleap-routines` | **Adapt.** For office events the code table is enough; no model call decides if a register event is work |
| Decision record | Missing. A run today has a receipt, not a reason | **Take.** Store a Decision for each new event (accept, ignore, `would_accept`) with its reason and Policy version. This is the base of the accept rate in #123 |
| Ticket per event, with Mandate | One chat per run (#45), which can hold several applications' events | **Take.** One Ticket per matter event. The Mandate scope is fixed text, for example "analyse and draft; never file, send or pay", which repeats ADR decision 21. It enters the chat as part of the logged run message, never only as a system-prompt section |
| Accept modes | Missing | **Take.** `observe` first: the watch records what it would start, with no model call and no cost. The attorney then turns on `auto` per watch |
| Policy version | Missing | **Take.** A hash of the code table and the mode, stored on each Decision |
| Stages and the panel | "Needs review" page, office action board (#81), dashboard "Coming up" (#60) | **Adapt.** Add the stages `person/review`, `person/answer`, `person/blocked` and the Decision reason to the Needs review page. Do not add a second panel |
| Worker slots, +1 for a person | No limit; several due watches can start several runs at once | **Adapt.** A limit of running routine chats per runtime. The attorney's own chat never waits for a routine |
| Outbox with fixed ids | Our routines store seen events after `schedule/delivered` | **Take the pattern** for any later write to the outside (an Outlook draft). Today nothing leaves the firm |
| Replies on the same thread | none | **Do not take.** A routine never sends (decision 21). The output is a deliverable and, later, an Outlook draft |
| `danger-full-access` workers | Shell sandbox with no network (#27), container per attorney | **Do not take** |
| Model can change its own Policy | none | **Do not take.** The gate and the mode change only from the UI or the console |
| One GitHub repo, coding persona, Chinese preset names, loopback-only API | none | **Do not take** |

## 5. Recommendation

1. Do not install or port the bundle. It does not typecheck on DSH `0.2.2`, its API refuses our bind address, its workers have no sandbox, and its domain is code review on GitHub.
2. Port its domain model into `dsh-flowleap-routines`, in the attorney runtime, as small tickets (section 8). Copy no code; if a file is copied later, keep the MIT notice.
3. Start every new routine in `observe`. A firm sees what the agent would do, at zero model cost, before it does work. This answers the attorney's first question: "what will it do without me?"
4. Keep the firm-level router (a shared mailbox, a docketing system) for after #123 and the wake API. Write it down as a comment on #123, not as a new design now.

## 6. Our development process

The pattern is already how this project runs: the founder's session gives out one ticket per side session, each in its own worktree and branch, and reports come back. Two ideas help:

- **A test-firm slot.** Several sessions use the one test firm (release cuts, `gate.sh`, live verify). The installer and the spawner share a lock, but `release/gate.sh` takes none. A lock file on the test firm, with the holder's ticket and a time, would stop two gates at once. That is the prototype's slot idea, at the smallest size.
- **A Decision line in each brief.** The prototype records why it accepted a request. Our briefs could name the gate (the founder's approval of the ticket) in one line, so a reviewer sees the authority. This needs no code.

The bundle itself does not fit our development: it watches one GitHub repository with a separate agent account, and its workers run without approval on the developer's machine.

## 7. Risks

- The `observe` default can hide a missed deadline if attorneys trust it too early. The Needs review page must show `would_accept` Decisions as clearly as started work.
- A Ticket per event can make many chats for a busy matter. Section 9 proposes one Ticket per application and day.
- The prototype is a research prototype at its first public commit. Its ideas are stable enough to copy; its code is not stable enough to depend on.

## 8. Proposed tickets

None is created. The founder approves each first.

| Id | Title | Repository | Size | Done when |
|---|---|---|---|---|
| A | Routines: a Decision for each new register event, with the accept modes off, observe and auto | flowleap-harness | M | A watch in `observe` stores a Decision with reason and Policy version for each new event and opens no chat; `auto` opens the chat; unit tests, REAL composition e2e, one recorded-session snapshot |
| B | Routines: one Ticket per matter event, with a fixed Mandate in the run message | flowleap-harness | M | Events of one application on one day open one chat; the run message starts with the Mandate text; the Session log alone rebuilds it; a crash does not open a second chat |
| C | Needs review page: show the stage and the Decision, and the "would start" list of observe | flowleap-harness | S–M | The page lists `would_accept` Decisions and marked chats with stage and reason; the attorney can switch a watch to `auto` there; verify skill evidence |
| D | Routines: a limit of running routine chats per runtime | flowleap-harness | S | With the limit 1, two due watches run one after the other; an attorney's own chat starts at once |
| E | Test firm: one lock for gate and release runs | flowleap-os | S | A second `gate.sh` waits or exits with the holder's name |
| F | Comment on #123: the firm-level router design of section 4.2 | flowleap-harness | XS | The comment is on #123 |

Order: A, then B and C, then D. E and F are independent.

## 9. Open decisions for the founder

1. Is `observe` the default for every new routine, or only for routines that the agent itself proposes? Recommended: every new routine.
2. Is one Ticket per application and day right, or one per event? Recommended: per application and day.
3. Approve the tickets A to F, or a subset.
