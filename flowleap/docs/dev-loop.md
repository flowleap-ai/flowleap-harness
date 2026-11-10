# The development loop

FlowLeap Patent AI has two local loops. Use the development loop to build a change, and the local firm to test a round of changes.

| Loop | Command | Use it for | A change shows after |
|---|---|---|---|
| Development loop | `flowleap/dev-loop.sh` of this repository | Building: client screens, Host plugins, agent tools, prompts, and the Firm Record's API, against the seed firm | a client edit: about 1 s, with no restart; a Host edit: `restart`, about 8 s |
| Local firm | `scripts/local-firm.sh` of flowleap-os | Each test round, and every change to the installer, the image, the sandbox, the sign-in, the per-attorney containers, the gateway, the updater or the release gate | a new image (about 10 minutes), then `local-firm.sh up` (2 to 5 minutes) |

The local firm is the only path to the test firm: `release/gate.sh` refuses a candidate without its local-firm pass. The development loop proves nothing about a firm, so a change is not done until a local firm round passes.

## What the development loop runs

One command starts six processes on this Mac. They do not collide with the local firm (Lima VM `flowleap-local-firm`, port 14180) or with the default ports of the verify skills (3180, 8095).

| Process | Port | Source |
|---|---|---|
| Postgres of the Firm Record, in Docker | a free port | flowleap-os `.claude/skills/verify/scripts/record-local.sh` |
| The Firm Record service, from source | 8276 | flowleap-os `lib/record/server.mjs` |
| The record's local proxy (`/records/_as/<a, b, c, admin>`) | 8275 | flowleap-os `lib/record/local-proxy.mjs` |
| dsh with the `flowleap-web` profile, from source | 3271 | this checkout, `apps/cli/src/bin.ts` with [`dev-loop.patch.yml`](../dev-loop.patch.yml) |
| The records proxy: the app and `/records/*` at one origin, with the person's headers | 3270 | [`records-proxy.mjs`](../../.agents/skills/verify/scripts/records-proxy.mjs) of the verify skill |
| The client watchers (`tsc --watch`, tsdown, Vite), polling every 500 ms | none | `scripts/dev-web.ts --poll --skip-build --no-serve`, as `pnpm run dev:web` |

