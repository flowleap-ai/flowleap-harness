# The client model: a record and a memory, not a drive

**Status:** approved by the founder on 2026-11-09, with the four [decisions](#decisions-for-the-founder) below. This page refines what Add client makes. It changes the build step of [the Add client design](2026-11-08-add-client.md) and the build part of [Add client for large clients](2026-11-09-add-client-large-clients.md). It does not change the find step, the group, the conflict check or the roles.

## The question

The founder asked on 2026-11-09: "Are we creating some kind of Google Drive for the client?" Today Add client copies public data into a folder tree: one folder for each family and each matter, with dated EP Register and publication files. That is what a drive does. For a large client it makes thousands of copies that get old, and most of the large-client work is about how to make these copies faster.

## The principle

[The problem](2026-11-08-problem-and-principles.md) is "every agent task starts without the firm's facts". The facts that the agent does not have are the firm's facts: which applications the firm has for the client and their state, what the firm did on them, the client's instructions and wishes, and the firm's own files. Public data is not one of these facts. The agent can read the EP Register or a publication when a task needs it, with its source and date (principle 2). A copy in a folder does not make the agent smarter. The firm's own work does.

## The four parts of a client

| Part | What it holds | Where it lives | When FlowLeap makes it |
|---|---|---|---|
| **Client record** | The client, its applicant names, its role, the conflict decision | Firm Record | Add client |
| **Application index** | One row for each EP application at the firm: application and publication number, title, status, the firm as representative since, and later the next deadline | Firm Record (`client/application-recorded`, in batches) | Add client, from the firm docket |
| **Matter memory** | The firm's own files, mails, decisions and client instructions for a matter, with their text, each with its source | The matter folder and its index | When work starts on the matter: a person opens the matter, a letter or a mail arrives, a person drops a file, or an agent task runs on it |
| **Public data** | EP Register records and events, publications, families, PATSTAT | Live reads through the patent data tools, with a short cache | When a task or a page needs it. A person can save a dated copy into a matter folder when the file needs it |

## What the person sees

- **The client page leads with the application list.** Each row shows the status, the next deadline when known, the last register event and whether a matter folder exists. The client's instructions and wishes show above the list. Files are a second tab.
- **A matter page shows the story, the files and the chat.** The story (step M1) comes from the live register events and the matter memory. The files are the folder page that we have.
- **The client folder on disk** starts with `00 Client` and "About this folder". A family folder and a matter folder appear when the first work on that matter starts. A Siemens client with 1,132 applications at the firm has 1,132 rows at once, and folders only for the matters that the firm works on.

## Add client after the change

Steps 1 to 5 stay. Step 6 becomes **Record**: FlowLeap writes the client record and the application index in batches. That takes seconds for any client size, so there is no build job and no build progress. Step 7 opens the client page.

## The demo

1. Add client: type the company, confirm the group, see "16 EP applications at your firm", select **Add client**. Seconds.
2. The client page shows the 16 applications with their status.
3. Open one application, drop the firm's files on it or forward a mail.
4. Ask the agent. It answers from the firm's files and the live register, with sources.
5. Ask a second question the next day. The agent already knows the matter.

## What this keeps and removes

**Keeps:** the find step, the group, the conflict check, the roles, the folder page, the firm docket, the counts and the opponent index from the large-client sheet, and the batch record command.

**Removes:** the build job, the dated EP Register and publication files for each matter, the family and matter folders at Add client, and the reference file. The client page shows the counts of the applications at other firms from live counts, and a search field finds any of them.

**Changes in PR 362:** the build code becomes the **Record** step and the code that makes a matter folder when work starts. The code that writes a dated file stays, for the act "Save a dated copy".

## Decisions for the founder

1. **No copies of public data by default.** Public data is a live read with its source and date; a person saves a dated copy only when the file needs it.
2. **A matter folder exists when work on the matter starts**, not at Add client.
3. **The client page leads with the application list**, and files are a second tab.
4. **PR 362 changes before its merge**: the build step becomes **Record**. Recommended: yes, because the build is the part that does not work for large clients.
