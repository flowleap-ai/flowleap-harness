# Agent builder

The attorney builds an agent from a name, instructions, files and a choice of connectors in the `New agent` form of the agent picker. The agent shows in the picker at once, without a restart. A chat with the agent follows the instructions, uses the text of its files, cites the file and the page, and can use only the connectors that the attorney chose.

## Sub-features

- `agent-create` creates an agent with one PDF and one connector, and the file row shows `Ready`.
- `agent-picker` shows the new agent in the agent picker without a restart.
- `agent-chat-context` answers from a file in the `All files in context` mode and cites the file and the page.
- `agent-chat-search` answers through `search_agent_files` in the `Search over files` mode.
- `agent-connectors` keeps the tools of the connectors that were not chosen out of the model's tool list.
- `agent-edit` changes a field with `Edit agent` and `Save changes`.
- `agent-delete` deletes the agent with `Delete agent` and the confirmation, and the picker row goes away.

## How to get to it (user POV)

- Choose button `Choose the agent preset for your new task`, then `New agent` (the last row).
- To change an agent, choose the agent in the picker, open the picker again, then choose `Edit agent`.

## Driving it with the browser tool

Preconditions:

- The baseline in [README.md](./README.md).
- A small PDF with a text layer, with one fact on page 2 that the model cannot know, such as a house code. `makePdf` in `packages/host/flowleap-agent-builder/tests/pdf.ts` makes one: run it with `npx tsx` from a script in the scratchpad.
- For `agent-chat-search`, start the instance with `DSH_VERIFY_PATCH` set to an overlay that sets `contextLimitTokens: 10` on the `flowleap-agent-builder` row, so that a small file is above the limit. An override replaces the row's whole config, so the overlay restates the other fields of the row in `packages/bundle/flowleap-web/cordis.patch.yml`.

- **Form.** Choose `New agent`. The dialog `New agent` shows. Type the name, the description and the instructions into the three text boxes.
- **File.** The browser tool cannot use the system file picker. In `javascript_tool`, make a `File` from the PDF bytes (base64), put it in a `DataTransfer`, set it as `files` of `[role=dialog] input[type=file]`, and send a `change` event that bubbles. The row shows the file name and `Uploads on save`.
- **Connectors.** Choose only `EPO OPS`. `Semantic Scholar` shows `Not configured` and is disabled while its key is absent.
- **Create.** Choose `Create agent`. The dialog title changes to `Edit agent`, the file row shows `Ready`, and the mode line shows `All files in context`.
- **Second view.** `$RUN/home/agents/<id>/` holds `agent.yaml` (name, description, `connectors: [epo-ops]`), `instructions.md`, `files/<name>` and `index.sqlite`. `sqlite3 index.sqlite "select name,state,pages from files"` shows `indexed` and the page count.
- **Picker.** Close the dialog and open the picker. The agent is a row above `New agent`. Choose it.
- **Chat.** Ask for the fact on page 2, with the house code and the file and page. The answer gives the code and `page 2`.
- **Log.** The log summary shows `preset=<agent id>`. The Session log has one `agent-preset/selected` event with the agent id and a `system/message` that holds `Agent instructions` and the markers `=== <file> | page N ===`. In `request/header`, the tool list has no USPTO ODP tool (`get_us_application`, `get_transactions`), no `search_academic` and no `mcp__flowleap__*` tool.
- **Edit.** Open the picker on the agent and choose `Edit agent`. Change the description and choose `Save changes`. The picker row shows the new description.
- **Delete.** In `Edit agent`, choose `Delete agent` and confirm. The picker row goes away, and `$RUN/home/agents/<id>/` is gone.
- **Proof.** Save screenshots of the form after create, the picker, and the answer, and the log summary, in `$RUN/evidence/`.

## Gotchas

- The picker opens and closes on one click. When the menu does not show, click once more after a short wait.
- A Session keeps the agent revision it started with. After `Save changes`, start a new Session to see the change.
- The header of the Session log names the preset at creation (`patent` for a new Session). The agent is in the later `agent-preset/selected` event; `scripts/session-log.mjs` shows the last one.
