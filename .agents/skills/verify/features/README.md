# FlowLeap Patent AI verification map

This directory is the maintained source for live proof of the `flowleap-web` profile. Read [the skill](../SKILL.md) first, then use the feature file that matches the change.

## Baseline preconditions

- `web.sh start "$RUN"` printed `ready:` and `web.sh doctor "$RUN"` shows only `PASS` lines.
- `$RUN` is new for this run. Do not drive an instance that this run did not start.
- The `Preview notice` dialog is closed with `Continue`.
- The composer shows the `Patent Agent` preset and the model `Anthropic: Claude Haiku 5.5`.

## Driving conventions

- Find elements by role and accessible name. Do not use coordinates or tab order.
- Use one new Session for each feature, so its Session log holds only that feature.
- Ask the model for one named tool call and a short, exact answer.
- Wait for text or a status, not for a fixed time.

## Proof and skip reporting

- Each proof has the Session log summary from `scripts/session-log.mjs`, a screenshot after the action, and a second view of each side effect.
- Write the feature ID and the entry point with each artifact.
- When a precondition is missing, such as a key, report the feature as not verified and name the precondition. Do not prove it through a different path.

## Feature entry contract

Each feature file has an H1 title, one paragraph on the user-visible behavior, and four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with the browser tool`, `Gotchas`.

## Features

- [Patent Agent turn](./patent-agent-turn.md): a live turn on the Patent Agent preset, and one office tool call. `turn-ping` was proven on 2026-10-27.
- [Patent data connectors](./connectors.md): the settings cards, Test connection, and the paid FlowLeap tools. `connectors-test` (EPO OPS) was proven on 2026-10-27.
- [Agent builder](./agent-builder.md): the `New agent` form, the agent in the picker, a chat that cites its own file, the connector restriction, edit and delete. `agent-create`, `agent-picker`, `agent-chat-context`, `agent-chat-search`, `agent-connectors`, `agent-edit` and `agent-delete` were proven on 2026-10-28.
- [Dashboard](./dashboard.md): the first screen with real data, the running chat, the register watch in Coming up, the search, the deep links, and the budget from a local gateway double. All six sub-features were proven on 2026-10-29.
- [Budget warning](./budget-warning.md): the model gateway's budget notice in the composer, through a local gateway double. `budget-notice-show` and `budget-notice-clear` were proven on 2026-10-29.
- [Uploads while the disk is low](./disk-low.md): the chat attachment and agent upload refusals while the firm host's disk low flag exists. `disk-low-chat`, `disk-low-agent` and `disk-low-clear` were proven on 2026-10-28.
- [Routines](./routines.md): the register watch from chat and its task on the Automation tasks page. `routines-page-empty` was proven on 2026-10-27.
- [Office action analysis](./office-action-analysis.md): the `recipe-office-action-response` skill of the skill pack from a chat and from a register watch, saved with `write_patent_results` and shown on the delivery card. `oa-chat-us`, `oa-chat-ep` and `oa-routine` were proven on 2026-10-29.
- [Work pages](./work-pages.md): the office action board with sample data, its state and owner controls, the side panel, and the analysis form. `work-board`, `work-state-owner`, `work-side-panel` and `work-form`, and the `Share` tooltip of `work-deferred`, were proven on 2026-10-29.

Not mapped yet: Word export, the other skills of the skill pack, and the brand. Add a file when a change touches one of them.
