# 2. The administrator sets up the firm

Felix (administrator) sets the firm identity, the persons and roles, the connectors, the read flag and the confirmation level. Each setting is a fact of the firm: it is in the Firm Record or a firm service, and every person sees the same value (founder decision 5 of 2026-11-10).

The firm-level home of these settings is in design: the architecture ADR (session S17, no output yet), S16 sheet 06 (the MyEPO link, not committed) and the mockups of draft PR 388. Where these are not final, the story follows the founder's decision and marks the dependency.

Edge cases of this area: an attorney tries an administrator's act; the administrator's change reaches every person; two administrators act at the same time; a wrong or revoked credential; MyEPO times out or the portfolio permission is missing; a firm with one person; a required setting is empty.

### ADM-01. The firm identity reaches every person

- **Mark:** New (a firm-level store for the identity; S17).
- **Fails today:** the identity is saved in `stateDir/identity.json` of the administrator's runtime (`ui-flowleap-folder/src/index.ts:414`, `cordis.patch.yml:426`). Other runtimes do not see it.
- **Risk:** Distrust.
- **Lines:** V1, V4.
- **Story:** As Felix (administrator), I want to set the firm's name and its EP representative identity once, so that every person's Add client and docket use the same identity.
- **Start:** L. Accounts `felix` (administrator) and `jonas`. No identity set.
- **Steps:** 1. Felix opens Settings, Firm identity, enters the firm name and representative, and saves. 2. Jonas, in his own browser profile, opens Add client.
- **Expected:** Jonas's Add client uses the identity that Felix saved, with no step of his own. The Firm Record (or the firm service) has one identity event by Felix.
- **Proof:** by hand on L as two persons; new test: a two-runtime test of the identity.

### ADM-02. An attorney cannot change the firm identity

- **Mark:** Today.
- **Risk:** Distrust.
- **Lines:** V2.
- **Story:** As Felix, I want only an administrator to change the firm identity, so that an attorney cannot change what the whole firm reads.
- **Start:** L or D. Jonas signed in.
- **Steps:** 1. Jonas opens Settings, Firm identity. 2. Jonas tries to save a change.
- **Expected:** The save is refused with a plain message that only an administrator can change it (`not-admin`). Nothing changes.
- **Proof:** the existing client test `ui-flowleap-folder/tests/add-client-routes.host.spec.ts`; by hand on L.

### ADM-03. The administrator gives a person a role

- **Mark:** New (no screen edits `firm.roles`; the roles are in the host file `settings.json`, os `lib/record/settings.mjs:39`).
- **Lines:** V1, V2, V4.
- **Story:** As Felix, I want to make a new employee a formalities person, so that the letters of the firm reach that person from the next minute.
- **Start:** L. A new account `newfa` signed in once, with no firm role.
- **Steps:** 1. Felix opens the persons page, gives `newfa` the role formalities and makes it an intake person. 2. `newfa` reloads My work.
- **Expected:** `newfa` sees the letters that wait in the Intake. The Firm Record has the role change with Felix as actor. No restart of a service is needed.
- **Proof:** by hand on L as two persons; new test.

### ADM-04. A role change reaches every person

- **Mark:** New (as ADM-03).
- **Risk:** Wrong person.
- **Lines:** V1, V2, V4.
- **Story:** As Felix, I want to remove the formalities role from Miriam, so that she gets no new letter from that minute.
- **Start:** L. Miriam (`miriam`) and Tobias signed in. One letter waits in the Intake.
- **Steps:** 1. Felix removes Miriam from the intake persons. 2. Miriam reloads My work and opens the address of the waiting letter. 3. Tobias reloads My work.
- **Expected:** Miriam's My work has no Intake letter, and the letter's address shows "not found" with no letter data. Tobias still sees the letter. The change is in the Firm Record with Felix as actor.
- **Proof:** by hand on L; new test.

### ADM-05. The administrator links MyEPO for the whole firm

