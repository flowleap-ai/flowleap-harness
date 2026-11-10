# 4. A letter arrives

An EPO letter arrives in the firm's MyEPO Mailbox. FlowLeap lists it, files it on its matter, records the office event, and shows it on the Letters surface and the matter page. The MyEPO intake source is not started (#389). Its process is in sheet 01 section 8 (committed; its decisions D1.1 to D1.5 are open) and sheet 06 (approved); the firm worker reads the Mailbox and the Firm Record files; the Letters surface is in draft PR 388. The forwarded-mail route (os PR 67, 88) is built and stays as the fallback (decision 11 of the scope).

Use the double (X) with the dev loop or the local firm. `POST /_double/arrive` makes the Rule 71(3) letter of SF-2023-0045 arrive.

Edge cases of this area: a letter with no application; an unknown document code; an application that is not in the index; the same letter twice (Mailbox and a forwarded copy); the same PDF twice; a letter for a screened matter; a parent and its divisional; MyEPO refuses, is slow, or answers in a new format; the portfolio permission is removed; a register event with no letter; two persons file at the same time; German and English.

### LET-01. A new EPO letter is filed on its matter by itself

- **Mark:** New (the MyEPO intake source; #389; migration step 7).
- **Lines:** V9, V14, V16, V5.
- **Story:** As Tobias (formalities), I want a new EPO letter to be filed on its matter with no step of mine when its application number matches, so that I only act on the letters that need a person.
- **Start:** L + X. MyEPO linked. SF-2023-0045 has no Rule 71(3) letter yet. Tobias and Anna signed in, in two browser profiles.
- **Steps:** 1. Call `POST /_double/arrive`. 2. Wait up to the read interval (`myepo.unhandledEvery`, 15 minutes, sheet 06 D6.7), or select Check now. 3. Tobias opens Letters. 4. Anna opens SF-2023-0045.
- **Expected:** Tobias sees the letter "Communication under Rule 71(3) EPC, 29 Sep 2026, SF-2023-0045" in state "Filed on its matter", with "Source: EPO Mailbox". Anna's matter page lists the letter, the office event and "Filed automatically: application number EP23771920". The Firm Record files it on the firm worker's observation, with the MyEPO communication id as evidence. Decision 4 of the scope applies: the application number matches exactly, and the user reference is empty or names the same matter (sheet 01 section 8).
- **Proof:** new test on L + X.

### LET-02. Listing a letter does not mark it read; opening it does

- **Mark:** New (the MyEPO intake; the setting `myepo.download` of sheet 01 section 8).
- **Risk:** Distrust.
- **Lines:** V10, V9.
- **Story:** As Felix, I want FlowLeap to download a letter only when a person or a task opens it (the default), so that the firm's MyEPO still shows which letters nobody opened.
- **Start:** L + X, read flag at its default. After LET-01.
- **Steps:** 1. Read `GET /_double/state` for the letter. 2. Anna opens the letter in FlowLeap. 3. Read the double state again.
- **Expected:** In step 1 the letter is unread. In step 2, FlowLeap shows the PDF and says that MyEPO now shows it as read for the whole firm. In step 3 it is read and not handled. The record has the download with Anna as actor.
- **Proof:** new test on L + X.

### LET-03. A letter with no application number

- **Mark:** New (the intake source; a double control for a letter with no application).
- **Risk:** Deadline.
- **Lines:** V9, V14.
- **Story:** As Felix (administrator), I want a firm letter with no application number to come to me, so that it is not lost and does not land on a wrong matter.
- **Start:** L + X with a double letter that has no application number (as the sandbox letter `52301_CONF`).
- **Steps:** 1. The letter arrives. 2. Felix and Tobias open My work.
- **Expected:** The letter is in Letters as "Needs a person: no application number". The letter is a firm letter, filed on the firm file (sheet 01). Felix has the task "Read this firm letter". It is on no matter. Tobias does not see it unless he is an intake person for firm letters.
- **Proof:** new test with a new double control.

### LET-04. A letter with an unknown document code

- **Mark:** New (the intake source; a double control for an unknown code).
- **Risk:** Deadline.
- **Lines:** V9, V11.
- **Story:** As Sabine, I want a letter with a code that FlowLeap does not know to come to me as an office letter, so that FlowLeap never guesses its kind or its period.
- **Start:** L + X with a double letter for EP24166597 with code `9999X`.
- **Steps:** 1. The letter arrives. 2. Sabine opens it.
- **Expected:** The letter is filed on SF-2024-0007 (the application matches) and its office event says "Unknown document code 9999X: a person enters the event". Sabine has the task "Enter the office event". No deadline is proposed.
- **Proof:** new test with a new double control.

### LET-05. A letter for an application that is not in the index

- **Mark:** New (the intake source).
- **Risk:** Wrong person.
- **Lines:** V9, V3.
- **Story:** As Tobias, I want a letter for an application that FlowLeap does not know to wait for a formalities person, so that it reaches no matter and no agent.
- **Start:** L + X with a double letter for EP14724725 (the parent of EP22213933, outside the index), whose applicant is not linked to a client. (When the applicant is linked to a client, the Record files the application by itself, sheet 07 D7.1.)
- **Steps:** 1. The letter arrives. 2. Tobias, Jonas and Lena open Letters.
- **Expected:** The letter is "Needs a person: no matter found" for the intake persons. Jonas and Lena do not see it. No agent reads it. The administrator and the partners see the application in the import list (sheet 07).
- **Proof:** new test.

### LET-06. The same letter from the Mailbox and as a forwarded copy

- **Mark:** New (the intake source; sheet 01 section 8).
- **Risk:** Deadline.
- **Lines:** V9.
- **Story:** As Sabine, I want the same EPO letter that arrives from the Mailbox and as a mail that a colleague forwards to be filed once, so that the matter shows one letter and one deadline.
- **Start:** L + X. The Art. 94(3) letter of SF-2024-0007 (row 6) is unread in the double. Sabine forwards the seed PDF of row 6 to the AI mailbox (`seed-letters.mjs --rows 6 --from forward`).
- **Steps:** 1. The double letter is listed. 2. The forwarded mail arrives. 3. Sabine and Jonas open SF-2024-0007.
- **Expected:** One letter, one office event. The second copy is "duplicate" (same PDF) or "possible duplicate" for a person (different scan). Sabine, the forwarder, gets a link to the first result. No second deadline.
- **Proof:** new test.

### LET-07. The same PDF forwarded twice

- **Mark:** Today.
- **Risk:** Distrust.
- **Lines:** V9.
- **Story:** As Sabine, I want a letter that I forward a second time to be known as a copy, so that I do not file it twice.
- **Start:** L or D. Row 2 already posted.
- **Steps:** 1. Post row 2 again (`seed-letters.mjs --rows 2`). 2. Sabine opens the Intake.
- **Expected:** One row for the letter; the second posting shows "duplicate" with a link to the first.
- **Proof:** the existing os test `test/mailbox-intake.test.mjs`; by hand on L.

### LET-08. A letter for a screened matter does not reach the screened person

- **Mark:** New. Parts: Today (forward route); New (MyEPO route).
- **Risk:** Wrong person.
- **Lines:** V3, V9, V19.
- **Story:** As Felix, I want a letter of SF-2022-0024 to reach no screened person, also before it is filed, so that the screen holds from the first minute.
- **Start:** L, with the account `jonas` (never `admin`). Make Jonas an intake person for this story. Forward row 5 (Rule 71(3) of EP22213933) with the reference SF-2022-0024, so that the intake proposes the matter (`seed-letters.mjs --rows 5 --from forward`). An unreadable scan with no proposed matter is LET-22.
- **Steps:** 1. Jonas opens the Intake and My work. 2. Jonas opens the letter's address. 3. Jonas checks the outbox page for notices.
- **Expected:** Jonas has no row, no count and no notice for this letter; its address shows "not found". Sabine sees it.
- **Proof:** the existing os test `test/record-unfiled-letters.test.mjs` (unfiled-letter readers); by hand on L.

### LET-09. Before filing, only the intake persons see a letter

- **Mark:** Today.
- **Risk:** Wrong person.
- **Lines:** V3, V9.
- **Story:** As Lena, I want an unfiled letter to be open only to the intake persons and the person who forwarded it, so that a letter of another client's matter does not reach every attorney.
- **Start:** L. The 18 seed letters wait. Lena and Jonas are not intake persons.
- **Steps:** 1. Lena and Jonas open the Intake. 2. Each pastes the address of one waiting letter. 3. Each asks the agent "What letters arrived today?".
- **Expected:** Both see "Intake 0" with a true empty state. The addresses show "not found". The agent sees no unfiled letter.
- **Proof:** the existing os test `test/record-unfiled-letters.test.mjs`; QA findings 40 and 42 (works).

### LET-10. A parent and its divisional

- **Mark:** New (the intake source).
- **Risk:** Deadline.
- **Lines:** V9.
- **Story:** As Sabine, I want a letter whose application number and our reference name two different matters to come to me with both, so that it is never filed on the wrong one.
- **Start:** L + X with a double letter for EP24166597 whose `userReference` is SF-2021-0011.
- **Steps:** 1. The letter arrives. 2. Sabine opens it.
- **Expected:** "Two matters match: SF-2024-0007 (application number) and SF-2021-0011 (your reference)". The letter is not filed until Sabine chooses.
- **Proof:** new test with a new double control.

### LET-11. MyEPO does not answer for hours

- **Mark:** New (the firm worker; sheet 06).
- **Risk:** Deadline.
- **Lines:** V9, V5, V14.
- **Story:** As Felix, I want an alarm when FlowLeap has not read the Mailbox for 4 hours, so that the firm knows that letters can be waiting.
- **Start:** L + X. MyEPO linked. Stop the double.
- **Steps:** 1. Let 4 hours pass (or the test clock). 2. Felix, Sabine and Anna open Letters.
- **Expected:** FlowLeap retries with a growing wait. After 4 hours Felix gets an alarm task. Every person's Letters surface says "MyEPO did not answer since <time>. Letters can be waiting." Nothing in the record changed.
- **Proof:** new test with a test clock.

### LET-12. MyEPO answers in a new format

- **Mark:** New (a double control for a changed answer).
- **Risk:** Deadline.
- **Lines:** V9, V5.
- **Story:** As Felix, I want FlowLeap to stop and tell me when MyEPO answers with fields that it does not know, so that it never files a letter from data that it read wrong.
- **Start:** L + X with a double answer in which `applicationNumber` is renamed.
- **Steps:** 1. A letter is listed with the new format.
- **Expected:** The list read is refused as "MyEPO answered in a format that FlowLeap does not know". No letter is filed. Felix gets the task. The Letters surface shows since when.
- **Proof:** new test with a new double control.

### LET-13. The MyEPO permission on a portfolio is removed

- **Mark:** New (sheet 06 state `permission_missing`; a double control).
- **Risk:** Deadline.
- **Lines:** V5, V9.
- **Story:** As Felix, I want FlowLeap to tell me when the firm's MyEPO account loses the permission on the Renishaw portfolio, so that Renishaw's letters are not silently missing.
- **Start:** L + X. MyEPO linked. A double control removes the Renishaw portfolio permission (`403 ERR_20` on its reads).
- **Steps:** 1. The hourly test runs. 2. Felix opens the console; Lena opens Letters.
- **Expected:** The link state is "permission missing" for the Renishaw portfolio. Felix has the task "Fix the MyEPO permission". Lena's Letters surface says that Renishaw letters cannot arrive since <time>. The WAGO and Phoenix letters still arrive.
- **Proof:** new test with a new double control.

### LET-14. A register event with no letter

- **Mark:** New (the lost-letter check of sheet 01, whose decision D1.4 is open; decision 7 of the scope).
- **Risk:** Deadline.
- **Lines:** V6, V9, V28.
- **Story:** As Sabine, I want a task when the EP Register shows a communication that never arrived in the Mailbox, so that no letter is lost without anyone noticing.
- **Start:** L + X with the OPS register data of EP24166597 that lists the Art. 94(3) communication of 2026-09-18, and no such letter in the double.
- **Steps:** 1. The daily register check runs. 2. Sabine opens My work.
- **Expected:** Sabine (the matter's formalities person) has "Find the missing EPO letter: Art. 94(3) of 18 Sep 2026, SF-2024-0007", due in 1 working day.
- **Proof:** new test.

### LET-15. A scan with no text is filed by hand

- **Mark:** WIP (the screen in draft PR 346; os `fileScan` is merged, os PR 88).
- **Fails today:** QA findings 9, 10 and 44 on the merged screens: no page image, filing refused (#325), no hand entry.
- **Risk:** Deadline.
- **Lines:** V9, V14, V27; decision 3 of the scope.
- **Story:** As Tobias, I want to see the page image of a scan and file it with its kind and date, so that a paper letter reaches its matter and gets a deadline.
- **Start:** L or D. Row 18 posted as a scan with no text layer, OCR off.
- **Steps:** 1. Tobias opens the letter. 2. He reads the first page image. 3. He chooses SF-2023-0045, enters "Rule 71(3)" and the date 29 Sep 2026, and files. 4. Anna opens the matter.
- **Expected:** The page image is large enough to read. After step 3 the letter is on the matter with "Entered by Tobias Schmitt" and the office event waits for a second person. Anna sees the letter and the event that waits.
- **Proof:** the existing os test `test/record-first-demo.test.mjs` (`intake.file-by-hand`); by hand with PR 346.

### LET-16. A letter is filed on the wrong matter

- **Mark:** New (moving a filed letter is not found in os `lib/record/intake.mjs`).
- **Risk:** Wrong person.
- **Lines:** V9, V3, V12.
- **Story:** As Sabine, I want to move a letter that was filed on the wrong matter, with a reason, so that its deadline and its readers are correct.
- **Start:** L. Row 6 (SF-2024-0007) filed on SF-2021-0011 by mistake, with a proposed deadline.
- **Steps:** 1. Sabine moves the letter to SF-2024-0007 with a reason. 2. Jonas and Lena open both matters.
- **Expected:** The letter, its event and its deadline are on SF-2024-0007. The deadline of the old matter is "stale" or "disputed" with the reason. If a reader of the old matter is outside the new wall, the partner gets a wall incident.
- **Proof:** new test.

### LET-17. Two formalities persons file the same letter at the same time

- **Mark:** Today (by hand; no test of this case).
- **Risk:** Distrust.
- **Lines:** V9, V4.
- **Story:** As Sabine and Tobias, we want the second of us to see that the other already filed the letter, so that it is filed once.
- **Start:** L. Two browser profiles. One letter that both can see waits in the Intake.
- **Steps:** 1. Both open the letter. 2. Sabine files it. 3. Tobias files it without a reload.
- **Expected:** Step 3 is refused: "Sabine Wolf filed this letter at <time>", with a link. The record has one filing.
- **Proof:** by hand on L; new test in os.

### LET-18. German and English letters

- **Mark:** New. Parts: Today (forward route with OCR or hand entry); New (MyEPO route).
- **Lines:** V9, V11.
- **Story:** As Sabine, I want a German and an English Rule 71(3) letter to give the same office event, so that the language of the letter never changes the deadline.
- **Start:** L. Row 2 (German, Form 2004C) and row 18 (English, Form 2004C).
- **Steps:** 1. File both. 2. Read the office events.
- **Expected:** Both are "Rule 71(3) EPC" with the letter date of the register (2025-08-29 and 2026-09-29), not the footer date.
- **Proof:** the existing os test `test/mailbox-readers.test.mjs`; by hand.

### LET-19. A letter with two dates

- **Mark:** Today.
- **Risk:** Deadline.
- **Lines:** V9, V11.
- **Story:** As Tobias, I want FlowLeap to take the date of the letter, not a date that the text names, so that the period starts on the right day.
- **Start:** L. Row 11 (Form 2015C of 2026-01-21; the body names 2025-08-29).
- **Steps:** 1. File row 11. 2. Read the office event's date and its source.
- **Expected:** The date is 2026-01-21, with its source shown. If the two readers differ, the event waits for a person and shows both dates.
- **Proof:** the existing os test `test/mailbox-readers.test.mjs`; seed case `two-dates`.

### LET-20. A letter for an imported application with no team

- **Mark:** New (the MyEPO intake; the task "Assign a person" of sheet 00 is not built; sheet 01 D1.3, the matter from the user reference, is open).
- **Risk:** Deadline.
- **Lines:** V7, V9, V13.
- **Story:** As Dr. Krüger, I want a letter for an imported application with no matter team to give a person the task "Assign a person", so that its deadline is never invisible.
- **Start:** L + X after IMP-01. One imported application has no matter, no responsible attorney and no formalities person. A Rule 71(3) letter arrives for it.
- **Steps:** 1. The letter arrives. 2. Dr. Krüger opens My work and Deadlines.
- **Expected:** The letter is `unmatched` (sheet 01) and waits for a person. Dr. Krüger has "Assign a person". Until a matter is known, no deadline starts (sheet 02), and the Deadlines surface shows the letter as "no deadline yet: no matter" with its dispatch date. No count on any surface leaves it out without a reason.
- **Proof:** new test.

### LET-21. Nobody decides a letter that needs a person

- **Mark:** WIP. Parts: Today (os escalates intake tasks by `intake.escalation`, `lib/record/tasks.mjs:91`); WIP for the screens (PR 346).
- **Risk:** Deadline.
- **Lines:** V9, V13, V19.
- **Story:** As Dr. Krüger, I want a letter that waits for a person longer than `intake.decideWithin` to go to the next person and then raise an alarm, so that a letter does not wait while its period runs.
- **Start:** L with a short `intake.decideWithinMinutes`. One letter waits as "no matter found". No intake person acts.
- **Steps:** 1. Let the time pass, then the next step of the chain.
- **Expected:** The task goes to the next person of the chain, then to the partner, then a daily alarm to the chain and the administrator, each with a notice. A person screened from a proposed matter is skipped. The timer counts working time: a letter of Friday evening does not alarm on Saturday.
- **Proof:** the existing os test `test/record-tasks.test.mjs` (escalation); new test for working time and screens.

### LET-22. An unreadable scan of a screened matter

- **Mark:** New (decision 18 of the scope).
- **Fails today:** a screened intake person reads an unreadable scan, because no matter is proposed for it (os `test/record-unfiled-letters.test.mjs`, the `unreadable` case).
- **Risk:** Wrong person.
- **Lines:** V3, V9.
- **Story:** As Felix, I want a paper scan of SF-2022-0024 with no text to reach no person whom that matter screens, or the firm to record that it accepts this limit, so that the screen has no silent gap.
- **Start:** L, account `jonas`, Jonas an intake person. Row 5 posted as a scan from the scan mailbox, OCR off.
- **Steps:** 1. Jonas opens the Intake.
- **Expected:** By decision 18: Jonas does not see the scan; or the firm's settings record the accepted limit, and the partner gets a wall incident when Jonas opens it.
- **Proof:** new test.
