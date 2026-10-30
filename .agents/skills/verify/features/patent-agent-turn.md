# Patent Agent turn

An attorney opens a new Session, the Patent Agent preset answers on the default model, and the agent can call the office tools on the firm's keys.

## Sub-features

- `turn-ping` sends one message and gets an exact answer on the OpenRouter route.
- `turn-office-tool` gets one EPO record through an office tool.
- `turn-no-web` asks for web search and gets an answer that no web tool is available.

## How to get to it (user POV)

- Open the app URL. The start page shows the composer with the `Patent Agent` preset.
- Choose `New session` in the sidebar for each later Session.

## Driving it with the browser tool

Preconditions:

- The baseline in [README.md](./README.md).
- For `turn-office-tool`: the EPO OPS card shows `Configured`.

- **Ping.** Fill the textbox `Describe what you want to build, / commands, @ files or sessions` with `Verification ping. Reply with exactly: FLOWLEAP-VERIFY-OK` and press Enter. The answer `FLOWLEAP-VERIFY-OK` shows, the tab title changes to the Session title, and the sidebar lists the Session under `Default workspace`.
- **Ping log.** Run `node .claude/skills/verify/scripts/session-log.mjs "$RUN/home" > "$RUN/evidence/turn-ping.session.txt"`. The summary shows `preset=patent`, `routes: openrouter/anthropic/claude-haiku-5.5`, `turn 1: completed`, no tool calls, and `assistant: FLOWLEAP-VERIFY-OK`.
- **Office tool.** In a new Session, send `Call get_bibliography for EP3456789 once. Then reply with only the title.` The answer is one title line.
- **Office tool log.** Run the log summary again. It shows `tool (turn 1): get_bibliography` with a JSON result head, and `turn 1: completed`.
- **No web.** In a new Session, send `Can you search the web?` The answer says that no web tool is available in this Session.
- **No web log.** Run the log summary. It shows `turn 1: completed` and no tool calls. The summary does not list the declared tools, so run `grep '"type":"request/header"' <log file> | grep -c 'web_search\|web_fetch'` on the Session log file that the summary names. It prints `0`.
- **Proof.** Save a screenshot of each answer in `$RUN/evidence/`.

## Gotchas

- The first request of a Session writes about 60,000 to 70,000 tokens to the cache (`cacheWrite` in the summary). This is the system prompt and the tool list, not the message.
- The model button names the OpenRouter display name `Anthropic: Claude Haiku 5.5`. The route in the log is the proof of the provider.
- The paid tools have the `mcp__flowleap__` prefix. The office tools have no prefix. Ask for the office tool by its exact name.
- Without the EPO OPS key, `get_bibliography` answers with one sentence that names the settings card. Report the feature as not verified.
