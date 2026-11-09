# MyEPO card mockups

HTML mockups of the **MyEPO** card on Settings → Connectors, from the approved [MyEPO API study](https://github.com/flowleap-ai/flowleap-harness/pull/363) (`flowleap/docs/2026-11-09-myepo-api-study.md`). The firm links its own MyEPO API account (B2B client credentials); FlowLeap then reads the firm's EP applications, Mailbox letters, EPO due dates and pending fees. The pages follow the [FlowLeap design language](../../../../.agents/skills/flowleap-design-language/SKILL.md). The founder approved them on 2026-11-09 at commit bad4a1b5a7 ("I approve myepo html mockup"), with the three proposals below.

## Pages

There is one page with an English file and a German file: [myepo.html](myepo.html) and [myepo.de.html](myepo.de.html). Open it with `?theme=light` or `?theme=dark`, and with `?state=<name>` for a state of the card.

| State | What the card shows |
|---|---|
| (none) | **Not linked.** One line on the account, the four sources as chips, the two short notes (read only; a downloaded letter shows as read in MyEPO), the two collapsed rows **What FlowLeap reads** and **Set up the account at the EPO**, the two empty fields, and **Save and test** disabled |
| `setup` | **Not linked**, with both rows open, as one click on each row shows them: the details of the four sources, and the 3 setup steps with the rights table of the B2B account |
| `entering` | Both fields filled, **Save and test** enabled |
| `testing` | The test steps: the token, then the portfolios, then the Mailbox access |
| `passed` | **Linked.** "6 portfolios that the account may read" as the key fact, the portfolios with type and access, the three checks, and the read-flag note |
| `empty` | **Waits for portfolio permission.** The credentials work and the Mailbox answers, but the account may read no portfolio: the notice names step 3 of the setup. **Test again** `R` |
| `refused` | **Test failed.** The EPO refused the client ID or the client secret; the fields are empty for a new entry |
| `offline` | **Test failed.** The EPO did not answer; the stored credentials did not change. **Try again** `R` |
| `linked` | The card on a later visit: the status with **Test** and the menu (Replace credentials, Unlink), one summary line (portfolios, Mailbox access, last test), and the collapsed setup row |

The two rows are collapsed in every state. The firm sees the setup once, and its administrator usually does it before anybody opens this card; the `empty` notice names the one step that is missing. Each state has at most one primary button. **Save and test** has no key; **Test again** and **Try again** have `R` (the `retry` act of the [key map](../../../../.agents/skills/flowleap-design-language/keys.md)).

## Proposals for the founder

- **The section name.** The navigation cuts "Patent data connectors" with an ellipsis today. The mockup renames the section to **Connectors** (German **Anbindungen**), which is also the founder's name for the page. The section has two groups: **Your firm's EPO account** (MyEPO) and **Patent data** (EPO OPS, USPTO ODP, Semantic Scholar, Mistral, as the client draws them today).
- **Save and test.** One act stores the two fields and runs the test, so that a firm sees at once whether the account works.
- **A short card.** The founder asked on 2026-11-09 for a shorter card: the setup steps and the details of the sources open with one click, and the linked card is one header and one line.
- **Linked or not.** The card says **Linked** only after a test passed. After a failed test, FlowLeap reads nothing with the credentials.

## Decisions in the mockup

- **The link state is not an atlas state.** The card uses the status shapes and colours of the design language with its own words (Not linked, Testing, Linked, Waits for portfolio permission, Test failed, Off). It uses the classes `.cst` and `.cstatus`, so `check-mockups.mjs` does not look for these words in the status map.
- **MyEPO names stay in English.** The menu names of MyEPO (`Admin area › Group members`, `Applications and patents`), the names of the rights and the portfolio names are as MyEPO writes them and carry `data-verbatim`. The German MyEPO labels were not checked.
- **The Settings dialog.** The dialog repeats the client's `SettingsRoot` (800 px panel, 188 px navigation), with its paddings rounded to the spacing scale. A long navigation label wraps with hyphens instead of an ellipsis (R17). The client cuts it today, for example the German "Agentenvoreinstellungen"; that client fix is not part of this card.

## Data

- **Portfolios.** The six portfolios of the EPO sandbox (`GET /portfolios`, read on 2026-11-09 after the reset), with `type` and `hasFullAccess`. `hasFullAccess: false` shows as **Limited**.
- **Rights.** The least-rights table of the study: Mailbox access yes; fee payment, admin, signing and sending rights no.
- **Examples.** The test time (9 Nov 2026, 14:02) and the two failures are examples, not a recorded failure.

## Build and check

The pages are generated. Edit `build.mjs`, then run `node build.mjs` in this folder. `myepo.css` adds the dialog and the card to the reference `records.css` of the skill. `frame.js` draws the app sidebar, the Settings navigation, the icons and the status shapes.

From the skill folder `.agents/skills/flowleap-design-language`:

```sh
node scripts/check-css.mjs ../../../flowleap/docs/mockups/myepo --pairs
node scripts/check-copy.mjs ../../../flowleap/docs/mockups/myepo
node scripts/check-mockups.mjs ../../../flowleap/docs/mockups/myepo --shoot <dir>
```
