# Connectors

The attorney sees which firm keys are set, tests each connection, and the agent uses the office tools on those keys and the paid FlowLeap tools through the signed-in CLI.

## Sub-features

- `connectors-cards` shows one card per connector with its state.
- `connectors-test` runs Test connection on a configured card.
- `connectors-paid-tool` calls one `mcp__flowleap__*` tool in a turn.
- `connectors-drawing` shows a drawing page from EPO OPS on the firm's key, with no FlowLeap host.

## How to get to it (user POV)

- Choose `Settings` in the sidebar, then `Connectors`.
- A turn reaches the tools through the Patent Agent preset.

## Driving it with the browser tool

Preconditions:

- The baseline in [README.md](./README.md).
- For `connectors-paid-tool`: doctor shows `PASS flowleap CLI: signed in`.

- **Cards.** Choose button `Settings`, then `Connectors`. The page text lists `EPO OPS`, `USPTO ODP`, `Semantic Scholar`, `Mistral`, each with `Configured` or `Not configured`. With the founder's keys, EPO OPS, USPTO ODP and Mistral are `Configured`.
- **Test connection.** Choose the first button `Test connection` (the EPO OPS card). The status `EPO OPS: access token issued` shows, and the card shows `Connection test passed`. The USPTO ODP and Mistral cards have their own `Test connection` buttons.
- **Paid tool.** In a new Session, send `Call mcp__flowleap__patstat_resolve with q "Toshiba" once. Then reply with only the first candidate name.` The log summary shows `tool (turn 1): mcp__flowleap__patstat_resolve` and a JSON result head with `candidates`.
- **Drawing.** In a new Session, send `Show me the drawing on page 6 of EP4831432A1. Call get_patent_image once without include_images, then once with include_images=true, pages [6], fit "compact". Then reply in one sentence: what FIG. 1 on page 6 shows, with two reference numerals you can see.` The log summary shows two `get_patent_image` calls (no `mcp__flowleap__` prefix). The Session log has the text `Page 6 of EP4831432` and a `"type":"image"` block. The answer names numerals of FIG. 1, such as 3, 5, 1U and 1L. The tool list in the log has no `mcp__flowleap__get_patent_image`.
- **Proof.** Save a screenshot of the card status and the log summary in `$RUN/evidence/`.

## Gotchas

- The firm keys are read-only in a verification run. Each configured card shows `The credential store is read-only in this deployment.`, and `Save` and `Remove` are disabled.
- The settings dialog covers the page. Close it with button `Close` before you use the composer.
- `Test connection` sends a request to the office. Do not repeat it in a loop: EPO OPS has a fair-use limit.
- A doctor `WARN flowleap CLI` line means the paid tools are absent. Report `connectors-paid-tool` as not verified.
