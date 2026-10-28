# Uploads while the disk is low

While the firm host's disk low flag file exists, the attorney cannot add a file to a chat or to an agent: the composer and the agent form show "The firm server is low on disk space" in the attorney's language. Chats, reads and agent edits go on. When the host removes the flag, uploads work again.

## Sub-features

- `disk-low-chat` refuses a chat attachment while the flag exists, and the composer shows the refusal.
- `disk-low-agent` refuses an agent file upload while the flag exists, and the agent form shows the refusal.
- `disk-low-clear` accepts both uploads again after the flag is removed.

## How to get to it (user POV)

- Chat: add a file to the composer of a Session (the paper clip button, or drop a file).
- Agent: `Choose the agent preset for your new task`, then `New agent` or `Edit agent`, add a file, and `Save`.

## Driving it with the browser tool

Preconditions:

- The baseline in [README.md](./README.md).
- Start the instance with `DSH_VERIFY_PATCH=.claude/skills/verify/features/disk-low.patch.yml` and `DSH_VERIFY_DISK_LOW_FLAG="$RUN/disk-low"`. The overlay points both rows at that file.

- **Set the flag.** `touch "$RUN/disk-low"`. No restart: each upload reads the flag.
- **Chat.** The browser tool cannot use the system file picker. In `javascript_tool`, make a `File` from a few bytes, put it in a `DataTransfer`, and send it to the composer as a `drop` or a `paste` event. The attachment chip shows the refusal text.
- **Agent.** Add a file to the agent form as in [agent-builder.md](./agent-builder.md), then `Save`. The form shows `Cannot upload <name>: the firm server is low on disk space. Ask your administrator.`
- **Clear the flag.** `rm "$RUN/disk-low"`, then retry both uploads. The chip and the file row show no error.
- The upload routes give the same answer without the page: `POST /api/session/uploadFileBinary?sessionId=<id>&name=a.txt` answers `session/attachment-invalid` with `reason: STORAGE_LOW`, and `POST /api/flowleap-agents/upload?agent=<id>&name=a.txt` answers `flowleap-agents/invalid` with `reason: storage low`.

## Gotchas

- A Session that never had a turn can be cold; send its first upload from the open Session page.
- The flag is read on each upload, so a test does not need a restart; it does need the overlay, because the shipped path `/run/flowleap/host/disk-low` does not exist on a Mac.
