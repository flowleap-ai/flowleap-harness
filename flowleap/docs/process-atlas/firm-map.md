# The firm map: all work of a patent firm, and where its facts live

**Status:** draft for the founder's approval, 2026-11-08. This page is the map before the sheets. It lists every kind of work that a patent firm does, who acts in it, how its facts reach the firm and where they live today. It does not hold a state machine; each procedure gets its own sheet, by the [method](README.md#the-method-for-every-phase). It serves [the problem and the product principles](../2026-11-08-problem-and-principles.md) and chooses the first procedure of step M1 in [the re-ordered roadmap](../2026-11-08-roadmap-reorder.md).

**Labels.** SOURCED means we read the source and it says this. INFERRED means we concluded it, and the line says from what. Volume shares and the "today" columns are INFERRED until a firm confirms them.

## Contents

- [The actors](#the-actors)
- [The objects](#the-objects)
- [The procedures](#the-procedures)
- [How facts reach the firm](#how-facts-reach-the-firm)
- [Where the facts live today](#where-the-facts-live-today)
- [The first procedure for M1](#the-first-procedure-for-m1)
- [Open questions](#open-questions)

## The actors

| Actor | Inside or outside | Role |
|---|---|---|
| Patent attorney | firm | Advice, drafting, office replies, oppositions, litigation; signs and decides |
| Trainee (Patentanwaltskandidat) | firm | First drafts and searches; an attorney checks every result |
| Lawyer (Rechtsanwalt) | firm, in mixed firms | Trademarks, designs, competition law, litigation |
| Paralegal (PAFA) | firm | Incoming mail, the docket, filings, fees, renewals, outgoing control |
| Accounts | firm | Invoices, associate invoices, payments |
| Client group | outside | One or more legal entities with their IP contacts; instructs and pays |
| Inventor | outside | Gives the invention and checks the draft |
| Foreign associate | outside | Files and prosecutes abroad for the firm, or sends inbound work to it |
| Office | outside | EPO, DPMA, WIPO, EUIPO, national offices: searches, examines, grants, registers |
| Court | outside | UPC divisions, national courts: registry, judges, orders and decisions |
| Third party | outside | Competitors and their representatives: oppositions, warning letters, actions |

## The objects

The UPC case view and the statement-of-claim form show the same objects from the court's side: one case with many patents, parties in roles, an event log and documents with a confidentiality code [INFERRED from the founder's work on the UPC CMS].

| Object | What it is | Why the memory needs it |
|---|---|---|
| Client group | The legal entities and contacts of one client, with their standing instructions | The rules for every matter of the client: where to file, renewal policy, cost limits, reporting, AI wishes |
| Party | A person or legal entity in a role on a matter | The instructing client, the applicant or owner, the invoice address, the inventor and the associate are often different |
| Family | All matters of one invention, linked by priority, continuation or division | The portfolio is managed by family; an argument in one country matters in the others |
| Matter | One right, one proceeding or one advice job, with the firm's own file number | The unit of work, of the docket and of billing |
| Procedure | The rules that a matter type follows: EP grant, DE grant, PCT, opposition, UPC action, trademark | It decides the states, the events, the deadlines and the next steps |
| Event | A fact with a date: a letter, a filing, a servicing, a hearing, a decision, an instruction | The history of the matter; deadlines come from events |
| Document | A file with its type, its date and its confidentiality | The evidence for every statement; a court can mark one document confidential or restricted to named persons |
| Person and team | The firm's people on a matter, with a default team per client | Who acts, who confirms, who is notified |
| Wall | Who may see which client and which document | Conflicts between clients, and confidential documents |

## The procedures

| Procedure | Office or court | Starts | Ends | Firm actors | Volume | How facts arrive | Sheet |
|---|---|---|---|---|---|---|---|
| Invention to filing decision | none (client and firm) | A client sends an invention or an IDF | Filed, kept secret, or dropped | attorney, client, inventor | medium | client mail, meetings | new |
| Drafting and first filing | EPO, DPMA, WIPO | The client instructs to file | Filing receipt | attorney, trainee, PAFA | medium | the firm files; receipt by portal or mail | new |
| EP grant procedure | EPO | EP filing or PCT regional entry | Grant, refusal, or withdrawal | attorney, PAFA | high | MyEPO Mailbox (API) | [10](10-ep-grant-procedure.md); [00](00-connected-flow.md) to [05](05-firm-internal-message.md) cover one letter path |
| DE patent and utility model | DPMA | DE filing | Grant, registration, refusal, or lapse | attorney, PAFA | high in German firms | paper or PDF letters; no API found | new |
| PCT international phase | WIPO, ISA | PCT filing | National and regional entry at 30 or 31 months | attorney, PAFA | medium | ePCT and mail | new |
| Foreign filings through associates | foreign offices | The client instructs a country | Grant or lapse abroad | attorney, PAFA, associate | medium | associate mail | new |
| Validation and unitary effect | EPO, national offices | Mention of grant | Validated or unitary patent | PAFA | medium | EPO and national offices, providers | new |
| Renewals | EPO, national offices, providers | Each year of the right | Paid or dropped | PAFA, client | high in task count | provider lists, office mail | new |
| EPO opposition and appeal | EPO | Notice of opposition, or a decision under appeal | Decision, or the appeal ends | attorney | medium | MyEPO Mailbox | new |
| UPC opt-out | UPC | The client decides for a granted EP patent | Opt-out registered or withdrawn | attorney, PAFA | low to medium | the UPC API for opt-outs (OAuth) [INFERRED from the founder] | new |
| UPC actions | UPC | Statement of claim, protective letter, or application | Decision, settlement, or appeal | attorney, lawyer | low count, high value | the CMS portal; email notices without documents [INFERRED from the founder] | new |
| National litigation | national courts | Action filed or received | Judgment or settlement | lawyer, attorney | low count, high value | court mail | new |
| Trademarks and designs | DPMA, EUIPO, WIPO | Filing or a conflict | Registration, refusal, or the end of the conflict | lawyer, PAFA | high in mixed firms | office portals and mail | new |
| Warning letters and disputes | none at first | A client forwards a third-party letter | Answer, settlement, or action | lawyer, attorney | low to medium | client mail | new |
| Advice (FTO, validity, due diligence) | none | A client asks | Opinion delivered | attorney, trainee | medium | the firm's own research, registers | new |
| Contracts and employee inventions | none | A contract or an invention report | Its dates pass or it ends | attorney, lawyer | low | client mail | new |
| Money | none | Time is recorded, an invoice arrives | Paid | accounts, attorney | high in task count | internal, associate invoices by mail | new |

The volume column is INFERRED for a German firm of the target size. The register shows the scale difference between the two firm types that we spoke to: a small firm has some tens of EP applications with its address as representative, and a large firm has over a thousand EP publications a year [SOURCED: EP Register through the FlowLeap patent-data tools, read 2026-11-08].

## How facts reach the firm

| Route | Example | What FlowLeap can do |
|---|---|---|
| Office API | The MyEPO API gives Mailbox communications with the application number, the user reference, the document code and the dispatch date; from 1 April 2027 the EPO notifies through the MyEPO Mailbox, and on paper only in exceptions [SOURCED in [sheet 00](00-connected-flow.md), facts 0.1 and 0.2] | Pull the letter, match it by its keys, record the event |
| Portal with an email notice | A UPC case activity: the email names the case and the first parties and links to the CMS; the documents stay in the portal [INFERRED from the founder] | Read the notice in Outlook, open a task on the right matter; a person drops the downloaded documents on the matter |
| Paper or PDF by mail | DPMA letters, associates, clients | Read the scan or the mail, match it, record the event |
| The firm's own act | A filing, a reply, a payment | Record it as the firm acts, with the receipt |
| Register data | EP Register events, publications, legal status; PATSTAT for history | Build the matter timeline; check that the expected letter came |
| People | A call, a meeting, an instruction | Record it as a fact with its source mail or note |

## Where the facts live today

| Fact | Docket | Outlook | File server or DMS | Office portals | People's heads |
|---|---|---|---|---|---|
| Matter data and dates | yes | | | yes | |
| Office letters | a reference | sometimes | yes | yes | |
| Claims, replies, opinions | | sometimes | yes | yes | |
| Client instructions and wishes | rarely | yes | sometimes | | yes |
| Why the firm argued something | | sometimes | in the replies | | yes |
| Family links and foreign status | partly | associate mail | yes | yes | |
| Court case state and documents | a reference | the notice | after download | yes | |

All cells are INFERRED from the firm model of 2026-11-08 and the founder's office and court work. No firm has yet shown its working day; the pilot must confirm them.

## The first procedure for M1

The criteria: the volume for both firm types, a route that FlowLeap can read without a person, the value of a full matter memory, and what the record already has.

| Candidate | Volume | Route | Memory value | Base in the record |
|---|---|---|---|---|
| **EP grant procedure** | high in both firm types | MyEPO API, the EP Register, the publications | high: claims, objections, replies and instructions over years | the R1 letter path, the deadline engine, the seed firm |
| DE patent and utility model | high in German firms | paper or PDF; no API found | high | none yet |
| Trademarks and designs | high in mixed firms | portals and mail | medium | none |
| UPC actions | low count | portal and notice | very high per case | none |

Proposal: start M1 with the **EP grant procedure**, with its mail in Outlook, and add the DE procedure next. The first test: open one real EP matter and see its whole story (its family, its register events, its letters and replies, the client's instructions) with a source for every fact.

## Open questions

1. Which share of a German firm's work is EP, DE, PCT, trademarks, renewals and litigation? Only a firm can say.
2. Which DMS and docket do the target firms use, and can they export a matter's documents?
3. What do the UPC confidentiality codes C, P and M stand for, beside HC (highly confidential) and R (restricted)?
4. Do German patent attorneys receive court mail through an electronic mailbox, and which one?
5. Does DPMA offer any electronic route for incoming letters that a firm system can read?