The record holds the seed firm ([flowleap-ai/flowleap-seed-firm](https://github.com/flowleap-ai/flowleap-seed-firm), pinned by the flowleap-os checkout): `acceptance/seed-firm.mjs` loads the persons, the clients' AI rules and the seven matters on each `up` (a second run appends nothing), and `acceptance/seed-letters.mjs` forwards the 18 register PDFs once per run dir. The intake persons are the seed's formalities users, as on the local firm.

## Use it

Start the loop. `--os` names the flowleap-os checkout whose Firm Record and seed you want; keep it on the commit you test against.

```bash
flowleap/dev-loop.sh up --os ~/flowleap/flowleap-os
```

The first run in a checkout builds the artifacts once (`pnpm run build:artifacts`). `up` prints the app's link with its access token on port 3270. Open that link; do not put the token in a PR or a note.

`--patch <overlay>` adds one overlay after `dev-loop.patch.yml`, for example the connector keys as a read-only credential file (as the [verify overlay](../../.claude/skills/verify/verify.patch.yml) does) or the `firmIdentity` of Add client. Keep that file outside the checkout. `restart` uses it again.

You act as one seed user, default `jonas`. Change the person at any time, with no restart:

```bash
flowleap/dev-loop.sh as lena
```

The person applies to the Matters panel (the records proxy sends that person's sign-in headers) and to the agent's `record_read` (the one dev token moves to that person's file in the record's `runtime-tokens/`). Any seed handle works (`partner`, `anna`, `jonas`, `lena`, `sabine`, `tobias`, `miriam`, `felix`), and `admin` is the local admin. Two people are necessary for the two-person deadline check: propose as `jonas`, then `as lena` and confirm.

Check the agent's record path with no model call:

```bash
flowleap/dev-loop.sh probe SF-2021-0011
```

It starts a second dsh with the probe plugin of flowleap-os (`scripts/local-firm/record-read-probe.mjs`), which sends one `record_read` through the tool executor, and prints the JSON that the model reads. It fails when the answer has no `recordSeq`.

After an edit:

- Client code (`packages/client/*`, `src/client/*` of a package, locale dictionaries): save. The watchers rebuild the bundle and the open page swaps the module with no reload; the main column goes back to a new Session.
- Host code (a plugin's Host half, an agent tool, a prompt, `cordis.patch.yml`): `flowleap/dev-loop.sh restart`. dsh runs from source through tsx, so there is no build. The open page keeps its sign-in; the link in the log has a new token after each start.
- The Firm Record (`lib/record/` of flowleap-os): `flowleap/dev-loop.sh down` and `up`. The data stays.

`flowleap/dev-loop.sh status` shows what runs and as whom. `flowleap/dev-loop.sh down` stops everything. Nothing stays up after `down`; the record's data, the seed and the Sessions stay in the run dir (`~/.local/share/flowleap-harness/dev-loop`, or `FLOWLEAP_DEV_RUN`). Remove the run dir to start with an empty record.

## The MyEPO double

`up --myepo-double` also starts the [MyEPO double](../../packages/host/flowleap-connectors/tests/myepo-double/README.md) on `<port>+3` (default 3273) and adds [`myepo-double.patch.yml`](../myepo-double.patch.yml), so the MyEPO link calls the double. The double serves the seed firm's real public EP files as public sample data; it is not a live MyEPO account. `up` prints its client ID and secret. Type them on Settings → Connectors → MyEPO and choose `Save and test`. To make the waiting Rule 71(3) letter of SF-2023-0045 arrive, and to restore the Mailbox:

```bash
curl -X POST http://127.0.0.1:3273/_double/arrive
```

```bash
curl -X POST http://127.0.0.1:3273/_double/reset
```

`--myepo-double` also starts the firm's [MyEPO letter reader](../../packages/host/flowleap-connectors/README.md#the-myepo-letter-reader) against the double. It reads the unhandled letters every 5 seconds and sends each new letter to the Firm Record's intake, so some seconds after `arrive` the letter is filed on SF-2023-0045 with its office event, its proposed deadline (2027-01-29) and the task Confirm the deadline. Its log is `<run dir>/logs/myepo-reader.log`. The seed letters leave out the rows that the reader takes from the double (rows 6, 15, 16 and 18), so the record has each letter once. A run dir whose seed letters were loaded without `--myepo-double` has those rows already, and `up --myepo-double` stops with a message: give a new `FLOWLEAP_DEV_RUN`.

`status` shows the double's and the reader's processes, and `down` stops them. The Mailbox state is lost when the double stops. A later `up` converges to its own options: with another `--port` it moves the double, the host and the proxy to the new ports; without `--myepo-double` it stops the double and starts the host without its overlay.

## Model keys

The loop reads `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY` and `DEEPSEEK_API_KEY` from your shell's environment and writes no key to the run dir or the repository. With no key, the app starts, the Matters panel and `probe` work, and a chat fails at its model call.

New chats use the default model of the `flowleap-web` profile (its `agent-default-model` row, `anthropic/claude-sonnet-5-5`). `--model <provider>/<model id>` sets another default for this loop through an overlay in the run dir, for example `--model openrouter/anthropic/claude-sonnet-5.5` with only an OpenRouter key. `up` and `restart` stop with a message when the default model's provider has no key in your shell while the shell has another model key, so a new chat does not fail with "No model is set up". `status` shows the default model.

## Measured

On the founder's Mac (M1 Pro, 32 GB), 2026-11-06:

| Step | Time |
|---|---|
| Once per checkout: `pnpm install`, then `pnpm run build:artifacts` | 23 s, then 195 s |
| First `up` with a new run dir and no `lib/record/node_modules` (the Postgres image was present) | 56 s |
| `up` with a new run dir: the record, the seed firm, the 18 letters, dsh | 15 s |
| `up` with the data of an earlier run | 10 to 13 s |
| The client watchers ready, from the start of `up` | about 25 s |
| A client edit, from save to the new module in the open page (3 samples) | 0.6 s, 0.9 s, 2.6 s |
| A Host edit: `restart` (2 samples) | 7.5 s, 8.4 s |
| `as <seed handle>` | under 1 s |
| `probe` | 4 s |

The watchers poll because native watching on macOS keeps one file descriptor open for each watched file: one loop held about 120,000, and the Mac's limit for all processes is 245,760. Polling costs about half of one CPU core while the loop waits.

## Limits

- No sign-in proxy, no per-attorney container, no sandbox, no gateway and no updater: the app runs as one process with the developer's account. Test those on the local firm.
- The Matters panel reads the record directly through the records proxy; the Firm admin link and the budget cards have no backend and show their empty states.
- Every seed PDF is page images only, so reader 1 makes each letter `unreadable`: it waits in the intake for an intake person. Act as `sabine` to see it.
