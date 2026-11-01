# FlowLeap Desktop as the way in: plan

Status: the founder decided Q0 to Q6 on 2026-11-01 (section 7). Later the same day the founder replaced Q2 with the native-app rule (section 7, Q7). The tickets of section 8 are issues #159 to #176. It changes the order of the [roadmap](2026-10-29-roadmap.md) and adds to the [open-source docs plan](https://github.com/flowleap-ai/flowleap-os/blob/main/docs/plans/2026-11-01-open-source-docs.md) of flowleap-os. It uses the [MCP door study](2026-11-01-mcp-door-study.md) for the agents' side.

**The goal (the founder, 2026-11-01).** "The desktop app should be open source, downloaded and used immediately like Kino, and we help them use it with Claude or ChatGPT or API, and our plugins will pay for us ... not all firms will host PATSTAT but we can sell a PATSTAT subscription to be in his agent or any agent." And: "open source everything and sell the execution and the ecosystem ... the ecosystem is mine, a set of plugins we can build incrementally."

**The answer in short.** Most of the parts exist. The FlowLeap desktop build runs from source with no account and opens the FlowLeap dashboard. But an attorney cannot get a first answer: the desktop uses the firm product's locks, so the Models page refuses every model key, and the first chat fails with a developer error. **The native-app rule (founder, 2026-11-01):** the desktop app and the firm OS call no FlowLeap backend. The attorney brings a model key, and the office tools run on the attorney's own free keys. Paid data comes only as a plugin that the attorney installs with one click from the plugin store; only that plugin signs in to FlowLeap and calls the hosted MCP server. So the first work is small and in this repository: a desktop product layer without the firm locks, a model key step, and the one-click data plugin. Then signing and notarization, so that a download opens without a security warning. The License ($39 a month) already sells all data sources in one plan; the plugin ecosystem needs entitlements per plugin only when there is a second paid thing to sell.

Two vendor facts set the limits. Anthropic forbids a "Sign in with Claude" in FlowLeap's own app, so "use your Claude or ChatGPT plan" means FlowLeap's tools inside the vendors' apps through MCP, which works today. And the EPO PATSTAT terms require the EPO's permission for any commercial use of PATSTAT data (clause 5.8); the founder confirmed on 2026-11-01 that FlowLeap holds it.

## 1. What exists

Facts from the code on 2026-11-01. Paths are in this repository unless a repository is named.

