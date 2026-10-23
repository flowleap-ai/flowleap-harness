# Computer use and trycua/cua: assessment for FlowLeap Patent AI

Date: 2026-10-23. Question from the founder: should the harness add https://github.com/trycua/cua as the
agent's computer-use tool? Inputs: `HANDOFF.md`, the
[2026-10-21 assessment](2026-10-21-assessment-dsh-as-patent-ai-web-harness.md), the dsh code on the
`flowleap` branch, and the web sources in section 8. Labels: **measured** = read from code or an API on
2026-10-23; **published** = stated by the vendor or office; **assumption** = our estimate.

## 1. Verdict in five lines

1. Do not add trycua/cua as a new dependency. dsh already ships it: two providers wrap Cua Driver
   (`@trycua/cua-driver` 0.28.0, MIT), and a third package adapts its macOS code in Swift.
2. Desktop computer use is the wrong tool for our product now. Our target is a Linux server with no
   desktop (S4), and almost every patent office we need has an API or is already a connector.
3. If we want anything, add **browser use, read-only, in an isolated browser**: the Playwright MCP
   provider dsh already ships, in `launch` mode, headless, with a fresh profile per Session.
4. Do it later, after S4 and S5, as one two-week trial for two use cases only: reading DPMAregister
   and national-office pages that our connectors do not cover, and reading the firm's own web tools
   that have no API.
5. Never let the agent click in a filing or payment portal (EPO Online Filing, MyEPO, Patent Center,
   ePCT). Those portals have 2FA, legal deadlines and personal liability, and two have filing APIs.

## 2. What dsh already has

### Packages (measured)

| Package | What it is | Platforms | Upstream |
|---|---|---|---|
| `packages/computer-use/computer-use` (`dsh-computer-use`) | Registration only. One provider name per process; a second provider fails. No desktop methods. | any | dsh |
| `experimental/computer-use-cua-driver-mcp` | Starts an installed `cua-driver mcp` executable and exposes its tools as `mcp__cua-driver-mcp__*`. | where Cua Driver installs: macOS, Windows, Linux | trycua `cua-driver-rs-v0.28.0` |
| `experimental/computer-use-cua-driver-native` | Loads `@trycua/cua-driver` 0.28.0 (Rust core, UniFFI bindings) inside the dsh host process; tools as `cua_driver_native__*`. | npm optional binaries for darwin arm64/x64, linux arm64/x64 gnu, win32 arm64/x64; only `darwin-arm64` is installed on this laptop | trycua, MIT |
| `experimental/cua` (`dsh-cua`) | Shared app/window object API, request validation, **application consent**, image admission. | any; native side needs a provider | dsh |
| `experimental/cua-macos` | dsh's own Swift helper (`native/`) for macOS 14 or later. `native/upstream.json` records files *adapted* (not copied) from trycua commit `1b50c02`, tag `cua-driver-rs-v0.28.0`; `native/LICENSE.cua-driver` keeps the MIT notice. Windows "in development". | macOS only | adapted from trycua |
| `browser-use/browser-use` + `experimental/browser-use-playwright-mcp` (`@playwright/mcp` 0.0.80), `-chrome-devtools-mcp` (1.9.0), `-stagehand-native` (`@browserbasehq/stagehand` 4.1.0) | Browser providers. One per process. Chromium. `launch` or `attach` mode. | any, headless works | Microsoft, Google, Browserbase |

So dsh's "cua" is both things. The two `computer-use-cua-driver-*` packages use trycua's project
directly. `cua-macos` is an independent driver with the same name, written in Swift, that reimplements
selected trycua behaviour under its MIT licence. `scripts/check-workspace-constraints.ts` lists the
Swift sources and `LICENSE.cua-driver` as published files of that package. The `mcp-client` README
names the native provider as a user of its `createMcpToolDefinition` adapter, without an MCP transport.

dsh's "browser-use" is a name for a capability. It is not the Python Browser Use library
(browser-use/browser-use).

### Sandbox and approval (measured)

