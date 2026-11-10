# 3. Import your EP docket and Add client

The firm gets its EP applications in: Import your EP docket reads the firm's MyEPO portfolios, and Add client adds one client with its applications at the firm. Both write the client record and the application index to the Firm Record ([the client model](../../docs/2026-11-09-client-model.md)).

Import your EP docket is in design: S16 sheet 07 (not committed) and mockups 1a to 1e of draft PR 388. Add client is merged (PR 362 to 386, os PR 89 and 90), but the identity, the docket, the folders and the Clients list are per runtime.

Edge cases of this area: two persons add the same client at the same time; the import breaks in the middle; the import runs twice; an application leaves a portfolio; a conflict hit; a screened person opens the client; a client with over a thousand applications; the EP Register does not answer; one client with two spellings.

### IMP-01. The partner imports the firm's EP docket

- **Mark:** New (no build; S16 sheet 07 and PR 388 mockups are in design).
- **Lines:** V7, V5, V4.
- **Story:** As Dr. Krüger (partner), I want to import the firm's EP docket from MyEPO, so that FlowLeap knows every EP application of the firm without typing.
- **Start:** L + X. MyEPO linked by Felix. No client recorded.
- **Steps:** 1. Dr. Krüger opens Import your EP docket. 2. He waits for the read. 3. He reviews the proposed clients (WAGO, Renishaw, Phoenix Contact), records the conflict check, and selects Import 3 clients. 4. Lena opens the Clients list.
- **Expected:** Step 2 shows 7 applications in 3 portfolios. Step 3 records 3 clients and 7 applications in the Firm Record, each with "Imported from MyEPO by Dr. Martin Krüger" and the date. Lena's Clients list shows the clients of her client groups (WAGO, Renishaw), with their applications.
- **Proof:** new test on L + X.

### IMP-02. Only a starter can start the import

- **Mark:** New (as IMP-01).
- **Risk:** Wrong person.
- **Lines:** V7, V2.
- **Story:** As Dr. Krüger, I want only the administrator and partners to start the import, so that an attorney does not see the whole firm's portfolio list.
- **Start:** L + X. MyEPO linked.
- **Steps:** 1. Jonas opens the address of Import your EP docket.
- **Expected:** Jonas sees no import act and no list of the firm's applications. A direct call is refused.
- **Proof:** new test.

### IMP-03. The import breaks in the middle and continues

- **Mark:** New (no build; the double cannot break in the middle of a read).
- **Risk:** Distrust.
- **Lines:** V7.
- **Story:** As Dr. Krüger, I want an import that breaks to continue from where it stopped, so that I never get half a docket that looks complete.
- **Start:** L + X with a double control that stops after the first page.
- **Steps:** 1. Start the import. 2. The double stops. 3. The double starts again.
- **Expected:** After step 2, the import shows "interrupted" with the count read so far and the reason. After step 3, it continues from the last page. The final counts equal the portfolio counts. No application is recorded twice.
- **Proof:** new test with a new double control.

### IMP-04. The import runs twice on the same data

- **Mark:** New (no build).
- **Risk:** Distrust.
- **Lines:** V7.
- **Story:** As Dr. Krüger, I want a second import on unchanged data to record nothing new, so that the record does not fill with copies.
- **Start:** L + X after IMP-01.
- **Steps:** 1. Start the import again.
- **Expected:** "No new application." The Firm Record has no new event.
- **Proof:** new test.

### IMP-05. An application leaves the firm's portfolio

- **Mark:** New (no build; the double cannot remove a portfolio entry).
- **Risk:** Deadline.
- **Lines:** V7, V5.
- **Story:** As Lena, I want FlowLeap to tell me when an application of my matter leaves the firm's MyEPO portfolio, so that I check why and keep its open deadline.
- **Start:** L + X. SF-2023-0045 has an active deadline. A double control removes EP23771920 from the portfolio.
- **Steps:** 1. The daily refresh runs. 2. Lena and Anna open My work and the matter.
- **Expected:** The application stays in the index, marked "left the MyEPO portfolio on <date>". Anna (responsible) has the task "Check why this application left MyEPO". The deadline stays active.
- **Proof:** new test with a new double control.

### IMP-06. A docket with over a thousand applications

