# Budget warning of the model gateway

When the firm's model gateway sends `x-flowleap-budget-warning` on a model response, the composer of that Session shows "Notice from the model gateway: <text>" as its own status line, apart from command results. The next response without the header removes the line. The model never sees the warning, and the Session log does not hold it.

## Sub-features

- `budget-notice-show` shows the notice after a turn whose response carries the header.
- `budget-notice-clear` removes the notice after a turn whose response carries no header.

## How to get to it (user POV)

- Send any message in a Session that runs on a gateway route. The line shows above the composer.

## Driving it with the browser tool

Preconditions:

- The baseline in [README.md](./README.md).
- Start the gateway double [`scripts/budget-gateway.mjs`](../scripts/budget-gateway.mjs) in the background: `node .claude/skills/verify/scripts/budget-gateway.mjs 3299 "$RUN/budget-warning.txt"`. It forwards to OpenRouter and adds the header, with the text of the file, while the file exists.
- Start the instance with `DSH_VERIFY_GATEWAY_URL=http://127.0.0.1:3299` and `DSH_VERIFY_PATCH="$PWD/.claude/skills/verify/features/budget-warning.patch.yml"`. The overlay sends the `openrouter` route through the gateway double.

- **Show.** Write one line to `$RUN/budget-warning.txt`, for example `You used 85 % of your monthly model budget: 42.50 USD of 50.00 USD in 2026-10 (UTC).` Send `Reply with exactly: FLOWLEAP-VERIFY-OK`. When the answer shows, a `status` element holds `Notice from the model gateway: <line>`.
- **Clear.** `rm "$RUN/budget-warning.txt"`, then send the same message again. When the answer shows, no element holds `Notice from the model gateway`.
- **Not logged.** `grep -c '85 %'` on the Session log file answers `0`.
- The gateway double prints one line for each request, with `+warning` when it added the header.

## Gotchas

- Each turn is a full Patent Agent request, about 69,000 input tokens. Two turns prove both sub-features.
- The overlay restates every route of the bundle row, because an override replaces the row's whole config.
- Stop the gateway double when the run ends; `web.sh stop` does not know it.
