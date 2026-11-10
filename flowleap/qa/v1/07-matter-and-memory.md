# 7. The matter page and matter memory

The matter page shows a matter's story, its files and its chat. Matter memory is what the agent knows about the matter: its letters, register events, files and client instructions, each with its source ([the client model](../../docs/2026-11-09-client-model.md)). The agent reads the Firm Record with `record_read` (merged). Register events come from each runtime's OPS key today; files are in one runtime's client folder; client instructions other than the AI wishes have no record (decision 10 of the scope).

Edge cases of this area: two persons add to the same matter; a fact with no source; the register does not answer; the agent is asked about a fact it does not have; the next day; search inside the walls; a matter of a client that allows only a local model; a firm with over a thousand matters.

### MAT-01. The matter page shows the whole story with sources

- **Mark:** New. Parts: WIP (the dossier in PR 346); New (register events and files at firm level, S17).
- **Lines:** V16, V17.
- **Story:** As Anna, I want SF-2023-0045's page to show its letters, register events, files and client instructions, each with its source and date, so that I know the matter's story without searching.
- **Start:** L + X, with OPS linked by Felix. Row 18 filed. A file on the matter. A recorded client instruction.
- **Steps:** 1. Anna opens SF-2023-0045.
- **Expected:** One time line: the letters ("EPO Mailbox, 29 Sep 2026"), the register events ("EP Register, read on <date>"), the files ("Added by <person>, <date>"), the client instructions ("Recorded by <person> from the mail of <date>"). A fact with no source is not shown.
- **Proof:** by hand.

### MAT-02. A file that one attorney adds is seen by the team

- **Mark:** New (the client folder is per runtime, `clientsRoot: dshHomePath('clients')`; S17).
- **Fails today:** the folder of one runtime is not seen by other runtimes.
- **Risk:** Distrust.
- **Lines:** V16, V17, V4.
- **Story:** As Lena, I want a file that I drop on SF-2023-0045 to be seen by Anna and Tobias and by Anna's agent, so that the team works on one file.
- **Start:** L. Lena and Anna in two browser profiles.
- **Steps:** 1. Lena drops `claims-amended.pdf` on the matter. 2. Anna opens the matter's files. 3. Anna asks the agent "What did Lena add to this matter?".
- **Expected:** Anna sees the file with "Added by Lena Hoffmann" and the time. The agent names the file with its source.
- **Proof:** by hand on L as two persons; new test.

### MAT-03. The agent answers with sources

- **Mark:** Today.
- **Risk:** Distrust.
- **Lines:** V17.
- **Story:** As Jonas, I want each statement of the agent about SF-2021-0011 to carry its source, so that I can check it.
- **Start:** L. Jonas signed in.
- **Steps:** 1. Jonas asks "What happened on SF-2021-0011, and what is its state?".
- **Expected:** Each fact has its source: the record position, the letter, or the register read with its date. The answer names Jonas Weber as responsible and the application number EP21755382.
- **Proof:** the existing test `flowleap-record/tests/record-read.e2e.ts`; QA findings L8 and L11 (works).

### MAT-04. The agent does not guess a fact it does not have

- **Mark:** Today.
- **Risk:** Distrust.
- **Lines:** V17.
- **Story:** As Lena, I want the agent to say that it does not know when the memory has no answer, so that it never invents a fact.
- **Start:** L. SF-2023-0042 has no recorded client instruction about a divisional application.
- **Steps:** 1. Lena asks "Did Renishaw instruct us to file a divisional on SF-2023-0042?".
- **Expected:** The agent says that no instruction is recorded and names where it looked. It does not answer yes or no.
- **Proof:** by hand; QA finding 46 (works).

### MAT-05. The next day, the agent still knows the matter