- **Mark:** New (a large fixture: no seed or double has more than 7 applications).
- **Risk:** Distrust.
- **Lines:** V7, V8.
- **Story:** As Dr. Krüger in a large firm, I want the import of 1,132 applications of 287 clients to finish with exact counts, so that I can trust that nothing is missing.
- **Start:** L + X with a double that serves 1,132 applications in 287 applicant names.
- **Steps:** 1. Run the import. 2. Review and import every proposed client.
- **Expected:** The counts on each step add up to 1,132. Recording finishes in batches, and a failed batch can be repeated alone. Every table has sort, filters and pagination.
- **Proof:** new test with a new fixture.

### IMP-07. A client that one attorney adds is seen by the others

- **Mark:** New (the Clients list reads the client folders of each runtime, `ui-flowleap-folder/src/client/api.ts:54`; S17).
- **Fails today:** a second attorney's Clients list does not show the client.
- **Risk:** Distrust.
- **Lines:** V8, V4.
- **Story:** As Lena, I want to add Renishaw once, so that Dr. Krüger and Anna see Renishaw and its applications without adding it again.
- **Start:** L with live register keys, or with the firm docket fixture. Renishaw is not a client.
- **Steps:** 1. Lena runs Add client for Renishaw to the Record step. 2. Dr. Krüger opens the Clients list in his own browser profile.
- **Expected:** Dr. Krüger sees Renishaw with 2 applications, "Added by Lena Hoffmann" and the date.
- **Proof:** by hand on L as two persons; new test.

### IMP-08. A possible conflict blocks Add client until an attorney decides

- **Mark:** Today.
- **Risk:** Wrong person.
- **Lines:** V8, V2.
- **Story:** As Lena, I want Add client to stop at a possible conflict until an attorney records a decision with a reason, so that the firm never takes a client against an existing client by mistake.
- **Start:** L or D. WAGO is a client. Lena adds a client that is an opponent of a WAGO application (a hit in the opponent index).
- **Steps:** 1. Lena reaches the conflict check. 2. Lena tries Next without a decision. 3. Lena records "checked, no conflict" with a reason. 4. Dr. Krüger opens the client.
- **Expected:** Step 2 is refused. After step 3, Add client continues. The Firm Record has `client/conflict-checked` with Lena, the hits and the reason. Dr. Krüger sees the conflict decision on the client.
- **Proof:** the existing tests `ui-flowleap-folder/tests/add-client-conflict-check*` and os `test/record-clients.test.mjs`; by hand on L.

### IMP-09. Two persons add the same client at the same time

- **Mark:** Today (by hand; no test of this case).
- **Risk:** Distrust.
- **Lines:** V8, V4.
- **Story:** As Lena and Jonas, we want only one WAGO client when we both add WAGO in the same minute, so that the firm has one client record.
- **Start:** L. Two browser profiles. WAGO is not a client.
- **Steps:** 1. Lena and Jonas both run Add client for WAGO to the Review step. 2. Lena selects Record. 3. Jonas selects Record.
- **Expected:** The Firm Record has one WAGO client. Jonas's Record step says that Lena added WAGO a moment ago and records only the applications that were not recorded.
- **Proof:** by hand on L; new test in os `test/record-clients.test.mjs`.

### IMP-10. The EP Register does not answer during Add client

- **Mark:** Today.
- **Risk:** Distrust.
- **Lines:** V8.
- **Story:** As Lena, I want Add client to say that the EP Register did not answer and to record nothing, so that I never get a client with a wrong count.
- **Start:** D with no network for the register, or a stopped data plugin.
- **Steps:** 1. Lena types "Renishaw" in Add client.
- **Expected:** "The EP Register did not answer. FlowLeap recorded nothing." with Try again. The count "0 applications" never shows in this state.
- **Proof:** the existing client tests `ui-flowleap-folder/tests/add-client-*` (failed state); by hand.

### IMP-11. A record batch fails and is repeated alone

