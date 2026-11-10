# 9. Notices

A notice is an Outlook mail to the person who owns a task, with a link to the task's page (sheets 03 and 05). The notice mail and the outbox are merged (os `lib/record/notices.mjs`, `lib/mailbox/outbox.mjs`, PR 88). They are proved with a fake Graph only; the local firm shows notices on a local outbox page (`records/outbox`). A real Outlook notice is proved only on the box.

Edge cases of this area: the link opens on a person who must not see the matter; a notice to an address outside the firm; Graph refuses; a crash during the send; a screened person; German.

### NOT-01. The owner of a task gets an Outlook notice

- **Mark:** Today (fake Graph and the local outbox); by hand on B for a real mail.
- **Lines:** V19, V13.
- **Story:** As Lena, I want an Outlook mail when a task comes to me, so that I act on it without watching FlowLeap.
- **Start:** B (Lena and Jonas). A deadline that Jonas entered on SF-2021-0011 waits for Lena.
- **Steps:** 1. Jonas enters the event. 2. Lena opens Outlook. 3. Lena selects the link in the mail.
- **Expected:** One mail, from the firm's FlowLeap address, with the act, the matter, the due time and the link. The link opens the deadline after sign-in. The record has the notice with "sent" and the time.
- **Proof:** the existing os test `test/record-first-demo.test.mjs` ("notices"); by hand on B.

### NOT-02. A notice is sent at most once

- **Mark:** Today.
- **Risk:** Distrust.
- **Lines:** V19.
- **Story:** As Anna, I want one notice for one task, also when the server restarts during the send, so that I do not get copies and stop reading them.
- **Start:** os test setup with a crash between send and stamp.
- **Steps:** 1. Send. 2. Restart. 3. Check Sent Items and the record.
- **Expected:** One mail. The record has one notice; a send that cannot be confirmed is checked against Sent Items, not sent again.
- **Proof:** the existing os test `test/mailbox-outbox.test.mjs`.

### NOT-03. A notice never goes outside the firm

- **Mark:** Today.
- **Risk:** Wrong person.
- **Lines:** V19.
- **Story:** As Felix, I want the outbox to refuse every address outside the firm's domain, so that no notice reaches a client or a stranger.
- **Start:** os test setup, or L with a person whose mail address is outside the firm's domain.
- **Steps:** 1. A task comes to that person.
- **Expected:** No mail. Felix has the task "Fix the message" with the reason.
- **Proof:** the existing os test `test/mailbox-outbox.test.mjs` proves that a reply goes only to firm addresses from the record; new test for the notice and the task of the administrator.

### NOT-04. Graph refuses the notice

- **Mark:** Today (by hand with the fake Graph).
- **Risk:** Deadline.
- **Lines:** V19.
- **Story:** As Felix, I want a notice that Graph refuses to come to me as a task, so that the owner of the deadline task is told another way.
- **Start:** L with the outbox on a Graph double that refuses.
- **Steps:** 1. A task opens and its notice fails. 2. Felix opens My work. 3. The task's owner opens My work.
- **Expected:** Felix has "Fix the message" with the refusal. The owner still has the task in My work; FlowLeap does not show "notified".
- **Proof:** by hand; new test.

### NOT-05. A notice says nothing that the reader may not see

- **Mark:** Today.
- **Risk:** Wrong person.
- **Lines:** V19, V3.
- **Story:** As Felix, I want a notice to hold only what its recipient may see, so that a forwarded mail does not carry a matter to a person outside its wall.
- **Start:** L. A notice to Lena about SF-2022-0024.
- **Steps:** 1. Lena forwards the mail to Jonas. 2. Jonas opens the link.
- **Expected:** The mail has the file number, the act and the due time, and no client file content. Jonas's link shows "not found" with no data.
- **Proof:** by hand on L (local outbox page) or B.

### NOT-06. A screened person gets no notice

- **Mark:** Today.
- **Risk:** Wrong person.
- **Lines:** V19, V3.
- **Story:** As Felix, I want no notice about SF-2022-0024 to go to Jonas, also through the escalation chain, so that the screen holds in Outlook.
- **Start:** L. A task of SF-2022-0024 that escalates through a chain that names Jonas's role.
- **Steps:** 1. Let the task escalate. 2. Open the outbox page.
- **Expected:** No notice to Jonas. The chain skips him and goes to the next person inside the wall.
- **Proof:** by hand on L; new test.

### NOT-07. A notice in the person's language

- **Mark:** New (no per-person language setting was found for notices).
- **Lines:** V19.
- **Story:** As Sabine, I want my notices in German, so that I read them as fast as my other mail.
- **Start:** L. Sabine's language is German.
- **Steps:** 1. A task comes to Sabine. 2. Open the outbox page.
- **Expected:** The subject and body are German; the file number and the EPO document name keep their published form.
- **Proof:** new test.

### NOT-08. A notice of an escalation names why

- **Mark:** WIP (escalation notices: os merged; the mail text with the reason, PR 346 or later).
- **Risk:** Deadline.
- **Lines:** V19, V12.
- **Story:** As Dr. Krüger, I want the notice of a task that escalates to me to say that its due time passed and whose it was, so that I act at once.
- **Start:** L, after DL-03.
- **Steps:** 1. Open Dr. Krüger's notice.
- **Expected:** "Given to you: the due time passed. It was Dr. Anna Becker's." with the due time of the deadline.
- **Proof:** by hand.