- **Mark:** Today.
- **Lines:** V17.
- **Story:** As Anna, I want to ask a second question about SF-2023-0045 the next day and get an answer from the same facts, so that I do not explain the matter again.
- **Start:** L. MAT-01 done. One day later (or after a restart of Anna's runtime).
- **Steps:** 1. Anna opens a new chat and asks "What is open on SF-2023-0045?".
- **Expected:** The agent reads the record and the matter files again and answers with the same facts and sources, plus anything new.
- **Proof:** by hand.

### MAT-06. A client instruction is recorded with its source

- **Mark:** New (instructions other than the AI wishes have no record; decision 10).
- **Lines:** V17, V4.
- **Story:** As Lena, I want to record "Renishaw wants no divisional on EP23771920" with the client's mail as its source, so that Anna and the agent know it.
- **Start:** L. Lena and Anna in two browser profiles.
- **Steps:** 1. Lena records the instruction on SF-2023-0045 and attaches the mail. 2. Anna opens the matter. 3. Anna asks the agent about divisionals.
- **Expected:** Anna sees the instruction with "Recorded by Lena Hoffmann" and the mail. The agent quotes it with that source.
- **Proof:** new test.

### MAT-07. Find a matter inside the walls

- **Mark:** WIP (os `GET search` is merged; the Find dialog is in PR 346).
- **Fails today:** QA finding 15: the merged Search act opens the app's command menu.
- **Risk:** Wrong person.
- **Lines:** V16, V3; decision 2 of the scope.
- **Story:** As Lena, I want to find a matter by its file number, its EP number, its client, its title or a person, so that I open it in seconds.
- **Start:** L. Lena and Jonas.
- **Steps:** 1. Lena searches "EP22213933", then "Renishaw", then "position encoding". 2. Jonas searches "EP22213933" and "control device".
- **Expected:** Lena gets SF-2022-0024, the two Renishaw matters, and SF-2023-0045. Jonas gets no hit and no count for SF-2022-0024.
- **Proof:** the existing os test `test/record-first-demo.test.mjs` (`record.search-inside-wall`); by hand with PR 346.

### MAT-08. The page names the next step and who does it

- **Mark:** WIP (PR 346, "What waits").
- **Fails today:** QA findings 22 and 28.
- **Lines:** V16, V13.
- **Story:** As Lena, I want the top of the matter page to say what happens next and who does it, so that I know whether it is my step.
- **Start:** L. A deadline of SF-2022-0024 that Lena entered waits for a second person.
- **Steps:** 1. Lena opens SF-2022-0024.
- **Expected:** "Waits for Sabine Wolf: confirm the deadline", with "Ask Sabine" or the notice that was sent.
- **Proof:** by hand.

### MAT-09. Every row of the matter page opens

- **Mark:** New (QA finding 23: only the date cell opens; no fix confirmed in PR 346).
- **Lines:** V16.
- **Story:** As Lena, I want to open a deadline by clicking anywhere on its row, so that I do not hunt for the link.
- **Start:** L. SF-2022-0024.
- **Steps:** 1. Lena clicks the title cell of the deadline row. 2. She uses the keyboard on the row.
- **Expected:** Both open the deadline page.
- **Proof:** by hand; new client test.

### MAT-10. The register does not answer

- **Mark:** New. Parts: Today (the client page error state is built); New (on the matter page).
- **Risk:** Distrust.
- **Lines:** V17, V6.
- **Story:** As Anna, I want the matter page to say that the EP Register did not answer, and keep what the record knows, so that I do not think that the matter has no events.
- **Start:** L with no network for the register.
- **Steps:** 1. Anna opens SF-2023-0045.
- **Expected:** The record's letters and deadlines show. The register part says "The EP Register did not answer at <time>" with Try again. It never says "no events".
- **Proof:** by hand.

### MAT-11. A local-model-only client stays on the local model

- **Mark:** New. Parts: Today for the Ticket run (os refuses `ai-not-allowed`, `lib/record/tickets.mjs:34`); New for chats.
- **Risk:** Wrong person.
- **Lines:** V17, V18, V22.
- **Story:** As Anna, I want the agent to never send a Phoenix Contact matter to a cloud model, so that the client's rule holds.
- **Start:** L. Phoenix Contact `local-model-only`. Anna's default model is a cloud model.
- **Steps:** 1. Anna asks the agent in a chat about SF-2020-0031. 2. A Ticket run starts for SF-2026-0019.
- **Expected:** The chat refuses to read the matter with the cloud model and says why, or uses the firm's local model. The run is "by hand" with "the client allows only a local model". The gateway log has no cloud call with the matter's content.
- **Proof:** the existing os test `test/record-r1.test.mjs` (`ai-not-allowed`); new test for chats.

### MAT-12. The matter list of a firm with over a thousand matters

- **Mark:** New (a large fixture).
- **Lines:** V16.
- **Story:** As Dr. Krüger, I want the matter list to sort, filter and page through 1,200 matters, so that I find a matter in a large firm.
- **Start:** L with a fixture of 1,200 matters.
- **Steps:** 1. Open the matter list. 2. Sort by next due date. 3. Filter by client and state. 4. Go to page 10.
- **Expected:** Each step answers in under 2 seconds; the counts are exact; the next due date of a proposed deadline is marked as proposed.
- **Proof:** new test with a new fixture.