- **File sandbox.** `dsh-sandbox-policy` (`workspace-write` by default) and `dsh-bash-sandbox` govern
  the shell and file tools. The computer-use and browser READMEs name no sandbox for their child
  processes. Cua Driver acts with the permissions of the process that launches it. dsh's own
  `SAFETY.md` says sandboxing "do[es] not guarantee isolation".
- **Approval.** `dsh-user-approval` runs with policy `ask` in `bundle/base`. The tools pipeline has a
  `tools/pre-execute` allow, deny or ask waterfall, but no shipped listener asks before MCP,
  computer-use or browser tool calls. The listeners that exist are for bash, jobs, workspace changes and
  some experimental hooks. A browser click is allowed by default.
- **Consent.** Only `cua-macos` has a gate: application consent through User Questions before any AX
  read, screenshot or input, per app, with saved grants bound to the code signature. It is per app,
  not per action. After consent, every click in that app runs.
- **Audit.** Every tool call and result goes into the Session log. Screenshots are stored as durable
  attachments when the model route accepts images. Approval requests and outcomes are audited.

### In our profile today (measured)

None of it is mounted. No row in `packages/bundle/flowleap-web/cordis.patch.yml`, `presets/patent.patch.yml`,
`bundle/base` or `bundle/web-app` mounts a computer-use or browser-use package. They appear only in
`snapshots/session/*` test compositions and in `cua-macos/examples/macos.cordis.yml`. The web profile
mounts `ui-sidebar-browser` only when the profile is `desktop`. That row is a viewer for the user, not a
tool for the agent.

### Distance to "the agent can use a web portal" (assumption)

One day for a read-only browser on the laptop (two profile rows, an image-capable model route). About
two weeks more for a firm-grade version (section 7). Desktop computer use on the S4 server needs a
graphical session (Xvfb or a VM), which we do not have.

## 3. What trycua/cua is today

The repository changed shape in October 2026. The brief's names (`cua-computer`, `cua-agent`, cloud
sandboxes) are now out of date.

| Part | State (2026-10-23) | Licence |
|---|---|---|
| **Cua Driver** (`libs/cua-driver`, Rust) | The core. Operates native apps and browsers on macOS, Windows, Linux; "background delivery" without moving the user's pointer. Surfaces: `cua-driver mcp` (stdio MCP), `cua-driver call` (CLI), Python `cua_driver` and TypeScript `@trycua/cua-driver` in-process SDKs. Permission modes: `standard` (promptless default), `bounded` (reviewed manifest of tools), `unrestricted` (needs `--dangerously-bypass-approvals`). Attaching to a logged-in Chromium profile needs `--grant existing-profile`. The driver "does not render its own authorization modal". | MIT |
| **Lume / Lumier** | macOS and Linux VMs on Apple silicon (Virtualization.framework); Lumier is a Docker-style front end. | MIT |
| **cua SDK and CLI** (`cua`, `cua-sandbox`) | Local sandboxes (gVisor containers, VMs), your own AWS, Google Cloud or Modal account, or Cua Spaces machines. | MIT |
| **Cua Spaces** | Desktop app with agent desktops and "Teleport" of signed-in apps. Free; Pro $18/month; Teams $30/seat/month (published). | FSL-1.1-MIT (source-available) |
| **Cua Cloud and Fleets** | **Ended 18 October 2026** (published). `on="cloud"` now fails. | n/a |
| **`cua-computer`, `cua-agent`, `cua-som`** | **Deprecated**, no fixes (published). Last releases 0.5.19 and 0.9.0. The agent loop is gone; trycua now says to use your own agent with the Driver MCP. | MIT (`cua-som` AGPL) |
| **`cua-perception`** (optional OmniParser detector) | Separate install. | AGPL-3.0-only parts |
| **`cuabot`** | "Do not run it: it has known security issues" (published). | n/a |

Maturity (measured through the GitHub API): 30,731 stars, 2,233 forks, 1,219 open issues and pull
requests, last push 2026-10-23, created 2025-01-31. Release rate is very high: 15 releases from 19 to
22 October 2026 across Driver, SDK, Spaces and bench. `cua-driver-rs` is at v0.38.0; dsh pins v0.28.0,
ten minor versions behind. The README's migration notes describe breaking SDK changes between minor
versions. For a firm machine this is a fast-moving, pre-1.0 dependency.

