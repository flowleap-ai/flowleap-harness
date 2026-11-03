# Firm Record: the `record_read` tool and the Matters page

The Firm Record of flowleap-os is the only writer of the firm's record. In the Web app an attorney reads it in two ways. The Patent Agent calls `record_read` with a file number and gets one matter with its deadlines and the record position (`recordSeq`, `viewHash`) in the Session log; the tool is read-only, and the model cannot confirm a deadline. The `Matters` row of the sidebar (German `Akten`) opens the Matters page, which embeds the Firm Record's own pages from `records/` at the same origin with the client's theme; a confirm goes from that page to the Firm Record through the firm proxy, never through the runtime. Without the Firm Record, as in a plain local run, `record_read` answers `not_configured` and the Matters page says that the firm has no matters yet.

## Sub-features

- `record-read-turn` calls `record_read` once for `FL-2026-0001` and answers with the record position and the due date; the Session log holds `"recordSeq":7` in the tool result.
- `record-read-not-configured` answers `not_configured` when the instance has no Firm Record address.
- `records-page-empty` shows the `Matters` launcher and, on its page, the empty state `No matters yet` when the proxy does not serve `records/`.
- `records-page-embedded` shows the Firm Record's matter list inside the Matters page, without its own top bar, in the client's theme, and the matter page with its Confirm and Reject buttons.

## How to get to it (user POV)

- `record_read`: ask the Patent Agent in a chat for a matter by its file number.
- The Matters page: the `Matters` launcher in the sidebar, between the app launchers. The browser asks `api/flowleap/records-link` once when the page loads.

## Driving it with the browser tool

Preconditions:

- The baseline in [README.md](./README.md).
- A local Firm Record (flowleap-os `lib/record/server.mjs` on its Postgres, see the "Local proof of the Firm Record" section of the flowleap-os verify skill) with the matter `FL-2026-0001` and one proposed R.71(3) deadline, listening at `http://127.0.0.1:<record port>`; its runtime record token in a file that only you read.
- Start the instance with `DSH_VERIFY_PATCH=.agents/skills/verify/features/record-read.patch.yml`, `DSH_VERIFY_RECORD_URL=http://127.0.0.1:<record port>`, and `FLOWLEAP_RECORD_TOKEN=$(cat <token file>)` in its environment. The overlay points the provider at that address; the credential store resolves the ref from the environment like the model keys. Do not write the token into the run directory, a note, or the PR.
- For `records-page-embedded`, write the identity headers of a person of the matter's team to `$RUN/records-headers.json`, for example `{"x-flowleap-starter":"<starter secret>","x-flowleap-user":"admin"}` (the exact headers are in the flowleap-os design note; the starter secret is in `RECORD_DIR/starter-secret` of the local Firm Record), and start the proxy double [`scripts/records-proxy.mjs`](../scripts/records-proxy.mjs) in the background: `node .agents/skills/verify/scripts/records-proxy.mjs 3182 http://127.0.0.1:3180 http://127.0.0.1:<record port> "$RUN"`. Open the `ready:` link with port 3182 in place of 3180. The double forwards `/records/*` to the Firm Record with those headers and everything else to the instance, so both share one origin.

- **Turn.** In a new Session, send `Call record_read for the matter FL-2026-0001 and reply with the record position and the due date only.` The answer names position 7 and `2026-03-02`. `scripts/session-log.mjs` shows the `record_read` call with a result head that starts with `{"recordSeq":7,"viewHash":"` and `turn 1: completed`.
- **Not configured.** Start a second instance without `DSH_VERIFY_PATCH` on another port and send the same request. The answer says that the runtime has no Firm Record; the result head is `{"error":"not_configured",…`.
- **Page, empty.** On the instance port (3180, no proxy), the sidebar shows the launcher `Matters` (role `button`, in the panel list). Select it. The main column shows the `flowleap-records` test id and the status `No matters yet`, with the sentence that the firm has no matters yet. Switch the UI language to German in Settings: the launcher reads `Akten`.
- **Page, embedded.** On the proxy port (3182), select `Matters`. The frame (role `document` inside an `iframe` titled `Matters of the firm`) shows the Firm Record's matter list with `FL-2026-0001` and no top bar; its address ends with `records/?embedded=1&theme=light`. Switch the theme to dark in Settings: the frame reloads with `theme=dark` and a dark page. Open the matter: the page shows the deadline, its four trace steps, and the buttons `Confirm` and `Reject`. Do not press Confirm on a record that the parent keeps; the two-person rule is proved in the flowleap-os verify skill.
- **Second view.** The Firm Record's own log shows the `GET /records/api/matters/FL-2026-0001/view` of the turn with a bearer token, and the `GET /records/?embedded=1` of the page with the identity headers. `scripts/session-log.mjs` holds the record position.

## Gotchas

- The overlay is a `--patch` file, so it applies although the bundle locks the row against user patches.
- `baseURL` must be a loopback or single-label http address, or https; the row fails at load for any other plain-http host.
- The page probes `records/?embedded=1` once when it opens; a proxy started later shows after you select another launcher and `Matters` again.
- A theme change reloads the frame, so an unsaved form inside it is lost.
- Stop the proxy double when the run ends; `web.sh stop` does not know it.
