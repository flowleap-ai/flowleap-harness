# MyEPO link

The firm links its own MyEPO account on the MyEPO card of Settings → Patent data connectors. The card stores the client ID and the secret only after a test passed, then shows the portfolios that the account may read; on a later visit it is one header and one summary line.

## Sub-features

- `myepo-linked` shows the linked card: the status, the portfolio count, the Mailbox, and the last test.
- `myepo-test` runs Test on the linked card against the EPO sandbox and shows the portfolio list.
- `myepo-unlink` removes the link from the menu, and the card shows the not-linked intro, the two collapsed rows and the empty fields.
- `myepo-refused` saves a client ID and a secret that the sandbox refuses; the card says so and stores nothing.

## How to get to it (user POV)

- Choose `Settings` in the sidebar, then `Patent data connectors`. The MyEPO card is first, under `Your firm's EPO account`.

## Driving it with the browser tool

Preconditions:

- The baseline in [README.md](./README.md), started with `DSH_VERIFY_PATCH=.claude/skills/verify/features/myepo.patch.yml`.
- Before `web.sh start`, in the new run directory: `node .claude/skills/verify/scripts/myepo-link.mjs "$RUN"`. It reads the founder's sandbox credentials from `~/.config/flowleap/myepo-sandbox.env`, runs the card's test against the sandbox, and writes the link into the run's writable credential store. It prints the portfolio count only. Never type the real credentials into the page.

- **Linked.** Choose button `Settings`, then `Patent data connectors`. The MyEPO card shows `Linked`, `6 portfolios`, `Mailbox access` and `Last test` with the time of the link.
- **Test.** Choose button `Test` on the MyEPO card. The card shows `Test passed`, `6 portfolios`, `that the account may read`, and a table of six portfolios: `Applicant Portfolio 1` to `Association Portfolio 2`, three `Full` and three `Limited`.
- **Unlink.** Choose button `More acts`, then `Unlink`. The card shows `Not linked`, the four sources, the rows `What FlowLeap reads` and `Set up the account at the EPO`, and the empty `Client ID` and `Client secret` fields. Open both rows once.
- **Refused.** Type `verify-client` in `Client ID` and `verify-wrong-secret` in `Client secret`, then choose `Save and test`. The card shows `Test failed` and `The EPO refused the client ID or the client secret.` The run's `home/.credentials.yaml` has no `flowleap-connectors/myepo` record.
- **Proof.** Save a screenshot of each state in `$RUN/evidence/`, and check that `server.log` holds no part of the client secret.

## Gotchas

- The sandbox answers `ERR_15` for every read until `POST /latest/sandbox/reset` ran once for the account. The founder's account was reset on 2026-11-09; the card then shows `Test failed` with `the MyEPO sandbox has no data before its reset (ERR_15)`.
- `Test` sends three requests to the sandbox. Do not repeat it in a loop.
- The settings dialog covers the page. Close it with button `Close` before you use the composer.