### What it would add over dsh's own driver

- Windows and Linux desktop control (dsh's `cua-macos` is macOS only), through the same Driver dsh
  already wraps.
- The `bounded` permission mode: a reviewed manifest of allowed tools. This is a useful control that
  dsh does not configure today.
- Lume VMs for one disposable macOS desktop per task on an Apple-silicon Mac.
- Nothing for browsers beyond Playwright MCP, and no agent loop.

### Integration options

| Option | What we do | Effort (assumption) | Comment |
|---|---|---|---|
| A. MCP row (`computer-use-cua-driver-mcp`) | Install `cua-driver` on the machine; mount two rows; set `CUA_DRIVER_PERMISSION_MODE=bounded` and a manifest. | 1 day to run; 1 to 2 weeks with approval listener and doctor check | Already built. Driver runs as a separate process with its own permissions. Best of the three if we ever do desktop. |
| B. Native SDK in process (`computer-use-cua-driver-native`) | Mount one row; bump the pin from 0.28.0. | 1 day, plus a re-test on each bump | Native crash can stop the dsh host ("native crashes can terminate that process"). Not for a server that serves an attorney. |
| C. Python SDK through dsh's subprocess seam | Write a tool that runs `cua_driver` or `cua-sandbox` in Python. | 1 to 2 weeks | No gain over A; adds Python, which the founder ruled out for connectors. |
| D. Vendor trycua source | Copy Rust or Swift into the fork. | weeks, then every upgrade | dsh already did this for macOS in `cua-macos`. We gain nothing by doing it again. |

## 4. Alternatives

| Option | Fit for us | Cost | Licence | Maturity |
|---|---|---|---|---|
| **Playwright MCP** (dsh provider exists) | Best fit for web portals: works headless on Linux, reads the accessibility tree (text, few screenshots), `launch` mode gives a fresh browser per Session. | Free; tokens only | Apache-2.0 | 38,528 stars (measured); dsh pins 0.0.80 |
| **Stagehand** (dsh provider exists) | Natural-language `act`/`extract`; needs a second configured model, so a second key and a second cost line. Good for `extract` with a JSON schema. | Free library; extra model calls; Browserbase cloud optional | MIT | 25,787 stars (measured); dsh pins 4.1.0 |
| **Browser Use** (Python) | Own agent loop competes with dsh's loop; Python. Its cloud is a hosted browser outside the firm. | Library free; cloud paid | MIT | 118,918 stars (measured) |
| **Anthropic computer-use tool** + reference container | Model-side tool (`computer_toolset_20260801`, GA on the Claude API for 5.x models, published); we would still need a desktop to run it in. The quickstart Docker desktop (Xvfb) is a good pattern for a VM per task. Anthropic says: dedicated VM, no credentials near the model, domain allowlist, human confirmation for consequential actions. | Tokens; about 1,000 to 1,800 input tokens per screenshot (published) | MIT (quickstarts) | Anthropic-maintained |
| **OpenAI computer tool** (Responses API) | Model-side, like Anthropic's; OpenAI names Playwright, Browserbase, Browser Use, E2B Desktop as environments. Only for OpenAI routes. | Tokens plus environment | proprietary API | Preview tool replaced; status label not stated (published) |
| **Microsoft UFO** (and its OmniParser screen parser, CC-BY-4.0 repo, AGPL weights) | Windows-desktop agent with its own loop. Wrong platform; duplicates dsh; accessibility trees make a screen parser unnecessary for web. | Free | MIT | 10,060 stars (measured) |
| **E2B Desktop** | Cloud Linux desktop sandbox per task. Strong isolation, but the firm's session and pages leave the firm. Conflicts with self-hosting. | Pro $150/month plus about $0.17/hour for 2 vCPU, 4 GiB (published rates, our arithmetic) | Apache-2.0 SDK | 1,539 stars (measured) |

## 5. Patent use cases

"Terms" means what the office publishes about automated access to its web UI.

| Use case | API exists? | Terms allow automation? | Failure modes | Attorney trust (assumption) | Verdict |
|---|---|---|---|---|---|
| **Espacenet** search and documents | Yes, OPS; already our native connector | No. EPO: Espacenet "does not support automated searches" and denies robots; OPS is the route (published) | Bot block, rate limits | Low need | **Never** |
| **EPO Register** UI (file inspection, procedural steps) | Yes, OPS register service; our `get_register_*` tools | No for the UI: BOT protection with CAPTCHA since March 2021; OPS recommended (published) | CAPTCHA (we must not solve it) | Low need | **Never**; close data gaps in OPS or the connector |
| **DPMAregister / DEPATISnet** | Yes, DPMAconnectPlus REST, contract with DPMA, €200 one-time, data free (published); DPMA connector is a planned slice | Web UI terms not found; assume no bulk automation | Session timeouts, German-only UI, layout changes | Medium for reading one file | **Later**, as a bridge until the DPMA connector ships; read-only, one case at a time |
| **MyEPO Portfolio** and **Online Filing 2.0** | Yes, MyEPO Portfolio API (mailbox, due dates, fees) and Online Filing 2.0 API (EP forms), WIPO ST.90 (published) | Through the APIs | 2FA is the only access since 1 Jan 2025 (published); legal deadlines; fee payments | Very low for an agent clicking | **Never** in the UI; if wanted, a connector on the API with attorney sign-off |
| **USPTO Patent Center** | Data: yes, ODP (our connector). Filing: UI only | Account can be revoked for harmful use; identity verification required for all users since 11 Sep 2025, guest access ended, 2-step authentication (published) | ID.me / 2FA, the attorney's personal registration number, fees | Very low | **Never** |
| **WIPO ePCT** | No public filing API found | Strong authentication needed to file (published) | 2FA push / OTP, real-time validation against the IB database | Very low | **Never** for filing; **later** at most for reading a dossier the attorney has open |
| **JPO J-PlatPat** | Yes, JPO patent information API (registration, access limits, trial since Jan 2022; no utility models) (published) | Site terms not verified | Japanese UI, rate limits | Medium | **Later**, prefer the JPO API connector or Global Dossier through a paid connector |
| **CNIPA** (PSS system) | No foreign-friendly public API found | Not verified; login has a verification code (published guide) | Captcha at login, registration, Chinese UI | Low | **Never** for automation; use family data from OPS / PATSTAT |
| **Docketing**: Anaqua, Patricia, PatSnap | Anaqua: API suite and connectivity products (vendor, details gated). PatSnap: Open API (vendor). Patricia: not confirmed | Vendor contract | SSO, per-seat licences, data protection | Medium if read-only | **Later**, and only where the vendor confirms no API; else an MCP row on the API |
| **Firm DMS**: iManage, NetDocuments | Yes, iManage Work REST API with OAuth 2.0 (registered app); NetDocuments REST API (assumption, not verified this session) | API by contract | n/a for the API route | High for the API route | **Never** by screen; MCP row on the API (HANDOFF already plans this) |
| **Firm intranet tools with no API** (time entry, conflict check, old docketing web UI) | Often no | Firm's own policy | SSO, session timeouts | Medium, read-only | **Later**, the one real case for browser use |

What this table shows: for the data we need, an API exists in 8 of 11 rows. The rows with no API are
filing portals (where an agent must not act) and the firm's own legacy tools (where browser use can
help, read-only).

