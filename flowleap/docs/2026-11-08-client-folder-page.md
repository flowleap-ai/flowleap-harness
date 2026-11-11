# The client folder page

**Status:** approved by the founder on 2026-11-08, with the [mockups](mockups/client-folder/README.md) and the decisions below. It is the first plugin from the founder's demo loops, and it serves step M1 of [the re-ordered roadmap](2026-11-08-roadmap-reorder.md): a matter's own documents in one place, and the agent working over them.

## The problem

Demo loop 4 opened a client folder (client → family → matter, with the folders Client, Office, Drafts, Search, Associates and Internal) as a harness workspace. The file tree, the PDF and Markdown preview and the chat over the files worked with no change. Three gaps stopped the demo:

1. The tree shows only in the right sidebar of a chat session. A folder has no view of its own, and the middle area is always a chat.
2. A person cannot add a file or a folder from the app. The tree is list-only, and a chat attachment does not go into the folder.
3. The agent does not know which file the person looks at. The tree and the preview never reach the model.

## What the page does

| Flow | What the person does | What the page does |
|---|---|---|
| Open | Selects a client in **Clients** | Opens the client's folder with no chat: the folder tree at the left, and the selected folder's folders and files in the middle (name, kind, size, modified, source). A family folder and a matter folder show their kind (**Family**, **Matter**) |
| Look | Selects a file | Shows the file in the middle: PDF, Markdown, mail (`.eml`), Word, Excel and images |
| Add | Drops files on a folder, or selects **Upload files** | Writes the files into that folder, shows the progress in the rows, and asks before it keeps two files with one name |
| Organize | Selects **New folder**, **Rename** or **Move to…** | Creates, renames or moves inside the client folder; the firm's template folders are only the start |
| Ask | Selects **Ask about this** on a file, a folder or a selection | Starts a chat session in the client's workspace with the file or folder already referenced, and opens it |

The page is one view. The tree is 280 px wide, as the app sidebar, and a person drags its edge between the app sidebar's limits of 264 and 420 px; the browser keeps the width for each person. A long name ends in an ellipsis, with the full name in the folder header and on hover. At 390 px the tree opens from the top bar. **Ask about this** is the one primary action of the page. The page has no delete act: **Move to Trash** moves an entry into the `Trash` folder at the client folder root, and **Restore** moves it back (founder decision 7). A search field `/` finds files and folders by name over the whole client folder and shows each hit with its folder; Enter opens the hit and Esc clears the search. A search inside the files' text comes later, as the first part of the Knowledge Pool.

## Reused parts

| Part | Package | Use |
|---|---|---|
| Workspace and its folder | `workspace`, `api/workspace-controller` | One client is one workspace; `ctx.workspaces.list` gives the client list; `WorkspaceView.path` is the client folder |
| File reads and changes | `api/workspace-files` (`remote.workspaceFiles`) | `readBytes` and `read` for the preview, `changes` to update the view when a file changes on disk |
| The tree component | `ui-sidebar-files`, factory slot `sidebar.files.tree` | The tree at the left; the factory is root-scoped, so the page renders it and feeds it its own listing |
| File reads and conversion | `remote.workspaceFiles.readBytes`, `remote.officeKit.render` | The page's own viewers read the bytes of a file, and Word and PowerPoint files as PDF, under the workspace's blank Session |
| Markdown | `MarkdownText` of `ui-primitives` | The Markdown viewer |
| The chat | `ui-workspace` `startSession(workspaceId, { prompt, whenDraftExists: 'append' })`, `dsh-file-reference` `formatFileMention` | **Ask about this** opens the workspace's new-session draft with `@path` in the prompt |
| A FlowLeap page | `ui-flowleap-records` pattern: `sidebar.panellist` entry and keyed `main` slot | The **Clients** entry in the app sidebar and the page in the middle; `?page=` selects it |
| The look | `ui-primitives`, client theme, [FlowLeap design language](../../.agents/skills/flowleap-design-language/SKILL.md) | List rows, menus, the bulk bar, empty, loading and error states |

## New parts

All new code is in one FlowLeap plugin, `packages/client/ui-flowleap-folder` (`@deepseek-ai/dsh-client-ui-flowleap-folder`), with a client half and a host half, in the `flowleap-web` bundle. It changes no harness package.

