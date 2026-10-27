# The self-hosted firm OS is a firm control plane in front of one isolated agent runtime per attorney, on one host the firm owns

**Status:** accepted (2026-10-26)

This is the first record of the self-hosted product: FlowLeap Patent AI that a patent firm installs on a
machine it controls. It is a separate product from flowleap-agent-v2 (the IDE), whose records stay in
that repository; agent-v2 ADR 0011 (FlowLeap-hosted instances, a FlowLeap key, Clerk sign-in) stays
valid for agent-v2 and does not apply here. The data path decision this product builds on is agent-v2
ADR 0019 (one connector library, the firm's own office keys).

The agent itself exists: this repository's `flowleap-web` profile runs the Patent Agent prompt, 34
native office tools, the paid MCP row and the deliverables plugin, and all three S5 acceptance cases
pass with an empty skills folder (`HANDOFF.md`). What does not exist is the system around it. A dsh
process serves one owner (`HANDOFF.md`, "Requirements"; `packages/client/connection/README.md`): the
launch token or cookie is the identity, and there are no user accounts. The S4b recipe in `deploy/`
gives one container per attorney with a copy of every key in each container. No pilot firm exists yet,
so the design must fit any host. The decisions below come from a design interview with the founder on
2026-10-26 (52 questions); the architecture and the build phases are in
[2026-10-26-firm-os-architecture.md](../2026-10-26-firm-os-architecture.md). Decisions 5, 14, 15, 19 and 21
were changed and decisions 25 and 26 added on 2026-10-27, after a study of EveryApp
(github.com/every-app/every-app, MIT), a gateway that holds every key and token for the apps behind it.
Decision 27 was added the same day.

## Principle

**The product trusts the attorney's judgement.** It does not impose working rules. It enforces only
two kinds of thing: a choice the attorney made (an offline chat really has no network), and protection
against attacks (prompt injection that tries to send data out). Firm policy stays in the firm's
policies and training, not in code.

## The decisions

1. **Target.** Firms of 5 to 30 attorneys plus paralegals, EU first: GDPR and professional secrecy from
   the first day, EU data residency, no air gap. Users are attorneys, trainees, paralegals and one
   firm administrator. No client accounts in version 1.
2. **Hosting.** The same software runs on an office machine, in the firm's cloud account (Azure
   first) or on a dedicated server that FlowLeap rents for the firm. One host per firm, Docker
   Compose, scaled up before scaled out. A second host only for a GPU box (local models). Rejected:
   Kubernetes (a burden that firms of this size cannot carry, and nothing in the load needs it).
3. **Instance model.** A **firm control plane** of shared services in front of **one isolated dsh
   instance per attorney**. An instance sleeps when idle and wakes on sign-in or for a scheduled job.
   Rejected: one shared multi-user dsh process (dsh has no user model, and per-person isolation of
   files, terminal and sessions is a security property for privileged work).
4. **Identity.** The firm's Microsoft Entra ID (OIDC) in front of every service, with a local admin
   account as the fallback. The network layer (VPN or tailnet) is only the network. Rejected:
   Tailscale identity alone, and FlowLeap accounts (Clerk), which put FlowLeap in the sign-in path.
5. **Keys.** A vault that only the administrator writes. The **model gateway** holds the model keys;
   each attorney instance gets a personal virtual key and never the real one. **No other key or token
   enters an instance either**: the egress proxy adds the office keys, the FlowLeap Data firm key
   (decision 18) and the attorney's Microsoft 365 token (decision 21) to the outgoing request, and removes
   any credential the instance put on it. A plugin declares each credentialed service it calls; the proxy
   refuses a call to an undeclared service and to paths that act on the whole account. A prompt injection
   or a faulty plugin can then misuse a call while the chat runs, but it cannot copy a key out.
