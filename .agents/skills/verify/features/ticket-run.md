# Ticket run: the AI mailbox wakes the attorney's runtime

An office letter that reaches the firm's AI mailbox opens a Ticket in the Firm Record of flowleap-os. The Work router signs a Ticket delivery and posts it to `POST /api/flowleap/ticket` of the responsible attorney's runtime. The runtime opens one run Session whose first message starts with the Mandate ("analyse and draft, never file, send or pay"). The agent reads the matter with `record_read`, writes the client report on the firm template with `office_letter_from_template`, proposes it with `record_propose_report`, and ends with `record_finish_run`. The attorney decides in the Records app, never in the run. No sidebar row and no composer step belong to this feature: the attorney sees the result as a Ticket card in the Records app and as the reply mail.

## Sub-features

- `ticket-ingress-signature`: a delivery with a wrong `X-Flowleap-Signature` gets 401; a good one gets 202 with no session cookie; a repeat of the same `X-Flowleap-Delivery` gets 200 and opens no second Session.
- `ticket-run-mandate`: the run Session's first user message starts with the Mandate, and its source is `webhook` / `flowleap-ticket` / `<ticket id>/<pass>`.
- `ticket-run-report`: the run calls `record_read`, `office_letter_from_template`, `record_propose_report` and `record_finish_run`, and ends `turn 1: completed`; the Firm Record shows the Ticket in `proposals_ready`.

## How to get to it (user POV)

- A person forwards an office letter to the AI mailbox. The flowleap-os verify skill, section "Local proof of the Firm Record", runs the mailbox side with a fake Microsoft Graph. This file covers the runtime side.

## Driving it with the browser tool

Preconditions:

- A local Firm Record of flowleap-os (`record-local.sh start <rec run> <port>`) with a matter whose responsible person is person A, the client's AI wishes (`aiUse` and `aiLetters` `allowed`) and a model provider contract for `openrouter`. Its run dir holds `runtime-tokens/<A>` and `ticket-keys/<A>`; never print them.
- The OfficeCLI 1.0.160 binary of this Mac, and a template folder with `client-report.docx` (copy `packages/host/flowleap-office/tests/fixtures/firm-template.docx`; it needs the fields `datum`, `ihr_zeichen` and `zeichen`).
- One overlay file that joins [`packages/experimental/flowleap-ticket/examples/local-run/cordis.yml`](../../../../packages/experimental/flowleap-ticket/examples/local-run/cordis.yml) and [`office.patch.yml`](office.patch.yml): `cat` both into one file, because `DSH_VERIFY_PATCH` takes one file.
- Start the instance with `DSH_VERIFY_PATCH=<joined file>`, the Office variables of [office.md](office.md), `FLOWLEAP_RECORD_URL=http://127.0.0.1:<record service port>`, `FLOWLEAP_RECORD_TOKEN` and `FLOWLEAP_TICKET_SECRET` from the two files of person A, `FLOWLEAP_TEMPLATES_DIR=<template folder>` and `FLOWLEAP_RUN_WORKSPACE=<an empty folder>`.
- Act as the host that starts runtimes: write `<rec run>/starter/runtimes/<A>.json` with `{"url":"http://127.0.0.1:<instance port>/","session":"local-proof"}`. The Work router reads it after it writes `starter/requests/<A>`.

Steps:

- **Run.** Let the flowleap-os side record the office event (or post the reading as its verify skill says). The Firm Record log shows `ticket/wake-started`, then `ticket/run-started` from the runtime. Wait until the matter view shows the Ticket in `proposals_ready`.
- **Log.** Run `node .claude/skills/verify/scripts/session-log.mjs "$RUN/home" > "$RUN/evidence/ticket-run.session.txt"`. It shows the route `openrouter/anthropic/claude-haiku-5.5`, a session id that starts with `webhook-`, the four tool calls, and `turn 1: completed`.
- **Second view.** The letter is in `FLOWLEAP_RUN_WORKSPACE`; the Records app's Ticket card shows the report as Proposed with its statements, and the reply as Sent.

## Gotchas

- The model can miss template fields or write a statement over 200 characters; the tool result names the fault and the model corrects it. Each retry is in the Session log.
- The agent has no tool to read the letter itself yet, so its statements cite the whole letter, not a span.
- A run for a client whose `aiLetters` is not `allowed` cannot finish (there is no by-hand command yet), so the Firm Record makes it `run_failed` at its time limit.
- `ctx.logger.warn` lines of this composition do not reach `server.log`, so a 401 or a refused `run-started` is not visible there.
- Proven live on 2026-11-04: `ticket-run-mandate` and `ticket-run-report` (evidence `~/.local/share/flowleap-os/evidence/r1/live/`); `ticket-ingress-signature` in the delegate's smoke run of the same day.