- **Client half.** The **Clients** list, the folder page, the drop target, the inline name field, the **Move to…** picker, the bulk bar, and the **Ask about this** act.
- **Host half: the folder Remote.** `list(workspaceId, path)` returns the entries with their modified time and their source; `mkdir`, `upload`, `rename` and `move` write into the client folder. The Remote looks up the workspace by its `WorkspaceId` and takes `WorkspaceView.path` as the root.
- **Source record.** For each file that the page or **Add client** writes, the plugin stores the source (the public register, a person's upload) and the time, and for each folder that **Add client** builds, its role (family or matter). A file that changes outside the app shows "Not recorded".
- **Viewers.** One module of the plugin shows a file in the middle: a PDF or an image in the browser's viewer through a `blob:` URL, Markdown and text, Word and PowerPoint through the Host's PDF conversion, a sheet (`.xlsx`, `.xls`, `.csv`) read-only through SheetJS with one table for each sheet and sheet tabs, and mail (`.eml`) through the maintained MIME parser `postal-mime`, with the date in the sender's own zone. Other kinds show "FlowLeap has no preview for this kind of file yet". The preview bodies of `ui-sidebar-documentpreview` render only in that package's Session sidebar: only the plugin that declares a slot may render it (coordinator decision of 2026-11-08 after the build spike). When that package exports a body that a page can render, this module goes away. `.msg` needs a Host converter and is not in this step.

## How files are written

The host half writes; the browser never writes to disk. Each write obeys these rules:

1. The target must be inside the client folder. The Remote resolves the real path of the parent folder and refuses a target outside the root, a final symbolic link, and the names `.` and `..`.
2. A name has no `/`, `\` or NUL character, has no space at the start or end, is at most 255 bytes, and is not a reserved Windows name.
3. A write never replaces a file. An upload goes into a hidden temporary file in the same folder and is renamed into place when it is complete, so a partial file never shows. On a name conflict the Remote fails with `exists`, and the page offers **Keep both** (the name gets " 2", as the file manager of macOS does) or **Skip**.
4. A move stays inside one client folder. A move to another client is refused, because it can cross a wall.
5. The largest upload is a validated `Config` field of the plugin. The Remote refuses an upload while the host's low-storage flag is set, as the attachment store does.
6. Each act is a Remote call that the `remote-access` policy checks with the resource kind `workspace`. Today only the owner of the runtime uses it.

The page shows a new file through the `changes` feed of `workspace-files`, so a file added in the file manager of the system also shows within seconds (loop 4 measured 3 s).

## The reference in the chat

**Ask about this** puts `@"<path>"` (a file) or `@"<path>/"` (a folder) in the prompt of the new session, relative to the client folder; a selection puts one mention for each item. The person can add a question before sending. The mention is ordinary prompt text, so it is part of the logged user message, and the agent reads the file only through a logged `read` tool call ([file reference](../../packages/context/file-reference/README.md)). The rule "anything that reaches the model is logged" holds with no new session event.

## Confidentiality

- The page shows one client folder at a time, and only its workspace root. The listing and the writes refuse a path outside the root, and the tree does not follow a symbolic link out of it.
- The **Clients** list shows only the workspaces of this runtime. Today the harness has no wall per workspace: whoever owns the runtime sees every workspace. The firm OS keeps each person to the clients they may see by what it mounts into that person's runtime.
- A wall inside a client folder (for example, a restricted Internal folder) is not possible in this step.

## Extension points to propose upstream

The page works with no core change. These small slots would remove workarounds; each is "propose upstream", and no upstream code is edited in this step.

| Slot or field | Package | Why | Workaround until then |
|---|---|---|---|
| A workspace-keyed scope for `remote.workspaceFiles` | `api/workspace-files` | Every read and watch needs a session id | Read under the workspace's blank session from `uiWorkspace.connectWorkspace` |
| An exported preview body factory, root-scoped, input `{ address }` | `ui-sidebar-documentpreview` | Only the declaring plugin may render the session-scoped `sidebar.right.tab.document` bodies, so a page cannot reuse them | The plugin's own viewers |
| `modifiedAt` on `WorkspaceDirectoryEntry` | `api/workspace-files` | The listing has no date | The plugin's own `list` |
| `mkdir`, `upload`, `rename`, `move` fenced to the root | `api/workspace-files` | No harness package writes into a workspace folder for a person | The plugin's folder Remote |
| A list slot for the workspace row menu, for example `sidebar.workspaces.menu.item` | `ui-workspace` | "Open folder" belongs on the workspace row in the app sidebar | The **Clients** entry |

## Gaps that this page does not solve

- **The agent's reads are not fenced.** In loop 4 the agent read a file outside a matter workspace with `bash`. The firm OS solves this later by what it mounts into each runtime.
- **Workspace nesting.** A matter is not a workspace under its client. A chat started from a matter folder runs in the client's workspace with the matter's path in the prompt.
- **The open preview as context.** The page references the file in the prompt. A chat that is already open still does not know which file the person looks at.
- **The tree order.** Folders sort by name (Associates first). The template can number its folders, or the page can sort the template folders in their template order.
- **Time limits.** The register data has status changes only; rule-based dates need their own plugin tool.

## Founder decisions

The founder decided on 2026-11-08:

1. **Mockups.** Approved as the design for the build.
2. **Product rule 1.** The file list groups by **Folders** and **Files**. This is an approved exception to product rule 1, as My work has one.
3. **Keys.** **Ask about this** `A`, **New folder** `⇧N`, **Upload files** `U`, **Rename** `F2`, **Move to…** `⇧M`.
4. **Source.** The source of a file stays in the plugin for now. It moves into the Firm Record's document index in M1.
5. **Delete.** The app has no delete act in the first step. Decision 7 adds Move to Trash, which deletes nothing.
6. **Where the chat opens.** In the middle, with the file in the right sidebar, as drawn.

After the founder's test of the build on 2026-11-08 (a file uploaded by mistake had no way out), the coordinator decided:

7. **Trash.** **Move to Trash** `Backspace` moves an entry into the `Trash` folder at the client folder root, with the same path checks; a name that Trash has gets `name 2.ext`. The Host records the origin, and **Restore** moves the entry back, makes the missing folders, and keeps both on a taken name. Only Move to Trash puts entries into Trash. FlowLeap never deletes an entry.
8. **Search by name.** **Find** `/` searches names over the whole client folder. Full-text search inside the files is the first slice of the Knowledge Pool.
9. **Sheets.** Excel and CSV files show read-only in the page, one table for each sheet with sheet tabs, through SheetJS.
