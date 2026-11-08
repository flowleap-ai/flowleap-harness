---
description: "The Clients row in the FlowLeap sidebar (German Mandanten) and the client folder page: a client's workspace folder with no chat, its files in the middle, new folders, uploads, rename, move, Move to Trash and Restore, a search by name, and Ask about this; writes stay inside the client folder and never replace or delete an entry."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-flowleap-folder

## Summary

An attorney sees a **Clients** row in the `flowleap-web` sidebar (German **Mandanten**) that lists the client folders, which are the runtime's workspaces. A client folder opens with no chat: the folder tree at the left, and in the middle the folder's entries or a file itself. The person makes folders, uploads or drops files, renames, moves, moves entries to Trash and back, finds entries by name, and starts **Ask about this**: a chat in the client's workspace with the entry already in the prompt. The design and the founder's decisions are in [the client folder page](../../../flowleap/docs/2026-11-08-client-folder-page.md).

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
```

| Field | Default | Meaning |
|---|---|---|
| `stateDir` | required | The plugin's state folder; the source records go into its `sources/` folder and the Trash origins into its `trash/` folder, one JSON file for each workspace |
| `maxEntries` | `2000` | Cap on the entries of one listing; the rest is dropped and the listing says it is cut |
| `maxUploadBytes` | `209715200` (200 MiB) | Inclusive byte cap of one uploaded file |
| `maxSearchHits` | `200` | Cap on the hits of one search by name; the page says when the cap dropped hits |
| `storageLowFlagPath` | `''` | A file whose presence means the Host disk is low; while it exists, uploads are refused. Empty: no check |

### The page

The top bar shows the location (Clients, the client, `…` for the folders between, the folder, the file), the search field `/`, **New folder** `⇧N`, **Upload files** `U` and the one primary action, **Ask about this** `A`. The tree has a resize handle on its right edge with the limits of the app sidebar (264 to 420 px); the browser keeps the width for each person. The list groups by **Folders** and **Files** (the founder's approved exception to product rule 1) and sorts by name. A row has a checkbox; with rows checked, a bulk bar at the bottom offers **Move to Trash** `Backspace` (or **Restore** in Trash), **Move to…** `⇧M` and **Ask about these N**. A right-click on a row opens Open, Ask about this, Rename `F2`, Move to…, Copy path and Move to Trash or Restore. Rows do not select page text. Files dropped on the middle area go into the listed folder. At 390 px the tree opens from the top bar.

### Files in the middle

The page shows a file with its own viewers: a PDF or an image in the browser's viewer through a `blob:` URL, Markdown with `MarkdownText`, text as text, Word and PowerPoint through the Host's PDF conversion (`remote.officeToPdf`), a sheet (`.xlsx`, `.xls`, `.csv`) read-only with SheetJS, one table for each sheet with sheet tabs and the first 1000 rows and 50 columns, and mail (`.eml`) with `postal-mime`, its subject, sender, receivers, plain text and the date in the sender's own zone. Any other kind says that FlowLeap has no preview for it yet. SheetJS loads only when a sheet opens.

### Writes

Every write goes through the Host half, never from the browser to disk. A path is relative to the client folder; the Host refuses an absolute path, a `.` or `..` part, a link as the final part, and a target whose real path is outside the client folder. A name has no `/`, `\` or NUL, no space at the start or end, at most 255 UTF-8 bytes, and is not a reserved Windows device name. No write replaces an entry: a new folder or a rename onto a taken name is refused, and an upload is written to a hidden file and then hard-linked to its name, which fails when the name is taken. The page then offers **Keep both** (the macOS form `name 2.ext`) or **Skip**. A move stays inside one client folder. No route deletes an entry.

### Trash

**Move to Trash** moves an entry into the `Trash` folder at the client folder root, which the Host makes when it is missing, and records where the entry came from; a name that Trash already has gets the free form `name 2.ext`. In Trash, each row shows **From** its folder, and **Restore** moves it back, makes the folders on the way again, and keeps both on a taken name. Only Move to Trash puts entries into Trash: the Host refuses a new folder, an upload or a plain move into it, and a rename or move of Trash itself. Nothing in Trash is deleted; a person empties it outside FlowLeap.

### Search

The search field finds files and folders by name over the whole client folder: every word of the query must be in the name, case and accents aside. The hits show each name with its folder; the arrow keys move, Enter opens, and Esc clears. Hidden entries, links and Trash are left out. A search inside the files' text comes later, as the first part of the Knowledge Pool.

### Sources

For each folder made and each file uploaded on the page, the Host records the act and its time; a rename or a move carries the record of the entry and of everything below it. The list shows **Made here**, **Uploaded**, or **Not recorded** for an entry this plugin did not write.

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
| [`src/index.ts`](src/index.ts) | Host half: the config, the eight routes and their answers |
| [`src/folder.ts`](src/folder.ts) | the path and name checks and the listing, writes, Trash, Restore and search of one client folder |
| [`src/sources.ts`](src/sources.ts) | the source records and the Trash origins of each workspace |
| [`src/client/index.ts`](src/client/index.ts) | Browser half: the dictionaries, the keys, the row menu, the Clients row, the page, the file readers and Ask about this |
| [`src/client/model.ts`](src/client/model.ts) | the page's state and acts |
| [`src/client/api.ts`](src/client/api.ts) | the calls to the folder routes |
| [`src/client/Panel.tsx`](src/client/Panel.tsx) | the Clients list, the top bar, the search, the tree, the list, the file view, the dialogs and the notice |
| [`src/client/TreeResize.tsx`](src/client/TreeResize.tsx) | the tree's resize handle, in the pattern of the app sidebar's handle |
| [`src/client/viewer.tsx`](src/client/viewer.tsx) | the page's own viewers; it goes away when `ui-sidebar-documentpreview` exports a body that a page can render |
| [`src/client/keys.ts`](src/client/keys.ts) | the page's seven commands in the scope `flowleap.folder` and their keycaps |
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
- **Folder kinds and the sources of Add client** — every folder shows the kind Folder; Family and Matter come with Add client, which records the role of each folder it builds, as it records the sources of the files it writes.
- **A rename onto a free name races with another writer** — the Host checks the name and then renames; a writer that takes the name in between is replaced on a file system that renames over a file.
- **The tree marks the open file, not the open folder** — the tree factory has a current file and no current folder.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
