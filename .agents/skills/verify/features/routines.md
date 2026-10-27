# Routines

The attorney asks in chat to watch applications, the agent creates one daily register watch, and the Automation tasks page shows the task with its watched applications. When the register lists a new event, the run opens its own chat, titled by the event, and marks it `Needs review`.

## Sub-features

- `routines-page-empty` opens the Automation tasks page with no tasks.
- `routines-watch-create` creates a register watch from chat.
- `routines-watch-delete` deletes the watch task.
- `routines-run-new-chat` lets one due run open its own chat with the `Needs review` mark.
- `routines-needs-review` shows the mark on the Sidebar row, on the `Needs review` page, and as the `Needs review` filter of the Automation tasks page, and clears it with `Mark as done`.

## How to get to it (user POV)

- Choose `Automation tasks` in the sidebar.
- Choose `Needs review` in the sidebar.
- Ask the Patent Agent to watch an application.

## Driving it with the browser tool

Preconditions:

- The baseline in [README.md](./README.md).
- The EPO OPS card shows `Configured` (the watch reads the register once at creation).

- **Empty page.** Choose button `Automation tasks`. The heading `Automation tasks` shows, with the filters `Enabled`, `Inactive`, `All`, and the text `No tasks yet. Tasks created in your sessions appear here.`
- **Create.** In a new Session, send `Call register_watch_create once with applications ["EP 3 456 789"], title "Verify watch", prompt "Report new register events.", daily time 09:00 time_zone Europe/Berlin. Then reply with only DONE.` The answer is `DONE`.
- **Create log.** The log summary shows `tool (turn 1): register_watch_create` and a result that names the task.
- **Second view.** Choose `Automation tasks`. The `Enabled` list has `Verify watch`. Its detail shows `Watched applications: EP3456789` and a daily 09:00 Europe/Berlin rule.
- **Delete.** In the task detail, delete the task and confirm. The list is empty again.
- **Proof.** Save screenshots of the task detail and the empty list, and the log summary, in `$RUN/evidence/`.
- **Due run.** Create the watch with a daily time about ten minutes ahead, in UTC. Stop the instance. In `$RUN/home/storages/flowleap_routines.json`, remove the newest entry (for EP 3 456 789, `["2020-12-18","7"]`) from the watch's `seen` counts, so that event is new at the run. Start the instance again. The saved register read is newer than 12 hours, so the run uses it and makes no new OPS call. Keep a copy of the file before the edit in `$RUN/evidence/`.
- **New chat.** At the daily time a new chat shows in the `Default workspace`, titled `EP3456789: No opposition filed within time limit (2020-12-18)`. The task's own chat receives no message. The new chat's log summary shows `turn 1: completed` and one short answer; its Session log has one `user/message` whose source is `schedule` and whose text holds `register_events_json`, and a `session/title` event with the title.
- **Mark.** When the answer is complete, the new chat's row shows the `Needs review` badge, the `Needs review` launcher shows the count `1`, the `Needs review` page lists the chat with the task `Verify routine`, and the Automation tasks page has a `Needs review` filter tab that lists the task. `reviews` in `flowleap_routines.json` holds the chat with `state: "needs_review"`.
- **Restart.** Stop and start the instance. The mark is still on the row and on the page.
- **Clear.** Open the chat and choose `Mark as done` in its header, or answer in the chat. The badge, the page row, and the filter result go away.

## Gotchas

- A due run happens only at the task's daily time, so set that time a few minutes ahead. Without the `seen` edit the run is skipped, because the watch's baseline already holds every event. The skip, delivery, chat, and mark behavior also has its own tests: `pnpm exec vitest run packages/host/flowleap-routines`.
- A run on Claude Haiku 5.5 sends the full Patent Agent prompt to the new chat: about 70,000 input tokens for one short answer.
- The watch reads the register at creation. A failed read fails the tool call, and no task is created. Without the EPO OPS key, report the feature as not verified.
- The schedule storage is in `$RUN/home`, so a watch from a verification run never reaches the founder's own instance.
