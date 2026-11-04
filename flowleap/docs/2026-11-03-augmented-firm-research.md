# The augmented firm: how patent firms work, and an AI that works inside them

Status: research and proposal of 2026-11-03, for the founder. No decision in this file is final until the founder confirms it. It builds on [ADR 0001](adr/0001-self-hosted-firm-os.md), the [v1 scope](2026-10-28-v1-scope.md), the [roadmap](2026-10-29-roadmap.md), the [docket agent study](2026-11-01-superagent-docket-agent-study.md), the [skills and plugins design](2026-11-02-skills-and-plugins-design.md) and tickets #119, #122, #123 and #154.

Labels. Each claim has one label:

- **[cited]**: a source states it. The link is in the same paragraph. "Secondary" means that we read a report about the source, not the source itself.
- **[inferred]**: our conclusion from cited facts. A real firm must confirm it.
- **[proposal]**: our design proposal. Estimates of time and money are proposals, not measurements.

## Summary

**The problem.** FlowLeap Patent AI is a strong chat with patent data, methods, routines, Needs review and a dashboard. But the attorney must go to it. In a patent firm, work does not start with a prompt. It starts with an event on a matter: a letter in the EPO Mailbox, a client email, a deadline. Then it moves through handovers: formalities staff to attorney, attorney to client, client to attorney, attorney to formalities staff. Each handover is an email or a docketing entry, and each is a place where work waits or is lost [inferred from section 2]. Today FlowLeap is not part of any handover.

**What we found about the firm.**

