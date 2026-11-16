# The seed firm: proposal

Status: approved by the founder on 2026-11-05 (decisions D1 to D7 of section 12). This is the design of [#294](https://github.com/flowleap-ai/flowleap-harness/issues/294), parts 1 and 2. Nothing in this document changes code or fixtures. The EP document tool of decision D2 is [#323](https://github.com/flowleap-ai/flowleap-harness/issues/323).

**Goal.** From now on, every test and every evidence run of FlowLeap Patent AI uses one shared seed firm. Its matters are real public EP files, copied exactly. Its people are fictional users of a fictional firm, with the ids, groups and walls that a real firm has. This document chooses the matters, defines the users, the walls and the sharing cases, and recommends where the one copy of the seed lives.

Labels, as in the [IPMS design](2026-11-03-ai-native-ipms-design.md):

- **[cited]**: a source states it. For a register fact the source is a FlowLeap MCP call of 2026-11-05, named by tool and input.
- **[inferred]**: our conclusion from cited facts. The fetch or a test must confirm it.
- **[proposal]**: our design proposal.

## Contents

1. [Summary](#1-summary)
2. [Sources and what we could fetch](#2-sources-and-what-we-could-fetch)
3. [The matters](#3-the-matters)
4. [Coverage of the R1 processes and the R2 rule set](#4-coverage-of-the-r1-processes-and-the-r2-rule-set)
5. [The users](#5-the-users)
6. [Groups and walls](#6-groups-and-walls)
7. [Actors of the seed record events](#7-actors-of-the-seed-record-events)
8. [The sharing cases](#8-the-sharing-cases)
9. [The seed clock](#9-the-seed-clock)
10. [Where the seed package lives](#10-where-the-seed-package-lives)
11. [The fetch script and its checks](#11-the-fetch-script-and-its-checks)
12. [Decisions of the founder](#12-decisions-of-the-founder)

## 1. Summary

- **Seven matters, three clients.** WAGO Verwaltungsgesellschaft mbH (three matters, German), PHOENIX CONTACT GmbH & Co. KG (two matters, German) and Renishaw plc (two matters, English). WAGO and Phoenix Contact make competing products, so a firm that acts for both needs walls between them [inferred].
- **The hard cases are real.** EP20706232 (Phoenix Contact) has a Rule 71(3) communication dated 29 August 2025. Its four-month period ends in the EPO closure of 24 December 2025 to 1 January 2026 and moves to 2 January 2026. The register shows the loss of rights effective on 3 January 2026, the day after the moved date [cited: `get_legal_status EP3935617A1`, 18D effectiveDate 2026-01-03]. EP22213933 (WAGO) has a Rule 71(3) communication of 1 April 2026 whose period ended on 3 August 2026, and no act is recorded up to the fetch: the overdue deadline at the seed date [cited: `get_legal_status EP4170443A1`; the end date is inferred].
- **Two of the six named cases need the public file.** The letter with two dates and the scan with no text layer are properties of a PDF. FlowLeap has no EP file-inspection tool, and the European Patent Register refuses scripted requests. Section 3 names the candidate documents in the download list of decision D2.
- **Eight fictional users** (partner, three attorneys, two PAFAs, one assistant, one IT administrator) with Entra object ids and the app roles `FlowLeap.Administrator` and `FlowLeap.User`. Three client groups, seven matter teams and one screen. Every matter has users outside its wall, and one attorney is screened from one matter of a client that the attorney otherwise sees.
- **The seed package lives in the public repository [`flowleap-ai/flowleap-seed-firm`](https://github.com/flowleap-ai/flowleap-seed-firm),** created on 2026-11-05 after the founder's approval. Each consumer pins it by commit, as flowleap-os pins `flowleap-deadlines` today (section 10).

## 2. Sources and what we could fetch

The founder's order is FlowLeap first, then the European Patent Register directly.

| Source | What it gave on 2026-11-05 | Label |
|---|---|---|
| FlowLeap MCP `search_register` | Application number, title, applicants, representatives, status, filing and publication dates, opponents | [cited] |
| FlowLeap MCP `get_legal_status` | INPADOC legal events with `effectiveDate` and gazette date, for example `GRAP`, `INTG`, `17Q`, `18D`, `GRAS`, `AK`, `26N` | [cited] |
| FlowLeap MCP `get_register_biblio`, `get_register_events`, `get_bibliography`, `patstat_query` | Register status changes; priority and PCT numbers; a PATSTAT 2026 Spring search on the `INTG` effective date found the closure case | [cited] |
| FlowLeap MCP `get_application_documents`, `read_application_document` | Nothing for EP. Both tools read the USPTO Image File Wrapper only | [cited: the tool descriptions] |
| FlowLeap CLI (`flowleap tools run ...`) | HTTP 402 `subscription_required` for the local CLI account | [cited: a run of 2026-11-05] |
| European Patent Register (`register.epo.org`) | HTTP 403 to a scripted request for the document list of EP24710381. We did not try to work around the refusal | [cited: a run of 2026-11-05] |

What the legal events mean, from the data:

- `GRAP` gazette date is the despatch date of the Rule 71(3) communication. `INTG` effectiveDate is the same date or one day later [cited: two candidate reports in the shared notes; EP20706232 has `GRAP` 2025-07-29 and `INTG` 2025-07-30 for its first communication]. The seed uses the date that the letter bears, so the fetch of the letter settles this.
- `17Q` effectiveDate is the despatch date of the first Article 94(3) communication [inferred: it equals the status change to "examination is in progress" for EP24166597].
- `18D` effectiveDate is the first day after the missed period [inferred: EP23181171 has `17Q` 2025-07-03 and `18D` 2025-11-04].
- No field gives the procedure language. The German files show the national event "LANGUAGE OF EP DOCUMENT: GERMAN" after grant, or a German abstract; the English files are [inferred] from the applicant and the representative.
- No FlowLeap tool gives a Rule 161 date or a further-processing event [cited: both candidate reports].

The candidate searches and their query logs are in the shared notes of this group of sessions (`2026-11-05-seed-candidates-de.md`, `2026-11-05-seed-candidates-en.md`). The fetch script of section 11 repeats every call and stores each response.

## 3. The matters

Names of applicants, representatives and opponents are exactly as `search_register` gave them on 2026-11-05. The firm file numbers are fictional, because the firm is fictional (decision D4).

| Id | Application (register) | Publication | Client | Title | Representative of record | Language | Status on 2026-11-05 |
|---|---|---|---|---|---|---|---|
| W1 | [EP21755382](https://register.epo.org/application?number=EP21755382&lng=en) | EP4189782 | Wago Verwaltungsgesellschaft mbH | CONDUCTOR CONNECTION TERMINAL | Günther, Constantin, et al (Meissner Bolte Patentanwälte, Rechtsanwälte Partnerschaft mbB, Hannover) | German [cited: national event IE "LANGUAGE OF EP DOCUMENT: GERMAN"] | No opposition filed within time limit |
| W2 | [EP22213933](https://register.epo.org/application?number=EP22213933&lng=en) | EP4170443 | Wago Verwaltungsgesellschaft mbH | CONTROL DEVICE AND METHOD FOR SWITCHING INPUT/OUTPUT UNITS OF A CONTROL DEVICE | Bardehle Pagenberg Partnerschaft mbB Patentanwälte Rechtsanwälte, München | German [cited: German abstract from `get_bibliography`] | Grant of patent is intended |
| W3 | [EP24166597](https://register.epo.org/application?number=EP24166597&lng=en) | EP4443656 | Wago Verwaltungsgesellschaft mbH | CONTACT ASSEMBLY FOR CONNECTING AN ELECTRICAL CONDUCTOR AND CONDUCTOR CONNECTION TERMINAL HAVING SUCH A CONTACT ASSEMBLY | Günther, Constantin (Meissner Bolte, Hannover) | German [inferred] | Examination is in progress |
| P1 | [EP20706232](https://register.epo.org/application?number=EP20706232&lng=en) | EP3935617 | PHOENIX CONTACT GmbH & Co. KG | LABELLING MATERIALS FOR MARKING ELECTRICAL INSTALLATIONS AND METHOD FOR PRODUCING A LABELLING STRIP | Richly & Ritschel Patentanwälte PartG mbB, Bergisch Gladbach | German [inferred] | The application is deemed to be withdrawn |
| P2 | [EP21810318](https://register.epo.org/application?number=EP21810318&lng=en) | EP4248526 | Phoenix Contact GmbH & Co. KG | TERMINAL FOR ELECTRICAL WIRE | none listed in the register data | German [cited: national event IE "LANGUAGE OF EP DOCUMENT: GERMAN"] | The patent has been granted; opponent HARTING Electric Stiftung & Co. KG, filed 2026-09-30, admissible |
| R1 | [EP23755468](https://register.epo.org/application?number=EP23755468&lng=en) | EP4569300 | Renishaw plc | SCALE | Dunn, Paul Edward (Renishaw plc, Patent Department) | English [inferred] | Examination is in progress |
| R2 | [EP23771920](https://register.epo.org/application?number=EP23771920&lng=en) | EP4584557 | Renishaw plc | APPARATUS AND METHOD FOR POSITION ENCODING | Dunn, Paul Edward, et al (Renishaw plc Patent Department) | English [inferred] | Grant of patent is intended |

The register spells the WAGO applicant "Wago Verwaltungsgesellschaft mbH" on all three files and the Phoenix Contact applicant in two ways ("PHOENIX CONTACT GmbH & Co. KG" on P1, "Phoenix Contact GmbH & Co. KG" on P2). The seed keeps each spelling as published. One client party per company holds both spellings as published names [proposal], so the party match of intake and the conflict check meet a real spelling difference.

### Why each matter is in the set, and its documents

The dates are from `get_legal_status` (effectiveDate, or the `GRAP` gazette date) [cited]. The due dates are our arithmetic with Rules 131 and 134(1) EPC and OJ EPO 2025 A40 [inferred]; the engine must compute the same dates. The documents are the EPO letters that these events show [inferred]. Their register document ids, page counts and SHA-256 hashes come from the fetch (decision D2).

**W1, EP21755382. A Rule 71(3) deadline in the closure that the applicant met, and a superseded first communication.**

- First Rule 71(3) communication, `GRAP` 2025-06-19. Examination resumed (`GRAJ`, gazette 2025-07-18), and the register deleted the first intention to grant (`INTC`). The deadline of the first letter becomes `superseded` (design section 5.5).
- Second Rule 71(3) communication (Form 2004C), dated 2025-08-29. Four months end on Monday 29 December 2025, inside the closure, so the period ends on Friday 2 January 2026.
- The grant fee is recorded (`GRAS`, gazette 2025-10-15), so the deadline is `met`. Mention of grant 2025-11-19 (`AK`, B1). The opposition period ended on 2026-08-19, and `26N` (no opposition) is effective 2026-08-20.
- Documents: both Rule 71(3) communications and the decision to grant. `GRAJ` covers both a disapproval by the applicant and a resumption by the EPO, so the download shows whether an EPO letter sits between the two communications [inferred].

**W2, EP22213933. A Rule 71(3) deadline that rolls over a weekend, and the overdue deadline at the seed date.**

- A divisional application (`AC`) of EP14724725, with the priority DE102013105097 of 2013-05-17 [cited: candidate report DE]. A different representative from W1 and W3 for the same client.
- Rule 71(3) communication (Form 2004C), dated 2026-04-01. Four months end on Saturday 1 August 2026, so the period ends on Monday 3 August 2026.
- No `GRAS`, `GRAA` or `18D` event up to the fetch [cited]. At the seed date the deadline is past and no act is recorded [inferred]. The public file shows whether the applicant filed amendments under Rule 71(6) EPC or let the period pass; the seed copies what it shows.
- Documents: the Rule 71(3) communication, and the first Article 94(3) communication of 2024-09-11 (`17Q`).
- W2 is a divisional, so its DE priority document is in the file of the parent EP14724725, not in this file [inferred]. W2 is not a candidate for the scan.

**W3, EP24166597. A German Article 94(3) communication, open at the seed date.**

- First Article 94(3) communication (EPO Form 2001), dated 2026-09-18 (`17Q`). The period is stated in the letter (Rule 132 EPC). If it is four months, it ends on Monday 18 January 2027 [inferred].
- A due date in 2027 needs the 2027 closing days (OJ EPO 2026 A30). Until `flowleap-deadlines` has them, the engine must refuse with `calendar-missing` (design section 5.1, principle 4). The seed shows this real case.
- Documents: the Article 94(3) communication and its annex.

**P1, EP20706232. The closure case, a missed period, a loss of rights, and the letter with two dates.**

- Euro-PCT from PCT/EP2020/054334, priority DE102019105526 of 2019-03-05 [cited: candidate report DE].
- First Article 94(3) communication, dated 2024-02-21 (`17Q`).
- First Rule 71(3) communication, `GRAP` 2025-07-29. Examination resumed (`GRAJ`, gazette 2025-08-12), and the register deleted that intention to grant (`INTC`, gazette 2025-09-17). This deadline becomes `superseded`.
- Second Rule 71(3) communication (Form 2004C), dated 2025-08-29. The period ends on 2 January 2026, as for W1. No grant fee is recorded. The loss of rights is effective on 3 January 2026 (`18D`), and the status became "deemed to be withdrawn" on 2026-04-24.
- Between these dates the EPO notified the loss of rights under Rule 112(1) EPC [inferred: the status change comes months after `18D`]. That communication bears its own date and names the date on which the period expired, so it is the planned letter with two dates [inferred; the fetch confirms it]. It also starts the two months for further processing (Article 121, Rule 135 EPC).
- Documents: the first Article 94(3) communication, both Rule 71(3) communications and the Rule 112(1) communication. As for W1, `GRAJ` does not show whether an EPO letter sits between the two communications.
- Candidate for the scan with no text layer: the certified copy of DE102019105526 [inferred].

**P2, EP21810318. A granted patent under opposition, with the opposition filed on the last day.**

- Rule 71(3) communication, effective 2025-07-28 (`INTG`). Mention of grant 2025-12-31 (`AK`, B1).
- Nine months from the mention end on Wednesday 30 September 2026. HARTING Electric Stiftung & Co. KG filed its opposition on 2026-09-30, and the register shows it as admissible [cited: `search_register`].
- The opponent is a party of the firm's conflict check (design section 4.4).
- The EPO sent the notice of opposition to the proprietor with a request to file observations and a time limit (`PLAX`, original code EPIDOSNOBS2, gazette 2026-10-14) [cited]. If the time limit is four months (Rule 79(1) EPC), it ends on Sunday 14 February 2027 and moves to Monday 15 February 2027 [inferred].
- Documents: the Rule 71(3) communication, the decision to grant and the `PLAX` communication. The notice of opposition itself is the opponent's document, so the seed leaves it out (decision D3).

**R1, EP23755468. An English Article 94(3) communication.**

- Euro-PCT (`PUAI`). First Article 94(3) communication, dated 2026-06-09 (`17Q`). If the period is four months, it ended on Friday 9 October 2026 [inferred]. The public file shows whether Renishaw replied; the seed copies it.
- Documents: the Article 94(3) communication and its annex.

**R2, EP23771920. An English Rule 71(3) communication, open at the seed date, and the handover.**

- Euro-PCT (`PUAI`). Rule 71(3) communication (Form 2004C), dated 2026-09-29. Four months end on Friday 29 January 2027, so the engine needs the 2027 calendar, as for W3.
- Documents: the Rule 71(3) communication with the text intended for grant.

### The download list (decision D2)

A person downloads these 19 documents in a browser from the register's "All documents" page of each matter, and `add-documents.mjs` records them (section 11). All are EPO-issued, except row 12, which a case needs (decision D3).

What we know and what the download adds:

- **Dates.** The date column is from `get_legal_status` of 2026-11-05 [cited]. The `GRAP` gazette date is the despatch date of a Rule 71(3) communication, and `INTG` is the same date or one day later. The date that the PDF bears is the authority, and `add-documents.mjs` records it.
- **Document names** are the names that the register usually shows for these documents [inferred]. The person picks the document of the right date and kind.
- **Document ids and page counts are not known.** FlowLeap has no EP document data, and the register was not reachable by script (section 2). The person reads them on the "All documents" page, and `add-documents.mjs` checks the page count in the PDF.
- **The two candidate cases** depend on rows 11, 12 and 15. Row 11 bears its own date and names the date on which the period expired [inferred]. Row 15 bears its own date and names a time limit; it can also name the date of the notice of opposition [inferred]. The seed uses the first of the two that has two dates in its header or first page. For the scan, `add-documents.mjs` runs `pdffonts` on every document. P1 is a Euro-PCT application, and the EPO usually takes the priority document from WIPO (Rule 17.1 PCT), so its EP file can lack row 12 [inferred]. If row 12 is not there or has a text layer, the scan case uses the first document of this list with no text layer. If no document qualifies, the scan case stays open and the founder chooses a replacement under decision D1.

| # | Matter | All documents page | Date (FlowLeap source) | Document (expected register name) | Case |
|---|---|---|---|---|---|
| 1 | W1 | [EP21755382](https://register.epo.org/application?number=EP21755382&lng=en&tab=doclist) | 2025-06-19 (`GRAP`; `INTG` 2025-06-20) | Communication about intention to grant, Rule 71(3) EPC (Form 2004C), first | superseded deadline |
| 2 | W1 | [EP21755382](https://register.epo.org/application?number=EP21755382&lng=en&tab=doclist) | 2025-08-29 (`GRAP`, `INTG`) | Communication about intention to grant, Rule 71(3) EPC (Form 2004C), second | closure; deadline met |
| 3 | W1 | [EP21755382](https://register.epo.org/application?number=EP21755382&lng=en&tab=doclist) | read at download (`GRAA` gazette 2025-10-17) | Decision to grant a European patent | the act after the met deadline |
| 4 | W2 | [EP22213933](https://register.epo.org/application?number=EP22213933&lng=en&tab=doclist) | 2024-09-11 (`17Q`) | Communication from the Examining Division, Article 94(3) EPC (Form 2001) | first Article 94(3) communication |
| 5 | W2 | [EP22213933](https://register.epo.org/application?number=EP22213933&lng=en&tab=doclist) | 2026-04-01 (`GRAP`, `INTG`) | Communication about intention to grant, Rule 71(3) EPC (Form 2004C) | weekend roll; overdue at the seed date |
| 6 | W3 | [EP24166597](https://register.epo.org/application?number=EP24166597&lng=en&tab=doclist) | 2026-09-18 (`17Q`, status change) | Communication from the Examining Division, Article 94(3) EPC (Form 2001) | German Article 94(3); due date in 2027 |
| 7 | W3 | [EP24166597](https://register.epo.org/application?number=EP24166597&lng=en&tab=doclist) | 2026-09-18 | Annex to the communication | source text of the German report (sheet 4) |
| 8 | P1 | [EP20706232](https://register.epo.org/application?number=EP20706232&lng=en&tab=doclist) | 2024-02-21 (`17Q`) | Communication from the Examining Division, Article 94(3) EPC (Form 2001) | first Article 94(3) communication |
| 9 | P1 | [EP20706232](https://register.epo.org/application?number=EP20706232&lng=en&tab=doclist) | 2025-07-29 (`GRAP`; `INTG` 2025-07-30) | Communication about intention to grant, Rule 71(3) EPC (Form 2004C), first | superseded deadline |
| 10 | P1 | [EP20706232](https://register.epo.org/application?number=EP20706232&lng=en&tab=doclist) | 2025-08-29 (`GRAP`, `INTG`) | Communication about intention to grant, Rule 71(3) EPC (Form 2004C), second | closure; deadline missed |
| 11 | P1 | [EP20706232](https://register.epo.org/application?number=EP20706232&lng=en&tab=doclist) | read at download (after `18D` 2026-01-03, before the status change of 2026-04-24) | Noting of loss of rights, Rule 112(1) EPC | **two dates, candidate 1**; hand-entered office event (case S3b) |
| 12 | P1 | [EP20706232](https://register.epo.org/application?number=EP20706232&lng=en&tab=doclist) | read at download | Certified copy of the priority document DE102019105526, only if the file holds it | **no text layer, candidate** |
| 13 | P2 | [EP21810318](https://register.epo.org/application?number=EP21810318&lng=en&tab=doclist) | 2025-07-27 (`GRAP` gazette; `INTG` 2025-07-28) | Communication about intention to grant, Rule 71(3) EPC (Form 2004C) | Rule 71(3) before the grant |
| 14 | P2 | [EP21810318](https://register.epo.org/application?number=EP21810318&lng=en&tab=doclist) | read at download (`GRAA` gazette 2025-11-28) | Decision to grant a European patent | mention of grant 2025-12-31; opposition period |
| 15 | P2 | [EP21810318](https://register.epo.org/application?number=EP21810318&lng=en&tab=doclist) | 2026-10-14 (`PLAX` gazette) | Communication of a notice of opposition, request to file observations and time limit | **two dates, candidate 2**; Rule 79(1) time limit |
| 16 | R1 | [EP23755468](https://register.epo.org/application?number=EP23755468&lng=en&tab=doclist) | 2026-06-09 (`17Q`; status change 2026-06-05) | Communication from the Examining Division, Article 94(3) EPC (Form 2001) | English Article 94(3) |
| 17 | R1 | [EP23755468](https://register.epo.org/application?number=EP23755468&lng=en&tab=doclist) | same date as row 16 | Annex to the communication | source text of an English report (sheet 4) |
| 18 | R2 | [EP23771920](https://register.epo.org/application?number=EP23771920&lng=en&tab=doclist) | 2026-09-29 (`GRAP`, `INTG`) | Communication about intention to grant, Rule 71(3) EPC (Form 2004C) | English Rule 71(3); due date in 2027; handover (case S2) |
| 19 | R2 | [EP23771920](https://register.epo.org/application?number=EP23771920&lng=en&tab=doclist) | 2026-09-29 | Text intended for grant | the text that the attorney checks after the handover |

### What the downloads showed (2026-11-05)

The founder downloaded all 19 documents on 2026-11-05; none was missing. The package [`flowleap-ai/flowleap-seed-firm`](https://github.com/flowleap-ai/flowleap-seed-firm) records 18 of them. These facts come from the PDFs [cited: `pdffonts`, `pdfinfo` and the page images]:

- **The date on each Rule 71(3) letter is the `INTG` effective date**, not the `GRAP` gazette date: rows 1, 9 and 13 bear 20.06.2025, 30.07.2025 and 28.07.2025, one day after `GRAP`. So W1's first period ended on 20 October 2025 and P1's on Sunday 30 November 2025, moved to 1 December 2025 [inferred]. The closure cases do not change: rows 2 and 10 bear 29.08.2025.
- **No PDF has a text layer.** Each register copy is a set of page images; `pdffonts` lists no font in any of the 19. So every seed letter is a scan, and the case "a scan with no text layer" needs no applicant document. Row 12 is a WIPO copy of the PCT priority document; the package leaves it out (decision D3).
- **Nearly every EPO form has two dates.** The footer prints a date beside the form number, for example `EPA Form 2004C 10.24AUWF (17.06.2025)` on the letter of 20.06.2025, and the decisions to grant also print "zur Poststelle am". Rows 7, 8, 11 and 17 have no footer date.
- **The chosen two-date case is row 11** (EPA Form 2015C of 21.01.2026). Its body names the Rule 71(3) communication of 29.08.2025, and the further-processing period runs from this letter, so a reader that takes the body date computes a wrong deadline. Row 15 (EPA Form 2317A of 14.10.2026, footer "(06/10/26)") stays as a second case.
- **German letters print "EPA Form", "Datum", "Zeichen" and "Anmeldung Nr."**; English letters print "EPO Form", "Date", "Ref." and "Application No.". The "Ref." field holds the real representative's reference (decision D4).
- **The register document ids are not in the PDFs.** A person copies them from the "All documents" page; until then the package lists them as open items.

## 4. Coverage of the R1 processes and the R2 rule set

| Case named in #294 or the brief | Matter | Label |
|---|---|---|
| Rule 71(3) communication, Form 2004C | W1 (two), W2, P1 (two), P2, R2 | [cited] for the events; the form number from the fetch |
| Rule 94(3) communication | W3 (German), R1 (English), and the first communications of W2 and P1 | [cited] |
| A deadline in the closure of 24 December 2025 to 1 January 2026 | W1 (met) and P1 (missed); both end on 2 January 2026 | [cited] for the dates; the roll is [inferred] and P1's `18D` agrees |
| An EPO letter with two dates | P1, the Rule 112(1) communication (row 11, chosen); P2, the communication of the notice of opposition (row 15); and the footer date of nearly every form | [cited]: the page images |
| A scan with no text layer | Every register PDF of the seed | [cited]: `pdffonts` lists no font in any of the 19 |
| An overdue deadline | W2 at the seed date (section 9); P1 at the closure clock | [cited] for the absent act up to the fetch |
| A superseded deadline | W1 and P1, the first Rule 71(3) communications | [cited] |
| A weekend roll | W2 (Saturday 1 August 2026 to Monday 3 August) | [inferred] |
| An engine refusal for a missing calendar | W3 and R2 (due dates in 2027) | [inferred] |
| English and German files | W1 to W3, P1, P2 German; R1, R2 English | see section 3 |

The five R1 sheets of the [process atlas](process-atlas/README.md):

| Sheet | Seed cases |
|---|---|
| 1 Office letter intake | Each EPO letter of section 3 goes through the AI mailbox. The scan with no text layer becomes `unreadable`. The two spellings of Phoenix Contact test the party match |
| 2 Office event to deadline | Form 2004C letters with two agreeing readers (W1, R2); the letter with two dates where the readers differ (P1); a hand-entered office event and a manual deadline with a second person (P1, case S3b); `superseded` (W1, P1); the engine refusal (W3, R2) |
| 3 Notify and run | The Ticket routed to one person (W3, case S4); the three client AI rules of decision D7: a run for WAGO, a by-hand Ticket for Phoenix Contact (local model only), a "not recorded" Ticket for Renishaw; the agent run that reads only what its person may see (case S5) |
| 4 Report to the client | A German report on a real Article 94(3) communication (W3). Renishaw records no AI wishes (decision D7), so a test that needs an English report first records Renishaw's wishes as a firm event in that test (R1) |
| 5 Firm-internal message | The reply to the forwarder and the notice to the responsible attorney for each letter; the notice after the handover goes to the new attorney (R2, case S2) |

The R2 EP rule set of design section 5.4:

| Rule id | Seed case |
|---|---|
| `ep.r71-3.grant-communication` | W1, W2, P1, P2, R2 |
| `ep.r132.specified-period` | W3, R1, W2 and P1 (first communications) |
| `ep.opposition-period` | W1 (ended, no opposition), P2 (opposition on the last day) |
| `up.request-unitary-effect` | W1 (mention 2025-11-19), P2 (mention 2025-12-31) |
| `ep.renewal` | Every matter, from its filing date |
| `ep.further-processing` | P1, from the Rule 112(1) communication |
| `ep.r159.euro-pct-entry` | P1, R1, R2 (Euro-PCT), from their priority or PCT filing date |
| `ep.r70.examination-request`, `ep.r161.euro-pct`, `ep.appeal`, `ep.re-establishment` | Not covered. FlowLeap gives no Rule 161 date, and we found no appeal or re-establishment case in these clients. Add a matter when R2 needs one |
| `pct.*`, `de.*` | Not covered. #294 adds them when R2 adds PCT and DE |

## 5. The users

The users are fictional [proposal]. Anna Becker, Jonas Weber and Lena Hoffmann keep the object ids of the R1 record seed (`record-seed.mjs`, flowleap-os PR 68), so the move from the R1 fixtures changes no person id. The other ids are random version-4 GUIDs, made once and fixed. The tenant is fictional: tenant id `bd44a9c5-d81e-49b5-823f-1a033eef1686`, domain `seed-firm.test` (RFC 2606 reserves `.test`).

| Handle | Name | Firm role (design section 4.2 `Role`) | App role | Entra object id | Sign-in |
|---|---|---|---|---|---|
| `partner` | Dr. Martin Krüger | partner | `FlowLeap.User` | `a4f9593b-0896-4138-8b9c-a17ceeffbd23` | `martin.krueger@seed-firm.test` |
| `anna` | Dr. Anna Becker | attorney | `FlowLeap.User` | `0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0` | `anna.becker@seed-firm.test` |
| `jonas` | Jonas Weber | attorney | `FlowLeap.User` | `1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d` | `jonas.weber@seed-firm.test` |
| `lena` | Lena Hoffmann | attorney | `FlowLeap.User` | `2b3c4d5e-6f70-4b8c-9d0e-1f2a3b4c5d6e` | `lena.hoffmann@seed-firm.test` |
| `sabine` | Sabine Wolf | formalities (PAFA) | `FlowLeap.User` | `adfbb95a-2c5f-4571-8091-452a266f8353` | `sabine.wolf@seed-firm.test` |
| `tobias` | Tobias Schmitt | formalities (PAFA) | `FlowLeap.User` | `8279562c-e5ec-431b-a839-f6bdc2966368` | `tobias.schmitt@seed-firm.test` |
| `miriam` | Miriam Yilmaz | assistant (new `Role` member, decision D5; until it exists, `formalities` without the confirm right) | `FlowLeap.User` | `74e45f9c-c4a1-4033-8fe3-726d4d7961ca` | `miriam.yilmaz@seed-firm.test` |
| `felix` | Felix Neumann | administrator | `FlowLeap.Administrator` | `c2569871-8b89-4ab2-b4ca-c82ceb770f37` | `felix.neumann@seed-firm.test` |

Rules for the users [proposal]:

- No user name equals a natural-person name in the register data of a seed matter (applicants, inventors, representatives, opponents). The package check enforces this. A check against the whole register is not useful: `search_register nm="Becker, Anna" or nm="Weber, Jonas" or nm="Hoffmann, Lena" or nm="Krüger, Martin"` gives 98 applications, all of them inventor entries of other files [cited]. Common names occur, so the rule is about the seed matters.
- The IT administrator has the administrator app role and no client group or matter team. This user manages the firm and sees no matter data. This tests that the app role gives no access to matters.
- The partner has the user app role. Firm management and matter access are separate.

## 6. Groups and walls

Each matter has one wall: the client group `client-<id>`, the matter team `matter-<id>`, and a screen `screen-<id>` where a case needs it (design section 4.4). The groups are Entra security groups with fixed object ids. The matter id in a group name is the EP application number in lower case [proposal].

Our reading of section 4.4 for the seed: a user may see a matter when the user is a member of its client group or of its matter team, and is not a member of its screen. A screen beats a membership [cited: design section 4.4; "or" is our reading, inferred].

| Group | Entra object id | Members |
|---|---|---|
| `client-wago` | `3d537d36-5089-47dd-952b-a597f88552a8` | partner, jonas |
| `client-phoenix` | `72d23be2-6255-47fe-a128-ea681f910589` | partner, anna |
| `client-renishaw` | `2feb3227-76eb-478a-9caa-f3c3db9d2340` | partner, lena |
| `matter-ep21755382` (W1) | `6bb3a0c9-b746-4e66-aaec-38fe5d7afebd` | jonas, lena, sabine |
| `matter-ep22213933` (W2) | `21827c61-756b-4fec-8273-38ee6289c0eb` | lena, sabine |
| `matter-ep24166597` (W3) | `a75f88df-453a-48c8-ad43-b1d76628636b` | jonas, lena, sabine |
| `matter-ep20706232` (P1) | `8072b230-ebb3-41eb-bba9-c057e82fb2f8` | anna, tobias, miriam |
| `matter-ep21810318` (P2) | `8cd72997-679f-4a60-941f-b70544119526` | anna, tobias |
| `matter-ep23755468` (R1) | `c1e8d518-ed3f-4465-937c-097a3fa28082` | lena, sabine |
| `matter-ep23771920` (R2) | `1d66f5ab-59f0-4b77-a105-35d7d3801e37` | lena, tobias; anna from the handover (case S2) |
| `screen-ep22213933` (W2) | `1ddd42a5-7ff2-4b62-8e98-050f81e2ed7a` | jonas |

The firm-side fields of each matter [proposal]:

| Matter | Firm file number | Responsible attorney | Matter type | Client AI rules (decision D7) |
|---|---|---|---|---|
| W1 | SF-2021-0011 | jonas (shared with lena, case S1) | prosecution | AI allowed, cloud model |
| W2 | SF-2022-0024 | lena | prosecution | AI allowed, cloud model |
| W3 | SF-2024-0007 | jonas | prosecution | AI allowed, cloud model |
| P1 | SF-2020-0031 | anna | prosecution | local model only |
| P2 | SF-2026-0019 | anna | opposition (the firm defends the patent) | local model only |
| R1 | SF-2023-0042 | lena | prosecution | not recorded |
| R2 | SF-2023-0045 | lena, then anna from 2026-10-15 (case S2) | prosecution | not recorded |

Who sees what, with the screen and the handover applied:

| User | W1 | W2 | W3 | P1 | P2 | R1 | R2 |
|---|---|---|---|---|---|---|---|
| partner | yes | yes | yes | yes | yes | yes | yes |
| anna | no | no | no | yes | yes | no | yes (from the handover) |
| jonas | yes | **no (screen)** | yes | no | no | no | no |
| lena | yes | yes | yes | no | no | yes | yes |
| sabine | yes | yes | yes | no | no | yes | no |
| tobias | no | no | no | yes | yes | no | yes |
| miriam | no | no | no | yes | no | no | no |
| felix | no | no | no | no | no | no | no |

Each matter has at least three users outside its wall. jonas is in `client-wago` and is screened from W2, a matter of a client that jonas otherwise sees. The seed records the screen with a fictional reason: jonas advised a third party on the parent application before joining the firm [proposal]. No WAGO user sees a Phoenix Contact matter, and the reverse, except the partner.

## 7. Actors of the seed record events

Every seed record event names its actor with the `Actor` union of design section 4.2 [proposal]:

| Record events | Actor |
|---|---|
| The register data of each matter: rights, parties, register status and legal events | `{ kind: 'import' }` with the seed version as the batch, the FlowLeap tool call as `sourceKey`, and the SHA-256 of the stored response as `sourceHash` |
| Opening each matter, its client, team and responsible attorney; the conflict check | partner (`person`) |
| Each EPO letter arriving | `{ kind: 'intake', source: 'ai-mailbox' }`; the forwarder is the PAFA of the wall (sabine for WAGO and Renishaw, tobias for Phoenix Contact) |
| Reader 1 and reader 2 of a letter | `intake`, with the reader 2 model and its Session reference as evidence |
| A deadline proposal | `intake` (the engine proposes from the read code and date) |
| A code decided by a person, a deadline confirmed, rejected or closed | the person (`person`) |
| A hand-entered office event and a manual deadline | the PAFA (`person`), and the second person who confirms it |
| A run's work products (analysis, report, task) | `{ kind: 'agent', onBehalfOf: <routed person> }` with its Session and Ticket |
| A Decision on a work product, a report sent | the routed attorney (`person`) |
| A handover and its acknowledgement | the old attorney, then the new attorney (`person`) |

Fictional firm events (a matter opened, a handover, a decision) carry dates that fit the real register dates. A test can tell real from fictional data by the actor: only `import` and `intake` records carry register data or EPO letters [proposal].

## 8. The sharing cases

| Case | Matter | What happens | What a test checks |
|---|---|---|---|
| **S1. Two attorneys share a matter** | W1 | jonas is responsible and lena is a co-attorney. Both are in the matter team | Both see the matter and its deadlines. Each may decide a code and confirm a deadline that the other proposed |
| **S2. Handover** | R2 | On 2026-10-15 lena hands the matter to anna: a Task and handover record with the instruction "Check the text intended for grant of the Rule 71(3) communication of 29 September 2026". anna acknowledges it, and the partner adds anna to the matter team | anna sees R2 only from the handover. The notice on a later letter goes to anna. The record keeps both persons |
| **S3a. Two readers agree** | W1 (second Form 2004C), R2 | Reader 1 reads the form number and the date; reader 2 reads the page image. Both agree, so the reading counts as checked (`two-readers`) | The deadline is proposed with both readings as evidence |
| **S3b. A hand-entered office event and a second person** | P1 | The Rule 112(1) communication is not Form 2004C, so reader 1 gives no code. tobias enters the office event and the further-processing deadline by hand. A second person confirms it | The record refuses tobias, who made the entry, and refuses sabine, who is outside the wall. anna or the partner confirms |
| **S3c. The readers differ** | P1 (the letter with two dates) | Reader 1 refuses (`two-documentDate`) or the readers differ on the date. A person decides the date | The person who decided the date cannot confirm the deadline (`docket.code-decider-not-confirmer`) |
| **S4. A Ticket routed to one person** | W3 | The Article 94(3) Ticket is routed to jonas, the responsible attorney | lena (team) and the partner see the Ticket and get `not-routed-person` when they try to decide |
| **S5. An agent run reads only what its person may see** | W3, W2 | jonas's run on W3 has a Mandate that names all WAGO matters | `record_read` gives W1 and W3, never W2. The same run for the partner gives all three. A run for felix gives none |

## 9. The seed clock

The package holds the full real history of each matter. A test chooses a clock, and the record replays every real and fictional event with a date on or before it [proposal]:

| Clock | Date | What it shows |
|---|---|---|
| `fetch` (default) | 2026-11-05 | The state at the fetch. W2's deadline is overdue; W3 and R2 have open deadlines in 2027; P1 is withdrawn; P2 is in opposition |
| `closure` | 2025-12-22 | W1 and P1 each have an active deadline on 2 January 2026, and W1's grant fee is already recorded |
| `after-closure` | 2026-01-05 | P1's deadline is overdue; W1's deadline is met |

The engine golden cases do not use a clock. They use the trigger dates of section 3.

## 10. Where the seed package lives

**Decision: the public repository [`flowleap-ai/flowleap-seed-firm`](https://github.com/flowleap-ai/flowleap-seed-firm),** approved by the founder and created on 2026-11-05 (default branch `main`, MIT license). The package work goes there by pull request, never by a direct push to `main`. Each consumer pins it by commit, as flowleap-os pins `flowleap-deadlines` today (`lib/record/package.json`: `github:flowleap-ai/flowleap-deadlines#<sha>`) [cited].

| Option | Readers it serves | Why not |
|---|---|---|
| **A. Own public repository (chosen)** | flowleap-os tests and its verify skill (git pin), flowleap-deadlines golden cases (git pin as a dev dependency), the harness client fixtures and the harness verify skill, the demo firm (#246) | Needs one more repository and a release step |
| B. In flowleap-harness (`flowleap/seed-firm/`) | The harness | `flowleap-deadlines`, a small pure library, would depend on the large harness repository, and the private flowleap-os would have to fetch the harness to run a test |
| C. In flowleap-os | flowleap-os | The repository is private, so the public CI of the harness and of `flowleap-deadlines` cannot read it |
| D. In flowleap-deadlines | The engine | Users, groups and walls are not deadline rules; the library would carry firm data that its readers do not need |

Reasons for A:

- The data is public. The register data and the EPO letters are open to inspection after publication (Article 128(4) EPC) [cited: design section 5.8], so a public repository needs no secret in any CI.
- One home for the data, the fetch script and the compare check. No consumer keeps its own copy of a matter (#294).
- No cycle. The seed package has no dependencies. `flowleap-deadlines` reads it only in its tests, and the expected due dates stay in `flowleap-deadlines`.
- A version is a commit. A consumer moves to a new seed version in its own PR, and its tests show what changed.

Two points to confirm when the package is built:

- The harness gate `scripts/check-workspace-constraints.ts` checks dependency ranges. We did not test whether it accepts a `github:` dev dependency [inferred]. If not, the harness test setup reads a copy at the pinned commit and checks its hashes, or the package goes to npm (decision D3).
- The PDFs make the repository a few megabytes [inferred]. Plain git is enough at this size.

Proposed layout [proposal]:

```
flowleap-seed-firm/
  package.json              no dependencies; exports ./index.mjs
  index.mjs                 loadSeed(): reads the files, checks hashes, no network
  firm/                     users.json, groups.json, walls.json, sharing.json, clocks.json
  matters/<application>/
    matter.json             firm-side fields (file number, client, team, responsible, type)
    register/<tool>.json    each FlowLeap response as fetched: tool, input, fetchedAt, sha256, body
    documents.json          per document: register document id, date it bears, type, form, pages, sha256, URL, fetchedAt, textLayer
    documents/<id>.pdf      the public EPO document, byte for byte
    events.jsonl            fictional firm events (actor, date) that the record replays
  fetch/                    fetch-register.mjs, add-documents.mjs
  check/                    compare.mjs, check-seed.mjs
```

## 11. The fetch script and its checks

The fetch is a script that a person can run again [proposal]. It is package code, so we write it after the founder approves the matter list.

- **`fetch/fetch-register.mjs <application>...`** runs `flowleap --json tools run <tool> ...` for `search_register` (by publication number), `get_register_biblio`, `get_register_events`, `get_legal_status` and `get_bibliography`. It stores each response with the tool, the input, the fetch time and the SHA-256. The FlowLeap CLI needs an account with an active plan (decision D6).
- **`fetch/add-documents.mjs <application> <pdf>...`** takes the PDFs that a person downloaded from the register (decision D2). It records the register document id, the date that the document bears, the form number, the page count, the SHA-256 and whether the PDF has a text layer (`pdffonts`). It never edits a PDF.
- **`check/compare.mjs`** fetches each register response again and fails on any difference in a field that the seed uses. It names the matter, the tool and the field. This is the first acceptance criterion of #294.
- **`check/check-seed.mjs`** runs in CI without network. It fails when a PDF hash differs from `documents.json`, when a user name equals a natural-person name of a seed matter, when a wall leaves no user outside a matter, or when a matter has no register URL and fetch date.

## 12. Decisions of the founder

| # | Decision | Decided by the founder on 2026-11-05 (as recommended) |
|---|---|---|
| D1 | Approve the seven matters and the three clients of section 3 | Approved. Replace a matter only if its public file does not show the case that it is for (section 4) |
| D2 | How do we get the EPO letters? FlowLeap has no EP file-inspection tool, and the register refuses scripted requests | For the first version, a person downloads the documents of the [download list](#the-download-list-decision-d2) from the register's "All documents" page in a browser, and `add-documents.mjs` records them. The EP file-inspection tool in the FlowLeap backend is [#323](https://github.com/flowleap-ai/flowleap-harness/issues/323) |
| D3 | May the public repository hold the EPO letters and the names in them? The founder decided on 2026-11-05 to keep names as published | Yes for EPO-issued letters. Leave out documents that the applicant wrote (for example a priority document) unless a case needs one, and then take the shortest one |
| D4 | The firm file numbers are fictional (`SF-...`). The real letters carry the reference of the real representative in the "Ref." field | Keep fictional file numbers and match the letters by the EP application number. Store the printed "Ref." as read, never as our file number |
| D5 | The design `Role` union has no assistant | Add `assistant` to the `Role` union of design section 4.2: an assistant may see and forward, and may not confirm a deadline. Until the union has it, the seed marks miriam as `formalities` without the confirm right |
| D6 | The FlowLeap CLI account answers HTTP 402 | Give the fetch a FlowLeap account with an active plan, as a personal API token (`fl_pat_`) in the environment, never in the repository |
| D7 | The AI rules of the three clients for sheet 3 | WAGO allows AI with a cloud model, Phoenix Contact allows only a local model, Renishaw records no wishes. So the seed has a run, a by-hand Ticket and a "not recorded" Ticket (section 6) |

After approval, the next steps of #294 are the fetch and the package (part 3), and after the R1 merges, the move of the tests to the package. This PR changes no fixture of R1.
