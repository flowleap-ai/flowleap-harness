---
description: "The Clients row in the FlowLeap sidebar (German Mandanten), Add client, and the client folder page: a client's workspace folder with no chat, its files in the middle, new folders, uploads, rename, move, Move to Trash and Restore, a search by name, and Ask about this; writes stay inside the client folder and never replace or delete an entry."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-flowleap-folder

## Summary

An attorney sees a **Clients** row in the `flowleap-web` sidebar (German **Mandanten**) that lists the client folders, the workspaces in `clientsRoot`. **Add client** finds a company's EP matters at your firm in the EP Register, records the person's decision in the Firm Record, and builds the client folder. A client folder opens with no chat, with folders, uploads, rename, move, Trash, find by name and **Ask about this**. In **Settings > Firm identity**, a firm administrator sets the firm's names, addresses and representatives; every other person sees them read-only. The designs are in [the client folder page](../../../flowleap/docs/2026-11-08-client-folder-page.md) and [Add client](https://github.com/flowleap-ai/flowleap-harness/pull/361).

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the row with its Host half and its browser half; the `flowleap-web` bundle does:

```yaml
- id: ui-flowleap-folder
  name: '@deepseek-ai/dsh-client-ui-flowleap-folder'
  config:
    stateDir: !!js dshHomePath('flowleap-folder')
    storageLowFlagPath: /run/flowleap/host/disk-low
    clientsRoot: !!js dshHomePath('clients')
```

