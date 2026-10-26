# Self-hosted firm OS: architecture and build phases

Date: 2026-10-26. Status: design, accepted with [ADR 0001](adr/0001-self-hosted-firm-os.md). No code yet.
The ADR holds the decisions and the rejected options; this document shows how the parts fit and in
which order they are built.

## 1. The system on one host

```
                         firm network (VPN or tailnet), no inbound from the internet
  attorney ─ browser / installed web app / thin desktop client
  outside agents ─ Claude Desktop extension, Claude Code, Codex (through the MCP door)
            ▼
 ┌──────────────────────────────── firm host (one VM or server) ───────────────────────────────┐
 │  SIGN-IN PROXY (Entra ID OIDC)  ── in front of every service below                          │
 │                                                                                              │
 │  CONTROL PLANE (repository flowleap-os)                                                      │
 │   admin console ─ dashboard, users, budgets, models, keys status, updates, audit view       │
 │   vault ──────── model keys, office keys, FlowLeap Data key (admin writes only)              │
 │   spawner ────── start, sleep and wake one runtime per attorney; archive on leave            │
 │   scheduler ──── wakes a runtime for a scheduled job, runs it as that attorney               │
 │   model gateway ─ virtual key per attorney, budgets, spend log, routes to cloud or local     │
 │   egress proxy ── allowlist per group, host log, office cache, per-chat credential           │
 │   artifacts ──── immutable shared copies, audiences, versions, comments                     │
 │   knowledge pool ─ inbox, single compiler, fact records, pages, index, MCP tools             │
 │   skills library ─ git, mounted read-only in every runtime                                   │
 │   token broker ─ short-lived Microsoft 365 token per signed-in attorney (delegated access)   │
 │   MCP door ───── the runtime's tools for outside agents, behind the same sign-in             │
 │   audit trail ── firm-level actions                                                           │
 │   updater, backup (restic), health signal, support channel                                    │
 │                                                                                              │
 │  ATTORNEY RUNTIMES (this repository's image), one per attorney, isolated                     │
 │   dsh + flowleap-web profile: Patent Agent / Patent Agent Offline presets,                   │
 │   plugins: office connectors, deliverables, Share, pool tools, Microsoft 365, usage reporting │
 │   private disk: workspaces (folders) and chats (sessions)                                    │
 └──────────────────────────────────────────────────────────────────────────────────────────────┘
            │ outbound only, through the gateway or the egress proxy
            ▼
   models (cloud API, firm's Azure/Bedrock EU, or a local GPU host) · EPO, USPTO, other offices ·
   FlowLeap Data · Semantic Scholar, OpenAlex · search API · Microsoft 365 (Graph) · Entra ID ·
   update registry · backup target
```

## 2. Where data lives

| Store | Location | Writer | Mutable | Backed up |
|---|---|---|---|---|
| Attorney workspaces and chats | Each runtime's private volume | That runtime | Yes | Yes |
| Artifacts | Content-hashed files plus a SQLite metadata database | Artifacts service | No (new version per share) | Yes |
| Pool sources (fact records, notes, editor decisions, inbox) | SQLite | Pool service | No (append-only) | Yes |
| Pool derived (pages, links, index) | Files plus a full-text index | Pool compiler | Rebuilt | No (rebuilt from sources) |
| Skills library | Git repository | Editors through the console | Versioned | Yes |
| Control plane (users, budgets, settings, audit) | SQLite | Control plane | Yes | Yes |
| Vault | Encrypted file | Administrator only | Yes | Yes, encrypted |
| Office cache | Proxy cache | Egress proxy | Expires | No |
| Firm's Microsoft 365 (SharePoint, OneDrive, Outlook) | Microsoft's cloud, as today | The attorney, through the plugin with their own permissions | Yes | The firm's own Microsoft 365 backup |
| Laptop | Downloaded files only | The attorney | Untracked | No |

A shared service never points at a file in an attorney's workspace. Sharing copies. A file read from SharePoint
into a workspace is a copy too; the original stays in Microsoft 365 under the firm's own rules.

## 3. Main flows

**Sign-in.** The attorney opens the firm address. The sign-in proxy sends them to Entra ID. On return the
spawner wakes that attorney's runtime (a few seconds when it sleeps) and the proxy forwards to it.
The dsh launch token never reaches the browser; the proxy holds it per runtime.

**A model call.** The runtime calls the gateway with its virtual key. The gateway checks the budget and
the allowed models, adds the real key, sends the call to the provider or the local model, and records
tokens and cost per attorney.

**An office call.** The runtime's connector calls EPO through the egress proxy, with the chat's proxy
credential. The proxy checks the allowlist and the chat's mode, answers from the cache when the data is
cached and fresh, and logs the host and time.

**An offline chat.** The attorney chooses "Patent Agent Offline". The runtime starts the chat with the
offline preset (offline prompt, local model, server-only tools, office tools in cache-only mode) and a
proxy credential marked offline. The proxy refuses every outbound request for that credential and serves
office answers only from the cache, each with its retrieval date. The chip reads "Offline".

**Share.** The attorney clicks Share on a delivery card and picks an audience. The runtime sends the file
bytes and metadata to the artifacts service, which stores a new immutable version. The artifacts service
then puts a proposal into the pool inbox.

**Knowledge in.** The pool compiler takes the next inbox item, asks the model (through the gateway, on the
firm budget) to extract candidate facts with identifiers, and queues them for a knowledge editor. Approved
facts become records; the compiler renders the affected pages and updates the index.

