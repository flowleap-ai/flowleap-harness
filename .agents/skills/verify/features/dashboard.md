# Dashboard

The dashboard is the first screen. Its cards and panels show real data: chats that need review, the register watches with their next check and newest recorded event, the running and recent chats, and the attorney's spend and budget from the model gateway. The ask bar searches chats, agents and routines (Cmd+Option+K on the web). The address names the open chat (`?chat=`) or page (`?page=`), so a reload or a link opens that item.

## Sub-features

- `dash-start` shows the dashboard at the start, with the budget figures of the gateway and no sample data.
- `dash-running` shows a chat as `Running` in Agent activity while its turn runs and the dashboard shows.
- `dash-watch` shows a new register watch in Coming up and Cases watched without a reload.
- `dash-search` finds chats, agents and routines from the ask bar, opened with the shortcut.
- `dash-deep-link` puts `?chat=` in the address of an open chat, opens it again after a reload, and selects a page from `?page=`.
- `dash-budget-unknown` shows `Unknown` and the reason, and no number, when the gateway does not answer.

## How to get to it (user POV)

- Sign in. The dashboard shows. The `Dashboard` row of the sidebar shows it again.

## Driving it with the browser tool

Preconditions:

- The baseline in [README.md](./README.md).
- Write the budget answer to a file, for example `{"month":"2026-10","spent_usd":18.64,"budget_usd":50}` in `$RUN/budget-answer.json`, and start the gateway double [`scripts/budget-read.mjs`](../scripts/budget-read.mjs) in the background: `node .agents/skills/verify/scripts/budget-read.mjs 3298 "$RUN/budget-answer.json"`. It answers `GET /flowleap/budget` while the file exists, and 503 while it does not.
- Start the instance with `DSH_VERIFY_BUDGET_URL=http://127.0.0.1:3298/flowleap/budget` and `DSH_VERIFY_PATCH="$PWD/.agents/skills/verify/features/dashboard.patch.yml"`.

- **Start.** The `flowleap-dashboard` test id shows. `Budget this month` shows `$18.64 used` and `Budget $50.00`; `Budget used` shows `37 %`. `Coming up` shows `No register watch yet`. No `Sample data` tag shows.
- **Running.** Type a register watch request in the ask bar, for example `Call register_watch_create once with applications ["EP 3 456 789"], title "EP 3 456 789 register watch", prompt "Summarise the new events.", and daily time 07:00:00 in time zone UTC. Then reply with exactly: FLOWLEAP-VERIFY-OK`, and press Enter. A new chat opens with the text in its composer. Press Enter there, then select `Dashboard` at once. The panel `Agent activity` (role `listitem`) shows `Running`.
- **Watch.** When `Running` goes, `Coming up` shows the task title, `Next register check: …`, and `EP3456789: <date>, <event>`; `Cases watched` shows `1`.
- **Search.** Press Cmd+Option+K; the ask bar has focus. Type a word of the task title. The region `Search results` shows the groups `Chats`, `Agents` (after you made an agent, see [agent-builder.md](./agent-builder.md)) and `Routines`. Escape clears the bar.
- **Deep link.** Select the chat in `Agent activity`. The address has `?chat=`. Reload; the chat shows. Open the address with `?page=flowleap-needs-review`; the `Needs review` row of the sidebar has `aria-current=page`.
- **Unknown.** Delete `$RUN/budget-answer.json` and reload. `Budget this month` shows `Unknown` and `The model gateway did not answer, so the spend is not known.`
- **Second view.** The gateway double prints one line for each read, with `bearer=true`. `scripts/session-log.mjs` shows the `register_watch_create` call and `turn 1: completed`.

## Gotchas

- The panels are `listitem` elements with the panel heading as their name, not `region` elements.
- A Haiku turn with one tool call can end in a few seconds. Select `Dashboard` right after Enter to see `Running`.
- The verify run has no virtual key, so the overlay sends the OpenRouter key of the run to the local double. Do not point `DSH_VERIFY_BUDGET_URL` at another host.
- Stop the gateway double when the run ends; `web.sh stop` does not know it.