## 6. Risks and controls on a firm machine

### What a computer-use agent can reach

- **Desktop driver (Cua Driver, `cua-macos`)**: every app the launching user can see, after OS
  permissions (Accessibility, Screen Recording). That includes the attorney's mail, the DMS client,
  the password manager window and any signed-in browser. The `standard` mode is promptless.
- **Browser in `attach` mode**: the existing browser with its cookies, sessions and saved logins.
  dsh's Playwright provider supports this mode. It must not be used.
- **Browser in `launch` mode**: a fresh Chromium with no cookies. It can still reach any URL the
  machine can reach, including intranet hosts.
- **Prompt injection**: a page or PDF can carry instructions (Anthropic and OpenAI both warn,
  published). One injected "click Submit" in a filing portal is a malpractice event.

### Controls the harness must add

| Control | Exists in dsh? | What we add |
|---|---|---|
| Isolated browser | Partly: `launch` mode, per-Session browser, no login restore | Profile row pins `mode: launch`, `headless: true`, a temporary user-data directory deleted at Session end; refuse `attach` |
| Isolated desktop | No | Out of scope for v1. If ever: a VM per task (Lume on a Mac, or an Xvfb container like Anthropic's quickstart), never the attorney's own desktop |
| Domain allowlist | No | A `tools/pre-execute` listener that denies `navigate` outside an admin-set list (DPMA, firm intranet hosts) |
| Approval before input | Waterfall exists; no listener for browser tools | Listener: read tools (snapshot, screenshot, navigate within allowlist) run; `click`, `type`, `fill`, `press`, `select`, file upload ask the attorney every time |
| No filing actions | No | Deny-list of filing and payment hosts (MyEPO, `online-filing` hosts, Patent Center, ePCT, fee payment pages), denied even with approval |
| No credentials | n/a | The agent never types a password; the attorney signs in by hand in a separate window if needed, and the harness never stores the session |
| Audit trail | Yes: Session log, durable screenshots, approval events | Include screenshots and approval outcomes in the log bundle and the doctor output; keep per firm retention |
| Permission mode | Cua Driver has `bounded` | If desktop is ever enabled, set `CUA_DRIVER_PERMISSION_MODE=bounded` with a reviewed manifest |
| Dependency pinning | Yes: exact pins | Keep pins; re-run gates on each bump; read release notes for breaking changes |

## 7. Recommendation and plan

**Decision.** Close the trycua question: it is already in the tree, it is not needed now, and its
cloud and agent loop are gone. Put desktop computer use on the "never in v1" list. Keep one later slice
for read-only browser use.

### Slice B1: read-only browser for portals without an API (after S4 and S5)

Build:

1. Profile rows in `flowleap-web` (off by default, an admin switch): `dsh-browser-use` and
   `dsh-experimental-browser-use-playwright-mcp` with `mode: launch`, `headless: true`.
2. One host plugin `dsh-flowleap-browser-policy` with a `tools/pre-execute` listener: domain
   allowlist from admin config; filing and payment deny-list; `ask` for every input action; deny
   `attach`.
3. Doctor check: browser starts, allowlist loaded, deny-list loaded.
4. Prompt note in the Patent Agent prompt: use connectors first; the browser is for reading; never
   submit.

Acceptance criteria:

- With the switch off, the model sees no browser tools (tool schema snapshot).
- The agent reads one DPMAregister file page for a known DE number and returns the status with a
  screenshot reference in the Session log.
- A `navigate` to a host outside the allowlist is denied with a clear message.
- A `navigate` to MyEPO, Patent Center or ePCT is denied even when the attorney would approve.
- Every `click` or `type` produces an approval card; a rejection stops the action.
- After the Session ends, the browser user-data directory no longer exists.
- The log bundle contains the screenshots and the approval events.

### Two-week trial: what to measure

| Metric | How | Target (assumption) |
|---|---|---|
| Task success | 20 scripted read tasks on DPMA and one firm intranet page, scored by the attorney | 16 of 20 or better |
| Tokens per task | Session usage | under 60K beyond the base turn |
| Time per task | Session timing vs. attorney by hand | not slower than the attorney |
| Approval load | approval cards per task | 2 or fewer on average |
| Wrong actions | any input the attorney rejects because it was wrong | 0 reaching the site |
| Blocks | CAPTCHA, login wall, layout break | logged; each one names a connector to build instead |

### What would make us stop

- Any CAPTCHA, ban or terms complaint from an office.
- One unapproved input reaches a site, or one injected instruction gets past the policy.
- Success below 12 of 20 tasks, or the attorney is faster by hand.
- A connector (DPMA, JPO, or a paid connector such as patent-connector.com) covers the same data first.

## 8. Sources

Code (measured, 2026-10-23, `flowleap` branch):

- `packages/computer-use/README.md`, `docs/subsystems/computer-use.md`, `docs/subsystems/browser-use.md`
- `packages/experimental/computer-use-cua-driver-mcp/README.md`, `computer-use-cua-driver-native/README.md` and `package.json` (`@trycua/cua-driver` 0.28.0)
- `packages/experimental/cua/README.md`, `packages/experimental/cua-macos/README.md`, `native/upstream.json`, `native/LICENSE.cua-driver`, `examples/macos.cordis.yml`
- `packages/experimental/browser-use-playwright-mcp/README.md`; pins in `browser-use-*/package.json`
- `packages/mcp/mcp-client/README.md`; `scripts/check-workspace-constraints.ts`
- `packages/bundle/base/cordis.patch.yml` (sandbox, approval rows), `packages/bundle/web-app/cordis.patch.yml`, `packages/bundle/flowleap-web/cordis.patch.yml`
- `docs/subsystems/approval.md`, `docs/subsystems/tools.md`, `SAFETY.md`, `docs/tool-catalog.md`
- `node_modules/.pnpm/@trycua+cua-driver@0.28.0/.../README.md`

Web:

- trycua/cua repository and README: https://github.com/trycua/cua
- Cua Driver README: https://github.com/trycua/cua/blob/main/libs/cua-driver/README.md
- Cua Cloud ended, deprecated packages: https://cua.ai/docs/cua-sdk/guides/cua-cloud-ended
- Cua pricing: https://cua.ai/pricing
- Anthropic computer-use tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
- Anthropic reference container: https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo
- OpenAI computer use: https://developers.openai.com/api/docs/guides/tools-computer-use
- Browser Use: https://github.com/browser-use/browser-use
- Stagehand: https://github.com/browserbase/stagehand
- Playwright MCP: https://github.com/microsoft/playwright-mcp
- Microsoft UFO: https://github.com/microsoft/UFO
- OmniParser: https://github.com/microsoft/OmniParser
- E2B Desktop: https://github.com/e2b-dev/desktop ; pricing https://e2b.dev/pricing
- EPO fair use charter: https://epo.org/en/service-support/ordering/fair-use
- Espacenet: https://epo.org/en/searching-for-patents/technical/espacenet
- OPS restrictions FAQ: https://epo.org/en/service-support/faq/searching-patents/open-patent-services/general-information/are-there-any
- EPO Register BOT protection: https://www.epo.org/en/news-events/news/introduction-bot-protection-system-european-patent-register
- MyEPO APIs: https://www.epo.org/en/applying/myepo-services/understand/api ; https://www.epo.org/en/news-events/news/connecting-myepo-services-users-ip-management-systems
- DPMAconnectPlus: https://dpma.de/recherche/datenabgabe/dpmaconnect/index.html
- USPTO Patent Center identity verification: https://www.uspto.gov/subscription-center/2025/effective-tomorrow-identity-verification-will-be-required-all-patent ; https://www.uspto.gov/about-us/news-updates/uspto-implementing-additional-security-measures-patent-center-0 ; access document https://www.uspto.gov/sites/default/files/documents/Patent%20Electronic%20System%20Access%20Document_1.pdf
- WIPO ePCT strong authentication: https://www.wipo.int/edocs/mdocs/pct/en/wipo_webinar_pct_2025_24/wipo_webinar_pct_2025_24_presentation_2.pdf
- JPO patent information API: https://www.jpo.go.jp/e/system/laws/koho/internet/api-patent_info.html ; terms https://www.jpo.go.jp/e/system/laws/koho/internet/document/api-patent_info/terms_of_use_api_e.pdf
- CNIPA PSS guide (EPO): https://link.epo.org/web/cnipa_pss_citation_retrieval_202001_en.pdf
- Anaqua connectivity: https://www.legaltechnologyhub.com/vendors/anaqua-connectivity-by-anaqua
- PatSnap API: https://www.patsnap.com/resources/blog/articles/patsnap-api-integration-6-key-features-for-ip-teams/
- iManage Work API (third-party summary): https://nango.dev/docs/api-integrations/imanage.md

Not verified this session: J-PlatPat and DPMA web-UI terms on automation, the CNIPA automation
policy, the NetDocuments and Patricia APIs, and the Chrome DevTools MCP licence.
