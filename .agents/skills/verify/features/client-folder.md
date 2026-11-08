# Client folder page

The `Clients` row of the sidebar (German `Mandanten`) lists the workspaces as client folders. A client folder opens with no chat: the folder tree at the left, and in the middle the listed folder's folders and files with their kind, size, modified time and source, or the selected file itself (PDF, Markdown, mail). The person makes a folder, uploads or drops files, renames and moves, and starts `Ask about this`, which opens a chat in the client's workspace with the file or folder as an `@` mention in the prompt and, for one file, the file in the chat's right sidebar.

## Sub-features

- `folder-open` lists a client folder with no chat: the tree, the `Folders` and `Files` groups, and the sources `Not recorded`, `Made here` and `Uploaded`.
- `folder-view-pdf`, `folder-view-markdown` and `folder-view-mail` show a PDF, a Markdown file and an `.eml` mail in the middle.
- `folder-upload` drops or uploads a file into the listed folder; a second file with the same name opens the `Keep both` or `Skip` dialog, and `Keep both` adds `name 2.ext`.
- `folder-new-rename-move` makes a folder (`⇧N`), renames a file (`F2`) and moves files (`⇧M`).
- `folder-ask` opens the chat with the mention, and the agent's first tool calls read the referenced file.

## How to get to it (user POV)

Add the client folder with `Add workspace`, then select `Clients` in the sidebar and the client on the Clients page.

## Driving it with the browser tool

Preconditions:

- The baseline in [README.md](./README.md), on an instance whose run can write into the client folder. Use a copy of the folder, such as a copy of `~/flowleap-demo/Syntegon` in the run directory, because the uploads, folders and moves stay on disk.
- `Add workspace` with the in-page picker: `Edit path`, type the folder's absolute path, Return, then `Open`.

Steps:

- **Open.** Select `Clients` (role `button`, in the panel list), then the client's button. The main column shows the `flowleap-folder` test id, the location `Clients › <client>`, and rows with the `folder-row` test id. Open a family folder and a matter folder by their row buttons.
- **View.** Open a PDF row: the middle shows its name as the heading and an `iframe` with the `folder-pdf` test id whose source starts with `blob:`. The PDF viewer can draw a few seconds after the frame. Open `Search report.md`: the middle shows its tables. Open an `.eml` row: the `folder-mail` test id shows the subject, `From`, `To` and `Date`.
- **Upload.** Use `Upload files` (`U`) or drop files on the list. The new row shows `Uploaded` and the notice `1 file added to <folder>`. Drop a file with the same name: the dialog names the file and offers `Skip this file` and `Keep both`.
- **New, rename, move.** Press `⇧N` with the focus on the page, type a name, Return: the row shows `Made here`. Check a row, press `F2`, type, Return: the extension stays. Check rows, press `⇧M`, select a folder, `Move here`.
- **Ask.** Open a file and press `A` (or `Ask about this`). The chat opens with `@"<path>"` in the composer and the file in the right sidebar. Click at the end of the draft before typing the question, so it does not land inside the mention. Send it.
- **Second view.** The files and folders are on disk in the client folder; the source record is `<DSH_HOME>/flowleap-folder/sources/<workspace id>.json`. `scripts/session-log.mjs` shows the mention in the user text and the agent's first read of that path.

## Gotchas

- In the development loop, a client edit reloads the bundle and sends the main column back to a new Session; select `Clients` again.
- A real published PDF prints the representative of record on page 1. Do not record it into a GIF or a screenshot for a public PR; use a copy whose page 1 covers that block.
- `read_pdf` needs the Mistral key; without it the agent says so and reads the Markdown files beside the PDF.