- **Mark:** WIP (S16 sheet 06; the console Keys page and the firm MyEPO card in draft PR 388; #389).
- **Fails today:** the MyEPO link of PR 366 saves the pair in the runtime of the person who links it, with no admin check.
- **Lines:** V5, V4.
- **Story:** As Felix, I want to link the firm's MyEPO account once on the console, so that every person sees the firm's EPO letters and nobody holds the secret.
- **Start:** L + X. The double runs; MyEPO is not linked.
- **Steps:** 1. Felix opens the console Keys page, MyEPO, enters client `flowleap-myepo-double` and secret `public-sample-data`, and tests. 2. Jonas opens Settings, Connectors, MyEPO in his app.
- **Expected:** Step 1 links only after the full test passes (token, portfolios, unhandled letters) and shows three portfolios. Jonas's card shows "Linked by your firm" with the date, and no field for a secret. No attorney runtime holds the secret: the runtime's credential store has no `flowleap-connectors/myepo` record.
- **Proof:** by hand on L + X as two persons; new test: an os invariant that no runtime holds the MyEPO pair.

### ADM-06. A wrong MyEPO secret saves nothing

- **Mark:** WIP (PR 387 for the double; the firm card in PR 388).
- **Lines:** V5.
- **Story:** As Felix, I want a wrong secret to be refused before it is saved, so that the firm never believes that it is linked when it is not.
- **Start:** L + X. MyEPO is not linked.
- **Steps:** 1. Felix enters the client id and the secret `wrong`. 2. Felix tests.
- **Expected:** The test is refused with "MyEPO refused this client id or secret" (the double answers `401 invalid_client`). The card stays "Not linked". Nothing is saved.
- **Proof:** the existing test `flowleap-connectors/tests/myepo-link.e2e.ts` (runtime card); by hand on L + X for the firm card.

### ADM-07. MyEPO does not answer during the link test

- **Mark:** WIP (S16 sheet 06 D6.4; the PR 388 console draws "Save anyway", see decision 13 of the scope).
- **Risk:** Distrust.
- **Lines:** V5.
- **Story:** As Felix, I want a link test that times out to save nothing, so that a link is never "linked" without a passed test.
- **Start:** L + X. The double is stopped.
- **Steps:** 1. Felix enters the correct pair and tests.
- **Expected:** After the time limit, the card says that MyEPO did not answer and that nothing was saved. No "Save anyway" act. The state stays "Not linked".
- **Proof:** by hand (stop the double); new test.

### ADM-08. The MyEPO account has no portfolio permission

- **Mark:** New (a double control for zero portfolios; the double always answers three).
- **Risk:** Deadline.
- **Lines:** V5, V7.
- **Story:** As Felix, I want FlowLeap to tell me when the MyEPO account sees no portfolio, so that I know that no letter can arrive.
- **Start:** L + X with a double state of zero portfolios.
- **Steps:** 1. Felix links MyEPO. 2. Felix and Sabine open the Letters surface.
- **Expected:** The link is saved as "waits for portfolio permission" with "Test again". The Letters surface of every person says that no letter can arrive and since when. My work of Felix has the task to fix the permission.
- **Proof:** new test with a new double control.

### ADM-09. An attorney cannot link MyEPO in their own app

- **Mark:** New (#389: the firm mode refuses a runtime link).
- **Fails today:** any attorney can save a MyEPO pair in their own runtime (PR 366).
- **Risk:** Wrong person.
- **Lines:** V2, V5.
- **Story:** As Felix, I want an attorney's app to refuse a MyEPO link of its own, so that no person holds a MyEPO secret that reads every client's letters.
- **Start:** L. MyEPO linked by the firm, or not linked.
- **Steps:** 1. Jonas opens Settings, Connectors, MyEPO. 2. Jonas tries to enter a client id and secret.
- **Expected:** The card has no fields; it says that the administrator links MyEPO for the firm. A direct call to the runtime's link route is refused.
- **Proof:** new test.

### ADM-10. The administrator links EPO OPS for the firm

- **Mark:** New (no console OPS card; os `lib/firm-keys.py:49` copies the key into every runtime).
- **Risk:** Wrong person.
- **Lines:** V6, V4.
- **Story:** As Felix, I want to enter the firm's EPO OPS key once, so that every person and the firm's register check use it and no attorney can read it.
- **Start:** L. No OPS key.
- **Steps:** 1. Felix opens the console Keys page, EPO OPS, enters the key and secret, and tests. 2. Anna opens a matter and its register events.
- **Expected:** The test passes and the card shows "Linked". Anna's matter page shows the register events with "EPO Register, read on <date>". The OPS key is in no runtime's keys document.
- **Proof:** by hand on L; new test: the os invariant `keys.none-in-runtime` passes in full.

### ADM-11. The administrator sets the read flag

- **Mark:** WIP (S16 sheet 01, `myepo.download`; the setting in draft PR 388).
- **Lines:** V10, V1.
- **Story:** As Felix, I want to choose when FlowLeap downloads a Mailbox letter, so that the firm's MyEPO shows a letter as read only when the firm decides.
- **Start:** L + X, MyEPO linked. The setting has its default.
- **Steps:** 1. Felix opens the MyEPO setting. 2. Felix reads the current value. 3. Felix changes it to "download at arrival" and saves. 4. Sabine opens the MyEPO card in her app.
- **Expected:** Step 2 shows "Download a letter when a person or a task opens it" as the default. After step 3, Sabine's card shows the new value and who changed it. The Firm Record has the change with Felix as actor.
- **Proof:** by hand on L + X; new test.

### ADM-12. The confirmation level is strict by default

- **Mark:** New (no setting; `deadline.observeModeConfirm` accepts only `confirm`, os `settings.mjs:100`; levels in S16 sheet 08).
- **Risk:** Deadline.
- **Lines:** V12, V1.
- **Story:** As Dr. Krüger (partner), I want the confirmation level to be strict unless the firm changes it, so that no deadline is confirmed without a person on day one.
- **Start:** L, fresh install.
- **Steps:** 1. Felix opens the deadline settings. 2. Jonas opens the same settings.
- **Expected:** The level shows "strict: a person confirms each deadline". Felix can change it; Jonas sees it read-only. A change shows to every person, with who changed it and when.
- **Proof:** by hand on L; new test.

### ADM-13. An administrator's change reaches every person without a restart

- **Mark:** New (the host file has no screen; today a change needs a restart of `flowleap-record`).
- **Risk:** Distrust.
- **Lines:** V1, V4.
- **Story:** As Felix, I want each firm setting that I change to take effect for every person at once, so that I do not have to ask people to sign out or wait for a restart.
- **Start:** L. Tobias and Lena signed in. Every setting that a v1 screen can change.
- **Steps:** 1. Felix changes one setting (for example the intake persons). 2. Within one minute, Tobias and Lena reload.
- **Expected:** Both see the new value. No service restart in the console's System log.
- **Proof:** by hand on L; new test.

### ADM-14. Two administrators change the same setting at the same time

- **Mark:** New (no settings screen).
- **Risk:** Distrust.
- **Lines:** V1, V4.
- **Story:** As Felix and Dr. Krüger (as a second administrator), we want the second save of the same setting to see that the first one changed it, so that one change does not silently undo the other.
- **Start:** L. Two administrator accounts, each on the settings page.
- **Steps:** 1. Both open the same setting. 2. Felix saves value A. 3. Dr. Krüger saves value B without a reload.
- **Expected:** Step 3 is refused with "this setting changed since you opened it", and shows A with who set it. The Firm Record has one change.
- **Proof:** new test.

### ADM-15. The administrator records the model provider contract

- **Mark:** WIP (the record command exists, os `lib/record/tickets.mjs:382`; no admin screen and no role check, see NEV-05).
- **Lines:** V1, V18, V22.
- **Story:** As Felix, I want to record the firm's § 39c PAO contract with the model provider, so that agent runs on client files are allowed only after the contract exists.
- **Start:** L. `firm.modelProviders` empty.
- **Steps:** 1. Before step 2, Anna asks for prepared work on SF-2023-0045. 2. Felix records the contract. 3. Anna asks again.
- **Expected:** In step 1, the work goes "by hand" with the reason "no provider contract". After step 2, the run starts. The Firm Record has the contract with Felix as actor.
- **Proof:** the existing os test `test/record-r1.test.mjs` for the by-hand path; by hand on L for the screen.

### ADM-16. The administrator screens a person from a matter

- **Mark:** Today (by the record command; no screen, walls from Entra groups are #227).
- **Risk:** Wrong person.
- **Lines:** V3, V1.
- **Story:** As Felix, I want to screen Jonas from SF-2022-0024, so that he cannot see a matter where he has a conflict, from that minute.
- **Start:** D or L. Seed firm. To test the change, remove the seed screen first, then record it.
- **Steps:** 1. Felix records the screen of Jonas on EP22213933. 2. Jonas reloads the Matters list, opens the matter's address and asks the agent about it.
- **Expected:** Jonas has no row, the address shows "not found", and the agent has no data on it. Lena still sees the matter. The record has `matter/screen-recorded`.
- **Proof:** the existing os test `test/record-unfiled-letters.test.mjs` (`matter.screen-recorded`); by hand on L.

### ADM-17. A firm with one person

- **Mark:** New (a seed variant with one person; the single-check of sheet 02).
- **Risk:** Deadline.
- **Lines:** V12, V2.
- **Story:** As a patent attorney who is the whole firm, I want FlowLeap to work with one person, so that I can run my own deadlines, and FlowLeap marks each one that had no second check.
- **Start:** L with a one-person seed: one person is administrator, attorney and formalities.
- **Steps:** 1. The person files a letter, computes its deadline, and opens it.
- **Expected:** The deadline cannot be confirmed by the person who entered it, unless the firm's setting says one person. Then it is active and marked "single check" on every surface and in the record. No surface shows it as confirmed by two persons.
- **Proof:** new test on a new seed variant.

### ADM-18. A required setting that is empty stops the service loudly

- **Mark:** Today.
- **Risk:** Deadline.
- **Lines:** V1.
- **Story:** As Felix, I want FlowLeap to refuse to start the Intake with no intake person, so that no letter waits for a person who does not exist.
- **Start:** L. Set `intake.persons` to an empty list.
- **Steps:** 1. Restart the Firm Record. 2. Felix opens the console System page.
- **Expected:** The Firm Record does not start, and the console names the empty setting and how to fix it. No letter is taken in silently.
- **Proof:** os `lib/record/settings.mjs:84` refuses an empty list; by hand on L for the console message.
