# Routines

The attorney asks in chat to watch applications, the agent creates one daily register watch, and the Automation tasks page shows the task with its watched applications.

## Sub-features

- `routines-page-empty` opens the Automation tasks page with no tasks.
- `routines-watch-create` creates a register watch from chat.
- `routines-watch-delete` deletes the watch task.

## How to get to it (user POV)

- Choose `Automation tasks` in the sidebar.
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

## Gotchas

- A due run does not happen during a short verification run. The skip and delivery behavior has its own test: `pnpm exec vitest run packages/host/flowleap-routines`.
- The watch reads the register at creation. A failed read fails the tool call, and no task is created. Without the EPO OPS key, report the feature as not verified.
- The schedule storage is in `$RUN/home`, so a watch from a verification run never reaches the founder's own instance.
