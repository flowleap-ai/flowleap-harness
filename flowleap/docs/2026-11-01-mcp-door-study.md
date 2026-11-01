# MCP door: one-click connection from Claude and ChatGPT

Status: a study for the founder. It proposes eight tickets (section 9). No ticket exists until the founder approves it. It refines [ADR 0001](adr/0001-self-hosted-firm-os.md) decisions 14, 19 and 25 and ticket #77. It does not change roadmap decision 3 (the MCP door comes after phase C); section 8 asks the founder about it.

**The goal.** An attorney uses the firm's FlowLeap tools from their own AI agent: Claude Desktop, the ChatGPT desktop app, Claude Code or Codex. The connection takes one click or one command, as in Kino. The firm host stays self-hosted and reachable only from the firm network (the tailnet). Each tool call runs as a known attorney, and the firm sees which agent called what.

**The answer in short.** Claude Code, Codex and the ChatGPT desktop app call an MCP server from the attorney's Mac, so they reach the firm address over the tailnet with one command. Claude Desktop custom connectors call from Anthropic's cloud, and Anthropic refuses tailnet addresses, so Claude Desktop needs a local bundle (`.mcpb`) that forwards to the firm host. A web page cannot write the agents' configuration files, so a true one click on the Mac (Kino's way) needs a local FlowLeap app, which is the thin desktop client (#75). ChatGPT web and the phone apps need a vendor tunnel; that is a later firm decision.

## 1. Sources and method

Vendor facts come from vendor documentation fetched on 2026-11-01. The full notes, with one source for each sentence, are in the session notes of 2026-11-01 (`2026-11-01-mcp-door-vendor-research.md`, outside the repository). I read two key pages again myself: the Claude connector troubleshooting page (the private address refusal) and the Kino agents page. A fact that came only from a search summary is marked "(search)"; help.openai.com refused the fetch (HTTP 403).

FlowLeap facts come from this repository (`flowleap/docs/`, `packages/host/flowleap-connectors/`, `packages/mcp/`), from `flowleap-os` (`lib/starter.mjs`, `lib/signin.py`, `docs/browser-only-access.md`, `docs/security-invariants.md`, `README.md`), from `flowleap-mcp/README.md` and from `flowleap-backend` (`src/lib/mcp-oauth.ts`, `src/routes/well-known.ts`).

## 2. The Kino reference

Kino's desktop app runs an MCP server on the Mac at `http://127.0.0.1:45680/mcp` ([Kino docs](https://kino.ai/docs/working-with-agents)). For Claude Desktop and ChatGPT the user clicks "Set up in Kino" in Kino's Settings > MCP, on a Mac. For Claude Code and Codex the page gives one command each:

```sh
claude mcp add kino --transport http http://127.0.0.1:45680/mcp --scope user
codex mcp add kino --url http://127.0.0.1:45680/mcp
```

The agent connects through the Kino app, so the app must stay open, and "Installing the MCP connection alone does not sign Kino in". The public docs do not describe the green check or the "last talked to" line; the founder saw them in the app.

Kino is one click for three reasons. The server is on the same Mac (a loopback address, so no network or sign-in question). A native app can write the agents' configuration files. The user already signed in to the Kino app, so the MCP connection needs no OAuth. FlowLeap has none of the three today: the server is on the firm host, attorneys use a browser, and the sign-in is Entra.

## 3. How each agent reaches an MCP server

| Agent | Where the call starts | Can it reach the tailnet address? | How to add a server | Sign-in |
|---|---|---|---|---|
| Claude Code | The attorney's machine: "the CLI and `curl` connect from your machine, while claude.ai connects from Anthropic's servers" ([troubleshooting](https://claude.com/docs/connectors/building/troubleshooting.md)) | Yes | `claude mcp add --transport http <name> <url> --scope user` ([Claude Code MCP](https://code.claude.com/docs/en/mcp)) | OAuth through `/mcp`; Claude Code has its own client metadata document and a loopback redirect ([authentication](https://claude.com/docs/connectors/building/authentication.md)) |
| Codex CLI | The attorney's machine | Yes | `codex mcp add <name> --url <url>`, or a `[mcp_servers.<name>]` block in `~/.codex/config.toml` ([Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)) | `codex mcp login <name>`, loopback redirect |
| ChatGPT desktop app | The attorney's machine; it reads the same `~/.codex/config.toml` and accepts STDIO and Streamable HTTP servers ([ChatGPT app MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=app)) | Yes | Settings > MCP servers > Add server, or the shared file | As Codex |
| Claude Desktop, custom connector | Anthropic's cloud, "across every Claude client, including claude.ai, Claude Desktop, Cowork, and the mobile apps" ([custom connectors](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)) | **No.** Claude refuses a host name that resolves to `100.64.0.0/10` (the Tailscale range) or a private address, before any request leaves Anthropic ([troubleshooting](https://claude.com/docs/connectors/building/troubleshooting.md)) | Settings > Connectors; on Team, an owner adds it and members connect | OAuth with DCR, CIMD or a client ID the customer registered |
| Claude Desktop, MCP bundle (`.mcpb`) | The attorney's Mac: the bundle runs a local server (`node`, `python`, `binary` or `uv`) ([MCPB manifest](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md)) | Yes, through a local bridge in the bundle. Anthropic names desktop extensions "secure proxies to internal MCP servers" ([enterprise extensions](https://support.claude.com/en/articles/12702546-deploying-enterprise-grade-mcp-servers-with-desktop-extensions)) | Double-click the file, or a Team or Enterprise owner uploads it to the desktop extension allowlist and members install it ([allowlist](https://support.claude.com/en/articles/12592343-enabling-and-using-the-desktop-extension-allowlist)) | The bridge does the OAuth; a `sensitive` setting goes to the macOS keychain |
| ChatGPT web and phone | OpenAI's servers; a public HTTPS endpoint or the Secure MCP Tunnel ([connect ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt)) | Only through the tunnel | chatgpt.com/plugins, "Add custom MCP server"; Business: admins and owners, Enterprise and Edu: by role (search) | CIMD, DCR or a static client ([Apps SDK auth](https://developers.openai.com/apps-sdk/build/auth)) |
| Claude web and phone | Anthropic's cloud | Only through Anthropic's MCP tunnels: a research preview, Claude Enterprise only, by request, at most 10 per organization ([MCP tunnels](https://claude.com/docs/connectors/mcp-tunnels/overview)) | Organization settings > Tunnels, then a connector | As a custom connector, with a "Tunnel OAuth configuration" |

I found no documented `chatgpt://` link that installs an MCP server, and no link that installs a Claude Desktop connector. An `.mcpb` file is the only one-click artifact for Claude Desktop.

### 3.1 What this means for FlowLeap

1. **Claude Code, Codex and the ChatGPT desktop app work with what exists.** The firm address `https://<name>.<tailnet>.ts.net/` has a real certificate from `tailscale serve`, and the attorney's Mac is on the tailnet. The connection is one command or one pasted URL.
2. **Claude Desktop needs a FlowLeap bundle.** A custom connector cannot reach the firm host. A public endpoint that allows Anthropic's range `160.79.104.0/21` would work, but it breaks "reachable only from the firm network" (ADR 0001 decision 19 keeps a public endpoint as the firm's own later choice).
3. **The ChatGPT one click is a copy, not a click.** No vendor link installs a server. Kino can click because its native app writes the files. In the browser, FlowLeap gives the command or the URL to paste. With the thin desktop client (#75), FlowLeap can write `~/.codex/config.toml` and install the bundle, as Kino does.
4. **Web and phone wait.** Both vendor tunnels need an Enterprise or Edu workspace, run an outbound agent on the firm host, and add a subprocessor (Cloudflare for Anthropic). This is a firm decision after the local paths work.
5. **The browser-only recipe changes nothing here.** A firm on browser-only access (`flowleap-os/docs/browser-only-access.md`) has Cloudflare Access or Entra Application Proxy in front of the host. Those gateways expect a browser sign-in, so an agent's MCP request is refused there. Such a firm has no MCP door in version 1.

## 4. Sign-in: the MCP door's own authorization server

An MCP client needs protected-resource metadata (RFC 9728), authorization-server metadata with PKCE S256, and a way to register itself: a pre-registered client, a client ID metadata document (CIMD), or dynamic client registration (DCR). The 2025-11-25 specification makes CIMD a SHOULD and DCR a MAY ([authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)).

Microsoft Entra has no DCR: "DCR isn't available for an MCP server that's protected by Microsoft Entra ID" ([Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication-dynamic-client-registration)). Microsoft's EnterpriseMCP README puts CIMD "in a future release" ([EnterpriseMCP](https://github.com/microsoft/EnterpriseMCP/blob/main/README.md)). The firm's sign-in proxy (oauth2-proxy, `lib/signin.py`) is a browser cookie gate, not an authorization server.

This confirms ADR 0001 decision 19. The control plane runs its own authorization server for the MCP door. It accepts CIMD and rate-limited DCR, requires PKCE S256, signs the attorney in through Entra (single sign-on, so usually no password), and shows the consent page. It issues its own short access tokens with the firm's MCP address as the audience; it never passes an Entra token to a runtime (the specification forbids token passthrough).

Three details from the research change the design:

- **CIMD needs one outbound fetch.** The firm host must read the client's metadata document, for example `https://claude.ai/oauth/claude-code-client-metadata` for Claude Code. The web gate (#33) must allow these fetches, or the door must offer DCR only.
- **The routes skip the cookie gate.** `/mcp`, `/.well-known/oauth-protected-resource/mcp` and the token endpoint take Bearer tokens or no credentials, so the sign-in proxy lets them through to the door. The authorize endpoint and the consent page stay behind the Entra sign-in.
- **The FlowLeap backend already has the resource half.** `flowleap-backend` serves RFC 9728 metadata and the Bearer challenge for the hosted `/mcp` (`src/lib/mcp-oauth.ts`, `src/routes/well-known.ts`); its authorization server is Clerk. The door can copy the metadata and challenge code; the authorization server is new.

A per-attorney personal token (as the hosted server offers to clients without OAuth) is simpler, but the attorney must copy a long-lived secret into a file. I recommend OAuth for every client and no token page.

## 5. Connected, and the last connection, per agent

The unit is a **connection**: one OAuth client registration with one grant, for one attorney. "Claude Code on the MacBook" and "Codex on the MacBook" are two connections. The door keeps a record for each:

| Field | Source | Trust |
|---|---|---|
| Attorney | The Entra object ID at consent | Verified |
| Agent | The client's `client_name` from CIMD or DCR, and the CIMD URL host (for example `claude.ai`) | Verified for CIMD (the URL is the client ID); claimed for DCR |
| Agent version | `clientInfo` in `initialize`, for example Codex sends `codex-mcp-client` ([Codex source](https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/rmcp_client.rs)) | A hint only; the specification does not verify it |
| Tools and level | The consent page: chosen tools, read-only or read and write (decision 25) | Verified |
| Connected at, last call at, calls this month | The door, on each request | Verified |
| State | Active, revoked by the attorney, revoked by suspension | Verified |

The attorney sees a "Connected agents" list in the FlowLeap web app: a green check for an active connection, "last call 2 days ago through Codex", and Revoke. The administrator sees the count and the last call for each attorney in the console (#34), and "Revoke all" comes with suspension. Every request checks the connection, the user and the suspension again, so a revocation works at once (decision 19).

## 6. The first tools, and the log of each call

### 6.1 Which tools first

| Group | Tools | Where they run | Risk | Data that leaves the firm |
|---|---|---|---|---|
| 1. Patent data | The connector library's read tools: `search_patents`, `get_bibliography`, `get_claims`, `get_legal_status`, `get_family`, `get_us_application`, `get_continuity` and the rest of the 34 (`packages/host/flowleap-connectors/`) | The attorney's runtime, with the firm's office keys | read | The query and the public patent data. A search query can describe an unfiled invention, so it is client-confidential. |
| 2. The attorney's own work | List and read the attorney's deliverables (reports, office action work pages) | The attorney's runtime | read | Client work product |
| 3. Cases | List cases, read a case and its documents | Knowledge v1 | read | Client files |

Group 1 first, because it exists today and its results are public data. Group 2 next. Group 3 waits for Knowledge v1 (phase D), because the firm has no case store yet. No write tool in version 1 (decision 25 already keeps destructive tools out; this study proposes read-only only until the audit trail runs).

The door forwards each call to the attorney's own runtime, through the starter (`lib/starter.mjs`), which wakes a sleeping runtime. So the call uses the firm's keys without moving them, the spend counts under the attorney, and the door holds no office key. The runtime needs a new plugin that serves an MCP endpoint over its tools, filtered by risk level. The harness has an MCP client (`packages/mcp/`) and no MCP server today, and no tool declares a risk level yet.

### 6.2 What the firm can log, and what it cannot

The repository rule is "model-visible ⟺ logged". At the MCP door the model is outside the firm. The rule holds for what FlowLeap sends: every byte that FlowLeap gives to an outside model is a tool result, and FlowLeap logs it.

The firm logs, for each call:

- In the attorney's runtime: the connection, the tool, the arguments and the full result, in a session of kind "outside agent" that the attorney can open, like a chat. It is attorney-private, as chats are.
- In the firm audit trail (#35): the attorney, the connection, the tool, the time and a keyed digest (HMAC) of the arguments, as ADR 0001 decision 14 says. No content.

The firm cannot log, and the console must say so:

- The attorney's prompt, the model's reasoning and its final answer.
- Files, text or other connectors that the attorney adds in the outside agent.
- What the vendor keeps, and for how long. That is the vendor's plan and its retention.

## 7. Data rules: the business plans

| Vendor and plan | Training on firm data | Source |
|---|---|---|
| Claude Team, Enterprise, API | Not by default: "we will not use your inputs or outputs from our commercial products" to train. Exception: feedback (thumbs up or down), which owners can turn off. | [Anthropic privacy](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training) |
| Claude Free, Pro, Max | The user chooses since 2025-08-28; on: 5 years of retention, off: 30 days | [consumer terms](https://www.anthropic.com/news/updates-to-our-consumer-terms) |
| ChatGPT Business, Enterprise, Edu | Not by default (search) | help.openai.com (search; 403) |
| ChatGPT Free, Plus, Pro | A user setting (not checked on a fetched page) | none |

A tool result enters the outside chat, so the vendor keeps it with that chat (inference; neither vendor names a separate rule).

FlowLeap cannot see which plan an attorney's agent uses. The design states the rule and makes the attorney confirm it; it does not claim to enforce it. Proposed text:

- **Console, MCP door section (administrator):** "Outside agents send FlowLeap results to Anthropic or OpenAI. Allow only firm business seats: Claude Team or Enterprise, or ChatGPT Business or Enterprise. On these plans the vendor does not train on your data by default. FlowLeap logs every tool call and its result. FlowLeap cannot see the prompts, the answers or the other tools of the outside agent."
- **Consent page (attorney):** "I use this connection only with my firm's business seat. Results from FlowLeap go to the vendor of this agent and stay in its chat history." The attorney ticks it once for each connection.

The MCP door is off by default. The administrator turns it on.

## 8. Recommendation and open decisions

Build the MCP door in this order: the authorization server and the runtime endpoint (tickets 1 to 3), then the attorney's page with the Claude Code, Codex and ChatGPT desktop commands (ticket 4), then the Claude Desktop bundle (ticket 5). This gives four agents through one door with no public endpoint. True one click on the Mac comes with the thin desktop client (ticket 7). The vendor tunnels stay a firm choice (ticket 8).

Open decisions for the founder:

1. **The order (roadmap decision 3).** The MCP door comes after phase C because the web gate (#33) and the audit trail (#35) come first. The research supports this: even a patent search query is client-confidential. Recommendation: keep decision 3 for turning the door on at a firm. Tickets 3 (risk levels) and 6 (the console text) can start in phase C, because the web gate and the audit trail need the risk levels too.
2. **OAuth only, no personal tokens.** Recommendation: yes.
3. **Read-only only in version 1.** Recommendation: yes; write tools after the audit trail has run on a pilot firm.
4. **The Claude Desktop bundle through the Team allowlist.** A firm on Claude Team or Enterprise can put the bundle on its allowlist, so attorneys install it from Claude itself. Recommendation: the release pipeline builds one bundle per release, and the page shows the allowlist steps to the administrator.

## 9. Proposed tickets

These split #77 into children. The labels follow the repository's taxonomy.

1. **MCP door authorization server (flowleap-os).** OAuth 2.1 server in the control plane: RFC 9728 metadata at the firm address, CIMD and rate-limited DCR, PKCE S256, Entra sign-in upstream, consent page (tools, read-only, the data statement), short audience-bound tokens, a connection record (section 5), revocation, and suspension revokes all. The sign-in proxy lets `/mcp` and the token routes through. Acceptance: Claude Code on the founder's Mac connects to the test firm with one `claude mcp add` command, the attorney consents, and a revoke stops the next call.
2. **Runtime MCP endpoint (harness).** A plugin that serves the runtime's tools over Streamable HTTP to the door only (the starter secret), lists only tools that the connection allows, and logs each call and result in an "outside agent" session. Acceptance: a `search_patents` call from Codex appears in the attorney's session list with its arguments and result; a hidden tool answers "unknown tool".
3. **Tool risk levels (harness; ADR 0001 decision 25).** Every tool declares read, write or destructive; a tool without a level counts as write. Proves the invariant `mcp.read-only-no-write-tool`.
4. **"Connected agents" page (harness web app).** For each agent: the command or URL to copy (Claude Code, Codex, ChatGPT desktop), the bundle download (Claude Desktop), and the connection list with the green check, the last call and Revoke. Locale-owned copy.
5. **Claude Desktop bundle (release pipeline).** A `node` `.mcpb` with a stdio to Streamable HTTP bridge that does the OAuth flow with a loopback redirect, with the firm address as its only setting. Signed. Acceptance: double-click on a Mac, Entra sign-in, and a patent tool runs in Claude Desktop.
6. **MCP door in the admin console (flowleap-os, part of #34).** The switch (off by default), the data statement of section 7, the connections per attorney with "Revoke all", and the audit records with #35.
7. **One click from the thin desktop client (add to #75).** The client writes the Claude Code, Codex and ChatGPT desktop configuration and opens the bundle, as Kino does; it shows the connection state from the door.
8. **Vendor tunnels for web and phone (later, firm decision).** ChatGPT Secure MCP Tunnel and Claude MCP tunnels, each with its subprocessor note and its plan requirement. Start only when a pilot firm asks.
