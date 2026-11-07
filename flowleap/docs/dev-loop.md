# The development loop

FlowLeap Patent AI has two local loops. Use the development loop to build a change, and the local firm to test a round of changes.

| Loop | Command | Use it for | A change shows after |
|---|---|---|---|
| Development loop | `flowleap/dev-loop.sh` of this repository | Building: client screens, Host plugins, agent tools, prompts, and the Firm Record's API, against the seed firm | a client edit: about 1 s, with no restart; a Host edit: `restart`, about 8 s |
| Local firm | `scripts/local-firm.sh` of flowleap-os | Each test round, and every change to the installer, the image, the sandbox, the sign-in, the per-attorney containers, the gateway, the updater or the release gate | a new image (about 10 minutes), then `local-firm.sh up` (2 to 5 minutes) |

The local firm is the only path to the test firm: `release/gate.sh` refuses a candidate without its local-firm pass. The development loop proves nothing about a firm, so a change is not done until a local firm round passes.

## What the development loop runs

One command starts six processes on this Mac (`--demo` adds the starter, the mailbox and one Ticket runtime for each woken person). They do not collide with the local firm (Lima VM `flowleap-local-firm`, port 14180) or with the default ports of the verify skills (3180, 8095).

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

## The full first demo

`up --demo` runs the first demo of atlas sheet 00 with no manual step, from the letter in the AI mailbox to Review the work of the attorney. Use a new run dir, because the seed letters go in once per run dir:

```bash
FLOWLEAP_DEV_RUN=~/.local/share/flowleap-harness/demo flowleap/dev-loop.sh up --os ~/flowleap/flowleap-os --demo --officecli <OfficeCLI 1.0.160 binary>
```

It needs:

- `OPENROUTER_API_KEY` in the shell: the Ticket run uses OpenRouter (`anthropic/claude-haiku-5.5`), the run model of the local record.
- The OfficeCLI 1.0.160 binary of this Mac (`--officecli` or `FLOWLEAP_OFFICECLI`). The loop pins its SHA-256 at `up`.
- A Mistral key file with the line `MISTRAL_API_KEY=...` (default `~/.config/flowleap/mistral.env`, or `--ocr-key-file`) and the firm's runtime image (default `registry.flowleap.co/flowleap/runtime:current`, or `--image`). `seed-letters.mjs` of flowleap-os reads each of the 18 scans with OCR in a one-shot container of that image through a local model gateway. That is 18 OCR calls, about USD 0.30. Reader 2 uses `OPENROUTER_API_KEY` through the same gateway. The keys go only to the gateway.

In addition to the normal loop, `--demo` does these steps:

1. **Setup.** [`dev-loop-demo-setup.mjs`](../dev-loop-demo-setup.mjs) records what the seed firm does not record yet: the OpenRouter provider contract, the AI wishes of the client of SF-2023-0045 (AI drafts and the client report allowed), and one sign-in of each seed person, so that the notices have mail addresses. A second `up` appends nothing.
2. **Letters and the reader loop.** `seed-letters.mjs --readers 240` of flowleap-os sends the 18 letters from the scan mailbox `scan@<seed domain>` (the record's `intake.scanMailboxes`; the loop sets the firm domain to the seed's), and reader 1 reads each scan with OCR. Its mailbox then stays as the reader loop for 240 minutes: reader 2 (`google/gemini-3.1-flash-lite` on OpenRouter) reads each filed letter of a client that allows AI, with no manual pass. The letters go in once per run dir; a later `up` starts the reader loop again with `--readers-only`, and `down` ends it with Ctrl-C (SIGINT), so it stops its gateway. The log is `logs/mailbox.log`, and the evidence of seed-letters is in `seed/`.
3. **The starter.** The loop acts as the host of a firm. When a confirmed deadline opens a Ticket, the Work router of the record writes `starter/requests/<person id>`. The starter then starts that person's Ticket runtime on port `<port>`+10 (the next person on +11), with the Ticket overlay of `flowleap-ticket`, the Office rows, the firm templates of `examples/local-run/templates/` (the letter to the EPO and the client report) and [`dev-loop-ticket.patch.yml`](../dev-loop-ticket.patch.yml). It writes the runtime's own record token to `runtime-tokens/<person id>` and the person's Ticket key to `ticket-keys/<person id>`, and then `starter/runtimes/<person id>.json`. The Work router posts the Ticket, and the run starts. The log is `logs/starter.log`, and each runtime's log is `runtimes/<person id>/dsh.log`.

The demo starts as `tobias` (the formalities person of SF-2023-0045). The path:

1. As `tobias`, open My work: **File this letter** for the R71(3) letter of SF-2023-0045 (OCR reads the application number, so the record proposes the matter). File it.
2. Within seconds the reader loop reads the filed letter with reader 2. When the two readings agree, the engine proposes the deadline, and Tobias has **Confirm the deadline** (Fri, 29 Jan 2027). When they differ, Tobias first has **Check the office event**. Confirm it.
3. The Ticket wakes Dr. Anna Becker's runtime. The starter starts it (about 35 s), and the run proposes the draft reply to the EPO on `epo-reply.docx`, then the client report on `client-report.docx`, and finishes (about 3 minutes).
4. **Sign out** and choose Dr. Anna Becker (or `dev-loop.sh as anna`): My work has **Review the work**, with both drafts.

A person with a Ticket runtime keeps that runtime's record token, because the record finds a token in one person's file only. So after `as anna` the Records screens work, but the chat agent of the app cannot read the record as Anna. `restart` and `down` stop the Ticket runtimes and remove `starter/runtimes/*.json`; the next wake starts them again from source.

## Sign out

When the records row of the bundle has `signOutHref` (harness PR 346), the loop adds [`dev-loop-signout.patch.yml`](../dev-loop-signout.patch.yml): **Sign out** in the account menu goes to `/_dev/people`, a person picker of the records proxy. A choice runs `dev-loop.sh as <handle>` and opens the app as that person. Without that row, the account menu has no Sign out, and `dev-loop.sh as` changes the person.

## Model keys

The loop reads `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY` and `DEEPSEEK_API_KEY` from your shell's environment and writes no key to the run dir or the repository. With no key, the app starts, the Matters panel and `probe` work, and a chat fails at its model call.

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
| `up --demo` with a new run dir, after the build: the record, the setup, the 18 letters with OCR, the reader loop (2026-11-08) | 246 s for the letters and the reader loop |
| The demo after Tobias confirms: the wake, the Ticket runtime, the run of Anna (OpenRouter `anthropic/claude-haiku-5.5`) | about 3 minutes |

The watchers poll because native watching on macOS keeps one file descriptor open for each watched file: one loop held about 120,000, and the Mac's limit for all processes is 245,760. Polling costs about half of one CPU core while the loop waits.

## Limits

- No sign-in proxy, no per-attorney container, no sandbox, no gateway and no updater: the app runs as one process with the developer's account. Test those on the local firm.
- The Matters panel reads the record directly through the records proxy; the Firm admin link and the budget cards have no backend and show their empty states.
- Every seed PDF is page images only, so reader 1 makes each letter `unreadable`: it waits in the intake for an intake person. Act as `sabine` to see it.
