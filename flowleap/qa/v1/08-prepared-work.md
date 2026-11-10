# 8. Prepared work on a letter

When a letter of a prepared type arrives, the agent prepares and checks; the attorney decides and writes ([principle 1](../../docs/2026-11-08-problem-and-principles.md)). The Ticket run for Rule 71(3) and its client report are merged (`flowleap-ticket`, os PR 67); the draft reply is in draft PR 347. The second letter type is not named; decision 6 of the scope recommends Art. 94(3), which is not started.

Edge cases of this area: the agent tries to decide; the client's AI wishes are not recorded; no provider contract; the run fails; a second letter on the same day; the record moves under the run; a statement with no source; a person who is not the routed attorney decides; German.

### PREP-01. A Rule 71(3) letter gets prepared work

- **Mark:** WIP. Parts: Today (the Ticket run and the client report); WIP (the draft reply, PR 347).
- **Lines:** V18, V17.
- **Story:** As Anna, I want the agent to prepare the Rule 71(3) review of SF-2023-0045, so that I decide with the facts, the differences, the risks and the questions in front of me.
- **Start:** L with Renishaw `allowed` (seed PR 2) and a recorded provider contract. Row 18 filed; deadline active.
- **Steps:** 1. The Ticket opens and is routed to Anna. 2. The run ends. 3. Anna opens the prepared work.
- **Expected:** The work shows the text intended for grant against the last filed claims, the question of a divisional application, the fees and their dates, and the questions for the client. Each statement carries its source. It is a proposal: Anna approves, changes or rejects each part. No letter is sent.
- **Proof:** the existing tests `flowleap-ticket/tests/delivery.spec.ts` and os `test/record-r1.test.mjs` (tracer); by hand on L.

### PREP-02. An Art. 94(3) letter gets prepared work

- **Mark:** New (no mandate for Art. 94(3) in `flowleap-ticket`; decision 6).
- **Lines:** V18.
- **Story:** As Jonas, I want the agent to prepare the Art. 94(3) communication of SF-2024-0007, so that I write the reply from the objections, the cited documents and candidate arguments with their evidence.
- **Start:** L. Row 6 and its annex row 7 filed on SF-2024-0007 (German). WAGO `allowed`.
- **Steps:** 1. The run ends. 2. Jonas opens the prepared work.
- **Expected:** Each objection of the examiner with its place in the letter; each cited document with what the examiner says it shows; candidate arguments, each with its evidence; the questions for the client. No finished reply text.
- **Proof:** new test.

### PREP-03. The agent never decides

- **Mark:** Today.
- **Risk:** Deadline.
- **Lines:** V18, V2.
- **Story:** As Dr. Krüger, I want the record to refuse every decision of a runtime, so that the agent cannot decide, file, send or pay, whatever its input says.
- **Start:** os test setup, or L with a runtime token.
- **Steps:** 1. The runtime calls the decide, confirm and file routes.
- **Expected:** Each is refused with `agent-cannot-decide` (403). The record has no new decision.
- **Proof:** the existing os test `test/record-r1.test.mjs`.

### PREP-04. The client's AI wishes are not recorded

- **Mark:** Today.
- **Risk:** Wrong person.
- **Lines:** V18.
- **Story:** As Lena, I want no agent run on a matter whose client's AI wishes are not recorded, so that no client file goes to a model without the client's consent.
- **Start:** L with the seed main branch (Renishaw `null`). Row 16 filed on SF-2023-0042.
- **Steps:** 1. The Ticket opens. 2. Lena opens it.
- **Expected:** "By hand: Renishaw's AI wishes are not recorded", with the act to record them. No model call in the gateway log for this matter.
- **Proof:** the existing os test `test/record-r1.test.mjs` (`ticket.no-run-without-client-wishes`); by hand.

### PREP-05. The run fails

