---
kind: upgrade-guide
description: "Each record_propose_report statement needs a { page, quote } span, so a Ticket run needs a Firm Record that serves the document text and finds the quote."
---

# A report statement quotes its letter as `{ page, quote }`

## Change

Before this release, a source of a `record_propose_report` statement had an optional `span` of `{ page, start, end, quote }`, and the Firm Record stored the offsets that the run sent. Now every source needs a `span` of `{ page, quote }`: the run reads the letter text with the new tool `record_read_document_text` (`GET records/api/documents/<sha256>/text`), copies the quote from that page, and sends no offsets. A `span` with `start` or `end` is a tool error. The Firm Record finds the quote on the page and stores the offsets; it refuses a quote that is not on the page or that stands on it more than once.

This affects each firm that runs a Ticket run: the `dsh-experimental-flowleap-ticket` overlay with `dsh-flowleap-record` against a Firm Record of flowleap-os. An older Firm Record answers 404 to the text read and stores no offsets for a quote, so the run cannot propose a report. The harness and flowleap-os must update together.

## Migration

1. Update flowleap-os to a build that holds the Records API of [`packages/host/flowleap-record`](../../../../packages/host/flowleap-record/README.md#the-run-commands): branch `claude/r1-ipms-api` of flowleap-os (commit `b1eba03`), until a flowleap-os release after `2026.11.04.1130` holds it. Update the harness in the same change window.
2. Remove `start` and `end` from each `span` in any prompt, fixture, or program of your own that calls `record_propose_report`.
3. Confirm the migration: run one Ticket, as the `ticket-run-report` case of [the verify skill](../../../../.agents/skills/verify/features/ticket-run.md) does. The run calls `record_read_document_text` before `record_propose_report`, the proposal gets `201`, and the work page of the Matters panel shows each statement with its quote and page.
