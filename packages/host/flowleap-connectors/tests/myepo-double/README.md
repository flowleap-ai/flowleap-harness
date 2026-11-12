# MyEPO double

The MyEPO double is a local server that answers the MyEPO API calls of the `flowleapMyEpo` connector, in the wire format of the recorded EPO sandbox answers. It lets a firm and the builders see the connector work on real patent data before a firm gives production credentials.

**The data is public sample data. It is not a live MyEPO account.** The marker `(public sample data, not a live MyEPO account)` is in every portfolio name (and so in each application row's `portfolioName`), in every letter's `recipientName`, in the start lines of the server and in `GET /_double/state`. The applications, the bibliographic data and the letters are real public EP files of the seed firm. The due dates and the pending fees are FlowLeap's own: no public source gives them for an application. Each term due date comes from `flowleap-deadlines`, the engine of the Firm Record; the renewal fee due dates come from the double's own Rule 51(1) arithmetic. Thus none of them is an independent check of the FlowLeap deadline engine, and a match between the two proves nothing.

## Start it

```bash
node --import tsx/esm packages/host/flowleap-connectors/tests/myepo-double/bin.ts --port 8290
```

Run the command from the repository root. The server listens on 127.0.0.1 only and prints three lines: the data marker, the endpoints with the test client, and the control surface.

| Surface | Path |
|---|---|
| Login service (`client_credentials`, scope `mailboxapi`) | `POST /token`, HTTP Basic or form fields |
| MyEPO API, read operations | `/latest/...` |
| Control surface, not a MyEPO path | `GET /_double/state`, `POST /_double/reset`, `POST /_double/arrive`, `POST /_double/arrive-text/<seed row>` |

The test client is `flowleap-myepo-double` with the secret `public-sample-data`. These values are public, because the double serves only public data. A wrong secret gets the recorded `401 invalid_client`.

To point `flowleap-web` at the double, add the overlay [`flowleap/myepo-double.patch.yml`](../../../../../flowleap/myepo-double.patch.yml). It reads `FLOWLEAP_MYEPO_DOUBLE_URL` (default `http://127.0.0.1:8290`). Then link the double on Settings → Connectors → MyEPO with the test client. `flowleap/dev-loop.sh up --myepo-double` does both steps except the link ([dev loop](../../../../../flowleap/docs/dev-loop.md)), and the verify feature [`myepo.md`](../../../../../.agents/skills/verify/features/myepo.md) drives it in the browser.

## What it does

- It issues a token for the test client and accepts only the last token that it issued. No token expires. A second token call therefore makes the first token invalid; the connector then gets a `401` and fetches a new token once.
- It answers each read of `ctx.flowleapMyEpo`: portfolios, applications (filters `portfolioId`, `applicationNumber`, `applicantFileReference`, `procedure`; `page` and `size`), bibliographic data, communications (filter `folderId`), unhandled communications, folders, the download of a letter, due dates, terms and pending fees.
- A download answers a ZIP with one PDF, and sets `read` to `true` for that letter only. The letter stays unhandled.
- An application outside the readable portfolios answers `403 ERR_20`. A `portfolioId` that the account cannot read answers `403 ERR_20`. An unknown application answers `400 ERR_30`. The bodies are the recorded ones.
- The four write operations (`POST /communications/handle`, `POST /communications/handle/{id}`, `POST /communications/move/{folderId}`, `PATCH /{procedure}/applications/{application}`) answer `501` with the code `DOUBLE_READ_ONLY`. The connector has no write, and the double does not pretend to have one.
- The Mailbox state lasts for one run. `POST /_double/arrive` adds the waiting letter (the Rule 71(3) communication of `EP23771920`, file SF-2023-0045) unread and unhandled. The due date and the fee that this letter states show only after it arrives. `POST /_double/reset` restores every `read` flag and removes the arrival. `POST /_double/arrive-text/<seed row>` adds the text version of a Form 2001 letter (rows 4, 6, 8 and 16) unread and unhandled, under its own communication id: a test fixture that FlowLeap made from the scan by OCR, with a text layer, marked as such in its file name and metadata, and not a Mailbox file (the seed's `text-fixtures/` and its README). The letters of rows 6 and 16 hold their reasons (EPO Form 2906) after the letter. By default the double delivers only the scans; a reset removes the text versions.
- A `page` or `size` that is not a whole number (`page` from 0, `size` from 1) answers `400` with the code `DOUBLE_BAD_PAGE`.

The same handler serves the in-test fake of the specs ([`../myepo-fake.ts`](../myepo-fake.ts)) with the recorded sandbox data ([`sandbox-data.ts`](sandbox-data.ts)). [`../myepo-double.spec.ts`](../myepo-double.spec.ts) checks that the double answers the twelve recorded sandbox reads with the recorded status, content type and body, and that every answer on the seed data parses with the connector's parsers. [`../myepo-double.e2e.ts`](../myepo-double.e2e.ts) boots the headless profile with the shipped overlay, links `flowleapMyEpo` to the double, and runs its ten reads.

## Rules for a screen on the double

A FlowLeap screen that shows MyEPO data from the double must show the marker beside the data. The marker travels in the fields that the connector already parses: `portfolioName` on each application row and `recipientName` on each letter, because both name the account and the double's account is the fictional seed firm. The bibliographic data carries no marker: each of its fields is published register data, and a marker there would falsify it. A screen that shows bibliographic data from MyEPO alone must therefore take the marker from the portfolio of the application. `GET /_double/state` names the data too.

## The data

The data comes from the `flowleap-seed-firm` package, pinned by commit in `package.json`. [`seed-data.ts`](seed-data.ts) builds the wire form from the package files on each start.

### Applications

| Application | Check digit source | File reference | Portfolio |
|---|---|---|---|
| EP20706232 | `20 706 232.4` on the letters | SF-2020-0031 | PHOENIX CONTACT GmbH & Co. KG |
| EP21755382 | `21 755 382.5` | SF-2021-0011 | Wago Verwaltungsgesellschaft mbH |
| EP21810318 | `21 810 318.2` | SF-2026-0019 | PHOENIX CONTACT GmbH & Co. KG |
| EP22213933 | `22 213 933.9` | SF-2022-0024 | Wago Verwaltungsgesellschaft mbH |
| EP23755468 | `23 755 468.8` | SF-2023-0042 | Renishaw plc |
| EP23771920 | `23 771 920.8` | SF-2023-0045 | Renishaw plc |
| EP24166597 | `24 166 597.5` | SF-2024-0007 | Wago Verwaltungsgesellschaft mbH |

There is one portfolio for each seed client, of the type `representative`, with full access. The file references are the seed firm's fictional file numbers. The filing date, the title, the applicants, the representatives and the first publication come from the seed's `get_register_biblio` snapshot. The inventors, the priorities and the IPC and CPC classes come from its `get_bibliography` snapshot. A priority is an entry of that list with a date before the filing date. `EP14724725`, the parent of `EP22213933`, is a real application outside the portfolios: its reads answer `403 ERR_20`.

### Letters

Each letter is a register PDF of the seed, byte for byte. The dispatch date is the register's list date. The document code and the title come from the EPO [document code list](https://api.apps.epo.org/dev-portal/document-codes), in the language of the letter. `userReference` is the seed firm's file number of the application, the same value as its `applicantFileReference`. This is FlowLeap's choice for the double, so that the intake can file a letter by this field; what a production account shows in the two fields is not known (the sandbox has `Applicant reference 1` and `EP102844`). The PDF still prints the real representative's reference (for example `1206/EPw/0` on row 18). `recipientName` is `Seed firm (public sample data, not a live MyEPO account)` on every letter: the recipient is the account holder.

| Application | Row | Letter | Code | Dispatch | State at the start |
|---|---|---|---|---|---|
| EP24166597 | 20 | European search report | 1503 | 2024-09-11 | read, handled |
| EP24166597 | 21 | Rule 69 reminder: designation and examination fee | 1081 | 2024-10-14 | read, handled |
| EP20706232 | 8 | Article 94(3) communication | 2001A | 2024-02-21 | read, handled |
| EP22213933 | 4 | Article 94(3) communication | 2001A | 2024-09-11 | read, handled |
| EP21755382 | 1, 2 | Rule 71(3) communications | 2004C | 2025-06-20, 2025-08-29 | read, handled |
| EP20706232 | 9, 10 | Rule 71(3) communications | 2004C | 2025-07-30, 2025-08-29 | read, handled |
| EP21810318 | 13 | Rule 71(3) communication | 2004C | 2025-07-28 | read, handled |
| EP21755382 | 3 | Decision to grant | 2006A | 2025-10-23 | read, handled |
| EP21810318 | 14 | Decision to grant | 2006A | 2025-12-04 | read, handled |
| EP20706232 | 11 | Application deemed to be withdrawn | 2015C | 2026-01-21 | read, handled |
| EP22213933 | 5 | Rule 71(3) communication | 2004C | 2026-04-01 | read, handled |
| EP23755468 | 16 | Article 94(3) communication | 2001A | 2026-06-09 | unread, unhandled |
| EP24166597 | 6 | Article 94(3) communication | 2001A | 2026-09-18 | unread, unhandled |
| EP21810318 | 15 | Notice of opposition, Rule 79(1) | 2317A | 2026-10-14 | unread, unhandled |
| EP23771920 | 18 | Rule 71(3) communication | 2004C | 2026-09-29 | waits for `arrive` |

A letter dispatched before 2026-06-01 is read and handled at the start; this rule is FlowLeap's. The annexes (rows 7 and 17, Form 2906) and the text intended for grant (row 19) are not letters of their own, and the ZIP holds the main letter only. The folders `Inbox` and `Done` are FlowLeap's names.

### Due dates and pending fees

These values are FlowLeap's. `derivedValues` in [`seed-data.ts`](seed-data.ts) computes them on each start and gives each one its source. They are the values on or after the seed clock `fetch` (2026-11-05).

| Application | Value | Source |
|---|---|---|
| EP23771920 | `DUE_TERM_21` 2027-01-29 | row 18 (Rule 71(3), 2026-09-29), computed by `ep.r71-3.grant-communication` v1 of `flowleap-deadlines`, with the EPO 2027 calendar (OJ EPO 2026, A30) |
| EP23771920 | fee `007` EUR 1135, 2027-01-29 | row 18 states the code and the amount; due at the end of the same period |
| EP23771920 | fee `035` EUR 1050, 2027-09-30 | renewal fee, 5th year |
| EP24166597 | fee `034` EUR 885, 2027-03-31 | renewal fee, 4th year |
| EP23755468 | fee `035` EUR 1050, 2027-08-31 | renewal fee, 5th year |
| EP22213933 | fee `044` EUR 1865, 2027-05-31 | renewal fee, 14th year |

- A due date comes only from a rule of `flowleap-deadlines` (pinned at the commit that the Firm Record uses). The library has a rule only for Rule 71(3) EPC. Thus the open Article 94(3) communications (rows 6 and 16) and the Rule 79(1) communication (row 15) have no due date in the double, although each letter states four months.
- Each fee code and amount is as the [EPO Schedule of Fees](https://fees.apps.epo.org/prod/ui/) lists it on 2026-11-10: 007 EUR 1.135,00; 034 EUR 885,00; 035 EUR 1.050,00; 044 EUR 1.865,00.
- A renewal fee is due on the last day of the month of the filing anniversary (Art. 86(1), Rule 51(1) EPC). The double computes this day itself; `flowleap-deadlines` has no renewal rule. Whether Rule 134(1) EPC moves this day when the EPO is closed is not settled here (the Guidelines, A-X, 5.2.4, apply Rule 134 to the period of the additional fee and do not say). The four dates above are open days in the EPO 2026 and 2027 calendars of `flowleap-deadlines`, and the double refuses to start when a renewal due date is a closed day.
- The `actor` value `applicant` is FlowLeap's word: the sandbox shows only placeholders. `currency` is `null`, as in the sandbox.

## Where the spec and the sandbox differ

The double copies the sandbox where the two differ.

| Point | OpenAPI spec 1.0.0 | Sandbox, copied |
|---|---|---|
| Download | `200 application/json` | a ZIP (`application/octet-stream`) with one PDF |
| Content type | `application/hal+json` | `application/json`; the Mailbox lists (`/communications`, `/communications/unhandled`, `/communications/folders`) `application/json;charset=utf-8` |
| Application outside the portfolios | no `403` | `403 ERR_20` |
| Unknown application, bibliographic data | no `400` | `400 ERR_30` "Invalid procedure" |
| Default sort of `GET /applications` | `procedure,asc` | the order of the data |
| Number field in bibliographic data and due dates | | `applicationNumberMyEPO`, number without `EP`; the list uses `applicationNumberMyEpo` with `EP` |

Where the double differs from the sandbox, or the sandbox gave no answer to copy:

| Point | Sandbox | Double |
|---|---|---|
| `digitalFile` of a letter | a `my-i.epo.org` URL on each letter with an application | `null`: a link into MyEPO would point at an account that does not exist |
| Tokens | not recorded | only the last issued token is valid, and no token expires |
| Download of an unknown letter | not recorded | `400` with `DOUBLE_UNKNOWN_COMMUNICATION` |
| Bad `page` or `size` | not recorded | `400` with `DOUBLE_BAD_PAGE` |

## Open questions for production data

- What a production account shows in `applicantFileReference` and in a letter's `userReference`, and whether the two are the same value.
- What the `actor` of a due date says, and which document codes and titles the Mailbox gives the letters of a real firm.

## Known limitations

- The double has no letter without an application. The sandbox has one (`52301_CONF`), and the specs keep that case with the recorded sandbox data set; no public source gives such a letter.
- Due dates exist only where `flowleap-deadlines` has a rule (Rule 71(3) EPC). The Article 94(3) and Rule 79(1) letters have none.
- The bibliographic data has the English register title only, and no applicant address. The seed has no unitary patent, so there is no `UPP` row.
- The download file name for an EP letter (`<file number>-<date>-EP<number>-<code>.pdf`) follows the one sandbox name, which was for a PCT letter.
- The double does not serve the fee schedule calls (`GET /fees...`), which the connector does not use.
