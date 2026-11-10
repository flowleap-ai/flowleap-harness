# 10. A month of use

The test of v1 is a month of EP prosecution on FlowLeap beside the old docket. These stories cover what happens after the first day: the second day, a person who is absent, a changed rule version, an update, a restore, and the daily comparison with the old docket. Decisions 8 and 9 of the scope apply.

Edge cases of this area: letters that arrive in the night; a person on holiday; a rule version that changes a date; a failed update; a restore that loses the last hours; a person who leaves the firm; the model provider is down; the comparison with the old docket differs.

### MON-01. The second day

- **Mark:** New. Parts: Today (by hand on the forward route); New (MyEPO route).
- **Risk:** Distrust.
- **Lines:** V9, V13, V19.
- **Story:** As Tobias, I want the morning after the first day to show only what is new and what is still open, so that I continue where I stopped.
- **Start:** L. Day 1 ended with one open task for Tobias. Two letters arrive in the night.
- **Steps:** 1. Tobias signs in the next morning. 2. He opens My work and Letters.
- **Expected:** The open task is still there with its due time. The two new letters show as new. No letter of day 1 is filed again or notified again.
- **Proof:** by hand on L over two days.

### MON-02. Every FlowLeap deadline is compared with the old docket

- **Mark:** New (a list that a person can put beside the old docket, decision 8; the hand-computed old docket of the seed letters; #229 for the shadow report).
- **Risk:** Deadline.
- **Lines:** V15, V12, V11.
- **Story:** As Sabine, I want each day to compare FlowLeap's deadlines with the old docket in one list, so that a difference is found the same day.
- **Start:** L. The firm's old docket: for the QA round, a list of the seed letters' deadlines that an attorney computed by hand, with the source of each date (new: the list does not exist). Do not use dates that the FlowLeap engine or the double made; a match with them proves nothing. Compare only EP prosecution terms; a renewal date in the old docket is not a miss.
- **Steps:** 1. Sabine opens the Deadlines surface and prints or exports it. 2. She compares each line with the old docket. 3. She records the reason of each difference.
- **Expected:** Each FlowLeap deadline has the same date as the old docket, or a recorded reason. A deadline in the old docket that FlowLeap does not have is recorded as a miss with its letter.
- **Proof:** by hand each day of the month; the result is the main evidence of the v1 pass.

### MON-03. A person who is absent

- **Mark:** Today (escalation by timer, the v1 bar by decision 9 of the scope). Absence and deputies are #253, not in v1.
- **Risk:** Deadline.
- **Lines:** V12, V13, V19.
- **Story:** As Dr. Krüger, I want a confirm task of Anna to reach another confirmer when Anna does not act in time, so that her holiday does not stop a deadline.
- **Start:** L. Anna does not sign in. A deadline on SF-2023-0045 waits for her.
- **Steps:** 1. Let `deadline.confirmWithinMinutes` pass. 2. Open My work as Tobias and Dr. Krüger.
- **Expected:** The task escalates to the next person of the chain inside the wall, with a notice. If the chain ends, a daily alarm goes to the chain and the administrator.
- **Proof:** the existing os test `test/record-tasks.test.mjs`; by hand.

### MON-04. A rule version changes a proposed deadline

- **Mark:** New (rule versions in S16 sheet 08; no second version of a rule exists).
- **Risk:** Deadline.
- **Lines:** V11, V12.
- **Story:** As Sabine, I want a deadline that waits for a confirm to be computed again when its rule gets a new version, so that nobody confirms a date of an old rule.
- **Start:** L. A proposed Rule 71(3) deadline. A test version Rule 71(3) v2 that gives another date.
- **Steps:** 1. Install v2. 2. Sabine opens the deadline.
- **Expected:** The old proposal is "stale". The new proposal shows both dates and "Rule 71(3) v2 replaced v1 on <date>".
- **Proof:** new test.

### MON-05. A rule version changes a confirmed deadline

- **Mark:** New (as MON-04).
- **Risk:** Deadline.
- **Lines:** V11, V12.
- **Story:** As Dr. Krüger, I want a confirmed deadline whose new rule version gives another date to be "disputed" with an alarm when the new date is earlier, so that the firm never misses the earlier date.
- **Start:** L. An active Rule 71(3) deadline. Rule 71(3) v2 gives a date one day earlier.
- **Steps:** 1. Install v2. 2. Open My work as the responsible attorney and the partner.
- **Expected:** The deadline is "disputed" with both dates. Because the new date is earlier, the responsible attorney and the partner get an alarm. Until a person decides, every surface shows the earlier date to watch. If v2 gives the same date, the deadline stays active and gets the new check as evidence.
- **Proof:** new test.

### MON-06. An update keeps every fact of the firm

- **Mark:** Today.
- **Risk:** Distrust.
- **Lines:** V24, V4.
- **Story:** As Felix, I want an update to keep every letter, deadline, task, setting and link, so that the firm sees the same state after the update.
- **Start:** L with candidate N and a firm state after a few days of use. Two persons signed in.
- **Steps:** 1. Note the counts on the console and the Firm Record's last position. 2. Update to candidate N+1. 3. Both persons sign in.
- **Expected:** The same counts and the same last position, plus only the update's own events. My work, Letters and Deadlines show the same rows. MyEPO and OPS stay linked.
- **Proof:** the existing os tests `test/update.test.mjs` and `test/gate-local-firm.test.mjs`; by hand on L.

### MON-07. A failed update rolls back

- **Mark:** Today.
- **Risk:** Distrust.
- **Lines:** V24.
- **Story:** As Felix, I want an update whose health check fails to return to the last version by itself, so that the firm keeps working.
- **Start:** os test setup with a candidate whose health check fails.
- **Steps:** 1. Run the update.
- **Expected:** The firm is back on version N, with the reason in the console's System log. No record event of the failed version stays.
- **Proof:** the existing os tests `test/update.test.mjs` and `test/applier.test.mjs`.

### MON-08. A restore from backup

- **Mark:** New. Parts: Today (backup and restore); New (the record hash-chain drill, #238).
- **Risk:** Deadline.
- **Lines:** V23.
- **Story:** As Felix, I want to restore last night's backup on a new server, so that the firm continues after a server loss.
- **Start:** L with one night's backup. Then a new VM.
- **Steps:** 1. Restore by `docs/restore-runbook.md`. 2. Sign in as two persons.
- **Expected:** The Firm Record's hash chain checks from the first event to the last. The state equals the state at the backup. The console says the time of the backup.
- **Proof:** by hand on L by the runbook; new test for the hash chain (#238).

### MON-09. A restore tells the firm what was lost

- **Mark:** New (no step after a restore reads the letters again or names the lost acts).
- **Risk:** Deadline.
- **Lines:** V23, V9, V12.
- **Story:** As Sabine, I want FlowLeap to tell me after a restore which acts of the lost hours must be done again, and to read the Mailbox again, so that no letter and no confirm is lost.
- **Start:** L + X. A backup at 02:00. At 10:00 a letter arrives and Anna confirms its deadline. The server is lost at 11:00 and the backup is restored.
- **Steps:** 1. Restore. 2. Sabine opens My work and Letters.
- **Expected:** FlowLeap reads the Mailbox again and lists the 10:00 letter again. The deadline is proposed again and waits for a confirm. The console names the time span that the restore lost.
- **Proof:** new test.

### MON-10. A person leaves the firm

- **Mark:** New (no act that hands over a person's tasks; #253).
- **Risk:** Deadline.
- **Lines:** V1, V13, V20.
- **Story:** As Felix, I want the open tasks of a person who leaves to go to named persons when I remove the person, so that nothing stays with a person who is gone.
- **Start:** L. Lena has open tasks on two matters.
- **Steps:** 1. Felix removes Lena. 2. Dr. Krüger and Sabine open My work.
- **Expected:** FlowLeap does not remove Lena until each open task has a new owner inside its wall. Lena can no longer sign in. The record has the handover with Felix as actor.
- **Proof:** new test.

### MON-11. The model provider is down for a day

- **Mark:** Today.
- **Risk:** Deadline.
- **Lines:** V22, V18, V11.
- **Story:** As Dr. Krüger, I want letters, deadlines and confirms to work when the model provider is down, so that the firm's docket does not depend on AI.
- **Start:** L with the gateway's route stopped.
- **Steps:** 1. Post a letter. 2. Compute and confirm its deadline. 3. Open the prepared work.
- **Expected:** Steps 1 and 2 work (the model reader is missing, so the event waits for a person). The prepared work says "run failed: model not reachable" with "Start again".
- **Proof:** by hand on L.

### MON-12. A handover in the middle of the month

- **Mark:** Today (by hand; seed case S2).
- **Risk:** Wrong person.
- **Lines:** V3, V13, V19.
- **Story:** As Lena, I want SF-2023-0045 to move to Anna with the open tasks and the handover note, so that Anna continues the work and I keep only the access the team gives me.
- **Start:** L at the seed clock before 2026-10-15.
- **Steps:** 1. Record the handover with the note "Check the text intended for grant of the Rule 71(3) communication of 29 September 2026". 2. Anna opens My work and the matter. 3. Lena opens the matter.
- **Expected:** Anna is responsible, sees the note and the open tasks. Lena sees the matter as a team member, with no task. Notices go to Anna.
- **Proof:** by hand; new test.

### MON-13. A backup that did not run, and what a restore keeps

- **Mark:** New (no alarm for a failed backup was found; the restore of roles, screens and settings is not tested).
- **Risk:** Wrong person.
- **Lines:** V23, V1, V3.
- **Story:** As Felix, I want an alarm when last night's backup failed, and a restore that keeps roles, screens, settings and links, so that I do not find out on the day I need it.
- **Start:** L. The backup target is not reachable for one night. Later, a restore of a backup that is older than a screen and a role change.
- **Steps:** 1. Felix opens the console the next morning. 2. Restore. 3. Felix and Dr. Krüger open the console and the matters.
- **Expected:** Step 1 shows the age of the last good backup and a task. After step 2, roles, teams, screens, the confirmation level and the read flag equal the backup, and the console lists the changes of the lost hours that must be done again. A screen of the lost hours is named, never lost in silence. No attorney's runtime can read a backup file.
- **Proof:** new test.

### MON-14. The EPO calendar changes

- **Mark:** New (calendar versions; MON-04 and MON-05 cover rule versions).
- **Risk:** Deadline.
- **Lines:** V11, V12.
- **Story:** As Sabine, I want a deadline to be computed again when the EPO adds a closed day or announces an interruption under Rule 134 EPC, so that the date follows the calendar that is in force.
- **Start:** L. An active deadline and a proposed one, each on a day that a new calendar version marks as closed.
- **Steps:** 1. Install the new calendar version. 2. Open both deadlines.
- **Expected:** The proposed one is "stale" and proposed again. The active one shows "the calendar changed: new date <date>" for a person. A later date never replaces a confirmed date without a person. The page names the calendar version and its source notice.
- **Proof:** new test.

### MON-15. An update while people work

- **Mark:** Today (by hand; the result is not known).
- **Risk:** Distrust.
- **Lines:** V24, V18.
- **Story:** As Felix, I want an update in working hours to lose no act, so that no confirm is half recorded and no run is lost in silence.
- **Start:** L. Anna has a deadline page open and a Ticket run in progress. Felix starts the update.
- **Steps:** 1. The update runs. 2. Anna confirms on the open page. 3. Anna opens the run.
- **Expected:** The confirm is recorded once, or refused with "FlowLeap was updated: load the page again". The run shows "run failed" with "Start again", never "in progress" for ever. The console says when the update ran and who started it.
- **Proof:** by hand on L.
