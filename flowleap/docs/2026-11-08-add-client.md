# Add client

**Status:** draft for the founder's approval, 2026-11-08, with the [mockups](mockups/add-client/README.md). Nothing is built. Add client is the step before [the client folder page](https://github.com/flowleap-ai/flowleap-harness/pull/358), and the first moment where the product shows that it already knows the firm. It serves step M1 of [the re-ordered roadmap](2026-11-08-roadmap-reorder.md).

## The problem

A new firm has an empty app. Demo loops 2 to 4 showed that public data already knows a lot about the firm: type "Syntegon", and the EP Register names the firm as the representative in 16 of the group's 272 EP applications. Today a script (`build-syntegon.mjs`) builds that client folder by hand. The firm needs one act that does it, with the firm's own decisions in it: which companies are the client, which role the company has, and whether there is a conflict.

## The flow

| Step | What the person does | What FlowLeap does |
|---|---|---|
| 1. Find | Types a company name in **Add client** (from the **Clients** list or ⌘K) | Sends only the name to the patent data plugin and shows the PATSTAT applicant names that match, with their application counts |
| 2. Confirm the group | Unticks a name that is not part of the client, then selects **Continue** | Treats the ticked names as the client group. The grouping is a proposal, never a legal fact |
| 3. See the matters | Reads "16 EP matters at your firm" and the list | Reads the group's EP applications from the EP Register and marks those whose representative of record matches the firm's identity. It shows the rest as a read-only reference list ("at other firms") and says what public data cannot show |
| 4. Conflict check | Reads the possible conflicts; for each, checks it and writes why, or cancels | Finds where a ticked name is the other side of an existing client: in the Firm Record parties, and as opponent or patent owner in an EP opposition |
| 5. Decide | Chooses the role (**Client**, **Watch**, **Other party**) in the decision bar and selects **Add client** `⇧⌘↵` | Records the decision with the person's name. **Client** is never blocked: zero EP matters is a valid client (a new client, DE work only, a recent transfer) |
| 6. Build | Waits, or leaves the page | Writes the records, makes the client folder (client → family → matter, with the firm's template folders), writes the public data as dated files with their source, and makes the folder a workspace |
| 7. Open | Selects **Open client folder** | Opens the client on the client folder page |

**Watch** records the company and its names on a Watch list and builds no folder; the Watch feature itself (new filings, oppositions, citations) comes later. **Other party** links the company to a matter of the firm with a role in it (opponent, licensee, other) and builds no folder. The role is the firm's decision; FlowLeap never takes it from the register.

## States

| State | What the page shows |
|---|---|
| Empty | What Add client does, and that only the name leaves the firm |
| Loading | Skeleton rows of the names list, after 150 ms, for at least 300 ms |
| Data plugin not reachable | "FlowLeap could not reach the patent data plugin. Nothing was searched and nothing was added." with **Try again** `R`. FlowLeap never invents names or matters; the person can add the client by name only |
| Data plugin not installed | Add the client by name only: the folder starts with the template folders |
| Already a client | Who added it and when. A second run adds only what is new (see [A second run](#a-second-run)) |
| Possible conflict | The evidence (patent, parties, dates, source) and a checkbox with a reason. **Add client** stays disabled until the person checks it |
| Zero matters | "No EP matters at your firm yet", why, and that the client can still be added |
| Build step failed | What failed and that everything else is done; **Try again** repeats only the missing work |

## Data sources and their limits

| Source | Gives | Limits |
|---|---|---|
| PATSTAT (FlowLeap patent data plugin) | Harmonized applicant names with their application counts at all offices | One edition (2026 Spring), so recent filings are missing. A harmonized name is a name match, not a legal entity: it can join two companies, or split one company that renamed or moved. Different PATSTAT tools count differently (`patstat_resolve` gives 567 for SYNTEGON TECHNOLOGY, the portfolio 600), so the page names the source of each number |
| EP Register (EPO OPS, through `flowleap-connectors`) | Each EP application of the group: applicants, representative of record and its date, status, opponents | Published applications only (the first 18 months are missing). The current representative only. EP only: no DPMA national matters, no validations. At most 100 rows a page and 10,000 a query. 47 of Syntegon's applications have no representative |
| EPO publication server | The A1/A2 text and PDF, claims, search report | A Euro-PCT EP publication has no text; the text is in the WO publication |

The firm's matters are the applications whose representative of record matches the **firm identity**: a typed setting with the firm's names, its current and earlier addresses, and the names of its representatives. FlowLeap matches it on the firm's computer against the register rows, so the firm identity never leaves the firm. A matter where the register still shows an address that is not in the setting is missed; the page says so and points to the setting.

## What Add client writes

**Into the Firm Record.** Today the record has no client, company, party or role record: a matter has a free-text `client`, and a matter needs the firm's `file_number`, which public data does not have. Add client needs these new record commands in flowleap-os. Each is a person's command through the proxy (a runtime gets `agent-cannot-decide`), sent with a deterministic `Idempotency-Key`.

| Command (proposal) | Payload | Idempotency key |
|---|---|---|
| `client/added` | client id, name, role (client, watch, other party) | `add-client:<client id>` |
| `client/name-linked` | client id, applicant name, source and edition | `add-client:<client id>:name:<name>` |
| `party/recorded` | party id, company name as the register writes it | `party:<normalized name>` |
| `client/application-recorded` | client id, EP application number, publication number, earliest priority, the firm as representative since | `add-client:<client id>:application:<number>` |
| `party/role-recorded` | application number, party id, role (applicant, opponent, patent owner, licensee, other) | `role:<number>:<party id>:<role>` |
| `client/conflict-checked` | client id, each hit with its source, the person's reason | `add-client:<client id>:conflict:<hits hash>` |

A payload holds only facts that do not change. A repeat with the same key and payload returns the first answer and appends nothing (`store.mjs`), so a second run cannot duplicate a fact.

**Only in the folder.** The register data, the publications, the claims, the search reports and the family members, as dated files; the reference list of the applications at other firms; and "About this folder". The folder plugin's source records keep, for each entry that Add client wrote, the source (EP Register, EPO publication server, PATSTAT), the time it was read, and for each folder its role (family or matter).

**A dated file.** Each file of public data starts with "As of 8 Nov 2026, 14:02, from the EP Register" and its name has the date (`EP Register 2026-11-08.md`). It is a copy, never presented as live data.

### A second run

Add client finds an existing client by its client id (from the **Clients** list) or by its linked names, and says so. It then adds only new names, new applications, new family and matter folders, and a new dated file where the data differs from the last dated file. It never replaces or deletes a file, a folder or a record. An application where the register no longer names the firm shows in the summary and is not removed.

## Reused parts

| Part | Package | Use |
|---|---|---|
| The Clients list and the client folder page | `ui-flowleap-folder` (PR 359) | The entry point, and the page where the flow ends |
| Workspace creation | `workspace`: `ctx.workspaceRegistry.create(path, title)` | Makes the client folder a workspace; a second call for the same path returns the same workspace. The folder must exist first |
| Fenced folder writes and source records | `ui-flowleap-folder` `folder.ts`, `sources.ts` | Make the folders and files inside the client folder, with the name rules and "a write never replaces a file" |
| EP Register reads | `flowleap-connectors` (`@flowleap/connectors`: `searchRegister`, `get_register_biblio`, `get_family`) | The group's applications, representatives, opponents and families |
| PATSTAT names | the `mcp-flowleap` row (`patstat_portfolio`, `patstat_resolve`) | The applicant names and their counts |
| Record commands | `ui-flowleap-records` `createRecordsApi` and its act runner | The person's commands with an `Idempotency-Key`, retried with the same key |
| A typed setting | `settings`: a plugin's `Config` schema becomes its settings form | The firm identity, the clients root folder and the folder template |
| The look | `ui-primitives`, the client theme, the [design language](../../.agents/skills/flowleap-design-language/SKILL.md) | The decision bar, the segmented control, lists, notices and the empty, loading and error states |

## New parts

All new code is FlowLeap plugin code; no harness core package changes.

- **`ui-flowleap-folder`: the Add client page and its Host routes.** The page and the build go into the folder plugin, because it is the one writer of the client folders and of their source records; a second package would be a second writer of the same JSON files. New Host routes: `find` (names), `review` (applications and conflicts), `build` (start or resume) and `build status`. New `Config` fields: `clientsRoot`, `folderTemplate` (default: client folder `00 Client`; matter folders `Associates`, `Client`, `Drafts`, `Internal`, `Office`, `Search`) and `firmIdentity`. New source kinds: `add-client` with its source and time, and the folder roles family and matter, which the folder page already reserves.
- **`flowleap-connectors`: a patent data Service for Host code.** A Service Definition `flowleapPatentData` with `findApplicantNames(name)`, `searchRegister(query, range)`, `registerRecord(application)` and `family(application)`. `flowleap-connectors` provides the register methods from its library. The PATSTAT method needs a Host-callable client of the paid data plugin; today PATSTAT is only a model-facing MCP tool. Until it has one, `findApplicantNames` answers from the applicant names of the register search, and the page names that source.
- **flowleap-os: the record commands above**, their tables, and their reads for the conflict check.

## Extension points to propose upstream

| Slot | Package | Why | Workaround until then |
|---|---|---|---|
| A job that a person's act owns, not a Session | `jobs` | `ctx.jobs` belongs to a Session; the build is a person's act on a page | The plugin's own `build status` route |

## Confidentiality

- The search sends only the company name, and then the group's applicant names, to the patent data plugin and the EP Register. It never sends the firm's identity, a file, or the name of another client. The firm's matters are found on the firm's computer.
- The conflict check reads the firm's own Firm Record on the firm's side. The register query for it sends only the group's names.
- The reference list names the town of the representative, never another firm.
- The PATSTAT attribution "This product contains data sourced from EPO databases, © European Patent Organisation" shows under every PATSTAT number.

## Open questions for the founder

1. **Matters without a file number.** The record's `matter/opened` needs the firm's file number. Add client records each application (`client/application-recorded`) and leaves the matter to open when a person or the docket import gives the file number. Or should Add client make file numbers by a firm pattern?
2. **Who records a conflict decision?** Any attorney with a reason, as drawn, or only a partner, or a second person?
3. **Where is the Watch list** until the Watch feature exists: a **Watch** section in the **Clients** list?
4. **Firm identity.** A plugin setting now, as proposed, or the firm settings of the Firm Record?
5. **"This is ours."** Demo loop 3 let a person mark a row of the reference list as the firm's matter, for a transfer that the register does not show yet. Keep it for the build?
6. **Refresh.** A **Check for new matters** act on the client folder page, which runs a second Add client, or only Add client from the Clients list?
7. **Grouping and keys.** The matters list groups by **At your firm** and **At other firms** (an exception to product rule 1), and Add client has no key of its own ([mockups](mockups/add-client/README.md#founder-decisions-needed)).
