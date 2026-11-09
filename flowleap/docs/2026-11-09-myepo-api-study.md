# The MyEPO API and a MyEPO plugin

**Status:** study and plugin proposal for the founder's approval, 2026-11-09. Sources: the EPO page [Exchange data with us using an API](https://www.epo.org/en/applying/myepo-services/understand/api), the [MyEPO feature guide on APIs](https://link.epo.org/web/understand-our-services/exchange-data-with-us-using-an-api/en-myepo-feature-guide-apis-for-exchanging-information-with-ip-management-systems.pdf) (March 2025), and the OpenAPI spec of the production API on the [MyEPO Developer Portal](https://api.apps.epo.org/dev-portal/) (`https://api.apps.epo.org/documentation/api-docs/latest`, "Machine to Machine Service API" 1.0.0), all read on 2026-11-09.

## Contents

- [What the MyEPO API is](#what-the-myepo-api-is)
- [The operations](#the-operations)
- [How a firm gets access](#how-a-firm-gets-access)
- [What the sources do not say](#what-the-sources-do-not-say)
- [What it changes for FlowLeap](#what-it-changes-for-flowleap)
- [Add client with MyEPO](#add-client-with-myepo)
- [The MyEPO plugin](#the-myepo-plugin)
- [Safety rules](#safety-rules)
- [Next steps](#next-steps)
- [Decisions for the founder](#decisions-for-the-founder)

## What the MyEPO API is

The EPO gives two business-to-business APIs that follow WIPO Standard ST.90:

- **The MyEPO API**: the firm's MyEPO Mailbox and information about the firm's applications.
- **The Online Filing 2.0 API**: import, export, submit, get the status of and delete EP forms in Online Filing 2.0. PCT forms are not covered yet.

This study covers the MyEPO API. Online Filing 2.0 is out of scope, because FlowLeap does not file.

## The operations

All paths are under `https://api.apps.epo.org/latest`. `{procedure}` is `EPC` or `UPP` (unitary patent).

| Area | Operations | Fields that FlowLeap needs |
|---|---|---|
| Mailbox | `GET /communications`, `GET /communications/unhandled`, `GET /communications/folders`, `GET /communications/download/{id}` | For each communication: `id`, `applicationNumber` (EP `EPYYNNNNNN.N` or `PCT/CCYYYY/NNNNNN`), `userReference` (the firm's reference), `applicantName`, `documentCode`, `title`, `dispatchDate`, `read`, `handled`, `folderId`, `document` (download link) |
| Mailbox writes | `POST /communications/handle`, `POST /communications/handle/{id}`, `POST /communications/move/{folderId}` | Mark as handled; move into a folder. An unread communication cannot be handled |
| Applications | `GET /portfolios`, `GET /applications` (filters: `portfolioId`, `applicationNumber`, `applicantFileReference`, `procedure`; pages), `GET /biblio-data/{procedure}/applications/{application}` | For each application: `applicantFileReference` (the firm's file number), `portfolioId`, `portfolioName`, `procedure`, bibliographic data |
| Time limits and fees | `GET /{procedure}/applications/{application}/dueDates`, `GET /terms`, `GET /{procedure}/applications/{application}/fees`, `GET /fees`, `GET /fees/feegroups`, `GET /fees/{feeCode}/history/{currency}` | For each due date: `termKey`, `dueDate`, `actor`; the term descriptions; the pending fees |
| Application write | `PATCH /{procedure}/applications/{application}` | Set the firm's file reference of an application |

The [document code list](https://api.apps.epo.org/dev-portal/document-codes) has about 5,600 codes in English, French and German, for example `1001` "Request for grant of a European patent". Known issue in the spec: the `sort` parameter of the Mailbox lists has no effect.

## How a firm gets access

1. The firm already uses MyEPO and has at least one company administrator.
2. The firm asks support@epo.org for production client credentials for its MyEPO company.
3. The EPO creates a B2B account for the company and sends an OAuth 2.0 client ID and client secret to the company administrator. The credentials work for all MyEPO APIs.
4. The administrator gives the B2B account Mailbox access rights, and permission on the portfolios whose applications the API may read. Without a portfolio permission, an application read answers `403 ERR_20`.
5. The software gets a bearer token from `https://login.epo.org/oauth2/aus6hh2ns9ORf2PD3417/v1/token` with `grant_type=client_credentials` and `scope=mailboxapi`. The sample token lives 18,000 s (5 hours).

A sandbox with dummy data exists. The spec says that it is available "to companies that have registered their interest and have requested access", through support@epo.org.

The guide warns that these credentials give access to confidential company information. They belong to the firm, and they must stay on the firm's installation.

## What the sources do not say

The sandbox must answer these before the build:

1. Whether `GET /applications` includes applications that are not published yet. For the firm's own docket, these are the most important rows.
2. Whether PCT applications appear in `GET /applications`, or only in the Mailbox.
3. The rate limits and quotas.
4. What `GET /communications/download/{id}` returns. The spec gives `application/json`, and the guide says "documents and data". We must see whether it has the PDF, structured data, or both.
5. Whether a download marks a communication as read, and how long the Mailbox keeps a communication.
6. The terms of use for a software vendor that builds a product on the API for its customers.

## What it changes for FlowLeap

| FlowLeap part | Today | With the MyEPO API |
|---|---|---|
| **Firm docket** (large-client sheet) | `re=` searches in the EP Register, in date slices, with a row check on the firm's computer | `GET /applications` for the firm's portfolios: exact, with the firm's file numbers, and possibly with unpublished applications. The `re=` read stays for a firm without MyEPO credentials |
| **Application index** (client model) | Rows from the docket | The same rows, with `applicantFileReference`. A row with a file number can open as a matter at once (founder decision 1 of Add client) |
| **Office letter intake** (atlas sheet 1) | Mail forwarded to the AI mailbox, OCR, the document kind and the matter proposed | EPO letters come from the Mailbox with their application number, the firm's reference and the document code. No OCR and no match guess for EPO letters. The forwarded-mail path stays for the DPMA, WIPO, foreign associates and clients |
| **Office event to deadline** (atlas sheet 2) | The document code is proposed from the read text | The EPO document code comes with the letter. The EPO due dates are an independent check of the deadline engine: a difference goes to a person. They never replace the engine |
| **Fees** | Not covered | The pending fees of each application, for the docket and the renewals later |

## Add client with MyEPO

The founder asked whether the MyEPO API could replace Add client. It replaces the first half for a firm that links MyEPO, and not the second half.

**What MyEPO replaces.** The firm docket and the search for the firm's matters. The firm links MyEPO once, and FlowLeap reads all its EP applications with their applicants and file numbers. FlowLeap then proposes the clients itself: it groups the applications by applicant name and shows "312 applicants in your EP docket". The person confirms each client and its names. This is the firm view of the client model: the firm does not type a company name for each client.

**What Add client still does:**

- **The client decision.** An applicant is not always the client. The instructing party can be a foreign associate, a parent company or a licensee. The client is the firm's decision (approved design).
- **The conflict check.** MyEPO shows only the firm's own applications. The other side, such as opponents and other companies, comes from the EP Register.
- **A company with no EP application at the firm:** a new client, a client with only DPMA or US work, a **Watch** company, or an **Other party**.
- **A firm without MyEPO credentials:** Add client with the EP Register docket, as in the large-client sheet.

So with MyEPO, the first run is **Import your EP docket**: FlowLeap reads the docket, proposes the clients, and the person confirms them in one list, with the conflict check for each. Add client stays for the cases in the list above.

## The MyEPO plugin

Yes: the firm links FlowLeap to the MyEPO API with its own B2B credentials, on its own installation. The plugin reuses what the connectors plugin has.

**Link.** Settings → Connectors gets a **MyEPO** card beside EPO OPS, USPTO ODP, Semantic Scholar and Mistral. The card takes the client ID and the client secret and stores them as a `flowleap-connectors/myepo` credential record (`ctx.credentials`), as the other connectors do. **Test** gets a token and reads `GET /portfolios`, then shows the portfolios that the B2B account may read and whether the Mailbox answers. When the list is empty, the card says that the company administrator must give the B2B account permission on the portfolios, and links the EPO guide.

**Service.** A Service Definition `flowleapMyEpo` in `flowleap-connectors`, for Host code only:

- reads: `portfolios()`, `applications(filter)`, `bibliographicData(application)`, `communications(folder?)`, `unhandledCommunications()`, `downloadCommunication(id)`, `dueDates(application)`, `terms()`, `pendingFees(application)`;
- writes: `markHandled(ids)`, `moveCommunications(ids, folder)`, `setFileReference(application, reference)`.

The token is fetched, kept in memory and renewed before it expires. The request rate comes from a `Config` field. The connector keeps the existing retry and deadline rules.

**Consumers.**

- Add client and the firm docket read `applications()` when MyEPO is linked, and the EP Register `re=` read when it is not.
- A Mailbox intake source in the intake plugin reads `unhandledCommunications()` on a schedule and files each letter on its matter by application number and reference.
- The deadline engine compares its deadline with `dueDates()` and shows a difference to a person.

**Model access.** The agent gets read tools for the matter that it works on, for example "the EPO due dates of this application" and "the EPO letters of this matter". It gets no write tool.

## Safety rules

- **Writes are a person's act.** `markHandled`, `moveCommunications` and `setFileReference` change the firm's MyEPO. They run only from a person's act on a FlowLeap page, never from an agent or a schedule. The default is that FlowLeap does not mark letters as handled in MyEPO; a firm rule can turn it on.
- **The OAuth scope `mailboxapi` covers reads and writes.** The spec shows no read-only scope, so the plugin itself must enforce that only a person's act can write.
- **The credentials never reach a model, a log or a session event.** They stay in the credential record.
- **A letter from the Mailbox is still a document of intake.** It is stored with its source (MyEPO, communication id, dispatch date) and goes through the same filing states as a forwarded letter.

## Next steps

1. **The founder asks support@epo.org for sandbox credentials** for FlowLeap as a software vendor that builds an IP management system on the MyEPO API, and asks about the vendor terms (open point 6).
2. With the sandbox: answer the open points 1 to 5, record real responses as test fixtures, and set the rate limit.
3. Then a mockup of the MyEPO card and of the Mailbox intake for approval (the Linear bar), and the build: the connector and the link card first, the docket source second, the Mailbox intake third.
4. A pilot firm links its production credentials only after the sandbox proof and its own consent.

Until the sandbox answers, the build can start on the link card and the Service against fixtures made from the OpenAPI spec, but it must not claim behavior that only the sandbox can prove.

## Decisions for the founder

1. **Build a MyEPO connector that the firm links with its own credentials**, as above. Recommended: yes.
2. **The EPO due dates are a check, not a source.** The deadline engine stays the source of a deadline; a difference goes to a person. Recommended: yes.
3. **FlowLeap writes to MyEPO only on a person's act, and does not mark letters as handled by default.** Recommended: yes.
4. **Order of the build:** link card and connector, then the firm docket from MyEPO with **Import your EP docket**, then the Mailbox intake. Recommended: yes, after the sandbox answers open point 1.
5. **Import your EP docket** is the first run for a firm with MyEPO, and Add client stays for the cases that MyEPO cannot cover. Recommended: yes.
