# 1. Install and first sign-in

The firm gets its server, and each person signs in for the first time. Persons and setups are in [the index](README.md).

Edge cases of this area: two persons sign in at the same time; a shared PC; a person outside the firm's tenant; a person whose account is disabled; the first sign-in after an update; German; a phone.

### INS-01. The administrator installs the firm server

- **Mark:** Today.
- **Lines:** V20, V21, V22, V25.
- **Story:** As Felix (administrator), I want to install FlowLeap on the firm's server with one installer, so that the firm has its own system with nothing outside its control.
- **Start:** L: no VM. The candidate that passed the gate last.
- **Steps:** 1. Run `scripts/local-firm.sh up current`. 2. Run `scripts/local-firm.sh check`.
- **Expected:** `up` ends with the seed firm loaded and the 18 seed letters waiting. `check` passes every live check and writes a local-firm record for the candidate.
- **Proof:** by hand on L; the existing os tests `test/local-firm.test.mjs` and `test/gate-local-firm.test.mjs`.

### INS-02. First sign-in shows who I am

- **Mark:** WIP (the account menu is in draft PR 346).
- **Fails today:** QA finding 1: no name, no role and no sign-out on the merged screens.
- **Lines:** V20.
- **Story:** As Lena (attorney), I want to see my name and my role after I sign in, so that I know that FlowLeap knows who I am.
- **Start:** B (Lena is attorney.b) or L (account `lena`). Lena never signed in on this firm.
- **Steps:** 1. Open the firm address. 2. Select "Sign in with Microsoft" (B) or sign in with the local account (L). 3. Open the account menu.
- **Expected:** The account menu shows "Lena Hoffmann" and her role. The first screen greets her by name. Her own runtime starts; the console Users page (as Felix) shows Lena with a runtime.
- **Proof:** by hand on B and L.

### INS-03. The next person on a shared PC gets their own account

- **Mark:** WIP (the Sign out item is in draft PR 346; the account picker is in os PR 88).
- **Fails today:** QA finding 39: the proxy sign-out does not end the Microsoft session, so "Sign in with Microsoft" can sign in the previous person.
- **Risk:** Wrong person.
- **Lines:** V20, V26; decision 1 of the scope.
- **Story:** As Jonas (attorney), I want to sign out and let Lena sign in on the same PC, so that she never works in my account and I never see her matters.
- **Start:** B. One Chrome profile. Jonas is signed in with a chat open on SF-2021-0011.
- **Steps:** 1. Jonas opens the account menu and selects Sign out. 2. Jonas presses the browser's Back button. 3. Lena selects "Sign in with Microsoft".
- **Expected:** After step 1, the sign-in page shows. After step 2, no page of Jonas shows; the sign-in page shows again. In step 3, Microsoft asks which account to use; Lena picks hers, and her name shows. Lena's chat list does not show Jonas's chat.
- **Proof:** by hand on B (needs Entra; L has no Entra).

### INS-04. The first screen tells me what waits for me

- **Mark:** WIP (My work is the first screen in draft PR 346).
- **Fails today:** QA finding 2: the merged first screen is the dashboard; "Coming up" says that nothing is coming while a deadline is due.
- **Lines:** V13.
- **Story:** As Tobias (formalities), I want my first screen to say what waits for me, so that I know at once what to do.
- **Start:** L or D, seed clock `fetch`. The letters of the seed are loaded. Tobias is an intake person.
- **Steps:** 1. Sign in as Tobias.
- **Expected:** The first screen is My work. Its first line counts what arrived and what needs Tobias. Each row names the matter, the act and the due time. No row is a matter that Tobias does not see.
- **Proof:** by hand on L; new test: a client test of the first route.

### INS-05. A person outside the firm's tenant cannot sign in

- **Mark:** Today.
- **Risk:** Wrong person.
- **Lines:** V20.
- **Story:** As Felix (administrator), I want only the firm's own Entra accounts to sign in, so that no outsider reads a client's file.
- **Start:** B. A Microsoft account that is not in the firm's tenant, or a tenant account with no FlowLeap app role.
- **Steps:** 1. Open the firm address. 2. Sign in with that account.
- **Expected:** FlowLeap refuses the sign-in with a message that names the reason. No runtime starts; the console Users page does not list the account.
- **Proof:** by hand on B; the existing os test `test/signin.test.mjs`.

### INS-06. Two attorneys sign in at the same time

- **Mark:** Today.
- **Risk:** Wrong person.
- **Lines:** V21, V3.
- **Story:** As Jonas and Lena, we want to sign in at the same time on two PCs, so that each of us works in our own runtime and sees only our own matters.
- **Start:** B, or L with two browser profiles. Both persons signed out.
- **Steps:** 1. Jonas and Lena sign in within the same minute. 2. Each opens the Matters list. 3. Each starts a chat and asks "Which matters are mine?".
- **Expected:** Two runtimes start (console Users page). Jonas sees 2 matters, Lena sees 5. Jonas's list does not show SF-2022-0024. Each chat list shows only that person's chat. The agent of each answers with that person's matters only.
- **Proof:** by hand on B; the existing os tests `test/starter.test.mjs` and `test/spawner.test.mjs` for the runtimes.