- **Mark:** WIP. Parts: Today (os `run_failed`); WIP (the screen in PR 346).
- **Risk:** Deadline.
- **Lines:** V18, V13, V22.
- **Story:** As Anna, I want a run that fails to give me the task to start it again or take it by hand, so that the letter is not forgotten.
- **Start:** L. Anna's budget set to 0, or the model gateway stopped.
- **Steps:** 1. The Ticket run starts and fails. 2. Anna opens My work. 3. Anna opens her own chat.
- **Expected:** "Start the work again or take it by hand" with the reason ("budget used" or "model not reachable"). The deadline is not changed. Anna's chat still answers.
- **Proof:** by hand on L.

### PREP-06. A second letter on the same application and day

- **Mark:** Today (by hand; os groups one Ticket for each application and day).
- **Lines:** V18.
- **Story:** As Jonas, I want the annex that arrives with the Art. 94(3) letter to join the same work, so that the agent reads both and I get one result.
- **Start:** L. Row 6 filed; the run is in progress. Row 7 (the annex, same day) filed.
- **Steps:** 1. Row 7 is filed. 2. Jonas opens the work.
- **Expected:** One Ticket with both letters. The run restarts or a second pass runs; proposals that the annex changes show "changed by the annex".
- **Proof:** by hand; new test.

### PREP-07. Every statement carries its source

- **Mark:** Today (by hand; no automated check).
- **Risk:** Distrust.
- **Lines:** V18, V17.
- **Story:** As Anna, I want no statement without its source in the prepared work, so that I can check each one.
- **Start:** After PREP-01.
- **Steps:** 1. Read each statement of the prepared work and open its source.
- **Expected:** Each source opens the place (the letter page, the claim, the register entry, the fee table). No statement has no source.
- **Proof:** by hand; new test: a check of the evidence ledger of the run.

### PREP-08. Only the routed attorney decides

- **Mark:** Today.
- **Risk:** Wrong person.
- **Lines:** V18, V2.
- **Story:** As Jonas, I want only me (the routed attorney) to decide the Ticket of my matter, so that a colleague does not decide my client's work.
- **Start:** L. The Art. 94(3) Ticket of SF-2024-0007 routed to Jonas (seed case S4).
- **Steps:** 1. Lena tries to decide it. 2. Dr. Krüger tries to decide it. 3. Jonas decides it.
- **Expected:** Steps 1 and 2 are refused (`not-routed-person`), with "Routed to Jonas Weber". Step 3 is recorded.
- **Proof:** the existing os test `test/record-r1.test.mjs`.

### PREP-09. The record moves under the run

- **Mark:** Today (by hand; no test of this case).
- **Risk:** Distrust.
- **Lines:** V18.
- **Story:** As Anna, I want proposals made on facts that changed during the run to show as "stale", so that I never approve work on old facts.
- **Start:** L. A run in progress on SF-2023-0045. Lena records a client instruction on the matter during the run.
- **Steps:** 1. The run ends. 2. Anna opens it.
- **Expected:** The proposals that depend on the changed facts are "stale" with the change named; a second pass runs or is offered.
- **Proof:** by hand; new test.

### PREP-10. Prepared work in German for a German letter

- **Mark:** New. Parts: Today for Rule 71(3) (row 2 is German); New for Art. 94(3).
- **Lines:** V18.
- **Story:** As Jonas, I want the prepared work of a German letter in German, so that I can send the client questions without translating them.
- **Start:** L. A German Rule 71(3) letter of a WAGO matter.
- **Steps:** 1. Open the prepared work.
- **Expected:** The text is German, the quoted letter passages are the German original, and the sources open the German letter.
- **Proof:** by hand.

### PREP-11. The agent's prepared work does not change the deadline

- **Mark:** Today.
- **Risk:** Deadline.
- **Lines:** V18, V12.
- **Story:** As Dr. Krüger, I want the run to read the deadline and never change it, so that only a person changes a date.
- **Start:** L. A run on SF-2023-0045 whose input says that the period is shorter.
- **Steps:** 1. The run ends. 2. Open the deadline's activity.
- **Expected:** No change by the agent. If the run finds a difference, it is a proposal for a person, shown on the work and on the deadline.
- **Proof:** the existing os test `test/record-r1.test.mjs` (`agent-cannot-decide`); by hand.