1. The deadline clock starts when the letter arrives. Since 1 November 2023 an EPO document counts as delivered on the date that it bears; the 10-day buffer is gone [cited: [OJ EPO 2023 A29](https://www.epo.org/en/legal/official-journal/2023/03/a29)]. Intake speed is now response time.
2. The EPO Mailbox goes to the company, not to a person. Its only shared state is folders and a "handled" flag: no assignment, no comment [cited: [MyEPO feature guide](https://link.epo.org/web/myepo-services/interact/en-myepo-feature-guide-handling-mailbox-communications.pdf)]. Firms close this gap by email between people [inferred].
3. PATORG, the system that most German firms use, already imports the EPO Mailbox, matches mail to files and uses ChatGPT to read deadlines from official letters [cited: [PatOrg features](https://patorg.com/de/features/productivity), [PatOrg AI](https://patorg.com/de/features/ai)]. Intake and docketing are taken. The open work is the substance, the report to the client, the instruction to staff, and the second check of the deadline [inferred].
4. The law puts the risk on deadline changes. In BGH X ZB 17/12 a firm lost a patent because a clerk deleted a validation deadline after misreading a foreign associate's letter [cited, secondary: [Betriebs-Berater](https://betriebs-berater.ruw.de/wirtschaftsrecht/urteile/Fristueberwachung-durch-Kanzleimitarbeiter-18890)]. The EPO asks for an independent cross-check in a deadline system [cited: [Guidelines E-VIII 3.2](https://www.epo.org/en/legal/guidelines-epc/2025/e_viii_3_2.html)]. An AI must never write or delete a deadline. It can be the independent second check [inferred].
5. The products that impress users put a draft where the work already is (Outlook Drafts, a recap, a pull request), start from a real work event, and let the person send [cited: section 3]. Products that fail add a tool, add noise, record without consent or expose data too widely [cited: section 3].

**The proposal: the augmented firm.** One rule: *the AI does the first 80 % of each handover before a person opens it, and it delivers the work where the person already is* [proposal]. Three guards: an event goes in, a draft comes out, a person decides; nothing leaves the firm without a person; one matter, one wall. Nine concepts in section 6:

| # | Concept | Size |
|---|---|---|
| 1 | The AI colleague's mailbox: "forward it to FlowLeap" | M |
| 2 | The office letter that arrives already worked | L (M through concept 1) |
| 3 | Deadline second check (Fristen-Gegenkontrolle), in observe mode | M to L |
| 4 | Morning brief for each role | M |
| 5 | Client report letters drafted for every office event | M |
| 6 | Handover cards between attorney, formalities staff and trainee | M |
| 7 | Matter memory: "what did we argue in this family?" | L |
| 8 | Foreign associate desk | L |
| 9 | Call and meeting notes into the matter | M |

**The first slice (1 to 2 weeks).** "Forward the EPO letter to FlowLeap." The firm gets one mailbox, for example `ki@kanzlei.de`. An attorney or a paralegal forwards an office letter to it, as they forward it to a colleague today. About ten minutes later the sender gets a reply in Outlook: what the letter is, each objection, a recommendation, a deadline proposal marked "confirm in PATORG", the analysis and a draft client report letter as Word files, and a link to the office action board. A daily register check adds the proactive part: "The Register shows a new communication on EP 3 xxx xxx. I have no letter for it. Forward it to me." Section 7.1 tells it as a 3-minute demo. It reuses the office action method (13 of 13 live), the register watch, deliverables, the board and Entra sign-in. It needs one mail intake in the control plane and one founder decision on ADR decision 21 (section 7.3).

**Next steps.** (1) the mailbox slice; (2) the morning brief and the observe Decisions of #135 to #137; (3) the matter record of #123, handover cards and Outlook drafts; (4) the deadline second check on the MyEPO API (#154) and a read-only PATORG adapter; (5) matter memory and Teams. Section 7.2 gives the order and the reasons.

---

## 1. Sources and method

- Two research notes, written on 2026-11-03 for this study, in the shared notes folder of this session group: A, how firms work (EPO, DPMA, professional rules, vendors, roles, workflows); B, how AI products work inside other tools, and Microsoft 365 options for a self-hosted server. Each fact below that is labelled [cited] has its link here. We give only links that the notes opened or marked as secondary.
- The FlowLeap documents named in the status line, the methods in [flowleap-methods](https://github.com/flowleap-ai/flowleap-methods), and the routines package README (`packages/host/flowleap-routines/README.md`).
- Gaps: we found no German survey of time spent on formalities or reports; no Patentanwaltskammer guidance on AI or cloud; the epi AI guidelines PDF returned HTTP 403, so we use secondary summaries. No source describes how German patent firms use Teams, file notes or paper. Section 7.4 turns these gaps into questions for the pilot firm.
- We did not use the test firm, made no model call, and wrote no product code.

## 2. How a patent firm of 5 to 50 people works

### 2.1 The roles

| Role | What they do | Systems | Source |
|---|---|---|---|
| Partner | Owns clients, the deadline system and its written instructions; signs and supervises | Outlook, PATORG, DMS | Supervision duty: [cited: [epi Code Art. 3(d), 3(e)](https://www.epo.org/en/legal/official-journal/2025/06/a42)]; deadline instructions: [cited, secondary: BGH X ZB 17/12] |
| Patent attorney (Patentanwalt, European patent attorney) | Drafting, office action analysis, reports and advice, oppositions, appeals | Word, Outlook, EPO and DPMA tools, PATORG | [inferred] from role sources |
| Attorney in training (Patentanwaltskandidat) | Drafts and analyses under review; at least 34 months of training, 26 of them with a patent attorney | Word, Outlook | [cited: [§ 7 PAO](https://www.gesetze-im-internet.de/patanwo/__7.html)] |
| Patentanwaltsfachangestellte (PAFA), formalities staff | Calculate, note and monitor deadlines; prepare applications; correspondence with clients, offices and foreign associates, also in English; costs and invoices | PATORG, EPO Mailbox, Online Filing 2.0, DPMAdirektPro, Outlook | [cited: [BIBB certificate supplement](https://www.bibb.de/dienst/berufesuche/de/index_berufesuche.php/certificate_supplement/en/patentanwaltsfachangestellter_e.pdf), [ReNoPat-AusbV](https://www.gesetze-im-internet.de/renopatausbv_2015/BJNR149000014.html)] |
| Docketing and records | Mailbox intake, file match, deadline entry, document filing; in small firms the PAFA does this | PATORG, DMS | UK job postings [cited, secondary: [Keltie](https://keltie.com/vacancy/patent-administrator)]; split in small firms [inferred] |
| Assistant, secretary | Letters out, calendars, phone | Outlook, Word | [inferred] |
| IT (often an outside IT service provider) | Microsoft 365 tenant, server, backups | Entra, Exchange, the firm server | [inferred] |
| Client's in-house IP team | Sends disclosures, gives instructions, decides on renewals; often has its own IP system | Email, own IP system (for example Anaqua) | Anaqua Connect for client-firm data exchange [cited, secondary: [Anaqua](https://www.anaqua.com/?p=25497)] |

### 2.2 Systems and channels

| System | What arrives or happens there | Facts |
|---|---|---|
| EPO Mailbox in MyEPO Portfolio | Every EPO communication, as a PDF, to the company | Company mailbox, folders and "handled" only, CSV export, ZIP download; a Mailbox API for IP systems with a sandbox [cited: [MyEPO feature guide](https://link.epo.org/web/myepo-services/interact/en-myepo-feature-guide-handling-mailbox-communications.pdf)]. Only in MyEPO Portfolio since 1 July 2024 [cited, secondary]. |
| EPO email alerts | A notice of new mail, actions, or a deadline in two weeks | "A courtesy service for information only"; a user "may not invoke the omission of an alert" [cited: [OJ EPO 2023 A49](https://www.epo.org/en/legal/official-journal/2023/05/a49)] |
| Online Filing 2.0 | Filing to the EPO | The desktop OLF closed on 1 January 2026 [cited: [OJ EPO 2025 A53](https://www.epo.org/en/legal/official-journal/2025/07/a53)] |
| European Patent Register, Register Alert | Public procedural events; email alert per file | [cited: [EPO monitoring services](https://epo.org/en/searching-for-patents/helpful-resources/patent-knowledge-news/monitoring-services-european-patent)]. After publication the file is open to inspection [cited: [Art. 128(4) EPC](https://www.epo.org/en/legal/epc/2020/a128.html)] |
| DPMAdirektPro, DPMA electronic mailbox | DPMA filing; DPMA letters for firms that consented | Service counts as done on the fourth day after the document is available, also when the email notice is lost [cited: [DPMA consent flyer](https://dpma.de/docs/dpma/veroeffentlichungen/flyer/dpmadirektpro_einwilligung.pdf)] |
| PATORG (Brügmann) | The docket, the files, letters and invoices | 300+ law firms; on-premise or PatOrg Cloud; EPO Mailbox import; file-number recognition on email; Outlook add-in; DPMAConnect; ChatGPT for deadlines, citations and foreign invoices [cited: [patorg.com](https://patorg.com/), [productivity](https://patorg.com/de/features/productivity), [AI](https://patorg.com/de/features/ai)] |
| Outlook, Exchange Online | Clients, foreign associates, colleagues; PDF attachments | Main channel to everyone outside the firm [inferred] |
| Teams | Internal chat and meetings | No source on its use in patent firms [gap] |
| DMS, matter folder | The documents | [inferred] |
| Word | Drafts, reports, responses with tracked changes | [inferred] |

### 2.3 The rules that shape any AI in the firm

- **Deadlines start on the document date.** EPO: Rules 126(2), 127(2) and 131(2) EPC since 1 November 2023 [cited: [OJ EPO 2023 A29](https://www.epo.org/en/legal/official-journal/2023/03/a29)]. DPMA: the fourth day after availability [cited: DPMA consent flyer]. So same-day intake is now safe practice [inferred].
- **Common EPO periods.** Office actions two to four months; four months for substantive communications of examining and opposition divisions [cited: [Guidelines E-VIII 1.2](https://www.epo.org/en/legal/guidelines-epc/2025/e_viii_1_2.html)]. Rule 71(3): four months [cited: [R.71](https://www.epo.org/en/legal/epc/2020/r71.html)]. Rule 161: six months [cited: [R.161](https://www.epo.org/en/legal/epc/2020/r161.html)]. Further processing: two months from the loss-of-rights communication, with a fee [cited: [R.135](https://www.epo.org/en/legal/epc/2020/r135.html)]. Re-establishment: two months from removal of the cause, at most one year [cited: [R.136](https://www.epo.org/en/legal/epc/2020/r136.html)]. Renewal fees: the last day of the anniversary month, six months with a surcharge [cited: [R.51](https://www.epo.org/en/legal/epc/2020/r51.html)]. Unitary effect: one month from grant [cited, secondary].
- **The deadline system is the attorney's duty.** For re-establishment the EPO wants a system that "normally works well", with an independent, effective cross-check; small entities are exempt from the cross-check; assistants must be carefully selected, instructed and supervised [cited: [Guidelines E-VIII 3.2](https://www.epo.org/en/legal/guidelines-epc/2025/e_viii_3_2.html)]. The BGH requires general instructions that stop staff from changing or deleting deadlines on their own [cited, secondary: BGH X ZB 17/12].
- **Confidentiality.** § 39a PAO: confidentiality, staff bound in writing and supervised [cited: [§ 39a PAO](https://www.gesetze-im-internet.de/patanwo/__39a.html)]. § 39c PAO: a service provider may see client secrets only when necessary, with a text-form contract, a confidentiality duty, sub-contractor rules, comparable protection abroad, and the client's consent for a service for one specific matter [cited: [§ 39c PAO](https://www.gesetze-im-internet.de/patanwo/__39c.html)]. § 203 StGB names the Patentanwalt [cited: [§ 203 StGB](https://www.gesetze-im-internet.de/stgb/__203.html)].
- **AI rules.** The epi adopted guidelines on generative AI on 16 November 2024. Secondary summaries say: the member stays responsible, checks all output, needs client permission for AI on client work, and keeps clients separate [cited, secondary: [Solve Intelligence summary](https://www.solveintelligence.com/blog/post/epi-guidelines---use-of-generative-ai-for-patent-attorneys)]. The EPO Guidelines 2026 keep the parties responsible for AI-assisted content [cited, secondary: [Mathys & Squire](https://www.mathys-squire.com/insights-and-events/news/european-patent-office-previews-the-2026-guidelines-for-examination/)]. We found no Patentanwaltskammer guidance; the BRAK published AI notes for Rechtsanwälte in December 2024 [cited, secondary: [DATEV magazin](https://www.datev-magazin.de/nachrichten-steuern-recht/recht/kuenstliche-intelligenz-in-anwaltskanzleien-brak-veroeffentlicht-leitfaden-135422)].
- **What this means for FlowLeap** [inferred]: the self-hosted host removes FlowLeap as a service provider of client data, but the firm's model provider is still a provider under § 39c PAO; the firm needs that contract and, per the epi guidelines, a client consent policy. Every proactive output needs a source and a named person who decides.

### 2.4 The workflows end to end

The steps are [inferred] from the role, rule and vendor sources in this section, unless a cell says otherwise. Section 7.4 asks the pilot firm to correct them.

| Workflow | Who does what | Handovers | Where time is lost | Where errors and risk are |
|---|---|---|---|---|
| **Invention disclosure → drafting → filing** | Client sends the disclosure; attorney or trainee meets the inventors, may search, drafts; client review rounds in Word; PAFA prepares forms and files (Online Filing 2.0, DPMAdirektPro); receipt is docketed and reported | client → attorney → trainee → attorney → client (several rounds) → PAFA → client | Waiting for inventor calls and client comments; retyping applicant and inventor data | Wrong applicant or inventor data; priority date from the wrong document. Employer has four months to claim an employee invention, so disclosures arrive under time pressure [cited for the rule: [§ 6 ArbnErfG](https://www.gesetze-im-internet.de/arbnerfg/__6.html)] |
| **Incoming office action → response** | Mailbox download, file match, docket entry with Vorfrist (PAFA, PATORG); attorney reads and writes the report to the client; client instructs by email; attorney drafts the response; PAFA files; receipt docketed; deadline closed | EPO → Mailbox → PAFA → attorney → secretary → client → attorney → PAFA → accounts | Reading and summarising for the client; the client answers near the end of a four-month period; chasing instructions | Docket from the wrong date; superseded action; a response that misses an objection. Foreign clients: the firm reports to an associate, and two firms docket the same deadline [cited for the vendor claim: Anaqua] |
| **Deadlines and docketing** | PAFA enters each deadline and Vorfrist; a second person or the partner checks; only an attorney may delete | PAFA ↔ attorney | Manual second check; lists printed or reviewed weekly | Deletion or change by staff (BGH X ZB 17/12); an unusual communication that gets the wrong docket code [inferred from PatOrg's AI targets] |
| **Opposition and appeal** | Attorney-heavy; many parties and documents; fixed oral-proceedings dates | attorney ↔ client ↔ other side's papers | Reading the other side's submissions and the file | Missing a party's new document or a summons date [inferred]; four-month periods also for opposition divisions [cited: Guidelines E-VIII 1.2] |
| **Renewals** | Often outsourced to a renewal provider (CPA, Dennemeyer, others); the firm still reports to the client and asks for decisions | provider → firm → client → firm → provider | Asking each client "keep or drop?" with no value data | Late instructions; surcharge [cited for the period: R.51; outsourcing: secondary, [Mondaq](https://www.mondaq.com/patent/875780/how-to-choose-a-patent-annuity-service)] |
| **Foreign filing and validation** | Instruction letters to foreign associates; translations; their acknowledgments, reports and invoices in many formats | firm ↔ many associates (email, PDF) | Free-form associate mail and invoices: the stream that PatOrg's AI targets [cited: PatOrg AI] | The BGH case: a misread associate letter deleted a validation deadline [cited, secondary] |
| **Client reporting and invoicing** | Routine reports (receipt, search report, publication, grant, fees due) are templates filled by staff and signed; the office action report is attorney time; PAFA prepares invoices | attorney → secretary → client; PAFA → accounts | Writing and translating reports; matching foreign invoices | Keeping clients informed is a duty [cited: epi Code Art. 4(a)] |

### 2.5 How information moves

- Official mail arrives in the EPO and DPMA mailboxes, with email notices that have no legal effect [cited: OJ 2023 A49, DPMA flyer]. Clients and associates use email with PDF attachments. Inside the firm: PATORG, the DMS and Outlook; PATORG's Outlook add-in exists to move mail into files [cited: PatOrg productivity]. [inferred for the whole picture]
- The handover between staff and attorneys has no tool of its own: the EPO Mailbox has no assignment or comment [cited], so the state of "who has this letter, and what did they decide" lives in emails, a docket entry and people's heads [inferred].
- "Ask the colleague who did this case", meetings, phone calls and file notes (Aktennotiz) are certain to exist, but we found no source on how they are kept [gap].

### 2.6 What the incumbents already automate

- PATORG: Mailbox import, file match, workflows that note deadlines and generate letters and invoices, and ChatGPT reading of official letters and foreign invoices [cited]. Patricia, FoundationIP and DIAMS calculate due dates with country-law engines [cited, secondary: vendor pages in note A]. Anaqua AQX auto-processes USPTO mail; its EPO support was "coming soon" in 2025 [cited: [AQX data sheet](https://go.anaqua.com/en/aqx-document-auto-processing-data-sheet)]. Clarivate Docket processes inbound office mail and calls it "automation" [cited: [Clarivate Docket](https://clarivate.com/intellectual-property/ip-management-software/docket/)].
- Nobody publishes accuracy data for this [cited as absence, note B]. The only time number is a vendor claim: 7 minutes per docket item, 2.23 with AQX [cited, secondary: Anaqua].
- **Conclusion** [inferred]: FlowLeap must not rebuild intake, file match or the due-date engine, and must never be the docket. It sits on top: it reads the substance, drafts the report and the instruction, and checks the docket a second time.

### 2.7 Where the time and the risk are

1. **Arrival to first look.** The period runs from the document date; every hour in a queue is response time lost [inferred from 2.3].
2. **The office action report to the client.** Attorney time on every substantive action; the client then decides late [inferred].
3. **Routine reports.** Many events, each a template letter, staff time [inferred].
4. **Foreign associate mail and invoices.** Free text, many languages, deadlines in many forms [cited for PatOrg's focus; inferred as a top sink].
5. **The second check of deadlines, and every deletion.** The legal danger point [cited: BGH, EPO Guidelines].
6. **Knowledge in people.** "What did we argue in this family?" is answered by finding the colleague or the old file [inferred; no source].

We found no public number for any of these times [gap]. The pilot must measure them (section 7.4).

## 3. How other products put AI into work

From note B. Most facts are vendor claims [cited]; the patterns are [inferred].

| Product | Channel | Trigger | The wow | What fails |
|---|---|---|---|---|
| Harvey for Outlook | Outlook add-in | User, plus optional inbox search that surfaces "a filing due today" | Replies from the matter's documents, redlines, client style; Harvey "never sends an email on its own" [cited: [Harvey](https://www.harvey.ai/blog/the-new-harvey-for-outlook)] | Usage disputed; no independent study |
| Clio Manage AI | Practice-management system | Matter events (task done, upload, stage change) | A draft client update appears without a request; AI follows matter permissions; 90-day AI event log [cited: [Clio help](https://help.clio.com/hc/en-us/articles/29658448391067), [Clio AI](https://help.clio.com/hc/en-au/articles/41990965598491-AI-Features-in-Clio-Manage)] | Price unclear |
| Legora, CoCounsel, DeepIP | Word and Outlook add-ins | User | Playbook redlines in Word; DeepIP scores examiner arguments: argue or amend [cited: [LawNext](https://www.lawnext.com/2024/08/davinci-rebrands-as-deepip-and-announces-general-availability-of-its-ai-copilot-for-patent-prosecution.html)] | Vendor claims only |
| Solve Intelligence | Web editor, Word output | User | Pulls EPO and DPMA file wrappers; applies local amendment format [cited: [Solve](https://www.solveintelligence.com/capabilities/patent-prosecution)] | A separate tool |
| Rowan Patents | Desktop | User | Local model; "no data is transmitted out of your system" [cited: [Clarivate](https://clarivate.com/intellectual-property/lp/rowan-patents/)] | Limited prior-art help |
| Anaqua AQX, Clarivate Docket | IP management system | Office e-notice, inbound mail | Auto-docketing [cited] | No accuracy data; EPO late |
| Copilot "Prioritize my inbox" | Outlook | Each new mail | A few plain-language rules [cited: [Microsoft](https://support.microsoft.com/en-US/Outlook/copilot-outlook/prioritize-my-inbox)] | New mail only |
| Teams Facilitator, channel agent | Teams | Meeting, @mention | Live notes; an agent per channel [cited, secondary] | Copilot licence; preview |
| Granola; Otter, Fireflies | Desktop app; bot in meetings | User starts a note; calendar | No bot, own notes merged with transcript [cited: [Granola](https://docs.granola.ai/help-center/taking-notes/transcription)] | Class action on consent against Otter; Fireflies bot joins every meeting by default [cited, secondary; [Fireflies guide](https://guide.fireflies.ai/articles/5074225515)] |
| Superhuman | Email client | Each mail | One-line summary above each thread; replies in the user's voice [cited: [Superhuman](https://superhuman.com/ai)] | A separate client |
| Cursor in Slack, Linear agents | Chat thread, issue | @mention, assignment, triage rule | A thread becomes a pull request; "delegation" with a human owner [cited: [Linear](https://linear.app/docs/agents-in-linear)] | Sometimes a plan and no result |

**What makes the wow** [inferred from the table]: (1) the result is already in the place of work; (2) a work event starts it, not a prompt; (3) it is grounded in the firm's own matter; (4) the user states rules in plain words; (5) the person stays accountable and sends; (6) the output is specific domain work, not general chat; (7) data stays local where the market expects it.

**What fails** [cited in note B, pattern inferred]: pilots with high satisfaction and no measured gain (UK government: 26 minutes a day, self-reported [cited: [gov.uk](https://www.gov.uk/government/publications/microsoft-365-copilot-experiment-cross-government-findings-report/microsoft-365-copilot-experiment-cross-government-findings-report-html)]; Australian Treasury: good for basic admin, weak for complex work [cited: [Treasury](https://evaluation.treasury.gov.au/publications/evaluation-generative-artificial-intelligence)]); oversharing that stops rollouts (67 % delayed Copilot over SharePoint risk [cited, secondary: [IT Brief](https://itbrief.news/story/two-thirds-of-firms-delay-copilot-over-sharepoint-risks)]); "another tool" (37 % of law firms cannot fit AI into their workflows [cited: [Wolters Kluwer 2024](https://www.wolterskluwer.com/en-gb/news/wolters-kluwer-2024-future-ready-lawyer-survey)]); recording without consent; one notice per event. In patent firms, AI use is mostly translation (63 %) and search (38 %), drafting only about 19 % [cited: [FICPI 2024](https://ficpi.org/node/43027)]: the daily work is not yet touched.

## 4. Microsoft 365 for a self-hosted server

Every option talks to the firm's own Microsoft 365 tenant. The question is the network direction [cited unless marked; sources in note B].

| Option | Direction | Use | Facts |
|---|---|---|---|
| Graph delta query on one mailbox | Outbound only | Mail as an event | Per folder, stores a `deltaLink`; the latency is the poll interval [cited: [delta query](https://learn.microsoft.com/en-us/Graph/delta-query-messages)] |
| Exchange RBAC for Applications | Configuration | Limit the app to one mailbox | Scopes an application role such as Mail.Read to selected mailboxes; changes take 30 minutes to 2 hours; the app must not also hold tenant-wide Mail.Read [cited: [limit mailbox access](https://learn.microsoft.com/graph/auth-limit-mailbox-access)] |
| Graph send mail, create draft | Outbound only | Reply from the AI mailbox; a draft in the attorney's Drafts | Outbound call [inferred] |
| Teams Workflows webhook | Outbound only | A card in a channel or chat | Replaces the retired Office 365 connectors [cited: [Microsoft 365 dev blog](https://devblogs.microsoft.com/microsoft365dev/retirement-of-office-365-connectors-within-microsoft-teams/)]; one way, and content passes through Power Automate in the tenant [inferred] |
| Teams activity feed notification | Outbound only | A native Teams notice that opens a tab | Needs a Teams app manifest installed for the user; no bot listed as a requirement [cited: [activity feed](https://learn.microsoft.com/en-us/graph/teams-send-activityfeednotifications)] |
| Outlook or Word add-in, Teams tab | The user's client loads a page from the firm host | FlowLeap inside Outlook, Word, Teams | Add-ins "can be hosted on any web server platform" with trusted HTTPS [cited: [add-in requirements](https://learn.microsoft.com/en-us/office/dev/add-ins/concepts/requirements-for-running-office-add-ins)]; an intranet host works only inside the network or tailnet [inferred] |
| Graph webhooks | Inbound | Faster mail events | Need "a publicly accessible, HTTPS-secured endpoint"; dropped notifications "can't be recovered" [cited: [webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks)] |
| Teams bot | Inbound | Two-way chat with the agent in Teams (#122) | Messages come from Microsoft's Bot Connector; network isolation only for Direct Line, not Teams [cited: [Q&A](https://learn.microsoft.com/en-us/answers/questions/2263616/is-it-possible-to-integrate-azure-bot-with-teams-w)]. So a bot needs a public endpoint in a DMZ [inferred] |

**Conclusion** [inferred]: a firm host on a tailnet can read one chosen mailbox, reply to staff, write drafts, and give Teams notices, all outbound. A two-way Teams bot needs a public endpoint and is a later, separate decision. Email is the first channel; Teams notices and a Teams tab come second; the Teams bot comes last.

## 5. What FlowLeap has, and the gap

| Has (2026-11-03) | Source |
|---|---|
| One isolated runtime per attorney, Entra sign-in, model gateway with a budget per attorney, sandboxed shell | ADR 0001 decisions 3 to 6; roadmap |
| Register watch: daily EP and US register read without a model, a run only on a new event, a new chat per run, Needs review | `packages/host/flowleap-routines/README.md`; #44, #45 |
| Office action analysis method (`recipe-office-action-response`), 13 of 13 live checks; office action board (#81); deliverables with an evidence ledger | flowleap-methods; #46, #81 |
| 15 methods, including claim drafting, invention disclosure, maintenance fees, prior art, FTO | [flowleap-methods](https://github.com/flowleap-ai/flowleap-methods) |
| Agent builder ("Only me"), dashboard, admin console, budgets | #55, #60, #34 |
| Patent data: EPO OPS and Register events, USPTO ODP with office action text, PATSTAT | connectors; [data connectors research](2026-11-01-data-connectors-research.md) |
| `packages/experimental/webhook`: a verified external event starts a new Session | #122 text |
| Planned: Decisions and observe mode (#135), one Ticket per matter event with a Mandate (#136), stages on Needs review (#137), email notices for administrators by SMTP (#119), MyEPO API read-only (#154), matter memory study (#123), Teams study (#122) | tickets |

**The gap** [inferred]:

1. **No event from the firm reaches FlowLeap.** The register watch sees public events, but not the letter. For EP, no tool serves the text of an EPO communication; the office action method needs the letter as a file (`recipe-office-action-response`, Step 1). The letter is in the EPO Mailbox, in PATORG and in Outlook.
2. **No result reaches a person outside the app.** Needs review is inside FlowLeap. ADR decision 21 allows drafts in the attorney's Drafts, but the Microsoft 365 plugin and the token broker are not built.
3. **No matter.** FlowLeap knows applications and chats, not matters with a responsible attorney, a client and a team (#123).
4. **A routine runs only while the runtime is awake.** The wake API is "later" in decision 27.

## 6. The augmented firm

### 6.1 Design rules [proposal]

1. **Event in, draft out, person decides.** Every concept starts from a firm event and ends in a draft that a named person accepts, edits or rejects. This is ADR decision 27, taken to the firm's own events.
2. **On top of the docket, never the docket.** FlowLeap never creates, moves or deletes a deadline in PATORG. It proposes and checks. The BGH and the EPO put that act on a person.
3. **In the channel people already use.** Outlook first, Teams second, the FlowLeap app for the work itself.
4. **Nothing leaves the firm without a person.** Mail to clients, offices and associates is always a draft in the attorney's Drafts (decision 21). Only internal notices to firm members go out automatically (decision D1 in section 7.3).
5. **One matter, one wall.** A run works in the runtime of the responsible attorney, sees only that matter, and writes to that attorney or the matter team. A Teams channel or a group mail never gets client content unless every member is on the matter.
6. **Batch, rank, stay quiet.** One brief per day and one reply per forwarded letter, not one notice per event.
7. **Show the source, and measure.** Every claim links to its source; every run records a Decision and the person's result, so the firm sees its accept rate (#123).

### 6.2 The spine: one event pipeline [proposal]

All concepts use one pipeline, which joins the docket agent study (#135 to #138) with the firm's channels:

```
 sources                     intake (control plane)            work (attorney runtime)        out (channels)
 AI mailbox (Graph delta) ─┐  gate: code table, no model        run chat with Mandate          reply mail to the sender
 register watch ───────────┤  match: application no. → matter  method (skill) from the pack   draft in attorney's Drafts
 MyEPO API (#154) ─────────┤  route: responsible attorney      deliverable + evidence ledger  morning brief
 PATORG adapter (later) ───┤  Decision: accept / observe       Needs review, office board     Teams notice (later)
 Teams, meetings (later) ──┘  audit record                     accept or edit = result        dashboard
```

The intake runs in the control plane because a firm mailbox is not one attorney's. This is the "firm-level router" of the docket agent study (section 4.2), brought forward with a minimal matter rule: the application number in the letter, and the sender as the responsible attorney until #123 gives a matter record.

### 6.3 The concepts

Each concept has: user and moment; before and after; the wow; the value; data and systems; confidentiality and professional rules; what FlowLeap has; what is missing; the size (S up to 1 week, M 1 to 3 weeks, L more than 3 weeks, for one or two engineers). Value figures are [proposal] estimates to test in the pilot, not measurements.

#### Concept 1. The AI colleague's mailbox: "forward it to FlowLeap"

- **User and moment.** Any attorney or PAFA, the moment they would forward a letter or a question to a colleague.
- **Before.** Frau Klein downloads a Rule 71(3) communication and forwards it to Dr. Weber with "bitte prüfen". Dr. Weber opens it at 16:00 between calls, reads the claims, and starts the client letter the next day.
- **After.** Frau Klein adds `ki@kanzlei.de` in Cc. When Dr. Weber opens the mail, the reply from FlowLeap is already below it: the summary, the text that the EPO intends to grant compared with the last filed claims, the four-month period proposal, the draft report to the client, and a draft instruction for fees and translations.
- **The wow.** Nothing new to learn. The AI acts like a colleague: you forward it work, it answers in your inbox.
- **Value.** Same-day first look for every forwarded letter; the first draft of the work before the attorney starts [proposal]. Hours: section 7.4 asks the firm to measure.
- **Data and systems.** One Exchange mailbox; an Entra app with Mail.Read and Mail.Send scoped to that mailbox by RBAC for Applications; Graph delta polling (outbound only); the control plane; the attorney runtimes.
- **Confidentiality and rules.** The mail and the letter are already in the firm's Exchange [inferred]. The reply goes only to firm addresses (code allow-list). The run uses the sender's runtime, so the sender's access applies. Model provider contract under § 39c PAO and the firm's client consent policy (epi) are preconditions [inferred].
- **FlowLeap has.** Runtimes, Entra identity, methods, deliverables, the board, the webhook runtime that starts a Session from a verified event.
- **Missing.** The mail intake, the sender-to-runtime mapping, the wake of a sleeping runtime, the reply composer, a founder decision on internal mail (D1).
- **Size.** M.

#### Concept 2. The office letter that arrives already worked

- **User and moment.** The responsible attorney, on the day an EPO or DPMA letter arrives, without anyone forwarding it.
- **Before.** The letter waits in the EPO Mailbox until the PAFA downloads it, then in PATORG until the attorney opens the file.
- **After.** FlowLeap reads the firm's EPO Mailbox through the MyEPO API (#154) or a PATORG export folder. For each letter: type, matter, period proposal, the analysis with the method that fits (office action, Rule 71(3), summons, search opinion, loss of rights), the client report draft, and the instruction draft. The PAFA still dockets in PATORG; FlowLeap's period proposal is the second opinion.
- **The wow.** "The EPO sent it at 9:00. At 9:20 my analysis and my client letter were waiting."
- **Value.** Removes the queue between arrival and first look; turns the four-month period into four usable months [proposal].
- **Data and systems.** MyEPO API B2B credentials of the firm (#154), DPMA mailbox (no API found; a folder export is likely [inferred]), PATORG documents (adapter).
- **Confidentiality and rules.** The Mailbox is company-wide [cited], so FlowLeap must route each letter to the matter's attorney and nobody else. Deadline proposals are never written to the docket.
- **FlowLeap has.** The office action method; the register watch for EP and US events; the board.
- **Missing.** #154; methods for Rule 71(3), summons and loss-of-rights letters; the matter record (#123) to find the attorney without a sender.
- **Size.** L. Through concept 1 (a person forwards) it is M.

#### Concept 3. Deadline second check (Fristen-Gegenkontrolle)

- **User and moment.** The partner who owns the deadline system; the PAFA after each docket entry; everyone before a deletion.
- **Before.** A second person checks the docket by hand, or no one does in a small firm. A misread associate letter can delete a validation deadline (BGH X ZB 17/12).
- **After.** Every day FlowLeap computes the periods that follow from the office data (EP Register events, MyEPO due dates, the letters it has read) and compares them with the PATORG docket. It reports differences: "EP 3 xxx xxx: Rule 71(3) communication dated 30.10.2026. PATORG has no deadline for it." Before a deletion it shows the evidence. It never changes the docket. It starts in observe mode (#135).
- **The wow.** "The system found a deadline that we did not have." One such find pays for the product [proposal].
- **Value.** Risk: a lost right costs the patent; further processing costs a fee and two months [cited: R.135]. It also gives the firm the record that its system "normally works well" [cited: Guidelines E-VIII 3.2].
- **Data and systems.** EP Register events (have), MyEPO due dates (#154), the PATORG docket (read-only adapter or the firm's export), a period rule table per action type.
- **Confidentiality and rules.** Only docket data and public register data. Liability: FlowLeap must say "second check, not the docket" on every output [inferred]. Whether a second check by software counts as the "independent cross-check" is a question for the firm and its insurer (section 7.4).
- **FlowLeap has.** The register reader, "Needs review", the action types reference in the office action method.
- **Missing.** The PATORG read, MyEPO, a tested period rule table (R.131, R.134 holidays), the difference report.
- **Size.** M with an export file from PATORG; L with an adapter.

#### Concept 4. Morning brief for each role

- **User and moment.** Each person at 7:30, by mail (later in Teams).
- **Before.** Each person opens the EPO Mailbox, PATORG lists and the inbox, and builds the day in their head.
- **After.** One mail per person. The attorney: "3 letters worked overnight, 2 drafts wait for you, 1 client has not answered in 3 weeks (EP 3 xxx, period ends in 19 days)". The PAFA: "5 new letters, 4 matched, 1 without a matter; 2 period proposals differ from the docket". The partner: the differences, the open items by attorney, the budget. The trainee: drafts with review comments.
- **The wow.** The day is prepared before you sit down.
- **Value.** Fewer missed follow-ups; one notice instead of many (section 3) [proposal].
- **Data and systems.** The Decisions and Tickets of #135 to #137, Needs review, the register watch, concept 3, the mail channel.
- **Confidentiality and rules.** Each brief holds only that person's matters. The partner's brief shows the firm's open items, which the partner may see [inferred].
- **FlowLeap has.** Needs review, the dashboard data, the scheduler.
- **Missing.** Roles beyond attorney and administrator; a matter-to-person map; the brief composer.
- **Size.** M.

#### Concept 5. Client report letters for every office event

- **User and moment.** The attorney after an office event; the PAFA for routine reports; the client's in-house IP team as the reader.
- **Before.** The attorney writes the office action report, often in English for a German client's foreign group, and staff fill the routine templates.
- **After.** For each event FlowLeap drafts the report in the firm's house style and the client's language: what happened, what it means, the options with a recommendation, the date by which the firm needs instructions, and, for renewals, data for the keep-or-drop decision (family, citations from PATSTAT, remaining term). The draft is a Word file and, with the Microsoft 365 plugin, a draft in the attorney's Drafts.
- **The wow.** "The letter to the client is already in my Drafts, in our style."
- **Value.** The OA report is attorney time on every substantive action; routine reports are many and repeated [inferred]. The size of the saving is a pilot measurement.
- **Data and systems.** House style (the firm skills library, #193), client language and preferences (matter record, #123), templates, the M365 plugin for drafts.
- **Confidentiality and rules.** The attorney sends (decision 21). Client style records are matter or client data and need walls [inferred from the Knowledge Pool design].
- **FlowLeap has.** The office action analysis, the maintenance fees method, deliverables, Word export on the board (planned in #81).
- **Missing.** A report-letter method and the firm's templates; the M365 drafts.
- **Size.** M.

#### Concept 6. Handover cards between attorney, formalities staff and trainee

- **User and moment.** The attorney who decides; the PAFA who executes; the trainee who drafts.
- **Before.** "Bitte Antwort einreichen, Ansprüche wie in v3, Anspruchsgebühren zahlen" in an email. The PAFA asks back which file and which fee.
- **After.** The attorney answers the reply or the board with one sentence. FlowLeap turns it into a card for the PAFA: the documents, the forms, the fees from a fee table (#153), the period, the steps in Online Filing 2.0, and a "done" button that records the receipt. For a trainee draft, the attorney's corrections become a review note that the trainee can learn from.
- **The wow.** A one-line instruction becomes a complete, checkable task.
- **Value.** Fewer questions back, fewer wrong filings [proposal].
- **Data and systems.** The run chat, the matter record, fee tables, Needs review stages (#137).
- **Confidentiality and rules.** The PAFA works under the attorney's supervision [cited: epi Code Art. 3(e)]; the card records who instructed whom, which supports the duty to instruct [inferred].
- **FlowLeap has.** Needs review, stages planned in #137.
- **Missing.** Roles and shared work items between runtimes; fee tables.
- **Size.** M.

#### Concept 7. Matter memory: "what did we argue in this family?"

- **User and moment.** An attorney before a response, a hearing or an opposition; a new colleague on an old matter.
- **Before.** Find the colleague who did the case, or read the old file.
- **After.** Ask in FlowLeap, Outlook or Teams. The answer cites the firm's own past responses and reports for the family and, after publication, the public EP file [cited for inspection: Art. 128(4) EPC], with each statement tied to its document.
- **The wow.** The firm's memory answers in seconds, with sources.
- **Value.** Consistent arguments across a family; faster start on old matters [proposal].
- **Data and systems.** The Knowledge Pool (phase D), the DMS or PATORG documents, EP Register documents (no tool serves them today).
- **Confidentiality and rules.** The highest risk: client data across matters. Walls per client and matter, as the Knowledge Pool design says; a self-learning tool needs client consent [cited in the Knowledge Pool design: ABA Opinion 512]. EPO terms for automated access to Register documents must be read first [inferred].
- **FlowLeap has.** The Knowledge Pool design, the evidence ledger.
- **Missing.** Knowledge v1 (phase D), a document source, walls from Entra groups.
- **Size.** L.

#### Concept 8. Foreign associate desk

- **User and moment.** The PAFA and the attorney who instruct and track foreign associates for filings and validations.
- **Before.** Instruction letters by hand; replies, reports and invoices as free email and PDF in many languages; the BGH case shows the risk.
- **After.** FlowLeap drafts instruction letters per country, tracks each acknowledgment, reads associate letters and invoices, shows any deadline in them beside the docket (concept 3), and chases a missing acknowledgment by a draft.
- **The wow.** Every associate letter is read, linked and checked on the day it arrives.
- **Value.** The stream that PatOrg's own AI targets [cited]; risk reduction on validation deadlines [inferred].
- **Data and systems.** The AI mailbox or the firm's associate mail, country rules for validation and translation, the docket.
- **Confidentiality and rules.** Associates are outside the firm; FlowLeap only drafts (decision 21).
- **FlowLeap has.** Concept 1 as the intake; OCR.
- **Missing.** Country rules; associate records; invoice reading.
- **Size.** L. PATORG already reads associate invoices [cited], so start with letters and deadlines, not invoices [proposal].

#### Concept 9. Call and meeting notes into the matter

- **User and moment.** The attorney after an inventor interview or a client call.
- **Before.** Notes in a notebook or in Word; the Aktennotiz is written later or not at all.
- **After.** The attorney forwards the Teams recap or dictates three sentences to the AI mailbox. FlowLeap writes the Aktennotiz, the decisions and the tasks, and files them with the matter. For an invention disclosure meeting, it fills the disclosure method's form and lists the open questions for the inventor.
- **The wow.** The file note writes itself from what you already have.
- **Value.** Complete file notes; faster first draft after an inventor meeting [proposal].
- **Data and systems.** Teams transcripts (the firm's own Copilot or Teams recording), the AI mailbox, the invention disclosure method.
- **Confidentiality and rules.** Recording needs consent; FlowLeap never joins a meeting by itself (section 3: Otter, Fireflies) [proposal]. Inventor disclosures are highly confidential before filing [inferred].
- **FlowLeap has.** The invention disclosure method; concept 1 as the intake.
- **Missing.** Matter filing (#123 or the DMS); transcript intake.
- **Size.** M.

### 6.4 What the AI never does [proposal]

Send to anyone outside the firm; file at an office; pay a fee; create, move or delete a deadline in the docket; join or record a meeting by itself; post client content to a channel whose members are not all on the matter; act for a person who is not a firm user.

## 7. Recommendation

### 7.1 The first slice: "Forward the EPO letter to FlowLeap" [proposal]

**What it is.** Concept 1 with the office action method as the first worked type, plus a register nudge. It is the smallest thing that puts the AI into the daily handover, and it uses what exists.

**The 3-minute demo.**

- *0:00, the setting.* A 20-person firm in Munich. Dr. Anna Weber is a patent attorney. Frau Klein is the PAFA. Their firm uses Outlook and PATORG. Nothing in their work changes except one address in the Cc line.
- *0:20, the event.* At 8:05 Frau Klein downloads a communication under Art. 94(3) EPC for a client's application from the EPO Mailbox into PATORG, as every day. She forwards the PDF to Anna, as every day, and this time adds `ki@kanzlei.de` in Cc. She dockets the period in PATORG.
- *0:45, the reply.* At 8:14 a reply from "FlowLeap" is in Anna's and Frau Klein's inboxes, in the same thread: "EP 3 xxx xxx, Art. 94(3) communication of 03.11.2026. Three objections: Art. 84 on claim 1, Art. 56 over D1 with D2, Art. 123(2) on claim 7. Recommendation: amend claim 1 with the feature of claim 4 (basis: page 12, lines 3 to 9) and argue inventive step against D2. Period proposal: four months from the document date, 03.03.2027. Second check against your docket: please confirm in PATORG. Attached: analysis (Word), draft report to the client in German (Word). Open the board." The mail ends with the review line of the method: AI-assisted analysis, not legal advice, nothing filed or sent.
- *1:30, the work.* Anna clicks the link. The office action board opens on the firm host: each objection with the examiner's text, the cited passage of D1, the claim element, and the response options. She changes one recommendation and clicks Export Word.
- *2:10, the client.* She opens the draft report, changes one sentence, and sends it from Outlook herself.
- *2:30, the proactive moment.* At 8:30 a second mail arrives: "EP 3 yyy yyy: the European Patent Register shows a communication under Rule 71(3) EPC dated 30.10.2026. I have not seen this letter. Forward it to me, or answer 'handled'." Anna forwards it from PATORG. The firm sees that FlowLeap watches its matters and not only answers.
- *3:00, the close.* "You did not open a new tool. You forwarded a mail. The AI did the first draft of the handover, and every decision stayed with you."

**What it reuses.** The office action method (13 of 13 live), the register watch and its run chats, deliverables with the evidence ledger, the office action board, Needs review, Entra identity, one runtime per attorney, the gateway budget, the webhook runtime.

**What it builds** (estimate for two engineers, 1.5 to 2 weeks) [proposal]:

| Part | Where | Size |
|---|---|---|
| Mail intake: Graph delta polling of one mailbox, attachments saved, sender mapped to an Entra user, application number read from the subject or the PDF, one Decision and one audit record per mail | flowleap-os control plane | M |
| Start a run: wake the sender's runtime and post a signed event to the webhook runtime, which opens a run chat with the Mandate ("analyse and draft; never file, send or pay") and the file as a logged `user/message` | flowleap-os spawner, harness webhook | S to M |
| Reply composer: reads the deliverable, sends one mail in the same thread to firm addresses only, with the Word files and the board link | flowleap-os | S |
| Client report letter: a report-letter section in the office action method or a small new method, with the independent Opus review of every new skill | flowleap-methods | S |
| Register nudge: the register watch on the attorney's matters, with "no letter seen" as a new run text | harness routines | S |
| Setup guide for the firm's IT: the shared mailbox, the app registration, RBAC for Applications | docs | S |

**The demo environment.** A separate demo host and a Microsoft 365 tenant that FlowLeap owns, with a real public EP application and its real communication PDF from the Register's public file. Not the test firm.

**Measures for the pilot.** Time from the mail to the reply; the share of replies that the attorney uses as is, with edits, or not at all (the accept rate of #123); the attorney's minutes on the report, before and after.

### 7.2 The sequence toward the augmented firm [proposal]

1. **The mailbox slice** (section 7.1). It opens the firm channel and proves the value on one workflow. 1.5 to 2 weeks.
2. **The morning brief, with observe mode.** Build #135 to #137 (Decisions, Tickets with a Mandate, stages) and send one brief per person per day by mail. Add methods for Rule 71(3), summons and search opinions. 2 to 3 weeks.
3. **Matters and handovers.** The matter record of #123 (responsible attorney, team, client, language), handover cards (concept 6), the Microsoft 365 plugin with the token broker for drafts in Drafts (concept 5), and the PAFA role. 3 to 5 weeks. This is the start of phase D.
4. **The second check.** The MyEPO API (#154) for the Mailbox and due dates, a read-only PATORG adapter or export (the founder's adapter rule), and the difference report in observe mode (concept 3). Then concept 2 without a person who forwards. 3 to 5 weeks; depends on EPO credentials and Brügmann's interface.
5. **Memory and Teams.** Knowledge v1 for "what did we argue" (concept 7); a Teams tab and activity feed notices (outbound); the two-way Teams bot (#122) only when a firm accepts a DMZ endpoint; call and meeting notes (concept 9); the foreign associate desk (concept 8).

**Relation to the roadmap** [inferred]. Steps 1 and 2 belong to the firm OS, not to the desktop. The roadmap of 2026-11-01 puts the desktop (D0, D1) before phases B and C "unless a pilot firm gives a start date". The pilot firm is now real, so its date sets the order (roadmap decision 4). Steps 1 and 2 need a firm host and the firm's Microsoft 365, and the firm will ask about the audit trail (#35) and the web gate (#33) before it forwards client letters. So step 1 runs beside phase C, and the slice writes its own audit record per mail.

### 7.3 Decisions for the founder [proposal]

| # | Decision | Recommendation |
|---|---|---|
| D1 | ADR decision 21 says that FlowLeap never sends mail. May the AI mailbox send **internal** replies and briefs to firm members? | Yes, with a code-enforced allow-list of the firm's own domains, and only from the AI mailbox, never in a person's name. Mail to clients, offices and associates stays a draft. Record it as an amendment to decision 21. |
| D2 | Decision 21 rejected firm-wide application permissions. May the intake use an application permission **scoped to one mailbox** by RBAC for Applications? | Yes. It is not firm-wide, it is outbound only, and the firm's IT sees the scope in Exchange. |
| D3 | The intake in the control plane, before #123 | Yes, with the minimal matter rule (application number, sender as attorney). It is the firm-level router of the docket agent study, brought forward. |
| D4 | Positioning against PATORG | "On top of PATORG": FlowLeap reads, drafts and checks, PATORG keeps the docket. Never write a deadline. |
| D5 | The first slice and the order | The mailbox slice first, beside phase C, planned back from the pilot firm's date. |

### 7.4 Questions for the pilot firm

Only a real firm can answer these. Ask them before the slice is built, and measure the times during the pilot.

**Systems**

1. Which PATORG version and set-up (on-premise or PatOrg Cloud)? Does PATORG import your EPO Mailbox, and do you use its AI features?
2. Who opens the EPO Mailbox and the DPMA mailbox each day, and when? Do you use the MyEPO API or download by hand?
3. How does a letter reach the attorney today: a PATORG workflow, a forwarded mail, a printout?
4. Do you use Microsoft 365 with Exchange Online and Teams? Does your IT allow an app registration scoped to one shared mailbox?
5. Where do documents live: the PATORG DMS, a file share, SharePoint?

**Work and time**

6. How long from arrival to the docket entry, and to the attorney's first look?
7. How much time per week goes to: intake and docketing; routine reports; office action reports; foreign associate mail; invoices?
8. What does a client report look like: a template, which languages, how long? How do instructions come back?
9. How do handovers between attorney, PAFA and trainee happen today: email, PATORG tasks, Teams, at the desk?
10. Are file notes (Aktennotizen) written for calls and meetings, and where are they kept?
11. Are renewals outsourced, and to whom?
12. How are deadlines with foreign associates agreed?

**Deadlines and liability**

13. How does your second check of deadlines work, and is it a written instruction? Who may delete or change a deadline?
14. Would a software second check count for you as part of the "independent cross-check"? What does your professional liability insurer say?

**Confidentiality and consent**

15. Do your clients have clauses on AI use or on service providers? Do you have an AI policy after the epi guidelines?
16. Which model provider and region is acceptable for client data under § 39c PAO, and which needs a local model?
17. Which people may see which matters? Are there ethical walls today, and where are they recorded?

**The wow**

18. Which daily task, if it were done when you arrive, would you show to a colleague?

## 8. Sources

Primary and secondary sources, with their labels, are in the two research notes of 2026-11-03 (note A: firm work; note B: AI in work). The sources cited in this document:

- EPO: [OJ 2023 A29](https://www.epo.org/en/legal/official-journal/2023/03/a29), [OJ 2023 A49](https://www.epo.org/en/legal/official-journal/2023/05/a49), [OJ 2025 A53](https://www.epo.org/en/legal/official-journal/2025/07/a53), [OJ 2025 A42, epi Code](https://www.epo.org/en/legal/official-journal/2025/06/a42), [MyEPO Mailbox feature guide](https://link.epo.org/web/myepo-services/interact/en-myepo-feature-guide-handling-mailbox-communications.pdf), [monitoring services](https://epo.org/en/searching-for-patents/helpful-resources/patent-knowledge-news/monitoring-services-european-patent), [Guidelines E-VIII 1.2](https://www.epo.org/en/legal/guidelines-epc/2025/e_viii_1_2.html), [Guidelines E-VIII 3.2](https://www.epo.org/en/legal/guidelines-epc/2025/e_viii_3_2.html), EPC [Art. 128](https://www.epo.org/en/legal/epc/2020/a128.html), [R.51](https://www.epo.org/en/legal/epc/2020/r51.html), [R.71](https://www.epo.org/en/legal/epc/2020/r71.html), [R.135](https://www.epo.org/en/legal/epc/2020/r135.html), [R.136](https://www.epo.org/en/legal/epc/2020/r136.html), [R.161](https://www.epo.org/en/legal/epc/2020/r161.html).
- DPMA and German law: [DPMAdirektPro consent flyer](https://dpma.de/docs/dpma/veroeffentlichungen/flyer/dpmadirektpro_einwilligung.pdf), [§ 7 PAO](https://www.gesetze-im-internet.de/patanwo/__7.html), [§ 39a PAO](https://www.gesetze-im-internet.de/patanwo/__39a.html), [§ 39c PAO](https://www.gesetze-im-internet.de/patanwo/__39c.html), [§ 203 StGB](https://www.gesetze-im-internet.de/stgb/__203.html), [§ 6 ArbnErfG](https://www.gesetze-im-internet.de/arbnerfg/__6.html), [ReNoPat-AusbV](https://www.gesetze-im-internet.de/renopatausbv_2015/BJNR149000014.html), [BIBB PAFA profile](https://www.bibb.de/dienst/berufesuche/de/index_berufesuche.php/certificate_supplement/en/patentanwaltsfachangestellter_e.pdf), BGH X ZB 17/12 through [Betriebs-Berater](https://betriebs-berater.ruw.de/wirtschaftsrecht/urteile/Fristueberwachung-durch-Kanzleimitarbeiter-18890) (secondary).
- Vendors: [PatOrg](https://patorg.com/), [PatOrg productivity](https://patorg.com/de/features/productivity), [PatOrg AI](https://patorg.com/de/features/ai), [Anaqua AQX data sheet](https://go.anaqua.com/en/aqx-document-auto-processing-data-sheet), [Clarivate Docket](https://clarivate.com/intellectual-property/ip-management-software/docket/), [Rowan Patents](https://clarivate.com/intellectual-property/lp/rowan-patents/), [Solve Intelligence](https://www.solveintelligence.com/capabilities/patent-prosecution), [Harvey for Outlook](https://www.harvey.ai/blog/the-new-harvey-for-outlook), [Clio AI](https://help.clio.com/hc/en-us/articles/29658448391067), [Linear agents](https://linear.app/docs/agents-in-linear), [Superhuman](https://superhuman.com/ai), [Granola](https://docs.granola.ai/help-center/taking-notes/transcription).
- Microsoft: [delta query for messages](https://learn.microsoft.com/en-us/Graph/delta-query-messages), [limit mailbox access](https://learn.microsoft.com/graph/auth-limit-mailbox-access), [webhook delivery](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks), [activity feed notifications](https://learn.microsoft.com/en-us/graph/teams-send-activityfeednotifications), [add-in requirements](https://learn.microsoft.com/en-us/office/dev/add-ins/concepts/requirements-for-running-office-add-ins), [retirement of Office 365 connectors](https://devblogs.microsoft.com/microsoft365dev/retirement-of-office-365-connectors-within-microsoft-teams/), [Prioritize my inbox](https://support.microsoft.com/en-US/Outlook/copilot-outlook/prioritize-my-inbox).
- Surveys and trials: [FICPI 2024](https://ficpi.org/node/43027), [Wolters Kluwer 2024](https://www.wolterskluwer.com/en-gb/news/wolters-kluwer-2024-future-ready-lawyer-survey), [UK Copilot experiment](https://www.gov.uk/government/publications/microsoft-365-copilot-experiment-cross-government-findings-report/microsoft-365-copilot-experiment-cross-government-findings-report-html), [Australian Treasury](https://evaluation.treasury.gov.au/publications/evaluation-generative-artificial-intelligence).
