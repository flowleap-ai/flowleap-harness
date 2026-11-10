# 6. My work

My work is the first screen: what waits for me, grouped by due time (Overdue, Today, Later), with one owner for each task. A task opens and closes with its object; there is no "done" button ([sheet 00](../../docs/process-atlas/00-connected-flow.md)). The os task model and `GET my-work` are merged (os PR 82, 87); the screen is in draft PR 346; the harness task fields are in PR 344 (open, with conflicts); the PR 388 version is a draft.

Edge cases of this area: two persons see the same task change; a task that escalates to me; a screened matter; the administrator, who sees no matter; the agent's answer differs from the screen; nothing waits; a firm with over a thousand matters; a phone.

### MW-01. My work groups what waits for me by due time

- **Mark:** WIP (PR 346, PR 344).
- **Lines:** V13.
- **Story:** As Tobias, I want My work to show my tasks grouped as Overdue, Today and Later, so that I do the most urgent one first.
- **Start:** L at the real date with the seed letters filed. Tobias signed in.
- **Steps:** 1. Tobias opens My work.
- **Expected:** One row for each task, with the act, the matter, the client, the due time and why it is his. The groups are in this order. The first line counts them.
- **Proof:** by hand with PR 346; the existing os test `test/record-my-work.test.mjs`.

### MW-02. A task that one person finishes leaves both lists

- **Mark:** WIP (PR 346).
- **Lines:** V13, V4.
- **Story:** As Tobias and Anna, we want a task to leave My work for each of us when its object is done, so that nobody does work that is done.
- **Start:** L. Two browser profiles. A deadline of SF-2023-0045 waits; the confirm task is Anna's; Tobias sees "waits for Dr. Anna Becker" on the matter.
- **Steps:** 1. Anna confirms the deadline. 2. Within one minute, Tobias reloads the matter and My work.
- **Expected:** Anna's task is gone. Tobias's matter shows the deadline as active, "confirmed by Dr. Anna Becker". Neither list has a "done" button.
- **Proof:** by hand on L; the existing os test `test/record-tasks.test.mjs`.

### MW-03. A task that escalates to me says why

- **Mark:** WIP (os `task/escalated` is merged; the screen is in PR 346).
- **Risk:** Deadline.
- **Lines:** V13, V12.
- **Story:** As Dr. Krüger, I want a task that comes to me from the chain to say why and whose it was, so that I act on it at once.
- **Start:** L, after DL-03 step 3.
- **Steps:** 1. Dr. Krüger opens My work.
- **Expected:** The row says "Given to you: the due time passed. It was Dr. Anna Becker's." in the Overdue group.
- **Proof:** by hand.

### MW-04. My work never shows a screened matter

- **Mark:** WIP (the os view is inside the walls; the screen in PR 346).
- **Risk:** Wrong person.
- **Lines:** V13, V3.
- **Story:** As Felix, I want Jonas's My work to have no row and no count for SF-2022-0024, so that the screen holds on the first screen too.
- **Start:** L. SF-2022-0024 has an overdue deadline and an open task for Lena. Jonas is a confirmer of WAGO matters.
- **Steps:** 1. Jonas opens My work. 2. Lena opens My work.
- **Expected:** Jonas: no row, and the counts do not include it. Lena: the row.
- **Proof:** by hand on L; the existing os test `test/record-my-work.test.mjs`.

### MW-05. The administrator's My work has firm tasks only

- **Mark:** New (firm tasks for the administrator: the MyEPO link, firm letters).
- **Risk:** Wrong person.
- **Lines:** V13, V3, V5.
- **Story:** As Felix, I want My work to show me the firm's tasks, such as a broken MyEPO link or a letter with no application, and no matter facts, so that I do my work without reading client files.
- **Start:** L + X. LET-03 and LET-13 done.
- **Steps:** 1. Felix opens My work.
- **Expected:** Rows "Fix the MyEPO permission" and "Look at this letter". No matter title, client fact or deadline of a matter.
- **Proof:** new test.

### MW-06. The agent's "what waits for me" equals the screen

- **Mark:** WIP (`record_my_work` is merged; its task fields are in PR 344).
- **Risk:** Distrust.
- **Lines:** V13, V17.
- **Story:** As Anna, I want the agent's answer to "what waits for me?" to list the same tasks as My work, so that I can trust both.
- **Start:** L. Anna has at least two tasks.
- **Steps:** 1. Anna opens My work. 2. In a new chat she asks "What waits for me?".
- **Expected:** The same tasks, the same due times, the same order of urgency. The agent names the record position it read.
- **Proof:** by hand; the existing snapshot `snapshots/session/flowleap-record-my-work/`.

### MW-07. Nothing waits

- **Mark:** WIP (the empty state of PR 346).
- **Fails today:** QA finding 41: the merged empty Intake says that a letter "files itself", which R1 never does.
- **Risk:** Distrust.
- **Lines:** V13, V14.
- **Story:** As Jonas, I want an empty My work to say something true, so that I believe it when it says that nothing waits.
- **Start:** L. Jonas has no task.
- **Steps:** 1. Jonas opens My work and the Intake.
- **Expected:** The empty states say who sees letters before filing (the intake persons) and when a task comes to Jonas. No sentence describes a behaviour that the firm's settings do not have.
- **Proof:** by hand.

### MW-08. My work of a firm with over a thousand matters

- **Mark:** New (a large fixture).
- **Lines:** V13.
- **Story:** As Sabine in a large firm, I want My work to open fast with hundreds of tasks, so that the first screen is usable on a busy day.
- **Start:** L with a fixture of 1,200 matters and 300 open tasks for Sabine.
- **Steps:** 1. Sabine opens My work. 2. She filters by client.
- **Expected:** The list opens in under 2 seconds on the firm server. Sort and filters work; the counts stay exact.
- **Proof:** new test with a new fixture.

### MW-09. My work on a phone

- **Mark:** WIP (PR 346; the 390 px tickets).
- **Lines:** V13.
- **Story:** As Anna, I want My work on my phone, so that I see an overdue task when I am out of the office.
- **Start:** L or B, width 390 px.
- **Steps:** 1. Open My work. 2. Open the first task.
- **Expected:** Every row is readable without zoom. The task opens its object page.
- **Proof:** by hand.

### MW-10. A row opens its object

- **Mark:** WIP (PR 346).
- **Lines:** V13, V16.
- **Story:** As Tobias, I want each row of My work to open the page where I do the act, so that I do not search for it.
- **Start:** L. Tobias has a letter to file, a deadline to confirm and an event to enter.
- **Steps:** 1. Tobias opens each row by click, and by the keyboard.
- **Expected:** Each opens the letter, the deadline or the event page with its one main act. The row's context menu has Open, Open matter and Copy link.
- **Proof:** by hand.