**Knowledge out.** An agent calls `knowledge_search` with a patent number, company or technology. The pool
service resolves the user's Entra groups, returns only facts and pages in those audiences, each with its
source artifact, date and "checked" or "own estimate".

**Microsoft 365.** The attorney asks for the client's claims on SharePoint. The Microsoft 365 plugin asks the
token broker for a token for this attorney, calls Microsoft Graph through the egress proxy, and reads the file
with the attorney's own permissions. A report can be saved back to a folder the same way. Mail is read from a
folder the attorney chose; an email is written as a draft in the attorney's Drafts folder and never sent by
the agent.

**An outside agent.** An attorney in Claude Desktop calls a FlowLeap tool. The call enters through the MCP
door behind the Entra sign-in, so it runs as that attorney, with that attorney's audiences, budget and
Microsoft 365 permissions. Nothing is reachable from the internet.

**Update.** In the maintenance window the updater pulls the new images with the firm's update key, takes a
backup, migrates the control-plane databases, restarts each runtime when its attorney is idle, and runs the
health check; on failure it rolls back to the previous images and the backup.

**Restore.** On a new VM, `install --restore <backup target>` with the firm's backup key restores every
backed-up store, takes over the firm address, and runs the health check and one acceptance case.

## 4. What changes in this repository

- A per-chat proxy credential, used by the runtime's own HTTP calls, the connectors, plugins and MCP
  subprocesses of that chat.
- The "Patent Agent Offline" preset: offline prompt section, server-only tool list, cache-only mode for
  the office connectors (answers carry the retrieval date).
- The online and offline indicator in the composer, the chat header and the chat list (a brand slot,
  translated into the 8 UI languages).
- A Share action on the delivery card and on files, calling the artifacts API.
- The Microsoft 365 plugin (`dsh-flowleap-m365`): search and read files, save reports, read a chosen mail
  folder, draft emails, propose calendar entries; tokens from the broker, never stored in the runtime.
- The rule for every new capability: a dsh plugin in the runtime, switchable on the Plugins page, talking to
  a control-plane service when it needs shared state or a secret.
- The pool tools (`knowledge_search`, `knowledge_propose`, `knowledge_remember`) and the
  `save-to-knowledge-pool` skill.
- Usage reporting and the gateway's virtual key as the model provider.
- A mount point for the firm skills library ahead of the pack.
- Known defect to fix first: a new Web session opens with "Select model" and Return then sends nothing.

## 5. Build phases

Each phase ends in something a person can check on the FlowLeap test firm.

| Phase | Content | Done when |
|---|---|---|
| **P0 Foundations** | Repository `flowleap-os`; the Hetzner test firm; installer skeleton with install and restore; release pipeline that builds this repository's image; the S5 cases automated headless | A clean VM installs, restores from a backup, and passes the three S5 cases with one command |
| **P1 Control plane core** | Entra sign-in proxy; spawner with sleep and wake; vault; model gateway (adopted proxy after a licence check); egress proxy with allowlist, log and office cache; audit trail; backups; updater with rollback; admin console with users, keys status, budgets and spend | Two test attorneys sign in with Entra, work at the same time on their own runtimes, see their spend, and a release updates without stopping an active chat |
| **P2 Runtime changes** | Per-chat proxy credential; offline preset with cache-only office tools; mode indicator; usage reporting; the "Select model" fix; the branded install manifest | An offline chat drafts from a shared report with a local or substitute model, and the proxy log shows no outbound request for it |
| **P3 Artifacts and Microsoft 365** | Artifacts service and library view; Share; comments; versions; "Open in my workspace". Token broker and the Microsoft 365 plugin (read, save, draft) | One attorney shares an FTO memo with a group; a colleague in the group opens it and copies it; a colleague outside the group does not see it. An attorney reads a SharePoint file they may open, cannot read one they may not, and finds an email draft in Outlook |
| **P4 Knowledge Pool and skills library** | Inbox, compiler, fact records, editor review, pages and index, nightly rebuild check, MCP tools, the skill; firm skills library with examples and proposals | A shared memo produces facts that an editor approves; a second attorney's agent finds them through `knowledge_search`; a hard delete removes them after the rebuild |
| **P5 Ways in** | Thin desktop client (signed, macOS and Windows); the MCP door for Claude Desktop, Claude Code and Codex; ChatGPT Secure MCP Tunnel | An attorney uses the firm OS tools from a Claude Team seat in Claude Desktop without any public endpoint |
| **P6 FlowLeap Data** | PATSTAT licence check; the separate paid service; the connector plugin; firm key and metering | A firm key unlocks PATSTAT tools in the runtime and the dashboard shows their use |

P0 comes first because every later phase needs the test firm and the automated acceptance to prove that an
update does not disturb users. P1 and P2 can run in parallel once P0 exists. The upstream sync procedure
(`flowleap/docs/2026-10-25-upstream-rc3-sync-survey.md`) keeps running on this repository; the release
pipeline of P0 makes each sync a normal release.

## 6. Open facts to check before building

- The licence and the paid-edition boundary of each adopted part (the LLM proxy, the sign-in proxy).
- The EPO PATSTAT licence terms for offering PATSTAT data as a service.
- OpenAI's help pages on ChatGPT connectors (they were read only through search extracts).
- How dsh's web server takes a launch token from a reverse proxy without exposing it to the browser.
- The Microsoft Graph permission set for delegated read, save, mail-read and draft access, and whether a
  firm's Entra admin must consent once for the app registration.
