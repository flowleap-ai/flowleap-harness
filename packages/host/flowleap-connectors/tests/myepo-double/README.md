# MyEPO double

The MyEPO double is a local server that answers the MyEPO API calls of the `flowleapMyEpo` connector, in the wire format of the recorded EPO sandbox answers. It lets a firm and the builders see the connector work on real patent data before a firm gives production credentials.

**The data is public sample data. It is not a live MyEPO account.** Every portfolio name ends with `(public sample data, not a live MyEPO account)`, and the start lines of the server say the same. The applications, the bibliographic data and the letters are real public EP files of the seed firm. The due dates and the pending fees are FlowLeap's own: no public source gives them for an application. Thus they are not an independent check of the FlowLeap deadline engine, and a match between the two proves nothing.

## Start it

```bash
node --import tsx/esm packages/host/flowleap-connectors/tests/myepo-double/bin.ts --port 8290
```

Run the command from the repository root. The server listens on 127.0.0.1 only and prints three lines: the data marker, the endpoints with the test client, and the control surface.

| Surface | Path |
|---|---|
| Login service (`client_credentials`, scope `mailboxapi`) | `POST /token`, HTTP Basic or form fields |
| MyEPO API, read operations | `/latest/...` |
| Control surface, not a MyEPO path | `GET /_double/state`, `POST /_double/reset`, `POST /_double/arrive` |

The test client is `flowleap-myepo-double` with the secret `public-sample-data`. These values are public, because the double serves only public data. A wrong secret gets the recorded `401 invalid_client`.

To point `flowleap-web` at the double, add the overlay [`flowleap/myepo-double.patch.yml`](../../../../../flowleap/myepo-double.patch.yml). It reads `FLOWLEAP_MYEPO_DOUBLE_URL` (default `http://127.0.0.1:8290`). Then link the double on Settings → Connectors → MyEPO with the test client. `flowleap/dev-loop.sh up --myepo-double` does both steps except the link ([dev loop](../../../../../flowleap/docs/dev-loop.md)), and the verify feature [`myepo.md`](../../../../../.agents/skills/verify/features/myepo.md) drives it in the browser.

## What it does

- It issues a token for the test client and accepts only the last token that it issued.
- It answers each read of `ctx.flowleapMyEpo`: portfolios, applications (filters `portfolioId`, `applicationNumber`, `applicantFileReference`, `procedure`; `page` and `size`), bibliographic data, communications (filter `folderId`), unhandled communications, folders, the download of a letter, due dates, terms and pending fees.
- A download answers a ZIP with one PDF, and sets `read` to `true` for that letter only. The letter stays unhandled.
- An application outside the readable portfolios answers `403 ERR_20`. A `portfolioId` that the account cannot read answers `403 ERR_20`. An unknown application answers `400 ERR_30`. The bodies are the recorded ones.
- The four write operations (`POST /communications/handle`, `POST /communications/handle/{id}`, `POST /communications/move/{folderId}`, `PATCH /{procedure}/applications/{application}`) answer `501` with the code `DOUBLE_READ_ONLY`. The connector has no write, and the double does not pretend to have one.
- The Mailbox state lasts for one run. `POST /_double/arrive` adds the waiting letter (the Rule 71(3) communication of `EP23771920`, file SF-2023-0045) unread and unhandled. `POST /_double/reset` restores every `read` flag and removes the arrival.

The same handler serves the in-test fake of the specs ([`../myepo-fake.ts`](../myepo-fake.ts)) with the recorded sandbox data ([`sandbox-data.ts`](sandbox-data.ts)). [`../myepo-double.spec.ts`](../myepo-double.spec.ts) checks that the double answers the twelve recorded sandbox reads with the recorded status and body, and that every answer on the seed data parses with the connector's parsers. [`../myepo-double.e2e.ts`](../myepo-double.e2e.ts) boots the headless profile, links `flowleapMyEpo` to the double, and runs its ten reads.

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

Each letter is a register PDF of the seed, byte for byte. The dispatch date is the register's list date. The document code and the title come from the EPO [document code list](https://api.apps.epo.org/dev-portal/document-codes), in the language of the letter. `userReference` is the reference that the letter prints (the real representative's reference). `recipientName` is the first representative in the register, or the applicant when the register has no representative; this agrees with the addressee on rows 6, 15, 16 and 18.

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

These values are FlowLeap's. [`seed-data.ts`](seed-data.ts) (`DERIVED`) records the source of each value. They are the values on or after the seed clock `fetch` (2026-11-05).

| Application | Value | Source |
|---|---|---|
| EP23771920 | `DUE_TERM_21` 2027-01-29 | row 18 states four months |
| EP23771920 | fee `007` EUR 1135, 2027-01-29 | row 18 states the code and the amount |
| EP23771920 | fee `035` EUR 1050, 2027-09-30 | renewal fee rule, 5th year |
| EP24166597 | `DUE_TERM_11` 2027-01-18 | row 6 states four months |
| EP24166597 | fee `034` EUR 885, 2027-03-31 | renewal fee rule, 4th year |
| EP23755468 | fee `035` EUR 1050, 2027-08-31 | renewal fee rule, 5th year |
| EP22213933 | fee `044` EUR 1865, 2027-05-31 | renewal fee rule, 14th year |
| EP21810318 | `DUE_TERM_37` 2027-02-15 | row 15 states four months; Sunday 2027-02-14 moves to Monday |

A period ends on the dispatch date plus the period that the letter states. Only a weekend moves the end (Rule 134(1) EPC); the EPO closing days are not applied. A renewal fee is due on the last day of the month of the filing anniversary (Art. 86(1), Rule 51(1) EPC), with the amount of OJ EPO 2026, A2. The renewal fee codes (`030` plus the year) are assumed, not checked against an EPO fee code list. The `actor` values `applicant` and `proprietor` are FlowLeap's words: the sandbox shows only placeholders. `currency` is `null`, as in the sandbox.

## Where the spec and the sandbox differ

The double copies the sandbox where the two differ.

| Point | OpenAPI spec 1.0.0 | Sandbox, copied |
|---|---|---|
| Download | `200 application/json` | a ZIP (`application/octet-stream`) with one PDF |
| Content type | `application/hal+json` | `application/json`; folders `application/json;charset=utf-8` |
| Application outside the portfolios | no `403` | `403 ERR_20` |
| Unknown application, bibliographic data | no `400` | `400 ERR_30` "Invalid procedure" |
| Default sort of `GET /applications` | `procedure,asc` | the order of the data |
| Number field in bibliographic data and due dates | | `applicationNumberMyEPO`, number without `EP`; the list uses `applicationNumberMyEpo` with `EP` |

## Known limitations

- The seed has no letter without an application, which the sandbox has (`52301_CONF`). The handler serves such a letter in the sandbox data set; the seed data set has none until a public source is chosen.
- The bibliographic data has the English register title only, and no applicant address. The seed has no unitary patent, so there is no `UPP` row.
- The download file name for an EP letter (`<reference>-<date>-EP<number>-<code>.pdf`) follows the one sandbox name, which was for a PCT letter.
- The double does not serve the fee schedule calls (`GET /fees...`), which the connector does not use.