| Part | State | Where |
|---|---|---|
| Desktop shell (Electron) | Builds and runs as FlowLeap Patent AI from `DSH_DESKTOP_PRODUCT=flowleap`. No account, no welcome window, no telemetry, no update feed. A local unsigned macOS arm64 DMG builds with `make desktop-flowleap`. | `apps/desktop/config/product.flowleap.json`, `apps/desktop/README.md` "FlowLeap product configuration" |
| Packaging and publishing | Upstream workflows exist, but they run on DeepSeek's self-hosted runners (`dsh-mac-package-trial`, `dsh-win-package-trial`) with a Windows EV hardware token. FlowLeap has no Apple Developer ID, no Windows certificate, no runner and no feed. The README calls this "Milestone 2". | `.github/workflows/macos-package.yml`, `windows-package.yml`, `desktop-publish.yml`, `apps/desktop/windows-signing/README.md` |
| Desktop profile | `$DSH_HOME/profiles/flowleap-desktop` from the `flowleap-web` template, so the desktop gets every firm lock of the `dsh-flowleap-web` bundle. | `packages/bundle/flowleap-web/README.md` "Models only through the firm's keys" |
| Model routes | `anthropic`, `openrouter`, `mistral`, with `fixedRoutes: true` and `lockedRefs` on the three keys. "Registers no subscription sign-in." Default model `anthropic` / `claude-sonnet-5-5`. | `packages/bundle/flowleap-web/cordis.patch.yml`, `packages/llm/llm-pi-ai/README.md` |
| Local patent tools | 34 office tools of `@flowleap/connectors` (33 native plus `read_pdf`, `compare_claims`) on the user's own free EPO OPS, USPTO ODP, Semantic Scholar and Mistral keys. Settings cards and a first-run wizard. | `packages/host/flowleap-connectors`, `packages/client/ui-settings-flowleap-connectors` |
| Paid tools in the harness | The `mcp-flowleap` row runs `flowleap mcp` (stdio) and keeps 19 paid tools (PATSTAT, citations, examiner baseline, images, analytics, US full text). It needs the `flowleap` CLI on PATH and signed in. No settings card or wizard step takes a FlowLeap token. | `packages/bundle/flowleap-web/cordis.patch.yml` (`mcp-flowleap`) |
| Skills pack | The `flowleap` skill provider reads `FLOWLEAP_SKILLS_DIR`, else `/opt/flowleap/skills` (the server image). `requireCustomSkillDirs: true`. The packaged desktop ships the flowleap-plugins commit that `product.flowleap.json` pins and sets `FLOWLEAP_SKILLS_DIR` to it (#160). | `packages/bundle/flowleap-web/cordis.patch.yml` (`skill-filesystem`), `apps/desktop/README.md` "FlowLeap product configuration" |
| Hosted MCP server | `https://api.flowleap.co/mcp`: 51 read-only tools, OAuth 2.1 (scope `patent-data`) or `Bearer fl_pat_`. Documented for Claude Code, claude.ai and Claude Desktop, ChatGPT developer mode, VS Code, Cursor and others; not for Codex. Registry name `co.flowleap/flowleap`. | flowleap-backend `src/routes/mcp.ts` (ADR 0022); flowleap-mcp `README.md` |
| Claude Code plugin | `flowleap` v2.5.1: 33 skills and a `.mcp.json` that points to the hosted MCP server with OAuth. "Free forever". | flowleap-plugins `marketplace.json`, `plugins/flowleap/.mcp.json` |
| License and billing | Stripe. One plan, "Basic": $39 a month or $199 a year. The only gate is the Subscription status (`trialing` or `active`). No entitlement per data set. | flowleap-backend `src/lib/billing-plans.ts`, `src/tools/access-policy.ts`, `docs/billing/CONTEXT.md` |
| Trial | 7 days from account creation, no card (ADR 0018). During the trial: a **Trial Model key** (an OpenRouter key per user, minted through OpenRouter's Provisioning API, $2 a day cap by default, `GET /v1/trial/model-key`, ADR 0015) and the **House keys** for office data up to a Trial data budget (ADR 0017). | flowleap-backend `src/routes/trial.ts`, `src/services/trialModelKeyService.ts`, `src/config.ts` |
| Personal tokens | `fl_pat_` tokens: mint with `POST /api/tokens` (needs a web session) or `flowleap auth create-token`. The website has no page to mint one. Device flow (RFC 8628) for the CLI. | flowleap-backend `src/routes/api.ts`, `src/routes/oauth.ts`; flowleap-cli `src/commands/auth.rs` |
| Plugin market generator | Writes a DSH Discover `index.json` from npm names and Git URLs of `dsh.bundle` packages. No auth, no paid concept, no private registry. Not a Claude Code or Codex marketplace. | `apps/plugin-market-generator` |

### What an attorney meets in the first 10 minutes (observed)

I built this branch (`pnpm install`, `pnpm run build:artifacts`, all 8 gates passed) and started the desktop with `DSH_DESKTOP_PRODUCT=flowleap pnpm run start:desktop`, with no model key in the environment, without the `flowleap` CLI on PATH, and with a new empty home. I signed in to nothing. Screenshots are in the session notes (`2026-11-01-desktop-first-run/`).

1. The window opens on the FlowLeap dashboard with no sign-in. Good.
2. The "Connect your patent data sources" wizard asks for four keys: EPO OPS key and secret, USPTO ODP, Semantic Scholar, Mistral. It does not ask for a model key, and it does not mention FlowLeap or the paid data. "Skip for now" closes it.
3. The dashboard shows "First steps", "Budget used: Unknown. No model gateway is connected to this app", and an "Install FlowLeap" card whose "Desktop app" and "Claude and Codex" rows say "Coming later". Inside the desktop app, this card is wrong.
4. Settings > Models says: "Models run only through the firm's AI gateway. The deployment sets the model routes and keys, so you cannot add a provider, sign in, or enter a key here."
5. The composer shows "Select model". A first question ("What is EP3000000 about?") fails at once: "llm-pi-ai: no credential for provider route "anthropic"; its profile resolves ANTHROPIC_API_KEY, which is not set — store ANTHROPIC_API_KEY through the credentials service (the web Models page writes it) or export it ...", code `MISSING_CREDENTIAL`. The message sends the attorney to a page that refuses the key. **This is the end of the path today.** No request left the machine.
6. The Plugins page stayed on its loading placeholder.
7. The paid tools are absent because the `flowleap` CLI is not on PATH. The skills pack row fails at load: `CustomSkillDirError: ... custom skill directory "/opt/flowleap/skills" does not exist` (seen in the log of the run below); the app starts without the pack.
8. Also seen: the development window title is "DSH Local Build", and the developer pages of #84 and #70 are present.

### Without the FlowLeap backend (checked live)

The founder asked whether the desktop works with the patent data connectors and no FlowLeap backend. It does. I checked it in two runs on this branch on 2026-11-01.

1. **The desktop with every FlowLeap host refused.** I started the desktop through a local proxy that refused every `flowleap.co` host and logged every other host. The app, the connector settings card and every FlowLeap plugin row loaded. The paid route (`flowleap mcp`) tried `api.flowleap.co` again and again, and the proxy refused each try. No other row needed FlowLeap.
2. **One chat with tool calls, no real model.** The desktop launch takes no overlay, so I ran the same `flowleap-web` profile (the desktop's template) from source with `dsh --profile flowleap-web`, an overlay that points the `anthropic` route at a small local fake model, and a `flowleap` command on PATH that only exits. The fake model asked for two tools. The model received 75 tools: the office tools (`search_patents`, `get_bibliography`, `get_us_grant`, `compare_claims`, `read_pdf` and the others), and no `mcp__flowleap__*` tool and no `get_fulltext`.
   - `get_bibliography` with no EPO key answered: "EPO OPS key not configured. Add it in Settings > Patent data connectors > EPO OPS, then call this tool again."
   - `search_academic` on arXiv, which needs no key, returned real papers straight from `export.arxiv.org`.

**What works with no FlowLeap backend.** The app, the settings card, the 34 office tools on the attorney's own EPO OPS, USPTO ODP, Semantic Scholar and Mistral keys, the keyless academic search, the deliverables, the agents and the routines.

**What names the paid route.** US claims and US full text, and PATSTAT. The prompt section `flowleap:patent-data-keys` says "Text this host has no source for (US claims) is a paid FlowLeap service; the tool result names the route to take", and the full-text router returns `not_configured` with the paid route. The Patent Agent prompt describes PATSTAT analytics. Without a FlowLeap sign-in these tools are not registered, so the model is sent to a tool that does not exist, and the attorney sees no way to get the data. T2 fixes this: without the data plugin, the result must name the plugin in the plugin store, not a tool.

**Limits of the check.** I entered no office key, so no call reached an office with a key. With the proxy on, the arXiv call failed because the host's own fetch does not use the proxy; the second run, with no proxy and no `flowleap` command, is the evidence for it. During one try between the two runs, an older `flowleap` CLI (v0.8.8, in the nvm folder) was still on PATH; it started, used the FlowLeap key stored on this Mac and reached `api.flowleap.co` before I stopped the run. No chat ran in that try, so the model called no tool; the CLI made only its start-up requests.

## 2. The 10-minute path

| Step | Today | What is missing | Ticket |
|---|---|---|---|
| Download | No public build, no download page, no update feed | A release workflow on GitHub-hosted runners, a download page on flowleap.co, and an update feed | T9, T10 |
| Install, macOS | Only a local unsigned DMG. macOS blocks an unsigned, unnotarized app downloaded from the internet. | Apple Developer Program membership, a Developer ID Application certificate, notarization with `notarytool` in CI | T8 |
| Install, Windows | No FlowLeap build. Upstream signs with an EV hardware token on a self-hosted runner, which FlowLeap does not have. | A cloud signing service (section 3.3) or a certificate on a hardware token | T9 |
| First run | Works: dashboard, no account | The first-run steps in the right order (below), the "Install FlowLeap" card hidden in the desktop | T1, T4 |
| Model setup | Refused (step 4 above) | A desktop layer without the firm locks; a model step | T1, T3 |
| Patent data | Four free office keys. Each is a browser sign-up at the office, so a human step that takes longer than 10 minutes. | A first question that needs no office key (arXiv and the other keyless tools), the office key cards after it, and the paid data plugin in the plugin store | T2, T4 |
| First useful result | Not reached | The steps above, and one guided first question | T4 |

**The proposed first run.** The app calls no FlowLeap host (the native-app rule, Q7):

1. **Add a model.** Connect OpenRouter (section 3) or paste an Anthropic or OpenAI key, with a Test button (T3).
2. **First question.** A prefilled example that a keyless tool can answer, for example an academic search on arXiv, so the first answer comes in minutes.
3. **Later cards.** "Use your own EPO and USPTO keys" (the office key wizard), and "Get FlowLeap data" (the data plugin in the plugin store, T2).

**The paid data plugin.** One click in the plugin store installs it. After the install, the plugin asks the attorney to sign in to FlowLeap: the system browser opens flowleap.co with a loopback redirect to the plugin (a new registered client `flowleap-desktop`, beside `flowleap-cli`), and a new account starts the data trial. The plugin stores one `fl_pat_` token in the credential store, and its tools call `https://api.flowleap.co/mcp` over Streamable HTTP with the token as a header; the `dsh-mcp-client` row supports this (`packages/mcp/mcp-client/README.md`), so no `flowleap` CLI is needed. Sign out or uninstall revokes the token and removes the tools. A desktop with no plugin installed makes no call to any FlowLeap host (#169).

The backend's Trial Model key (ADR 0015) is not used by the desktop: the attorney's own model key runs every chat.

## 3. Models

### 3.1 What each vendor allows

Vendor facts were fetched on 2026-11-01. The full notes, with a source for each claim, are in the session notes (`2026-11-01-desktop-model-access-vendor-research.md`, outside the repository). I read the Claude Code legal page, OpenAI's open-source "Sign in with ChatGPT" page and the PATSTAT terms again myself.

| Route | Allowed? | Source |
|---|---|---|
| The user's own Anthropic API key | Yes. Anthropic tells developers to use API keys. | [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) |
| The user's own OpenAI API key | Yes | [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data) |
| OpenRouter "connect your account" (OAuth with PKCE) | Yes. Documented for apps, with a callback to localhost on any port. The user gets a key of their own with no copy and paste. | [OpenRouter OAuth](https://openrouter.ai/docs/guides/overview/auth/oauth) |
| "Sign in with Claude" in FlowLeap's own app | **No.** "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users." Anthropic "may do so without prior notice". OpenCode removed this login after legal requests (search, March 2026). | [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance), [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) |
| FlowLeap runs the user's own, unmodified Claude Code, and the user signs in through Anthropic's own flow (Kino's way) | Yes, with conditions. Running Claude Code in a product "requires agreeing to our Commercial Terms"; the binary "must not be modified"; each end user authenticates "with their own Anthropic API key, Claude subscription plan credentials" or a cloud provider; FlowLeap "may not pay for, resell, or intermediate" the usage. Then Claude Code is the agent, and FlowLeap gives it tools through MCP and skills. | [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance), section "Can customers offer Claude Code in their products?" |
| "Sign in with ChatGPT" plan usage in FlowLeap's own app | Yes for "open-source and locally hosted apps", in preview: an OAuth flow with a host ID per installation, `store: false`, no hosted tools. A paid or hosted app uses an interest form. | [Sign in with ChatGPT, open source](https://developers.openai.com/siwc/token-sharing-open-source) |
| FlowLeap runs the user's own Codex (`codex app-server`) with the user's ChatGPT login | Local or open-source apps "can continue"; it "has never been permitted for commercial or hosted services"; OpenAI recommends moving to Sign in with ChatGPT. | [Codex app-server](https://learn.chatgpt.com/docs/app-server) |
| FlowLeap tools inside Claude Desktop, claude.ai, ChatGPT, Claude Code, Codex | Yes. This is the user's own plan in the vendor's own app, with FlowLeap as an MCP server. It exists (section 4). | [MCP door study](2026-11-01-mcp-door-study.md) |

**Data rules for law firms.** Anthropic API: conversation content "is not retained by default" (some newer models need 30 days) and is not used for training without permission; zero data retention through sales. OpenAI API: not used for training by default; abuse logs up to 30 days; zero data retention needs approval. OpenRouter: does not store prompts unless the user opts in, but "Some Models may store or train on your Inputs", so the desktop must pick providers that do not train. Sources are in the session notes.

### 3.2 What to offer at launch

1. **Connect OpenRouter** as the main button, and **paste an Anthropic or OpenAI key** for firms that want a direct contract and zero data retention. There is no FlowLeap trial model (Q7).
2. **"Use your Claude or ChatGPT plan"** means, at launch: FlowLeap data inside Claude Desktop, ChatGPT, Claude Code or Codex through the hosted MCP server. The attorney's plan pays for the model, and FlowLeap's data works inside the vendor's app. This is allowed and built. Writing the agents' settings from the desktop belongs to the data plugin, after its sign-in (T11), not to the core app.
3. **Later, after written confirmation from the vendors:** a Kino-style mode in which the desktop runs the attorney's own installed Claude Code or Codex as the agent, with FlowLeap tools and skills. For Claude Code this needs Anthropic's Commercial Terms; for ChatGPT, OpenAI asks open-source apps to use "Sign in with ChatGPT", which needs a client ID. Do not build "Sign in with Claude" in FlowLeap's own app.

### 3.3 Code signing

Both platforms can sign on GitHub-hosted runners, so FlowLeap needs no self-hosted runner and no hardware token.

- **macOS.** Apple Developer Program: 99 USD a year ([Apple](https://developer.apple.com/programs/whats-included/)). Only the Account Holder creates the Developer ID Application certificate. electron-builder signs and notarizes on `macos-latest` with the certificate and an App Store Connect API key ([electron-builder](https://www.electron.build/docs/features/github-actions/)). An organization account needs a D-U-N-S number (search).
- **Windows.** Azure Artifact Signing (formerly Trusted Signing): Basic 9.99 USD a month for 5,000 signatures ([Microsoft](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-change-sku)). Organizations in the US, Canada, the EU, the UK and some other countries can use it; "Individual developers must be located in the United States or Canada" ([quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)). Validation takes 1 to 20 business days. It needs a paid Azure subscription and gives no EV certificate; SmartScreen reputation builds with downloads. electron-builder v27 supports it with `win.sign` `type: "azure"`. Whether Microsoft asks for a minimum company age is not clear from its own answers.
- **The upstream workflows** stay for DeepSeek's runners. FlowLeap adds its own small workflow (T8, T9), so the fork does not depend on the upstream runner labels.

## 4. Paid data: buy, enter, use everywhere

**What the backend supports today.** One License (Basic, $39 a month or $199 a year) through Stripe Checkout and the customer portal. The only gate is the Subscription status. A tool is `plan` (402 `subscription_required` without the License) or `signed-in`. Free with a sign-in: the 8 PATSTAT graph tools and `patstat_docs`. Behind the License: `patstat_portfolio`, `patstat_query`, `patent_analytics`, the citation tools, `examiner_baseline`, `get_patent_image`, US full text, and the office tools on the House keys. Paying users bring their own office keys, as a Forwarded key or a Stored key (ADR 0008, ADR 0023).

**How it reaches each place.**

| Where | How the attorney enters it | State |
|---|---|---|
| FlowLeap Desktop | Install the FlowLeap data plugin from the plugin store, then sign in inside the plugin (T2). The token goes to the credential store; the paid tools appear. | Missing. Today only the `flowleap` CLI login, by hand. |
| Firm OS | Today `FLOWLEAP_API_KEY` in `/etc/flowleap/firm.env`; `install.sh` writes it as the CLI key. Under the native-app rule the administrator installs the same data plugin once for the firm from the admin console, and the firm token stays out of the attorneys' runtimes. | Exists as `FLOWLEAP_API_KEY`; the plugin is #176. |
| Claude Code | The `flowleap` plugin, or `claude mcp add --transport http flowleap https://api.flowleap.co/mcp`; OAuth on first use | Exists |
| Claude Desktop, claude.ai | Settings > Connectors, custom connector with the hosted URL; OAuth. The URL is public, so Anthropic's cloud can reach it. | Exists (flowleap-mcp README) |
| ChatGPT | Developer mode, add the hosted URL; OAuth | Exists (flowleap-mcp README) |
| Codex | `codex mcp add flowleap --url https://api.flowleap.co/mcp`, then `codex mcp login flowleap` | Works by the vendor docs; not in the flowleap-mcp README (T12) |

So "a PATSTAT subscription in any agent" exists today for the agents above: the License plus the hosted MCP server. What is missing is the data plugin with its sign-in (T2), a token page on the website for clients without OAuth (T12), the upgrade link in the 402 at the MCP door (backend #539), and a "Connect Claude and Codex" screen in the data plugin that writes the agents' settings, as Kino does (T11).

**One plan or a plan per plugin.** The backend CONTEXT says "exactly one plan", "no tiers". A plan per plugin needs an entitlement record per user (or firm) and plugin, Stripe products per plugin, and the tool gate reading the entitlement instead of the status. This is about 2 weeks of backend work (T13). I recommend one License until there is a second paid plugin that a buyer wants without the first (section 5). Then the License becomes "FlowLeap Data", and new plugins are add-ons.

**PATSTAT licence.** ADR 0001 decision 18 says the EPO PATSTAT licence terms for offering the data as a service "must be checked before it is sold". I checked them ([EPO PATSTAT terms](https://www.epo.org/en/service-support/ordering/patstat-data-terms-and-conditions)). Clause 5.8: "Any commercial use of the PATSTAT data requires prior written or electronic permission from the EPO", and "The EPO may decide to charge a licensing fee" for it. Clause 5.2 allows a licensee's own product when it is offered "free of charge". Clause 5.5 allows online access only "as part of one of their own products". Clause 10.2 asks for the line "This product contains data sourced from EPO PATSTAT data, © European Patent Organisation." Today the License sells `patstat_portfolio` and `patstat_query`. **The founder confirmed on 2026-11-01 that FlowLeap holds the clause 5.8 permission.** Every product that uses PATSTAT data, the desktop and the MCP answers included, keeps the clause 10.2 attribution line.

**A firm License.** Today a token belongs to one Clerk user, but the firm OS uses one token for all attorneys. Per-seat or per-firm pricing is a founder decision (section 7, Q4).

**What the plugin market generator can do.** It builds a Discover index for DSH bundles from npm or Git. It can list FlowLeap's free plugins for the desktop and the firm OS with no new client code. It cannot sell: it has no price, tier, entitlement or private registry. A paid plugin does not need one, if the paid part is a service behind the sign-in (section 5.3): the plugin is free to install and the backend checks the License on each call.

## 5. The plugin ecosystem: what to build first

The founder's strategy: the OS is free and open; FlowLeap sells the execution (setup, support) and the ecosystem (plugins). A competitor can copy any open code. So a paid plugin must hold its value in something that is not the code.

### 5.1 The order

| # | Plugin | What exists | What makes it hard to copy | Size to sell |
|---|---|---|---|---|
| 1 | **FlowLeap Data**: PATSTAT analytics and graph, US full text, examiner baseline, enriched citations, images | Built, in the License, in every agent through the hosted MCP server | The hosted data: PATSTAT editions loaded, cleaned and joined, the citation and family graph, the US full text index, kept current each edition. A firm needs a PATSTAT licence, a database server and the loading work to copy it. | Done; T2 and T12 bring it to the desktop and to Codex |
| 2 | **Register watch** (EP and US register events, every day, with an alert) | The routine and the Needs review mark run in the harness, only while the app is open | A hosted watch runs when the attorney's laptop is closed. The value is the reliable service and the event history, not the code. | M, backend schedule plus a notification |
| 3 | **Office action pack**: analysis (#46), the office action board (#81), Word export, examiner statistics | The skill is in flowleap-cli; the board shows sample data | The skill text is MIT and public, so it alone is easy to copy. The paid part is the data that it calls: examiner baseline, enriched citations, the file-wrapper OCR on the backend. Keep the skill free; it sells FlowLeap Data. | M, after #81 has real data |
| 4 | **Firm integrations**: document management (iManage, NetDocuments) and docketing (for example Anaqua, Clarivate IPfolio, Alt Legal) | Nothing | Partner API access, certification, and the mapping of each system's matter model. Each one is slow to build and to keep, and a firm pays for that work. | L each; start when a pilot firm names its systems |

**Why this order.** Number 1 already earns and works in every agent, so the desktop and the docs must point at it first. Number 2 is the first plugin that only a hosted service can do. Number 3 makes number 1 more useful but is not a product alone. Number 4 is a sales item per firm, not a self-service plugin.

### 5.2 What I do not recommend

Closed-source plugins inside the open app. An attorney cannot see what a closed binary does with client files, and a firm's IT will ask. Also, the code would be copied or worked around. Keep every plugin's client code MIT and put the value behind the sign-in.

### 5.3 How a plugin is sold, licensed and delivered

- **Licence of the code.** MIT for every client part (the dsh bundle, the skills, the MCP configuration). The paid value is the service at `api.flowleap.co`.
- **Sale.** On flowleap.co: Stripe Checkout, the customer portal, and the 7-day trial with no card. The data plugin and the 402 answer at the MCP door link to the same checkout (backend #539).
- **Entitlement.** Checked on the backend for each call (the Subscription status today; per plugin after T13). Nothing in the client needs to be trusted.
- **Delivery.** One plugin, three forms from one source: a dsh bundle for the desktop and the firm OS (listed in a FlowLeap Discover index built by the plugin market generator), the Claude Code plugin in flowleap-plugins, and the hosted MCP server for every other agent. The index and the bundle come from a public location such as GitHub or npm, not from a FlowLeap host, so a desktop that opens the plugin store and installs nothing makes no call to FlowLeap (#169).
- **Integrations (number 4)** run against systems inside the firm, so the backend cannot check each call. Sell them as a setup and support contract, with the code open.

### 5.4 The paid easy path

**The reference.** Postiz (social media scheduling, not a patent product) publishes its whole product as open source: "The open-source version is the same codebase, published on GitHub under the AGPL-3.0 license", with self-hosting docs. Its hosted plans start at $29 a month with a 7-day trial. It gives "a hosted MCP endpoint with OAuth sign-in and no API key" for Claude, Claude Code and ChatGPT, and a CLI with a skill (`npx skills add gitroomhq/postiz-agent`) for agents that run shell commands, such as Codex ([postiz.com](https://postiz.com/), [docs](https://docs.postiz.com/public-api)). The founder reports that it earns more than $100,000 a month, because self-hosting is hard. FlowLeap follows the same pattern: the code is free, and FlowLeap sells the easy path.

**Decided by the founder (2026-11-01): option 1 now, option 2 later.**

- **Option 1, now: a managed firm server.** FlowLeap sets up and runs one dedicated server for each firm, in the firm's own cloud account or on a server that FlowLeap rents for that firm. FlowLeap does the installation, the sign-in with the firm's Entra ID, the updates, the backups and the support. The firm pays for setup and for the running service.
- **Option 2, later, "when we have a solid product": a FlowLeap-hosted cloud.**

This changes the founder's decision of 2026-10-30 ("self-hosted only for now"; managed hosting comes after the firm OS is complete). Managed hosting of one server for each firm starts now. A shared cloud for many firms stays later. One firm still has one host, and a firm's data does not share a server with another firm's data.

**What option 1 can use today.** The flowleap-os installer, the health check, updates with backup and rollback, the release gate, off-site access through Tailscale, and the backup and restore proof (roadmap "Where FlowLeap is"). **What it lacks.** A script that creates the server in a cloud account (FlowLeap's or the firm's) and runs the installer (T16). A support access that the firm's administrator opens for a limited time, so that FlowLeap can operate the server without a standing key (ADR 0001 decision 15, designed and not built; T17). A service agreement and a data processing agreement for the firm (founder, with a lawyer).

**How FlowLeap works with any agent.** This is the Postiz pattern, and most of it exists:

| Agent | Way in | State |
|---|---|---|
| Claude Desktop, claude.ai, ChatGPT | The hosted MCP server, `https://api.flowleap.co/mcp`, OAuth sign-in, no key to copy | Exists |
| Claude Code | The `flowleap` plugin of flowleap-plugins: 33 skills and the hosted MCP server | Exists |
| Codex and other agents that run shell commands | The `flowleap` CLI (`npm i -g flowleap`, device-flow sign-in) and the skills (`npx skills add`, as the flowleap-plugins README says) | Exists; the Codex page is missing (T12) |
| FlowLeap Desktop | The same hosted MCP server, through the data plugin after its install and sign-in | T2 |
| A managed firm server | The data plugin, installed once by the administrator (#176); the firm's own documents and chats reach outside agents only through the MCP door (#77), after the web gate and the audit trail | Data: exists. Firm data: after phase C |

## 6. How this changes the roadmap and the docs plan

### 6.1 The roadmap

The roadmap of 2026-10-29 builds the self-hosted firm OS for a pilot firm first (phases A to C), and puts the desktop (#75) and the MCP door (#77) in phase E. The new strategy makes the free desktop the way in for most users and the hosted data the income. The firm OS stays the offer for firms that want a host of their own, with paid setup.

Two of the old assumptions change:

- **#75 changes meaning.** It was a thin client that opens the firm server. The desktop that exists runs the whole harness locally. I recommend: the desktop is the full local app (ADR 0001 decision 19 called it "S4a, for solo attorneys"); "connect to my firm server" is a later option in the same app.
- **#77 splits.** The hosted MCP server already gives FlowLeap Data to Claude, ChatGPT, Claude Code and Codex. The MCP door of the study is for a firm's own data on its own host, and it stays after phase C (roadmap decision 3), because it needs the web gate (#33) and the audit trail (#35).

**Proposed new order.**

| Phase | Goal | Work | Size |
|---|---|---|---|
| D0. Desktop works alone | An attorney gets a first answer from a source build in 10 minutes | T1 to T7 | 2 to 3 weeks |
| D1. Download | A signed download that opens without a warning, on macOS and Windows, with updates | T8 to T10 (needs the founder's Apple and Microsoft accounts) | 1 to 2 weeks, partly waiting for the vendors |
| A. Close the loop | Unchanged; #81 and #60 real data help the desktop too | As in the roadmap | 1 to 2 weeks, in parallel with D1 |
| D2. Agents and plugins | Connect Claude and Codex from the data plugin; register watch as the second paid plugin; the Discover index | T11, T12, T14; T13 only if the founder decides on plans per plugin | 2 to 3 weeks |
| B, C. Firm OS pilot-ready and trust | Unchanged, but after D0 and D1, unless a pilot firm with a date comes first. B adds the managed firm server (option 1, decided): T16 and T17. The native-app rule adds the data plugin installed by the administrator (#176) and updates from a public signed feed (#175, after signed images #120) | As in the roadmap, plus T16, T17, #175 and #176 | 7 to 10 weeks |
| D. Firm knowledge, E. phone and the firm MCP door | Unchanged | | later |

Phase B items that the desktop also needs (#84 developer pages, #70 plugin creation, #79 wizard bug) move into D0.

### 6.2 The open-source docs plan

- **Start here** gets a first page "Download FlowLeap Desktop", before "Install and operate". The firm OS becomes "For firms: run FlowLeap on your own host".
- **Use (attorney)** pages are written for the desktop first; the browser on a firm host is the same app.
- **Appendix A** (free and paid) adds "FlowLeap Desktop" as the first free row, and "the FlowLeap data plugin: install it from the plugin store, sign in, 7-day trial with no card, then the License" as the first paid row. "What you always pay others" adds "your model provider". The page states the native-app rule: the app and the firm OS call no FlowLeap server unless the user installs a paid plugin.
- **Install and operate** says that firm OS updates come from a public signed feed (#175), and the data key comes from the data plugin in the admin console (#176), not from `FLOWLEAP_API_KEY` in `firm.env`.
- **Plugins and the ecosystem** uses section 5 of this plan for the official, paid and community tiers (docs plan decision D8).
- The connect pages for Claude, ChatGPT, Claude Code and Codex point at the hosted MCP server, and the flowleap-mcp README gets the Codex row (T12). They belong to the paid data, not to the free app.
- **Places in the docs plan that the native-app rule changes** (flowleap-os `docs/plans/2026-11-01-open-source-docs.md` on 2026-11-01): "Paid data" (`FLOWLEAP_API_KEY` in `firm.env`) and the how-to "Add a paid plugin: enter the firm's FlowLeap key" become the administrator's plugin install (#176); the plugin index "from `registry.flowleap.co`" moves to a public location such as GitHub; decision D2 "publish the release images for free on `registry.flowleap.co`" becomes the public signed feed (#175); Appendix A "A FlowLeap key in the console" becomes "install the data plugin in the console".

## 7. Decisions of the founder (2026-11-01)

The founder accepted every recommendation of the first grilling round on 2026-11-01.

0. **Q0. PATSTAT permission. Decided (2026-11-01):** FlowLeap holds the EPO's clause 5.8 permission for commercial use.
1. **Q1. The desktop is the full local app, and #75 changes to this meaning.** **Decided: yes**.
2. **Q2. The trial is the 10-minute path** (Trial Model key and House keys through one sign-in). Decided yes, then **replaced by Q7** the same day.
3. **Q3. Models at launch.** OpenRouter connect and Anthropic or OpenAI keys (the trial model went with Q7); "use your Claude or ChatGPT plan" as FlowLeap inside the vendor apps through MCP; no "Sign in with Claude"; the Kino-style mode only after written vendor confirmation (section 3.2). **Decided: yes**.
4. **Q4. One License now, plans per plugin later.** **Decided: yes**, and decide the firm License (per seat or per firm) when the first firm asks.
5. **Q5. The new order (D0 and D1 before B and C).** **Decided: yes**, unless a pilot firm gives a start date.
6. **Q6. Apple and Microsoft signing accounts.** The founder buys the Apple Developer Program membership and applies for Windows signing (section 3.3). **Decided: yes**, start now, because the vendors' identity checks take days.
7. **Q7. The native-app rule. Decided (2026-11-01), replaces Q2:** "paid data should come from plugin store, they should install it in one click and when they install it they will be able to sign in; other than that the desktop app or any AI system should be native and not connected by any means to any backend". So the core desktop app has no "Sign in to FlowLeap", no trial model from FlowLeap and no call to a FlowLeap host; the first run uses the attorney's own model key. The FlowLeap sign-in exists only inside the data plugin (T2, #169). "Connect Claude and Codex" moves into the data plugin (T11, #174). The founder applied the same rule to the firm OS: the built-in FlowLeap MCP row and `FLOWLEAP_API_KEY` go away, and the administrator installs the same data plugin once for the firm with the firm token kept out of the attorneys' runtimes (#176); updates come from a public signed feed, not `registry.flowleap.co` with an update key, with trust from the image signature (#175, after #120).

## 8. Tickets

Each ticket is a GitHub issue; #75 lists them. Sizes: S up to 3 days, M about a week, L two weeks or more.

| # | Issue | Title | Repository | Size |
|---|---|---|---|---|
| T1 | #159 | Desktop product layer without the firm locks: move `fixedRoutes`, `lockedRefs`, the locked rows and `managed: true` out of `dsh-flowleap-web` into a firm layer that flowleap-os applies; the desktop keeps the routes but lets the attorney add a key and pick a model | flowleap-harness, flowleap-os | M |
| T2 | #169 | One-click FlowLeap data plugin from the plugin store, with its own sign-in (section 2). The core app calls no FlowLeap host; the plugin signs in through `https://api.flowleap.co/oauth/authorize` with a loopback redirect (new client `flowleap-desktop`), stores one `fl_pat_` token in the credential store, and calls the hosted MCP server over Streamable HTTP. Sign out or uninstall revokes the token. | flowleap-harness, flowleap-backend (client registration) | M |
| T3 | #170 | Model step: OpenRouter connect, Anthropic and OpenAI keys, Test; a `MISSING_CREDENTIAL` turn shows a card with the button instead of the developer text | flowleap-harness | M |
| T4 | #171 | First run in the desktop: the model step, the keyless first question, the office key wizard and the data plugin as later cards, the "Install FlowLeap" card hidden in the desktop; no FlowLeap sign-in and no trial model | flowleap-harness | S |
| T5 | #160 | Skills pack in the desktop: ship the flowleap-plugins pack as an application resource and point `FLOWLEAP_SKILLS_DIR` at it | flowleap-harness | S |
| T6 | #161 | Move #84, #70 and #79 into D0; fix the "DSH Local Build" title and the Plugins page that stays on its placeholder | flowleap-harness | S to M |
| T7 | #172 | A desktop verify script: start from source with an empty home, run the 10-minute path to the first answer (one minimal OpenRouter call, with the founder's permission), record the evidence | flowleap-harness | S |
| T8 | #166 | macOS signing and notarization on a GitHub-hosted runner with FlowLeap's Developer ID | flowleap-harness | M |
| T9 | #167 | Windows build and signing on a GitHub-hosted runner (section 3.3) | flowleap-harness | M |
| T10 | #173 | Update feed and download page: GitHub Releases of flowleap-harness as the generic feed, `updates.feedUrl` set, a download page on flowleap.co | flowleap-harness, flowleap-website-v2 | S to M |
| T11 | #174 | "Connect Claude and Codex", part of the data plugin after its sign-in: write the Claude Code, Codex and ChatGPT desktop settings for the hosted MCP server, open the Claude Desktop connector steps, show the connection state | flowleap-harness | M |
| T12 | #162 | Token page on the website dashboard (mint, list, revoke `fl_pat_`), the Codex row in the flowleap-mcp README, and the upgrade link in the MCP 402 (#539) | flowleap-website-v2, flowleap-mcp, flowleap-backend | S |
| T13 | #168 | Only after Q4: entitlements per plugin in the backend (Stripe products, an entitlement record, the tool gate) | flowleap-backend | L |
| T14 | #163 | Register watch as a hosted service and a paid plugin: daily EP and US register checks on the backend, an alert, shown in the desktop only after the attorney installs the plugin, and in any agent | flowleap-backend, flowleap-harness | M to L |
| T16 | #164 | Managed firm server, step 1: a script that creates one server in a cloud account (FlowLeap's or the firm's), runs the installer and records the firm in FlowLeap's operations list | flowleap-os | M |
| T17 | #165 | Support access that the firm's administrator opens for a limited time (ADR 0001 decision 15), so FlowLeap operates managed servers without a standing key | flowleap-os | M |
| none | #175 | Firm OS updates from a public signed feed (for example GitHub Releases and a public container registry), with no FlowLeap registry key; blocked by #120 | flowleap-os, flowleap-harness | M |
| none | #176 | Firm OS: the FlowLeap data plugin, installed once by the administrator for the whole firm; the firm token stays out of the attorneys' runtimes; blocked by #169 | flowleap-harness, flowleap-os | M |