| Field | Default | Meaning |
|---|---|---|
| `stateDir` | required | The plugin's state folder; the source records go into its `sources/` folder and the Trash origins into its `trash/` folder, one JSON file for each workspace; the Add client build statuses go into its `builds/` folder, one JSON file for each client; the firm docket goes into `docket.json` and its read again into `docket.refresh.json`, the opponent index into `opponents.json` and its read again into `opponents.refresh.json`, and the firm identity that a firm administrator saves goes into `identity.json` |
| `clientsRoot` | required | The absolute folder that holds the client folders that Add client builds; every Add client write stays in it. The Clients list shows only the workspaces whose folder is directly in it |
| `folderTemplate` | `client: [00 Client]`, `matter: [Associates, Client, Drafts, Internal, Office, Search]`, `publicData: Office` | The folders that Add client makes in each client folder and each matter folder, and the matter folder that takes the dated files; a name that is not a valid folder name, a repeated name, or a `publicData` that is not a matter folder stops the row at load |
| `firmIdentity` | empty lists | The firm's `names`, its current and earlier `addresses` (one line each), and the names of its `representatives`, until a firm administrator saves them in [Settings > Firm identity](#the-firm-identity); the saved identity then wins, and a later change of this value has no effect. The Host matches them against the representatives of record. The [firm docket](#the-firm-docket) sends their words to the EP Register, never together with a client name. While it is empty, no matter is at your firm |
| `maxRegisterRows` | `500` | The row cap of one EP Register query of Add client (at most 10,000, the EPO's cap); the page says when the cap cut a read. The EPO answers a page of 100 rows in about 15 s, so 500 rows take more than a minute |
| `docketRefreshAge` | `604800000` (7 days) | The age in milliseconds after which the firm docket and the opponent index are `stale`; the scheduled refresh then reads them again |
| `docketCheckAge` | `86400000` (1 day) | The age in milliseconds over which **Check for new matters** reads the firm docket again first; a later change uses it |
| `registerSliceRows` | `2000` | The most rows of one date slice of the firm docket, the opponent index and the `op=` reads of the conflict check, 1 to 2,000: the EPO reads no row after row 2,000 of one query (`CLIENT.InvalidQuery`) |
| `opsRequestsPerMinute` | `20` | The most EPO OPS requests in any minute of all EP Register reads of this plugin together: the docket, the opponent index, Add client and the build. In its `X-Throttling-Control` header, OPS gives `search=green:30`, 30 search requests a minute, when it is not busy; 20 leaves a third of that for the agent's own patent tools on the same key. A live read measures it |
| `maxEntries` | `2000` | Cap on the entries of one listing; the rest is dropped and the listing says it is cut |
| `maxUploadBytes` | `209715200` (200 MiB) | Inclusive byte cap of one uploaded file |
| `maxSearchHits` | `200` | Cap on the hits of one search by name; the page says when the cap dropped hits |
| `storageLowFlagPath` | `''` | A file whose presence means the Host disk is low; while it exists, uploads are refused. Empty: no check |

### The page

The Clients list is a table (the `DataTable` of `ui-primitives`) with the client and the date it was added, sorted by client, with **Find a client** and 25 rows a page; a client opens on a click or on Enter. When an act removes the control that has the focus, such as a client of the Clients list, the page takes the focus, so its keys keep working. The top bar shows the location (Clients, the client, `…` for the folders between, the folder, the file), the search field `/`, **New folder** `⇧N`, **Upload files** `U` and the one primary action, **Ask about this** `A`. The tree has a resize handle on its right edge with the limits of the app sidebar (264 to 420 px); the browser keeps the width for each person. The list groups by **Folders** and **Files** (the founder's approved exception to product rule 1) and sorts by name. A row has a checkbox; with rows checked, a bulk bar at the bottom offers **Move to Trash** `Backspace` (or **Restore** in Trash), **Move to…** `⇧M` and **Ask about these N**. A right-click on a row opens Open, Ask about this, Rename `F2`, Move to…, Copy path and Move to Trash or Restore. Rows do not select page text. Files dropped on the middle area go into the listed folder. The page lays out by its own width, which is the window less the app sidebar, so the top bar never goes past the page and the tree never goes under the app sidebar. At 1080 px or less, the keycaps of the top bar go and New folder, Upload files and Check for new matters show only their icons, with the name in a tooltip; in a language with longer labels, a label that still does not fit is cut, and the tooltip shows it whole. At 720 px or less, such as on a phone or beside an open app sidebar in an 800 px window, the tree opens from the top bar.

### Files in the middle

The page shows a file with its own viewers: a PDF or an image in the browser's viewer through a `blob:` URL, Markdown with `MarkdownText`, text as text, Word and PowerPoint through the Host's PDF conversion (`remote.officeToPdf`), a sheet (`.xlsx`, `.xls`, `.csv`) read-only with SheetJS, one table for each sheet with sheet tabs and the first 1000 rows and 50 columns (a date in the page's language, English in the European order such as 01/12/2026; a number as the sheet's own format writes it; text and every CSV value as written), and mail (`.eml`) with `postal-mime`, its subject, sender, receivers, plain text and the date in the sender's own zone. Any other kind says that FlowLeap has no preview for it yet. SheetJS loads only when a sheet opens. The browser's PDF viewer shows the file's name as the title, also for a converted Word or PowerPoint file: the page adds the title to the PDF's information dictionary by an incremental update, except for a PDF with a cross-reference stream or encryption.

### Writes

Every write goes through the Host half, never from the browser to disk. A path is relative to the client folder; the Host refuses an absolute path, a `.` or `..` part, a link as the final part, and a target whose real path is outside the client folder. A name has no `/`, `\` or NUL, no space at the start or end, at most 255 UTF-8 bytes, and is not a reserved Windows device name. No write replaces an entry: a new folder or a rename onto a taken name is refused, and an upload is written to a hidden file and then hard-linked to its name, which fails when the name is taken. The page then offers **Keep both** (the macOS form `name 2.ext`) or **Skip**. A move stays inside one client folder. No route deletes an entry.

### Trash

**Move to Trash** moves an entry into the `Trash` folder at the client folder root, which the Host makes when it is missing, and records where the entry came from; a name that Trash already has gets the free form `name 2.ext`. In Trash, each row shows **From** its folder, and **Restore** moves it back, makes the folders on the way again, and keeps both on a taken name. Only Move to Trash puts entries into Trash: the Host refuses a new folder, an upload or a plain move into it, and a rename or move of Trash itself. Nothing in Trash is deleted; a person empties it outside FlowLeap.

### Search

The search field finds files and folders by name over the whole client folder: every word of the query must be in the name, case and accents aside. The hits show each name with its folder; the arrow keys move, Enter opens, and Esc clears. Hidden entries, links and Trash are left out. A search inside the files' text comes later, as the first part of the Knowledge Pool.

### Sources

For each folder made and each file uploaded on the page, the Host records the act and its time; a rename or a move carries the record of the entry and of everything below it. The list shows **Made here**, **Uploaded**, or **Not recorded** for an entry this plugin did not write.

### Add client

**Add client** on the Clients list opens the Add client view of the page. The person types a company name; the Host sends only that name to the EP Register through the `flowleapPatentData` Service of [`dsh-flowleap-connectors`](../../host/flowleap-connectors/README.md) and shows the applicant names that hold every word of it, with their count of EP applications; spellings that differ only in case or punctuation are one row. The source line names the EP Register: PATSTAT is a model-facing MCP tool and has no Host-callable client yet. The person unticks a name that is not part of the client and selects **Continue**. The review reads the group's EP applications and groups them by **At your firm** (the representative of record matches `firmIdentity`) and **At other firms** (for reference, with the town of the representative, never its name; **This is ours** claims a row). The conflict check shows where a name of the group is on the other side of a client of your firm: in the Firm Record parties, and as patent owner or opponent in an EP opposition (see [the conflict check](#the-conflict-check)). When a half of the check is not complete, the page says that the check can be incomplete. With a possible conflict, **Add client** stays disabled until the person ticks that they checked it and writes why; the Firm Record lets only an attorney record that decision. By name only, FlowLeap reads no EP opposition: the page says so, and **Add client** stays disabled until the person ticks **I checked conflicts myself** and writes how; the reason goes with the conflict check. **Add client** also stays disabled for a client name that no folder can have, such as `CON`, before anything is recorded. The decision bar holds the role (**Client**, **Watch**, **Other party**) and the one primary act, which runs on the keycaps of the Matters panel's Record the decision (`⇧⌘↵`); **Try again** is `R`. Add client has no key of its own.

The browser sends the decision to the Firm Record with the person's cookie, under the records link of `api/flowleap/records-link`, in the contract order: the conflict check, the client, its names, then for each application its parties, the application and the applicant roles. Each command has a deterministic `Idempotency-Key`, so a retry or a second run sends only what is missing; two names with one name key go as one command. A publication number without its kind code and a title that is blank or over 1,000 characters stay out of a command, as the contract asks. A refusal of the Firm Record shows its own sentence, also `invalid-body` and `idempotency-key-reused` (the key names a step that the Firm Record has with other details). **Client** then starts the build; **Watch** records the company and its names on the **Watching** list below the clients; **Other party** links the company to a matter of your firm with its role. The page copy is in the `flowleapAddClient` namespace.

The build is a job of this plugin, not of a Session: `POST build` starts it and answers at once, the job goes on after the request ends, and `GET status` reports each step, so the person can leave the page and come back; the Clients list shows a running build on its client. The build makes `clientsRoot/<client folder>` and its workspace (`workspaceRegistry.create`); the client folder name is the client name with each `/`, `\` or NUL as `-` (`Novo Nordisk A/S` has the folder `Novo Nordisk A-S`), and the Firm Record and `About this folder.md` keep the name itself. A link or a file at the client folder, or where a family or matter folder of an earlier build was, is refused, so no write goes through a link. The build then makes the `folderTemplate.client` folders and `About this folder.md`, then for each application a family folder (one for each EP family, named by the application number of its first matter and at most 40 characters of the title in sentence case, cut at a word, such as `EP 23 171 862 Method and apparatus for producing…`) with a matter folder (`EP 23 171 862`) and the `folderTemplate.matter` folders. In the `publicData` folder of each matter it writes `EP Register YYYY-MM-DD.md` and, for a publication with text, `Publication EP 4 292 805 YYYY-MM-DD.md` with the title, the abstract and the claims (for a Euro-PCT publication, which has no text of its own at the EPO, those of the WO publication of the same international application, which the file names); at the client folder root it writes `Reference - at other firms YYYY-MM-DD.md`. Each dated file starts with "As of …, from …" and is a copy that never changes. No write replaces a file or a folder. A second run (**Check for new matters** on the client folder page, or Add client for an existing client) finds the family and matter folders by their source records, also after a person moved them, leaves a matter in Trash there, makes a new family folder for a new matter of a family whose folder is in Trash, and writes a new dated file only where the data differs from the last one. A failed item shows in its step, and **Try again** runs the build again, which adds only what is missing. A `build` request for a client whose build runs makes that build run once more when it ends, with the names and applications of both requests; the status says `running` until the last run ends. A Host stop ends a running build; its status then says `interrupted`. The status counts what the build made (`added`: the client folder, new family and matter folders, new dated files), so the page says "Syntegon added: 16 matters in 14 families" after a first build, "Syntegon updated: 1 new matter, 3 new dated files" after a second run that found something, and "Nothing changed for Syntegon" after one that found nothing. A status file without these counts, from an earlier version, reads as a build that made nothing, so its client keeps **Check for new matters**.

The list shows the source **Add client** for each entry that Add client wrote, and the kind **Family** or **Matter** for its family and matter folders.

### The firm docket

The firm docket is every EP application where the EP Register names your firm as the representative now. The Host reads it through the `flowleapPatentData` Service from the time the plugin loads with a `firmIdentity`, not at the first Add client, so the firm's queries and a client's queries do not go out in the same minutes. The docket and the [opponent index](#the-conflict-check) read one after the other: the index waits while the docket reads, at its first read and at each read again, and the docket waits while the index reads; one turn order of the plugin instance orders them, in the order of their requests. So the firm's names and the names of its clients never go out together. It sends one `re=` query for each firm name, each address and each representative: names and addresses as their words without `&` and punctuation (`re="Muster Partner"` for `Muster & Partner`), representatives surname first (`re="Becker, Anna"` for `Anna Becker`). No query holds a client name. `re=` finds the words anywhere in a representative's name and address lines, so it also finds other firms: the Host keeps a row only when a representative of record matches `firmIdentity`, and marks a row that matches only by a firm address as matched by address only, because two firms can share an address. A firm name in the address lines of a person counts as a match by name.

A query over `registerSliceRows` rows splits by its EP publication date (`pd`): into the years from 1978, a year into its months, a month into two halves of its days, until each slice has at most `registerSliceRows` rows. The Host reads each slice in pages of 100 rows. A slice that is still over the limit on one day fails with its query in the Host log. The rows of the slices of a query must sum to the count of the query; at the EPO's count cap of 10,000, they must be at least 10,000. A docket with a wrong sum is `partial` and names the missing count. The docket keeps one row for each application, the time of each slice, and the identity that it was read for, in `docket.json`; another identity drops the rows at load, and an empty identity removes the file.

`GET add-client/docket` answers the state: `no_identity`, `reading` and `interrupted` with the slices done, the slices known and the rows read, `ready` and `stale` with the rows and the time of the oldest slice, `partial` with the failed slices and the wrong sums, and `failed` with the reason. A `failed` docket never means that the firm has no matters. `POST add-client/docket/read` with `{ "slices": "all" }` reads every slice again; `{ "slices": "failed" }` reads only the failed slices and the queries whose sum was wrong. A Host stop leaves the docket `interrupted`, and the next start reads only the unread slices. A scheduled refresh reads the whole docket again when the oldest slice of its latest read is older than `docketRefreshAge`.

A read again of a complete docket (every slice read and every sum right), by the scheduled refresh or by `{ "slices": "all" }`, goes into `docket.refresh.json`, and the complete docket stays the served docket: the state stays `ready` or `stale` with its rows and its time, and gets `refresh` with the state of the read again. `refresh` is `reading` or `interrupted` with its progress, or `failed` with the failed slices and the wrong sums when the read again ended partial or failed; its rows are then not used, and `{ "slices": "failed" }` reads only its failed slices. A read again that ends complete takes the place of the served docket at once, and `refresh` goes. A Host stop during a read again keeps the complete docket on disk, and the next start reads only the unread slices of the read again. A docket that never ended complete is read again in its place, as a first read. A new identity drops the docket and its read again at once. Every EP Register read of this plugin waits for its turn in one limiter of `opsRequestsPerMinute`.

### The conflict check

The EP Register half of the conflict check has two halves, and the review answer says for each whether it is `complete`. **The group opposed a client of your firm**: the Host sends `op=` queries for the group's names only, four names in each query, as their words without `&` and punctuation; a query over `registerSliceRows` rows splits into date slices as the [firm docket](#the-firm-docket) does, and the half is complete when every slice is read and the slices of each query sum to its count. A failed slice or a wrong sum makes the half `incomplete` with the failed slices and the wrong sums. **A client of your firm opposed the group**: the Host looks for the group's applications in the opponent index, on the firm's computer. The half is `complete` when the index has read every name of the review's clients completely, as of the time of its oldest read; while the index is read again, the half uses the last complete index and stays `complete`; `reading` while a name is not read yet; `incomplete` with failed slices or wrong sums. With no client of your firm, nothing is read and both halves are complete.

The opponent index holds the EP applications that the names of the firm's clients opposed: one `op=` query for each company key of the names, read in date slices, with the rows that name the client as an opponent, in `opponents.json`. The Host cannot read the Firm Record, so the browser reads the clients when the Clients list opens, after a decision is recorded, and before each review, and sends the names of the clients with the role client and their linked names with `POST add-client/client-names` (`{ "names": [] }`). A changed list reads only the new names and drops the removed names with their rows at once, also from a read again that runs; the same names in any order read nothing again, but read the failed slices again when no read runs; no name removes the files. The answer is the index state: `no_clients`, or the states of the firm docket; `{ "status": "no-plugin" }` without the patent data plugin, which keeps the names and reads them when the plugin comes. The index refreshes after `docketRefreshAge` like the docket, into `opponents.refresh.json` while the complete index stays served, resumes after a Host stop, and reads through the same limiter. It sends the names of the firm's clients to the EP Register, which Add client sent already under the same EPO account; no query holds a client name and the firm's names together, and its reads wait while the docket reads, so the clients' names and the firm's names do not go out together.

Each hit has the facts of the approved mockup `flowleap/docs/mockups/client-model/3-conflict.html`: the application and its publication, the patent owner and the opponent with the role of the group, the client of your firm and its party, the day the opposition was filed, the register status, `yourFirm` (whether the register names your firm as the representative of the application; `unknown` with no firm identity), the source and its time: the time of the review for the first half, and the time of the index read for the second.

### The firm identity

**Settings > Firm identity** is where a firm administrator sets the firm's names, addresses and representatives (approved mockup `flowleap/docs/mockups/client-model/6-firm-identity.html`). The section shows, in this order, the line "FlowLeap sends your firm's names to the EP Register, through your firm's EPO account, to read your EP docket. It sends no client name.", one line on who may change the identity, the state of the firm docket with its read time, and one list of fields for each of the three kinds. For a firm administrator, the line says that after the first save, FlowLeap uses only the saved identity and a change of `firmIdentity` in cordis.yml has no effect; each field has **Remove**, each list has **Add**, and the head has **Save**. **Save** is disabled until the trimmed fields differ from the saved identity; with no identity, it waits for a first value, and the save starts the first read. For every other person, the line says that only a firm administrator can change the firm identity, the fields are read-only, an empty list shows "None", and there is no **Add**, **Remove** or **Save**. While the docket is read or read again, the section asks the Host for its state every second. While a read again runs, the section keeps the line of the complete docket and shows the progress of the read again under it. **Read again** reads a `ready`, `stale` or `interrupted` docket again in full, but not while a read again runs; **Try again** (`R`, the command `flowleap.identity.retry` of the scope `flowleap.identity`) reads only the failed slices of a `partial` or `failed` docket or of a failed read again, and repeats a failed load, save or read. **Read again** and **Try again** stay open to every person: they change nothing that a person set, and only read the public EP Register again for the saved identity, behind the shared limiter of `opsRequestsPerMinute`. A failed save keeps the person's fields. A refused save (`not-admin`, for example after a role change while the section is open) shows "FlowLeap could not save your firm identity. Nothing changed. Only a firm administrator can change the firm identity.", puts the saved identity back in the fields and makes the section read-only; **Try again** does not repeat it.

The firm identity is the firm's names, addresses and representatives. The Host keeps the identity that a firm administrator saves in `identity.json` under `stateDir`; before the first save, and while that file is damaged (with a Host log line), the identity is the `firmIdentity` of the row config, so a firm patch that sets it keeps working until a firm administrator saves another one. After the first save, a change of `firmIdentity` in cordis.yml or the firm patch has no effect: the saved identity wins. A saved empty identity stays empty after a restart.

Only a firm administrator may save the firm identity. A firm administrator is a person whose request carries an `X-Flowleap-Admin` header that the flowleap-os starter signed: the Host asks the `flowleapAdmin` Service of [`dsh-client-ui-flowleap-admin-link`](../ui-flowleap-admin-link/README.md#the-flowleapadmin-service), which checks the header with the starter's public key of that row's `publicKeyFile`. This row has no key setting of its own, so the key path has one home. Without the Service (the admin-link row is not mounted), with `publicKeyFile: ''`, or with no key file, no request is of a firm administrator and every save is refused.

`GET add-client/identity` answers the identity now, the [firm docket](#the-firm-docket) state (`{ "status": "no-plugin" }` without the patent data plugin), and `canSave`, which is true only for a request of a firm administrator, so the page needs no second request. `POST add-client/identity/save` with `{ "identity": { "names": [], "addresses": [], "representatives": [] } }` saves the whole identity. The Host first checks the request: a request that is not of a firm administrator (no header, a header of another key, an expired header) is `not-admin` (HTTP 403) before the Host reads the body, and changes nothing. Then the Host trims each entry and drops the entries with no word and the repeated entries; a body that is not three lists of strings is `bad-request`, and a failed write is `internal` and changes nothing. A new identity goes to the docket at once, with no restart: the docket stops its read, drops the rows of the old identity and reads for the new one; an empty identity removes the docket file and the state is `no_identity`. The same identity reads nothing again. The answer holds the saved identity, the docket state after the change and `canSave: true`. `POST add-client/docket/read` stays open to every person whom the connection authenticates, for the reason above.

### Ask about this

The act drafts `@path` (a file) or `@"path/"` (a folder) for each entry, relative to the client folder, in the workspace's new-session draft through `uiWorkspace.startSession`, and opens that chat. A single file also opens in the chat's right sidebar once the chat is on screen. The mention is prompt text, so it is part of the logged user message; the agent reads the file only through its own logged tool calls.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser reads files under the workspace's blank Session, which `uiWorkspace.connectWorkspace` resolves: `remote.workspaceFiles` needs a Session id for every read and change feed. The listing with dates and sources and every write go through the Host half's exact Fetch routes on `ctx.connection.fetch`, which the connection authenticates first. The tree is the `sidebar.files.tree` Component Factory of `ui-sidebar-files`, fed with the page's listings.

| File | Role |
|---|---|
| [`src/route.ts`](src/route.ts) | the route paths, the request bodies, the answers and the failure codes, shared by both halves |
| [`src/index.ts`](src/index.ts) | Host half: the config, the nine folder routes (with `clients`, the workspaces whose folder is directly in `clientsRoot`) and the nine Add client routes; the shared limiter, the firm identity, the firm docket and the opponent index |
| [`src/folder.ts`](src/folder.ts) | the path and name checks and the listing, writes, Trash, Restore and search of one client folder |
| [`src/sources.ts`](src/sources.ts) | the source records and the Trash origins of each workspace |
| [`src/add-client/wire.ts`](src/add-client/wire.ts) | the Add client route paths, request fields and answers, shared by both halves |
| [`src/add-client/routes.ts`](src/add-client/routes.ts) | the `find`, `review`, `build`, `status`, `docket`, `docket/read`, `identity`, `identity/save` and `client-names` routes, with the firm administrator check of the save |
| [`src/add-client/slices.ts`](src/add-client/slices.ts) | the date slices of a register query as data: the split, the sum check, the state and the stored file schemas |
| [`src/add-client/sliced-read.ts`](src/add-client/sliced-read.ts) | the read of one slice, the turn order of the docket and index reads, and the reader of a file of sliced queries: the slices one after another, the saves, the resume, the read again beside a complete read, the refresh timer and the stop |
| [`src/add-client/docket.ts`](src/add-client/docket.ts) | the firm docket on its reader: the docket files, Read again and the identity change |
| [`src/add-client/identity-store.ts`](src/add-client/identity-store.ts) | the saved firm identity in `identity.json`, with the row config identity before the first save |
| [`src/add-client/docket-model.ts`](src/add-client/docket-model.ts) | the firm docket as data: the queries, the firm's rows, the state and the docket file schema |
| [`src/add-client/opponent-index.ts`](src/add-client/opponent-index.ts) | the opponent index on its reader: the index files and the change of the client names |
| [`src/add-client/opponent-index-model.ts`](src/add-client/opponent-index-model.ts) | the opponent index as data: one `op=` query for each client name, the opposed rows, the state and the index file schema |
| [`src/add-client/limiter.ts`](src/add-client/limiter.ts) | the request limiter of all EP Register reads, and the clock |
| [`src/add-client/review.ts`](src/add-client/review.ts) | the group read, the split by the firm identity, and the two halves of the conflict check that the EP Register shows |
| [`src/add-client/identity.ts`](src/add-client/identity.ts) | the firm identity match and normalization, the company keys and the town of a representative |
| [`src/add-client/build.ts`](src/add-client/build.ts) | the client folder build and its dated files |
| [`src/add-client/jobs.ts`](src/add-client/jobs.ts) | the build jobs and their status files |
| [`src/client/add-client/`](src/client/add-client/) | the Add client view: its state (`model.ts`), the Firm Record commands (`records.ts`, `plan.ts`), the Host calls (`api.ts`), the pages and the `flowleapAddClient` dictionaries; the Firm identity section of Settings (`FirmIdentity.tsx`) and its state (`identity-model.ts`) |
| [`src/client/index.ts`](src/client/index.ts) | Browser half: the dictionaries, the keys, the row menu, the Clients row, the page, the file readers, Ask about this, and the Firm identity section in `settings.section` |
| [`src/client/model.ts`](src/client/model.ts) | the page's state and acts |
| [`src/client/api.ts`](src/client/api.ts) | the calls to the folder routes |
| [`src/client/clients.ts`](src/client/clients.ts) | the client folders among the workspaces, asked again of the Host each time the set of workspaces changes, and the rows of the Clients list |
| [`src/client/Panel.tsx`](src/client/Panel.tsx) | the Clients list, the top bar, the search, the tree, the list, the file view, the dialogs and the notice |
| [`src/client/TreeResize.tsx`](src/client/TreeResize.tsx) | the tree's resize handle, in the pattern of the app sidebar's handle |
| [`src/client/viewer.tsx`](src/client/viewer.tsx) | the page's own viewers; it goes away when `ui-sidebar-documentpreview` exports a body that a page can render |
| [`src/client/keys.ts`](src/client/keys.ts) | the page's commands in the scope `flowleap.folder`, Try again of the Firm identity section in the scope `flowleap.identity`, and their keycaps |
| [`src/client/row-menu.ts`](src/client/row-menu.ts) | the row's context menu |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [The client folder page](../../../flowleap/docs/2026-11-08-client-folder-page.md) — the design, the founder's decisions and the slots to propose upstream.
- [flowleap-design-language](../../../.agents/skills/flowleap-design-language/SKILL.md) — the bar and the key map.
- [api-workspace-files](../../api/workspace-files/README.md) — the reads and the change feed.
- [ui-sidebar-files](../ui-sidebar-files/README.md) — the tree factory.
- [dsh-file-reference](../../context/file-reference/README.md) — the `@` mention grammar.
- [dsh-flowleap-web](../../bundle/flowleap-web/README.md) — the bundle row.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a sidebar launcher, a page, a context menu contribution, and authenticated routes that register no model-facing tools or messages. **Ask about this** only drafts `@path` mentions in a new chat's composer; the person sends them as an ordinary turn of that Session, and the agent reads the files with its own tools.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **A local client folder only** — the Host half reads and writes the workspace path with Node's file system, not through `ctx.fs`, because `ctx.fs` has no modified time, no byte write and no folder create; a workspace on a remote file system backend does not work.
- **The page reads under the blank Session** — `remote.workspaceFiles` has no workspace-keyed scope; the page uses the blank Session of `uiWorkspace.connectWorkspace`, which is also the draft that Ask about this opens.
- **Own viewers** — `ui-sidebar-documentpreview` renders its bodies only in its Session sidebar; `.msg` mail and other kinds have no viewer on the page.
- **Search by name only** — the search reads names, not the files' text; it walks the client folder on each query, which is slow for a very large folder.
- **Trash is never emptied** — FlowLeap moves entries into Trash and back, and deletes nothing; Trash grows until a person empties it outside FlowLeap.
- **Applicant names from the EP Register only** — PATSTAT is a model-facing MCP tool with no Host-callable client, so Add client finds names and counts their EP applications in the register; names of applications that are not published, and other offices, are missing.
- **EP publications without a kind code** — the register search of `@flowleap/connectors` drops the kind code, so the Firm Record gets no publication number and the files name the publication without its kind.
- **Only a firm administrator may change the firm identity** — the founder decided "Admins only" (2026-11-09). The save checks the starter's signed `X-Flowleap-Admin` header through the `flowleapAdmin` Service; every other person sees the section read-only. In a run without the flowleap-os starter, such as the dev loop, no request is of a firm administrator, so the identity comes only from `firmIdentity` in an overlay. The docket's **Read again** and **Try again** stay open to every person, because they change nothing that a person set. The identity moves into the Firm Record later.
- **Two homes of the first identity** — after the first save, a change of `firmIdentity` in cordis.yml or the firm patch has no effect; `identity.json` wins. The section says so to a firm administrator.
- **A role change shows at the next load or save** — the section asks `canSave` when it opens; a person who loses the role while it is open sees the refusal at the next save.
- **No docket facts in the Firm identity section** — the approved mockup also lists the query count, the next read and the opposition index; the docket state has no such fields yet, so the section shows the state and its read time only.
- **Add client does not read the firm docket yet** — Add client still reads the group's portfolio for the firm's matters; only the Firm identity section of Settings shows the docket state. A later change makes the find step and the review read the docket, and gives `docketCheckAge` its use.
- **Rows with no EP publication** — the date slices use the EP publication date, so a register row with no EP publication is in no slice; the sum check then makes the docket `partial` with the missing count. A live read measures how many rows this is.
- **The pages do not wait for the conflict check yet** — the review answer says whether each half is complete, and `conflictsTruncated` is true while one is not, so the page shows its warning; the stepper change makes **Add client** as **Client** wait until both halves are complete and shows the facts of each hit.
- **Whether your firm acts in the opposition** — the register search names the representatives of the application, not those of the opponents, so `yourFirm` says only whether the register names your firm for the patent.
- **The limiter counts calls, not OPS requests** — the limiter is outside `flowleap-connectors`, so it grants each call the most requests that the call can send, such as 5 for a name search of 500 rows or 6 for a publication read; a call can use its grant faster or slower than the window.
- **The docket file is written whole** — a running read saves at most every 30 s, so a Host stop can lose the slices of the last 30 s; the next start reads them again.
- **A build job of the plugin** — `ctx.jobs` belongs to a Session; until a job that a person's act owns exists upstream, the plugin runs the build and keeps its status. A Host stop ends the build; Try again resumes it.
- **Dated files in English** — the Host writes the public data files in English, whatever the page's language.
- **A rename onto a free name races with another writer** — the Host checks the name and then renames; a writer that takes the name in between is replaced on a file system that renames over a file.
- **The tree marks the open file, not the open folder** — the tree factory has a current file and no current folder.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