### INS-07. The first sign-in after an update shows the app

- **Mark:** Today.
- **Fails today:** #327 is open: the first sign-in after an update can show an empty page.
- **Risk:** Distrust.
- **Lines:** V24, V20.
- **Story:** As Anna (attorney), I want FlowLeap to open normally on the morning after an update, so that I do not think that the firm lost its data.
- **Start:** L with candidate N. Anna signed in once on N. Then the firm's updater (`update.sh`) installs candidate N+1.
- **Steps:** 1. Anna opens the firm address and signs in.
- **Expected:** The first screen shows with Anna's data. No empty page, no reload needed.
- **Proof:** by hand on L; the gate case that stopped at the dossier (see #327).

### INS-08. A disabled account loses access

- **Mark:** Today (by hand; no test exists, and the life of a proxy session after the account is disabled is not known).
- **Risk:** Wrong person.
- **Lines:** V20, V2.
- **Story:** As Felix (administrator), I want a person whose Entra account I disable to lose access to FlowLeap, so that a person who left the firm reads nothing more.
- **Start:** B. Lena is signed in. The founder disables attorney.b in Entra (a founder act on the box).
- **Steps:** 1. Felix disables attorney.b in Entra. 2. Lena, still in her open browser, opens a matter and starts a chat.
- **Expected:** Within the session time that the firm accepts (to be written in the result), Lena's next page load goes to sign-in and the sign-in is refused. Her runtime stops. The time from step 1 to the refusal is recorded in the result.
- **Proof:** by hand on B; new test: an os test that a disabled account's proxy session ends.

### INS-09. A phone shows the first screen

- **Mark:** WIP (My work in draft PR 346; the 390 px tickets #297, #298, #302, #305, #307, #313, #314 are open).
- **Lines:** V13, V16.
- **Story:** As Anna (attorney), I want to open FlowLeap on my phone, so that I can see what waits for me when I am not at my desk.
- **Start:** B or L, browser width 390 px (a phone, or the browser's device view).
- **Steps:** 1. Sign in. 2. Open My work. 3. Open SF-2023-0045. 4. Open its deadline.
- **Expected:** No text is cut, no page scrolls sideways, every act can be tapped. The due date and the state of the deadline are readable without zoom.
- **Proof:** by hand; the existing client tests `ui-flowleap-records/tests/styles.client.spec.ts` for the style rules.

### INS-10. A German-speaking person sees German

- **Mark:** Today.
- **Fails today:** the German tickets #303, #309, #310, #315, #316 are open.
- **Lines:** V13 to V16.
- **Story:** As Sabine (formalities), I want FlowLeap in German, so that I read the terms of my work in my language.
- **Start:** L or D. The browser language is German.
- **Steps:** 1. Sign in as Sabine. 2. Open every v1 surface: My work, Letters, Deadlines, a matter, a deadline.
- **Expected:** Every label, state, refusal and empty state is German. Dates show in German format. Names and EPO document names keep their published form.
- **Proof:** by hand; the existing client test `ui-flowleap-records/tests/words.client.spec.ts`.

### INS-11. The first administrator and the last one

- **Mark:** New (no rule for the first administrator in the Firm Record; roles have two sources, the Entra app role for the console and `firm.roles` for the record).
- **Risk:** Wrong person.
- **Lines:** V1, V2, V20.
- **Story:** As Dr. Krüger, I want the first administrator to be only the person whom the firm named in Entra, and the last administrator to be impossible to remove, so that no stranger takes the firm and the firm is never locked out.
- **Start:** B or a fresh L. No person signed in yet. Then a firm with one administrator, and a person whose Entra app role and `firm.roles` differ.
- **Steps:** 1. A person without the Entra app role signs in first. 2. Felix tries to remove himself as the last administrator. 3. Open the console as the person whose two roles differ.
- **Expected:** Step 1 gives no administrator right. Step 2 is refused. In step 3 the lower right applies, and the console shows the difference between the two sources.
- **Proof:** new test.

### INS-12. A new attorney knows in ten seconds where to start

- **Mark:** New. Parts: WIP (My work as the first screen, draft PR 346); New (the sidebar groups of decision B of the scope).
- **Fails today:** the founder's local test of 2026-11-10: the sidebar has no groups, and a new person does not see one start.
- **Risk:** Distrust.
- **Lines:** V13, V2; decision B of the scope.
- **Story:** As Lena (attorney), I want to see at first sign-in where my work starts, so that I start without help.
- **Start:** L. Accounts `lena` and `felix`, both signing in for the first time. A tester who has not seen FlowLeap plays Lena.
- **Steps:** 1. Lena signs in. 2. The tester says where to start, with no help, and the time is measured. 3. Felix signs in.
- **Expected:** My work opens as the first screen. The sidebar has three groups with labels: Work (My work, Letters, Deadlines), Firm (Clients, Matters) and Agent (New chat, Chats, Agents, Automation). Setup is at the bottom with Settings. Lena has no Firm admin row. The tester names My work within 10 seconds. Felix sees Firm admin under Setup.
- **Proof:** by hand on L as two persons, with a stopwatch.
