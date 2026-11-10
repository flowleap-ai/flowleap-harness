# 5. The deadline

FlowLeap computes the deadline of an office event with its rule and its reasons, and a person confirms it. The deadline engine is [flowleap-deadlines](https://github.com/flowleap-ai/flowleap-deadlines); today it has one rule, Rule 71(3) v1, and the calendars of 2025 to 2027. The confirmation levels and the automatic confirm in shadow mode are in S16 sheet 08 (not committed). The founder's rule: confirmed automatically only when the event comes from a structured source, the rule version is signed by an attorney, and a second independent source agrees; otherwise a person gets it with the reason; strict is the default.

The deadline terms of v1 follow decision 5 of the scope (recommended: Rule 71(3), Art. 94(3), Rule 70(2) and 70a(2), Rule 161(1) and 162). A term with no rule goes to hand entry (decision 3).

Edge cases of this area: two persons confirm at the same time; the second person never answers; a deadline on a closed day, at a month end, and in a year with no calendar; the sources differ; a rule version that is not signed; no rule for the event; a person who may not confirm; the responsible attorney changes; a proposed deadline that looks confirmed.

### DL-01. A Rule 71(3) deadline is computed with its reasons

- **Mark:** WIP. Parts: Today (os and the merged deadline page); WIP for My work (PR 346).
- **Lines:** V11, V12, V15, V16.
- **Story:** As Tobias, I want FlowLeap to compute the Rule 71(3) deadline with each step of the computation, so that I can check it before I confirm it.
- **Start:** L or D at the real date. Row 18 filed on SF-2023-0045, with the office event recorded.
- **Steps:** 1. Tobias opens the deadline.
- **Expected:** "Rule 71(3) EPC: 4 months from 29 Sep 2026 = 29 Jan 2027", with the rule version, the calendar, and each step in one line. State "proposed: waits for a person". The legal source opens the rule text.
- **Proof:** the existing deadlines tests `test/golden.test.mjs`, os `test/record-r1.test.mjs`; by hand.

### DL-02. The person who entered an event cannot confirm its deadline

- **Mark:** WIP. Parts: Today (os); WIP (the screen that names the confirmer is in PR 346).
- **Fails today:** QA findings 22 and 31: the merged page does not say who can confirm.
- **Risk:** Deadline.
- **Lines:** V12, V2.
- **Story:** As Tobias, I want FlowLeap to refuse my confirm of a deadline that I entered, and to name who can confirm it, so that each deadline has a second person.
- **Start:** L. Tobias entered the office event of row 18 by hand (LET-15). Anna is the responsible attorney.
- **Steps:** 1. Tobias opens the deadline and looks for Confirm. 2. Tobias calls the confirm route directly. 3. Anna opens My work.
- **Expected:** Step 1 shows "Waits for Dr. Anna Becker" (or the next confirmer by the chain), and no Confirm act for Tobias. Step 2 is refused (`confirmer-is-proposer`). Anna has "Confirm the deadline: SF-2023-0045".
- **Proof:** the existing os test `test/record-r1.test.mjs` (second person); by hand with PR 346.

### DL-03. The second person never answers

- **Mark:** WIP. Parts: Today (os escalation by timer); WIP (the screens in PR 346).
- **Risk:** Deadline.
- **Lines:** V12, V13, V19.
- **Story:** As Dr. Krüger (partner), I want a confirm task that nobody does to go up the chain and then raise an alarm, so that no deadline stays unconfirmed in silence.
- **Start:** L with a short `deadline.confirmWithinMinutes` (for example 5). A deadline waits for Anna.
- **Steps:** 1. Nobody acts. 2. After the time passes, open My work as Anna, Tobias and Dr. Krüger. 3. Wait for the next step of the chain.
- **Expected:** The task goes to the next person of `deadline.escalation` with "Given to you: the due time passed", then to the partner, then an alarm each day to the chain and the administrator. Each step sends a notice. The activity of the deadline lists each step with names.
- **Proof:** the existing os test `test/record-tasks.test.mjs`; by hand on L.

### DL-04. Two persons confirm at the same time

- **Mark:** Today (by hand; no test of this case).
- **Risk:** Distrust.
- **Lines:** V12, V4.
- **Story:** As Anna and Dr. Krüger, we want the second confirm to see the first, so that a deadline is confirmed once, by a named person.
- **Start:** L. Two browser profiles. A deadline of SF-2023-0045 waits; both may confirm.
- **Steps:** 1. Both open the deadline. 2. Anna confirms. 3. Dr. Krüger confirms without a reload.
- **Expected:** Step 3 says "Dr. Anna Becker confirmed this deadline at <time>" and records nothing. The record has one confirm.
- **Proof:** by hand on L; new test in os (`seen-is-stale`).

### DL-05. A deadline on a closed day

- **Mark:** Today.
- **Risk:** Deadline.
- **Lines:** V11.
- **Story:** As Sabine, I want a period that ends on a day when the EPO is closed to move to the next open day, with the reason shown, so that I file on the right day.
- **Start:** L or D. Row 5 (Rule 71(3) of 2026-04-01 on SF-2022-0024; the period ends on Saturday 2026-08-01).
- **Steps:** 1. File row 5 and open its deadline.
- **Expected:** Due Monday 3 Aug 2026. The computation shows the step "1 Aug 2026 is a Saturday: the EPO is closed; moved to 3 Aug 2026 (Rule 134(1) EPC)".
- **Proof:** the existing deadlines test `test/golden.test.mjs`; seed case `r71-3-weekend-overdue`.

### DL-06. A deadline at a month end

- **Mark:** Today.
- **Risk:** Deadline.
- **Lines:** V11.
- **Story:** As Sabine, I want a period that starts on the last day of a month to end on the last day of the target month, so that a short month does not move the date.
- **Start:** deadlines test setup, or D with an office event entered by hand on 31 Oct 2026 for Rule 71(3).
- **Steps:** 1. Compute the deadline.
- **Expected:** Due 28 Feb 2027 (Rule 131(4) EPC), or the next open day, with the step shown.
- **Proof:** the existing deadlines test `test/golden.test.mjs` (1,308 dates).

### DL-07. A deadline in a year with no calendar

- **Mark:** Today.
- **Risk:** Deadline.
- **Lines:** V11.
- **Story:** As Sabine, I want FlowLeap to refuse a date in a year whose EPO closing days are not loaded, and give me the task, so that it never guesses a date.
- **Start:** D. An office event entered by hand for a Rule 71(3) letter of 2027-11-15 (the period ends in 2028; no 2028 calendar).
- **Steps:** 1. Compute the deadline. 2. Sabine opens My work.
- **Expected:** The engine refuses with "calendar-missing: the EPO closing days of 2028 are not loaded". Sabine has "Enter the due date" with this reason. No date is proposed.
- **Proof:** the existing deadlines test `test/engine.test.mjs`; by hand on D.

### DL-08. The sources of a deadline differ

- **Mark:** New (S16 sheet 08; the EPO due date as a second source is not read).
- **Risk:** Deadline.
- **Lines:** V12, V5.
- **Story:** As Anna, I want a deadline whose MyEPO due date differs from FlowLeap's date to go to two persons with both dates, so that a difference is never resolved by chance.
- **Start:** L + X with a double control that serves the due date 2027-01-28 for EP23771920 (FlowLeap computes 2027-01-29).
- **Steps:** 1. The letter arrives. 2. Tobias opens the deadline.
- **Expected:** "The sources differ: EPO due date 28 Jan 2027, FlowLeap 29 Jan 2027". Two persons must confirm. Until then, My work and the Deadlines surface show the earlier date as the date to watch.
- **Proof:** new test with a new double control.

### DL-09. A rule version that is not signed is never confirmed automatically

- **Mark:** New (rule signatures and levels, S16 sheet 08).
- **Risk:** Deadline.
- **Lines:** V12.
- **Story:** As Dr. Krüger, I want a deadline from a rule version that no attorney signed to go to a person with that reason, so that only a rule that an attorney checked confirms anything.
- **Start:** L + X. Level set to the automatic level. Rule 71(3) v1 not in `deadline.ruleSigners`' signed list. The double serves the same due date.
- **Steps:** 1. The letter arrives. 2. Anna opens the deadline.
- **Expected:** "Waits for a person: rule version Rule 71(3) v1 is not signed." Never "confirmed automatically".
- **Proof:** new test.

### DL-10. At the strict level, every deadline goes to a person

- **Mark:** Today (`deadline.observeModeConfirm` accepts only `confirm`).
- **Risk:** Deadline.
- **Lines:** V12.
- **Story:** As Dr. Krüger, I want every deadline at the default level to be confirmed by a person, so that the firm's first month has no automatic confirm.
- **Start:** L. Default settings. Every seed letter filed.
- **Steps:** 1. Open the Deadlines surface and every deadline.
- **Expected:** No deadline shows "confirmed automatically". Each active deadline names the person who confirmed it.
- **Proof:** by hand on L; the existing os test `test/record-install.test.mjs` (the setting).

### DL-11. Confirmation by algorithm in shadow mode

- **Mark:** New (S16 sheet 08; #229 for the shadow report).
- **Risk:** Distrust.
- **Lines:** V12.
- **Story:** As Dr. Krüger, I want FlowLeap to record, for each deadline, whether the algorithm would have confirmed it and why, while a person still confirms, so that the firm can see in the month whether the algorithm agrees with its people.
- **Start:** L + X. Strict level. Rule 71(3) v1 signed by Anna. The double serves the same due date.
- **Steps:** 1. The letter arrives. 2. Tobias confirms the deadline. 3. Dr. Krüger opens the shadow list.
- **Expected:** The deadline shows "Would be confirmed automatically: structured source, signed rule, EPO due date agrees", and "Confirmed by Tobias Schmitt". The shadow list counts agree and disagree for each rule.
- **Proof:** new test.

### DL-12. An Art. 94(3) letter has no rule

- **Mark:** WIP. Parts: Today (os refuses `unknown-event`; the task "Enter the due date" exists, os `lib/record/tasks.mjs:106`); WIP (the hand entry screen in PR 346).
- **Risk:** Deadline.
- **Lines:** V11; decisions 3 and 5 of the scope.
- **Story:** As Sabine, I want an Art. 94(3) letter to give me the task to enter its due date from the period in the letter, so that the deadline exists although FlowLeap has no rule.
- **Start:** L or D. Row 6 (Art. 94(3) of 2026-09-18, German) filed on SF-2024-0007.
- **Steps:** 1. Sabine opens My work. 2. She enters the due date from the letter (4 months: 18 Jan 2027) with the period. 3. Jonas opens the deadline.
- **Expected:** Step 1 shows "Enter the due date: no rule for Art. 94(3)". After step 2, the deadline is "proposed by Sabine Wolf, by hand" and waits for a second person. Jonas sees it and can confirm it. If v1 adds an Art. 94(3) rule (decision 5), FlowLeap proposes the date and Sabine only confirms.
- **Proof:** by hand with PR 346; new test.

### DL-13. Two readers disagree on the event

- **Mark:** Today.
- **Risk:** Deadline.
- **Lines:** V9, V12.
- **Story:** As Tobias, I want an event that the two readers read differently to wait for me with both readings, so that a wrong code or date never starts a period.
- **Start:** D. A letter where the code reader and the model reader differ (seed case S3c).
- **Steps:** 1. The letter is filed. 2. Tobias opens the office event.
- **Expected:** "The readers differ" with both values and where each came from. No deadline until a person decides.
- **Proof:** the existing os test `test/mailbox-readers.test.mjs`.

### DL-14. A person who may not confirm

- **Mark:** Today (by hand; `deadline.confirmerRoles` orders the confirm task, os `lib/record/tasks.mjs:158`, but a role check on the confirm route was not found).
- **Risk:** Deadline.
- **Lines:** V12, V2.
- **Story:** As Felix, I want an assistant (Miriam) and the administrator to be unable to confirm a deadline, so that only the firm's confirmers confirm.
- **Start:** L. A deadline on SF-2020-0031 waits. Miriam is in its team.
- **Steps:** 1. Miriam opens the deadline. 2. Miriam calls the confirm route.
- **Expected:** No Confirm act for Miriam; the route refuses with a reason that names the roles that may confirm.
- **Proof:** by hand; new test.

### DL-15. The responsible attorney changes while a deadline waits

- **Mark:** Today (by hand; no test of this case).
- **Risk:** Deadline.
- **Lines:** V12, V13.
- **Story:** As Anna, I want the open tasks of SF-2023-0045 to come to me when the matter is handed over from Lena, so that no task stays with a person who no longer owns the matter.
- **Start:** L at the seed clock before 2026-10-15 (Lena responsible), with a confirm task for the responsible attorney; then the handover of the seed.
- **Steps:** 1. Record the handover to Anna. 2. Lena and Anna open My work.
- **Expected:** The task is in Anna's My work with "Handed over from Lena Hoffmann". Lena no longer has it.
- **Proof:** by hand on L; new test.

### DL-16. An overdue deadline is shown as overdue everywhere

- **Mark:** WIP (PR 346 for My work; the Deadlines table in PR 388).
- **Risk:** Deadline.
- **Lines:** V13, V15, V16.
- **Story:** As Lena, I want an overdue deadline to show the same warning on every surface, so that I see it wherever I look.
- **Start:** L at the real date. SF-2022-0024 with its Rule 71(3) deadline of 3 Aug 2026 active.
- **Steps:** 1. Lena opens My work, Deadlines, the matter and the deadline.
- **Expected:** Each shows the red warning glyph and "Overdue by N days", N the same on each. Jonas sees none of these rows.
- **Proof:** by hand.

### DL-17. A proposed deadline never looks confirmed

- **Mark:** New (QA finding 20: no fix found in the merged code or in PR 346).
- **Risk:** Deadline.
- **Lines:** V12, V13 to V16, V17.
- **Story:** As Lena, I want a deadline that waits for a second person to look different on every surface, so that I never treat it as checked.
- **Start:** L. One proposed and one active deadline (SF-2022-0024 and SF-2021-0011 of the QA day).
- **Steps:** 1. Lena opens the Matters list, My work, Deadlines, the matter page and a notice mail. 2. Lena asks the agent "Which deadlines do I have?".
- **Expected:** On each surface the proposed one shows "waits for a second person". The agent says that it is proposed, not active.
- **Proof:** by hand; new test.

### DL-18. A loss-of-rights letter

- **Mark:** Today (by hand entry).
- **Risk:** Deadline.
- **Lines:** V11, V9.
- **Story:** As Tobias, I want a loss-of-rights communication to give me the task to enter the further-processing date, so that the firm can still save the application.
- **Start:** L. Row 11 (Form 2015C, SF-2020-0031).
- **Steps:** 1. File row 11. 2. Tobias opens My work.
- **Expected:** "Enter the due date: no rule for this event", with the letter date 21 Jan 2026. After Tobias enters the date, Anna confirms it.
- **Proof:** by hand; seed case S3b.

### DL-19. An opposition notice

- **Mark:** Today (by hand entry).
- **Risk:** Deadline.
- **Lines:** V11, V9.
- **Story:** As Anna, I want the Rule 79(1) notice on SF-2026-0019 to give the formalities person the task to enter the reply date, so that the four months for the proprietor are on the docket.
- **Start:** L. Row 15 (Form 2317A, footer date 06/10/26, register date 2026-10-14).
- **Steps:** 1. File row 15. 2. Tobias enters the date. 3. Anna confirms.
- **Expected:** The event date is 14 Oct 2026 (not the footer date). The deadline is active after Anna's confirm, with both names.
- **Proof:** by hand; seed cases `r79-1-opposition` and `two-dates-footer`.

### DL-20. A deadline is never deleted in silence

- **Mark:** New. Parts: Today (os allows `reject` only on a proposed deadline, `lib/record/deadlines.mjs:18`); New (the attorney's close with a reason, sheet 02 `closed_without_act`).
- **Risk:** Deadline.
- **Lines:** V12, V4.
- **Story:** As Dr. Krüger, I want one person's "reject" to never remove a deadline, so that a deadline goes away only with an attorney's reason.
- **Start:** L. An active deadline on SF-2023-0045.
- **Steps:** 1. Tobias rejects the deadline. 2. Anna rejects it with a reason and evidence. 3. Dr. Krüger opens its activity.
- **Expected:** Step 1 is refused: an active deadline cannot be rejected. Step 2 closes it with the reason and the evidence. The activity shows both steps with names.
- **Proof:** by hand for step 1; new test for step 2.