- **Mark:** Today.
- **Risk:** Distrust.
- **Lines:** V8.
- **Story:** As Dr. Krüger, I want a failed record batch to be repeated without copies, so that a large client is recorded exactly once.
- **Start:** os test setup, or L with the record stopped during step Record.
- **Steps:** 1. Record a client with more than one batch. 2. Stop the Firm Record during batch 2. 3. Start it and select Try again.
- **Expected:** Only the missing batches are recorded. The count of application events equals the count of applications.
- **Proof:** the existing os test `test/record-clients.test.mjs` (Idempotency-Key of the batch) and `ui-flowleap-folder/tests/add-client-batches.client.spec.ts`.

### IMP-12. A screened person opens the client page

- **Mark:** New (the client page reads the folders of the runtime; the wall rule for the application index row is not built).
- **Risk:** Wrong person.
- **Lines:** V3, V8.
- **Story:** As Felix, I want Jonas's WAGO client page to leave out the application of the matter that screens him, so that the screen holds on every surface.
- **Start:** L. WAGO recorded with 3 applications. Jonas is in the WAGO client group and screened from EP22213933.
- **Steps:** 1. Jonas opens the WAGO client page. 2. Jonas searches the page for "EP22213933".
- **Expected:** Jonas sees 2 applications, no row and no count for EP22213933. Lena sees 3.
- **Proof:** new test.

### IMP-13. A client with over a thousand applications

- **Mark:** Today (with the live register keys; no fixture).
- **Risk:** Distrust.
- **Lines:** V8.
- **Story:** As Dr. Krüger, I want to add Siemens with its 1,132 EP applications at the firm in seconds, so that a large client is as easy as a small one.
- **Start:** D or L with the FlowLeap data plugin and the firm docket of the large-client sheet. Siemens is not a client.
- **Steps:** 1. Add client "Siemens". 2. Confirm the group (and keep Siemens Healthineers apart). 3. Record.
- **Expected:** The count on each step is exact and equal. Recording takes seconds, in batches. The client page shows 1,132 rows with sort, filters and pagination. No matter folder is made.
- **Proof:** the existing unit tests `ui-flowleap-folder/tests/firm-docket.host.spec.ts` and `ui-flowleap-folder/tests/docket-model.host.spec.ts`; by hand with live keys.

### IMP-14. A docket slice is too large

- **Mark:** Today.
- **Risk:** Distrust.
- **Lines:** V8.
- **Story:** As Dr. Krüger, I want the docket read to fail loudly when one register query returns more rows than it can read, so that FlowLeap never shows a count that is too small.
- **Start:** unit test setup.
- **Steps:** 1. Read a docket with a day slice over 2,000 rows.
- **Expected:** The docket state is "partial" and the count shows "incomplete". It never shows "ready".
- **Proof:** the existing test `ui-flowleap-folder/tests/firm-docket.host.spec.ts`.

### IMP-15. One client with two spellings

- **Mark:** Today.
- **Risk:** Distrust.
- **Lines:** V8, V7.
- **Story:** As Anna, I want "PHOENIX CONTACT GmbH & Co. KG" and "Phoenix Contact GmbH & Co. KG" to be one client, and Siemens and Siemens Healthineers to stay two, so that the application list of a client is complete and correct.
- **Start:** D or L with register keys.
- **Steps:** 1. Add client "Phoenix Contact". 2. Confirm the group.
- **Expected:** The group shows both spellings as one client with 2 applications. A name that is only similar is offered, not merged.
- **Proof:** by hand; the existing client tests of the group step.

### IMP-16. Day one: the deadlines that already run

- **Mark:** New (the MyEPO intake; the link test reads only unhandled letters in S16 sheet 06).
- **Risk:** Deadline.
- **Lines:** V7, V9, V11.
- **Story:** As Dr. Krüger, I want FlowLeap to show on the first day every deadline that already runs, so that the comparison with the old docket starts complete.
- **Start:** L + X after IMP-01. The double has rows 6, 15 and 16 unread, and row 5 (Rule 71(3) of SF-2022-0024) read and handled.
- **Steps:** 1. The first read of the Mailbox ends. 2. Dr. Krüger opens Letters and Deadlines.
- **Expected:** FlowLeap reads the Mailbox history, not only the unhandled letters, and says how far back it read. Each letter whose period can still be open has a proposed deadline or the task "Enter the due date". A letter that MyEPO shows as handled is not skipped in silence. The first read sends no notice for old letters.
- **Proof:** new test.