6. **Network.** No instance has a direct route to the internet. Model traffic goes only through the
   gateway; all other outbound traffic goes through one **egress proxy** with an allowlist per group
   (models, patent offices, FlowLeap data, literature, operations), a log of host and time (never
   content), and a cache for office answers. The open web is on "ask" by default (the attorney gives
   or approves each URL; search goes through one search API with the firm's key); the firm can change
   this setting. No inbound access is needed.
7. **Agent presets and the network mode.** The attorney chooses per chat between **Patent Agent**
   (online) and **Patent Agent Offline** (no internet, local model, tools that work on the firm server,
   office answers from the firm's cache only with their retrieval date). The proxy keeps an offline
   chat offline through a per-chat proxy credential that every plugin and MCP server of that chat also
   uses. The mode is shown in the composer, the chat header and the chat list, with text and an icon.
   There is no administrator option to force a mode.
8. **Workspaces stay as they are.** Folders (workspaces) and chats (sessions), private to each
   attorney, as dsh has them today. Rejected: a client and matter object model (the walls and budgets
   it would carry are covered by decisions 9, 11 and 13 without it).
9. **Sharing is of outputs, through an Artifacts library.** An explicit Share on a delivered file
   **copies** that exact version into the library: to one person, an Entra group or the whole firm,
   with comments, download, versions and "Open in my workspace" (a copy with its origin). No external
   links in version 1. Rejected: shared folders between instances, and links to an attorney's file
   (they break at the first move, edit or delete).
10. **Sources of truth.** A source of truth is an **immutable copy that a shared service owns**: an
    artifact version, an approved fact record, a note, an editor decision. Nothing in a shared service
    points at an attorney's own folder. Unshare hides an artifact and the facts from it; a hard delete
    (administrator, for example a GDPR erasure) erases it, and the next rebuild drops what cites it.
    The firm sets the retention of unshared copies.
11. **Knowledge Pool.** The firm's memory of **facts about things** (patents and families, companies,
    technologies, past conclusions), for attorneys and agents. Methods are skills, not pool content.
    One pool service is the only writer: agents and users drop proposals into an append-only inbox;
    one compiler takes them one at a time. A model extracts proposed facts once; a knowledge editor
    approves them; after that, pages, links and the search index are built by code from the approved
    records and can be rebuilt at any time, with a nightly rebuild check against the live index. A
    fact record carries a normalised identifier, the statement, its source, its date, "checked" or
    "own estimate", its audience, and who proposed and approved it. Facts that disagree are all kept,
    with their dates. Every shared artifact proposes facts automatically. The audience of a fact is the
    audience of its source. Tools: `knowledge_search`, `knowledge_propose`, `knowledge_remember`;
    a skill teaches the method. This replaces the client and matter tiers of the 2026-10-22 design.
    The pool service also keeps a **library search** index of the text of shared artifacts and of reference
    sets the firm adds (for example the EPO Guidelines): `knowledge_search` returns checked facts and
    document passages, each passage marked "from a document, not checked" with its source and date, and
    visible only to the audience of its artifact. It starts as full-text search; an embedding index with a
    local model comes later, so offline chats can search and no firm text leaves the host for indexing.
    Retrieval is a tool the agent calls, not a separate chatbot.
12. **Firm skills library.** One versioned (git) library on the server, mounted read-only in every
    instance beside the FlowLeap pack. Firm skills win over pack skills of the same method (agent-v2
    ADR 0018). Knowledge editors and the administrator write; attorneys propose. It ships with 3 to 5
    example skills. Personal skills stay private in each instance.
13. **Dashboard.** Spend per attorney and for the firm by day, month and model; budgets per attorney
    and per firm with a warning at 80 % and a stop or warning at 100 % (the firm chooses); allowed
    models; key status without values; users (activity, suspend, archive); system (version, updates,
    backups, disk, health). Every figure comes from the gateway and the control plane.
14. **Firm audit trail.** The control plane records firm-level actions: sign-ins, shares and unshares,
    pool approvals and deletions, budget and key changes, MCP connections and their revocation, support
    sessions, updates, and the mode of each chat. Each tool call through the MCP door is one record with
    the attorney, the tool and a keyed digest (HMAC) of the arguments, so a later dispute can check a
    claimed call without the log holding its content. Not chat content (that stays in each chat's own log).
15. **Operations and support access.** FlowLeap installs remotely at onboarding, on a one-command installer
    and a browser setup wizard that a firm can later run alone. Each installer step can run again with
    the same result and resumes where it stopped; with `--json` the installer writes one event per step,
    and names each step that only a person can do (Entra admin consent, DNS, the backup key), so a coding
    agent can drive the install. Secrets never go on a command line or into a chat. A personal update key gives access to
    FlowLeap's private image registry while the retainer runs; when it ends, the installed version keeps
    working and no new versions arrive. Rejected: a licence check that stops the product. Updates install in
    the firm's maintenance window, each instance restarts only when idle, with a backup first and an
    automatic rollback on a failed health check; channels "stable" and "current". **Support access**
    (FlowLeap reaching the firm host to fix a problem) is a channel the firm administrator opens per
    incident, with a time limit, an audit record, and no access to client documents by default; a health
    signal without client content goes out and can be switched off. This record never calls it "remote
    access": that word has three meanings here (decisions 15, 23 and 24).
16. **Data protection.** Full disk encryption of the host, the encrypted vault, and nightly encrypted
    backups (kept 30 days) to the firm's own target with a key that only the firm holds. A departing
    attorney's instance is archived read-only for the retention period, with folders transferable to a
    colleague, then deleted.
17. **Availability.** One host, no fallback in version 1. A failed host is replaced by a fast restore:
    the installer's restore command on a new VM with the firm's backup key and a one-page runbook,
    target 2 to 4 hours, tested monthly and on each release. Rejected: the full local app on laptops as
    an emergency mode (a second system with copies of the firm's keys).
18. **FlowLeap Data.** PATSTAT, US full text, the examiner baseline, enriched citations and images
    become a small separate paid service with one firm API key, reached through a connector plugin like
    the office connectors, and metered per firm. It is separate from the IDE backend; both products may
    use it. The EPO PATSTAT licence terms for offering the data as a service must be checked before it
    is sold. Firm-hosted PATSTAT stays a later option.
19. **Ways in.** The browser and the installable web app first, then a thin desktop client (a FlowLeap
    shell that opens the firm server with Entra sign-in, notifications, file drop and self-update). The
    full local desktop app (S4a) stays for solo attorneys. The firm OS is also an **MCP server** for
    the firm's Claude and ChatGPT seats: local first (a Claude Desktop extension, Claude Code, Codex),
    then the ChatGPT Secure MCP Tunnel, and a public endpoint only if the firm decides it. The MCP door sits
    behind the same Entra sign-in, so an outside agent always acts as a known attorney with that attorney's
    rights. Clients such as Claude Desktop need OAuth 2.1 with client registration, so the control plane
    runs its own authorization server for the MCP door only: PKCE (S256) required, clients registered by a
    client metadata document or by rate-limited dynamic registration, and Entra as the sign-in. On the consent
    page the attorney chooses the tools and read-only or read and write (decision 25). Every request checks
    the connection, the user and the suspension again, so a revocation works at once; an attorney sees and
    revokes their connections, and suspending an attorney revokes all of them. Seats are metered by their vendor; API keys through the gateway are metered by us. Microsoft 365
    Copilot (a paid add-on per user, unlike the Copilot Chat included with Microsoft 365) is a candidate third
    way in through the same MCP door, for firms that already pay for it and want to stay inside Word, Outlook
    and Teams; to be checked before it is promised: Copilot Studio's current MCP support, the plans it needs,
    and its security limits. Copilot is a general assistant, not a patent agent; the patent tools, workflows
    and checks stay ours.
20. **Code layout, and everything the agent does is a plugin.** A new repository, `flowleap-os`, holds the
    control plane, the installer and the deploy files. This repository stays the attorney runtime and builds
    one image. Every capability of the agent is a dsh plugin in the runtime (office data, the writer, Share,
    the pool tools, Microsoft 365, usage reporting, the offline preset); the control-plane services are only
    what those plugins talk to. A firm switches a capability on or off on the Plugins page, and a new firm
    system (Google Workspace, iManage, a docketing system) is a new plugin, not new architecture. Maintained
    open-source parts are adopted where they delete owned code (an LLM proxy for the gateway, oauth2-proxy
    or Pomerium for sign-in, restic for backups), each after a licence check that excludes paid-edition
    features. Storage is content-hashed files plus one SQLite database per service, each service the only
    writer of its database; Postgres and object storage later, behind the same interfaces.
21. **Microsoft 365.** A plugin in each runtime (`dsh-flowleap-m365`) reaches SharePoint, OneDrive, Outlook
    and the calendar through Microsoft Graph, with one app registration in the firm's Entra ID. A token broker
    in the control plane gives the egress proxy (not the plugin, decision 5) a short-lived token for the signed-in
    attorney, so every call runs
    with **that attorney's own Microsoft 365 permissions** (delegated access) and the firm's existing access
    rules stay true. In version 1 the plugin reads and searches files, saves reports and Word exports to a
    folder, reads mail in a folder the attorney chooses, writes emails as drafts in the attorney's Drafts
    folder, and proposes calendar entries as drafts. It never sends an email or makes a final calendar change:
    what leaves the firm in the attorney's name is the attorney's action. The egress proxy enforces this: it
    refuses the Graph send and final calendar endpoints, so no plugin code or injected prompt can bypass it. Offline chats do not load it.
    Rejected: firm-wide application permissions (all mailboxes and all of SharePoint, with our product as the
    gatekeeper of the firm's data).
22. **Release quality.** A FlowLeap test firm on a Hetzner server runs every release before any firm gets
    it: the installer, sign-in, an update from the previous version with data migration, a restore, and
    the S5 cases (dossier, FTO, prior art) automated. Only then is the release published.
23. **Off-site access** (attorneys working from home, a hotel or a client site). The host stays without
    inbound access from the internet. By default each device joins the firm's tailnet (the Tailscale app on
    laptop and phone, signed in with the firm's Entra account, connected in the background; only traffic to
    the firm host uses it), and the attorney opens the same firm address as in the office. For a firm that
    wants browser-only access without an app, the host is published through an identity-aware gateway on an
    outbound tunnel (Microsoft Entra Application Proxy, or Cloudflare Tunnel with Access): no open port, and
    no page is reachable before the firm's Entra sign-in, MFA and Conditional Access. The firm's own VPN
    works the same way as the tailnet.
24. **Mobile continuation** (continue or watch a chat from a phone). A chat runs on the firm host, not on a
    device, so a phone is one more screen on the same chat and needs no relay; it uses off-site access
    (decision 23) and the firm sign-in. The phone client is the web app installed as a PWA ("Add to Home
    Screen"); no native store app in version 1. Web push notifications tell the attorney that a chat is
    finished, a question card waits, a scheduled job has a result, or a budget warning fired; a notification
    carries no client content (it passes through Apple's or Google's push service), and the attorney switches
    each type on or off. In version 1 the phone reads chats, reports and shared artifacts, answers question
    cards, sends a follow-up or starts a chat, and shows the online and offline indicator; uploads from the
    phone, Word editing and the administrator dashboard stay on the desktop. The full local desktop app
    (solo attorneys) has no mobile continuation in version 1, because its chats run on the laptop.
25. **Tool risk levels.** Every tool, in a plugin or at the MCP door, declares one risk level: read, write
    (changes something the attorney can undo) or destructive. A tool without a level counts as write. A
    read-only MCP connection does not see write or destructive tools, and the MCP door does not offer
    destructive tools in version 1. A hidden tool is absent from the tool list, and a call to it answers
    "unknown tool", so its existence does not leak. The attorney chooses the level of each connection; the
    product does not choose for them.
26. **Security invariant register.** Each security rule of the firm OS is one row: an id, one testable
    sentence, the attack it stops, the code that enforces it, the test that proves it, and a status (proved,
    partial, not proved). A release gate (decision 22) fails when a row names a test that does not exist or
    does not pass, so the register cannot drift from the code. Rows start with decisions 5, 6, 7, 21 and 25.
27. **Routines: work that an event starts.** Agentic work means an event starts the routine part and the
    attorney decides on the result; a chat that waits for a prompt is assistance. This is built on the
    existing scheduler (`dsh-schedule`): the agent creates a task in chat, and the Automation tasks page lists
    it. Three additions: (1) a **register watch**: a task can name applications, the host reads their
    register events through the office connectors once a day without the model, and the task runs only when
    an event is new, with the new events in its instruction; (2) a task can open **a new chat for each run**,
    titled by the application and the event; (3) a run marks its chat **"Needs review"**, and the sidebar
    and the Automation tasks page filter by that mark. The method of a routine is a skill from the firm
    skills library, named in the task's instruction; the first is the office action analysis. The additions
    live in a FlowLeap plugin that uses the scheduler's extension points (`schedule/resolve-agent`); where an
    extension point is missing, a small one is added to the scheduler and offered upstream, so the upstream
    sync stays cheap. A routine works under the attorney's identity and never sends anything (decision 21).
    Later, each in its own phase: connectors for other firm systems, time saved per routine, phone
    notifications, the control plane waking a sleeping runtime for a routine, and Outlook as an event.

## Not decided here

Docketing connectors, iManage and NetDocuments, Google Workspace, external sharing links, a public MCP endpoint, spend per
client or project, a standby host, and Kubernetes. Each gets its own record when a firm needs it.
