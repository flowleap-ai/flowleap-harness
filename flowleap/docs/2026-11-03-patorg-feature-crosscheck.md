# PATORG features against the R tickets: a cross-check

Status: research for the founder, 2026-11-03. It checks the [AI-native IPMS design](https://github.com/flowleap-ai/flowleap-harness/blob/claude/ipms-design-51bb4a/flowleap/docs/2026-11-03-ai-native-ipms-design.md) (PR 214) and [ADR 0002](https://github.com/flowleap-ai/flowleap-harness/blob/claude/ipms-design-51bb4a/flowleap/docs/adr/0002-system-of-record.md) and the tickets #215 to #246 against the public description of PATORG (Brügmann Software GmbH). No ticket was filed. The founder decides.

**The goal.** A firm that leaves PATORG must lose no job that PATORG does for it today. This document lists the PATORG features that public sources name, maps each one to the R tickets and the design, and lists the gaps with a proposed ticket and phase.

**Labels.** Each feature is SOURCED (a public source names it; the quote is from that source) or INFERRED (our reasoning; no source names it). Each feature has one coverage mark: COVERED (a ticket or the design covers the job, sometimes in another way), PARTLY (the missing part is named), NOT COVERED, or OUT OF SCOPE (a design decision excludes it, and the row cites the decision). "Design 4.1" means section 4.1 of the design document. Issue numbers are on `flowleap-ai/flowleap-harness`. Quotes stay in German and have at most 15 words.

## Summary

- **Features found:** 86. 82 are SOURCED and 4 are INFERRED.
- **Coverage:** 37 COVERED, 38 PARTLY, 9 NOT COVERED, 2 OUT OF SCOPE.
- **What the R tickets cover well:** the docket and its deadline control, the e-file, intake of EPO and mailed letters with file-number matching, tasks, permissions and the change history, time and invoices, DATEV, annuity payment through providers, the client portal, backups and self-hosting.
- **The five most important gaps:**
  1. **Trademarks and designs.** PATORG keeps trademark files and trademark oppositions (P02). The design has patent rights only (design 4.1). A firm with a trademark practice cannot switch.
  2. **Core deadlines missing from rule set v1** [inferred]. The priority year, the PCT Article 19 and Chapter II periods and the EP validation period are not in design 5.4 or in #224 and #225 (P20).
  3. **Absence cover and escalation.** PATORG handles staff absence by configuration and has an alarm step in workflows (P18, P19). No ticket sends a deadline or a task to a deputy, or escalates an internal date that nobody acted on.
  4. **Outgoing office work.** PATORG prepares filings for EPO Online Filing and German office procedures (P23, P25). The design names a filing package (design 7.2), but no ticket builds it.
  5. **Money after the invoice, and reports.** PATORG has accounting functions, offers, budget warnings, a report generator and controlling (P58 to P66). The R tickets stop at the issued invoice and the DATEV file; no ticket covers receivables, payment reminders, cost estimates, client portfolio reports or management statistics.

## 1. Sources

| Id | Source | What it is |
|---|---|---|
| S1 | [patorg.com/de](https://www.patorg.com/de) | Vendor home page. The site is one Next.js application: its page data also holds the text of the system requirements, training topics and job adverts, which we read from the data served at this URL |
| S2 | [patorg.com/de/features/ai](https://www.patorg.com/de/features/ai) | Vendor page: AI features |
| S3 | [patorg.com/de/for-who/for-law-firms](https://www.patorg.com/de/for-who/for-law-firms) | Vendor page: for law firms |
| S4 | [patorg.com/de/features/minimize-risks](https://www.patorg.com/de/features/minimize-risks) | Vendor page: deadlines, tasks, permissions, change history |
| S5 | [patorg.com/de/features/choose-partner](https://www.patorg.com/de/features/choose-partner) | Vendor page: service providers and DMS integrations |
| S6 | [patorg.com/de/features/productivity](https://www.patorg.com/de/features/productivity) | Vendor page: workflows, EPO and DPMA, mail import, controlling |
| S7 | [patorg.com/de/features/flexibility](https://www.patorg.com/de/features/flexibility) | Vendor page: personalisation, legal changes, absences |
| S8 | [patorg.com/de/features/impress-service](https://www.patorg.com/de/features/impress-service) | Vendor page: documents, reports, deadline rules, reminders |
| S9 | [patorg.com/de/for-who/annual-fee-management-for-law-firms](https://www.patorg.com/de/for-who/annual-fee-management-for-law-firms) | Vendor page: annual fees |
| S10 | [patorg.com/de/pattime](https://www.patorg.com/de/pattime) | Vendor page: PatTime time recording |
| S11 | [patorg.com/de/features/cloud](https://www.patorg.com/de/features/cloud) | Vendor page: PatOrg Cloud |
| S12 | [patorg.com/de/for-who/for-organizations](https://www.patorg.com/de/for-who/for-organizations) | Vendor page: for companies |
| S13 | [patorg.com/de/for-who/for-both](https://www.patorg.com/de/for-who/for-both) | Vendor page: link between a firm and its client |
| S14 | [patorg.com/de/inventions](https://www.patorg.com/de/inventions) | Vendor page: invention portal |
| S15 | [agorum: Detailansicht in PatOrg](https://www.agorum.com/documentation/detailansicht-in-patorg.html) | DMS vendor documentation |
| S16 | [agorum: Integration PatOrg IP](https://www.agorum.com/documentation/integration-patorg-ip.html) | DMS vendor documentation |
| S17 | [agorum: Mit Integration PatOrg IP Professional arbeiten](https://www.agorum.com/documentation/mit-integration-patorg-ip-professional-arbeiten.html) | DMS vendor documentation |
| S18 | [agorum: Bestandsdaten Migration PatOrg](https://www.agorum.com/documentation/bestandsdaten-migration-patorg.html) | DMS vendor documentation |
| S19 | [Universität Siegen, ZIMT: PatOrg](https://www.uni-siegen.de/en/zimt/patorg) | A university's deployment page |
| S20 | [G2: PatOrg 6](https://www.g2.com/products/patorg-6/reviews) | Software directory. The page returned HTTP 403; the quote in P04 is from the search engine's snippet of this page |

**Sources that we could not read.** G2 and TrustRadius returned HTTP 403. The PatOrg customer area (`/de/sign-in`), its changelogs and its brochures need a login; we did not try to get access. The site text says that the PatOrg forum is offline. The announcement of the CPA Global integration (legalitprofessionals.com) redirects to another domain; we did not read it. Job adverts that name PATORG (for example [Campusjäger 119817](https://www.campusjaeger.de/en/job/119817)) name it only for "elektronische Aktenführung" and add no feature.

**What no source names.** We found no public source that says PATORG does USPTO or WIPO e-filing, conflict checks, RVG or PAGebO fee calculation, XRechnung or ZUGFeRD, payment reminders (Mahnwesen), or a DATEV export. The vendor names "Finanzbuchhaltungssysteme" as an interface without a product name (P62). This document does not claim that PATORG has these features.

## 2. The features, by firm job

### 2.1 Matter and file management

| Id | PATORG feature | Source | Quote | Label | Coverage | Tickets and design | What is missing |
|---|---|---|---|---|---|---|---|
| P01 | One file management for many kinds of files | S1 | "Um Akten zu Patenten, Erfindungen und Marken genauso wie zu Einsprüchen, Widersprüchen" | SOURCED | PARTLY | #215, #230; design 4.1 (matter types prosecution, opposition, appeal, litigation support, advice) | Trademark, contract and project files (P02, P03) |
| P02 | Trademark files and trademark oppositions; "Markenverwaltung" is a keyword of the site | S1 | "Akten zu Patenten, Erfindungen und Marken" | SOURCED | NOT COVERED | Design 4.1 has no trademark or design right in the right union | Trademark and design rights, their deadlines and renewals |
| P03 | Contract and project files | S1 | "Einsprüchen, Widersprüchen, Verträgen, Projekten sowie anderen Vorgängen" | SOURCED | PARTLY | A matter of type advice can hold the work (design 4.1) | No contract entity with parties, terms and renewal or notice dates |
| P04 | Input masks per matter type and country | S20 | "input masks can be created special to matter type and country" | SOURCED | COVERED | The right type is a discriminated union (design 4.1, 4.2) | Nothing; FlowLeap reads facts from documents instead of masks |
| P05 | Personal start page, favourites, own filters and lists | S7 | "von der personalisierten Startseite mit Ihren Favoriten über angepasste Filter und Listen" | SOURCED | COVERED | #230, #242, #229 | Nothing |
| P06 | Filter and evaluate all data | S12 | "durch das Definieren individueller Filterungen und Listungen auswerten" | SOURCED | PARTLY | #242 (filters on documents), #230 (docket views); design 3.2 names `record_search` | No ticket for a full-text search over the record and the e-file across matters |
| P07 | Separate data sets in one system (Mandantenfähigkeit), also for an office-sharing group | S3 | "Mandantenfähigkeit gibt Ihnen die Freiheit, Ihre Daten aus organisatorischen Gründen" | SOURCED | PARTLY | Walls separate matters inside one firm (#227) | Two firms that share one host (Bürogemeinschaft) are not designed |
| P08 | Families of rights | S14 | "Information über eine sich potenziell entwickelnde Schutzrechtsfamilie" | SOURCED | COVERED | Design 4.1 (Family), #228 imports family links | Nothing |
| P09 | A file bundle to download (Aktenkoffer, with the agorum DMS) | S17 | "können Sie in agorum core pro zusätzlich Aktenkoffer erstellen" | SOURCED | PARTLY | #239 exports the whole record | No export of one matter as a bundle |

### 2.2 Parties and contacts

| Id | PATORG feature | Source | Quote | Label | Coverage | Tickets and design | What is missing |
|---|---|---|---|---|---|---|---|
| P10 | Person records from mail signatures with AI; missing public address data added | S2 | "E-Mail-Signaturen mit Hilfe von KI strukturieren, um daraus Personendatensätze zu erstellen" | SOURCED | PARTLY | Design 4.1 (Party); #228 proposes duplicates for merge | No ticket for party proposals from mail and letters |
| P11 | Communication rules per client: which message goes to which person | S3 | "Legen Sie flexibel für jeden Mandanten fest, welche Art von Kommunikation" | SOURCED | COVERED | #233; design 9.1 | Nothing |
| P12 | Inventor data and citations read from office letters into the file | S2 | "relevante Information wie Zeichen, Erfinderdaten, Fristen, Zitate" | SOURCED | PARTLY | #220 makes office events | No ticket writes inventors and cited documents into the record |

### 2.3 Deadline docketing (Fristen)

| Id | PATORG feature | Source | Quote | Label | Coverage | Tickets and design | What is missing |
|---|---|---|---|---|---|---|---|
| P13 | Deadline control | S4 | "Sicherheit im Umgang mit Fristen ist von essentieller Bedeutung" | SOURCED | COVERED | #216, #219, #224, #225, #226; design 5 | Nothing |
| P14 | Deadline rules that the firm configures by conditions; automatic calculation | S8 | "Regeln zur Notierung individuell und in Abhängigkeit spezifischer Bedingungen zu definieren" | SOURCED | COVERED | Rules are tested code with legal sources; the firm sets internal dates (design 5.1, 5.4; #224, #225, #226) | Nothing; other way on purpose (section 4) |
| P15 | Configuration changed at a legal effective date | S7 | "passen Sie Ihre Konfiguration mit Leichtigkeit zum Stichtag an gesetzliche Neuerungen an" | SOURCED | COVERED | Rule versions with effective dates (design 5.2; #216, #224) | Nothing |
| P16 | AI finds deadline text in documents, compares it with the docket, and dockets | S2 | "Abgleich mit notierten Fristen und gegebenenfalls Fristnotierung" | SOURCED | COVERED | #219, #220, #229; design 5.7 | Nothing |
| P17 | Reminder procedures per client with own internal dates and letters | S1 | "individuelle Erinnerungsverfahren nebst eigener Vorfristen und Schreiben" | SOURCED | PARTLY | #226 (internal dates as firm configuration); design 9.1 (instruction date per client) | Internal dates and reminder letters per client have no ticket |
| P18 | Alarm step in workflows ("Alarmierung", a training topic) | S1 | "Alarmierung" | SOURCED | PARTLY | #229 morning brief | The term is sourced, its meaning (escalation) is inferred. No escalation when an internal date passes with no act |
| P19 | Cover for staff who are absent | S7 | "kurzfriste Ausfälle von Fachpersonal zu meistern" | SOURCED | NOT COVERED | none | Deputies; tasks and deadlines of an absent person go to the deputy |
| P20 | The deadlines that every patent docket computes: priority year, PCT Art. 19 and Chapter II, EP validation after grant | none | none | INFERRED | NOT COVERED | Design 5.4 and #224, #225 list other rules | The priority year (Art. 87 EPC, Art. 4 Paris Convention), PCT R.46.1 and R.54bis.1, and the national validation periods. The attorney who signs `reviewedBy` must confirm the list |
| P21 | Deadlines of other countries | none | none | INFERRED | PARTLY | #241 (reported deadlines); design 5.6 step 2 | The country rule packs of R8 have no ticket |
| P22 | A printed deadline list when the system is down | none | none | INFERRED | PARTLY | Design 11 (Availability) names a nightly docket PDF | No ticket builds the nightly docket PDF |

### 2.4 Office communication (EPO, DPMA)

| Id | PATORG feature | Source | Quote | Label | Coverage | Tickets and design | What is missing |
|---|---|---|---|---|---|---|---|
| P23 | Filings through EPO Online Filing (Epoline), almost fully automated | S6 | "Einreichungen für alle Verfahren lassen sich mit PatOrg nahezu vollständig automatisieren." | SOURCED | PARTLY | Design 7.2 (filing package, "new"); #231 (task card with forms and fees) | The filing package has no ticket. The submit stays a person's act on purpose (ADR 0002 decision 6) |
| P24 | Import of incoming EPO documents through the EPO Mailbox | S6 | "Der Import eingehender Dokumente vom EPA erledigt sich von selbst" | SOURCED | COVERED | #154 (scope changed by F10); design 6.1 | Nothing |
| P25 | German office procedures: PATORG prepares the outgoing items ("Sendungserstellung") | S6 | "nimmt Ihnen PatOrg bei einigen oder gar allen deutschen amtlichen Verfahren" | SOURCED | PARTLY | #240 (DPMA letters in) | Outgoing DPMA items (DPMAdirektPro package) have no ticket. The source names "DPMAConnect"; which DPMA service it uses is not clear |
| P26 | Add-ins for Outlook, Chrome and Edge to import mail and documents | S6 | "PatOrgs Addins für Microsoft Outlook und die Web-Browser Chrome und Edge" | SOURCED | PARTLY | #220 (forward to the AI mailbox); design 3.2 row 16 ("later Outlook add-in") | No ticket for the Outlook add-in or "drag from Outlook" |
| P27 | File-number recognition in incoming mail, with a proposed match | S6 | "Eine intelligente Aktenzeichenerkennung identifiziert alle in eingehenden E-Mails genannten Akten" | SOURCED | COVERED | #220; design 6.2 | Nothing |
| P28 | AI reads office form letters | S2 | "Aus Formschreiben von Ämtern mit KI relevante Information" | SOURCED | COVERED | #220, #223; design 6 | Nothing |

### 2.5 Documents and templates

| Id | PATORG feature | Source | Quote | Label | Coverage | Tickets and design | What is missing |
|---|---|---|---|---|---|---|---|
| P29 | Documents and mails from Word, Excel and Outlook templates, in all languages, without SQL or VBA | S8 | "generieren Sie automatisch und vorlagengetreu Dokumente und E-Mails in allen Sprachen" | SOURCED | PARTLY | #217 (letter on the firm template), #233 (letters) | Excel form letters and mail templates have no ticket |
| P30 | Form letters with language variants, data fields, input dialogs and conditional text (training topics) | S1 | "Formbriefe mit Sprachvarianten" | SOURCED | PARTLY | #217, #233 | One template sent to many matters at once (a series letter) has no ticket |
| P31 | Documents filed with the file reference and metadata | S16 | "Dokumente mit Aktenbezug inklusive der Metadaten" | SOURCED | COVERED | #232 | Nothing |
| P32 | Document preview; the DMS detail view inside PATORG | S15 | "Die Detailansicht aus agorum core als Standardansicht in PatOrg" | SOURCED | COVERED | #242 (preview with source spans) | Nothing |
| P33 | Notes on a document for oneself or for others (DMS tab "Notizen") | S15 | "Notizen" | SOURCED | NOT COVERED | none | Notes and comments on documents and matters |
| P34 | DMS integration through CMIS (agorum, d.3, DocuWare) | S5 | "Integrationen der DM-Systeme agorum, d.3 und docuware (Bahe SmartWork)" | SOURCED | NOT COVERED | #232 is FlowLeap's own store; #228 imports documents from the PATORG export | A firm whose e-file is in a DMS needs an import from that DMS. S18 shows that the documents then leave PATORG through the DMS |
| P35 | Long-term archive that meets the legal rules for a paperless office | S5 | "Langzeitarchivierung und vor allem der Einhaltung aktueller gesetzlicher Vorgaben" | SOURCED | PARTLY | Content hashes and the hash chain (#215, #232, #238) | Retention periods per document class, a legal hold, and deletion after the period. Question P13 of design 13.3 is open |
| P36 | AI checks documents against rules and compares them | S2 | "Dokumente auf spezifische Eigenschaften hin analysieren" | SOURCED | COVERED | Methods (design 3.2 row 7); #217 (validate); #223 | Nothing |

### 2.6 Letters and correspondence

| Id | PATORG feature | Source | Quote | Label | Coverage | Tickets and design | What is missing |
|---|---|---|---|---|---|---|---|
| P37 | Webletters: web form letters that the recipient answers in the browser; replies processed automatically | S1 | "Webletter-Lösung ermöglicht das Generieren interaktiv beantwortbarer, web-basierter Formschreiben" | SOURCED | PARTLY | #244 (client instructions in the portal); #220 (free-text replies) | A structured answer path for associates and for clients without a portal account |
| P38 | AI builds interactive HTML form letters | S2 | "Erstellen Sie KI-unterstützt interaktive Formschreiben" | SOURCED | PARTLY | As P37 | As P37 |
| P39 | AI finds orders and dates in mail and makes tasks or notes | S2 | "E-Mails und andere Dokumente auf enthaltene Aufträge und Termine überprüfen" | SOURCED | COVERED | #220, #231, #241 | Nothing |
| P40 | Reminders to the people who must act, in time and per person | S8 | "Erinnern Sie mit PatOrg Ihre Leistungsempfänger rechtzeitig und individuell." | SOURCED | PARTLY | Design 9.1 (instruction date per client); #243 (annuity instructions) | No reminder when a client's instruction on an office action is late |

### 2.7 Annuities and renewals (Jahresgebühren)

| Id | PATORG feature | Source | Quote | Label | Coverage | Tickets and design | What is missing |
|---|---|---|---|---|---|---|---|
| P41 | Annual fee payment through Dennemeyer and Questel/PAVIS | S3 | "Mit den umfassenden Integrationen der Zahlungsdienstleister Dennemeyer und Questel/Pavis" | SOURCED | COVERED | #243 (provider plugin interface); F11 | Nothing |
| P42 | Renewal per right type and country through the office, a foreign associate or a provider | S1 | "direkt über das Amt, einen Auslandvertreter oder über einen Dienstleister" | SOURCED | PARTLY | #243 (provider, direct payment list) | The foreign associate route |
| P43 | Web or Excel reminder letters; the client's instruction is processed without retyping | S9 | "Weisungen können nach Erhalt automatisiert verarbeitet werden" | SOURCED | COVERED | #243, #244 | Nothing |
| P44 | Cost forecasts to clients for a period | S9 | "Informieren Sie als Kanzlei Ihre Mandantschaft regelmäßig über prognostische Kosten" | SOURCED | NOT COVERED | none | An annuity cost forecast per client and period |
| P45 | Live view of the provider's data per file: payment history, next date, expected cost | S9 | "Eingebettete Ansichten geben zur jeder Akte Auskunft über die Zahlungshistorie" | SOURCED | PARTLY | #243 | The provider plugin interface does not name a read of history and expected cost |
| P46 | Computed fee dates checked against the provider's dates | S9 | "errechnete Tax-Termine innerhalb der Erinnerungsprozesse automatisch mit den Dienstleistern abzugleichen" | SOURCED | PARTLY | #243 (the schedule equals the provider's list once) | A nightly reconciliation with differences in the morning brief |
| P47 | Provider receipts and invoices filed; invoices booked | S1 | "werden die Quittungen und Rechnungsdokumente in das Dokumentenmanagement abgelegt, Rechnungen eingebucht" | SOURCED | PARTLY | #237 (associate invoices to cost lines) | Provider receipts and provider invoices are not named |
| P48 | New rights and payment orders sent to the provider; checks of the bibliographic data | S1 | "Daten zu neuen Schutzrechten und Zahlungsaufträge direkt zu übermitteln" | SOURCED | PARTLY | #243 | Sending new rights to the provider, and the provider's error feedback |
| P49 | Validation and translation through Clarivate, Insperanto, iPify and RWS | S5 | "Integrationen für die Dienste von Clarivate, Insperanto, iPify und RWS." | SOURCED | NOT COVERED | none | Validation and translation orders after an EP grant |

### 2.8 Time recording and invoicing

| Id | PATORG feature | Source | Quote | Label | Coverage | Tickets and design | What is missing |
|---|---|---|---|---|---|---|---|
| P50 | Time recording on a PC or a phone, with project budgets and client fee agreements | S3 | "Zeichnen Sie Ihre Bearbeitungszeiten einfach auf - am PC oder mobil" | SOURCED | COVERED | #234; the phone PWA (design 12.3, phase E) | Nothing |
| P51 | Time to the minute or rounded, with breaks | S10 | "Erfassen Sie Tätigkeiten minutengenau oder gerundet – auch mit Unterbrechungen." | SOURCED | PARTLY | #234; design 8.1 (timer and day sheet) | Rounding units per fee agreement are not named |
| P52 | Templates and autocomplete for recurring activities | S10 | "Nutzen Sie Vorlagen für wiederkehrende Aufgaben und sparen Sie Zeit." | SOURCED | COVERED | #234 proposes entries from the work done | Nothing; other way (section 4) |
| P53 | AI corrects, extends or translates activity texts | S10 | "Korrigieren, erweitern oder übersetzen Sie Tätigkeitsbeschreibungen per KI" | SOURCED | COVERED | #234 | Nothing |
| P54 | Hourly rates proposed from the client's agreement | S10 | "Automatisches Vorschlagen von Stundensätzen durch Auswertung individueller Kundenvereinbarungen." | SOURCED | COVERED | #235 | Nothing |
| P55 | Start a timer by voice | S10 | "Tätigkeit auswählen oder per Spracheingabe starten" | SOURCED | NOT COVERED | none | Low need; measured review time replaces most timers (section 4) |
| P56 | Warnings when time or cost budgets overrun | S10 | "Warnungen, wenn Zeit- und oder Kostenbudgets aus dem Ruder zu laufen drohen" | SOURCED | PARTLY | Design 9.1 (cost cap per matter as a client rule) | Budgets and warnings have no ticket |
| P57 | Prices per client by criteria; agreements applied to offers and invoices | S1 | "Vereinbarungen automatisch bei der Erstellung von Angeboten und Rechnungen berücksichtigt" | SOURCED | PARTLY | #235 (fee agreements, invoices) | Offers and cost estimates to clients |
| P58 | Activity statements and invoice layouts per client | S7 | "Erinnerungsverfahren, Leistungsnachweise und Rechnungsaufbauten" | SOURCED | PARTLY | #235 | Invoice layouts and activity statements per client are not named |
| P59 | Accounting and bookkeeping functions | S1 | "Funktionen des Rechnungswesen und der Finanzbuchhaltung" | SOURCED | PARTLY | #236 (DATEV file), #235 (credit notes) | Incoming payments, open items and payment reminders |
| P60 | Interfaces to bookkeeping systems | S1 | "IP-Service-Anbieter wie auch Dokumentenmanagement- und Finanzbuchhaltungssysteme anschließen" | SOURCED | PARTLY | #236 | Only DATEV; other systems are open (ADR 0002, "Not decided here") |

### 2.9 Reports and statistics

| Id | PATORG feature | Source | Quote | Label | Coverage | Tickets and design | What is missing |
|---|---|---|---|---|---|---|---|
| P61 | Reports of any kind for clients and management | S8 | "Mit PatOrg sind Berichte jeder Art leicht erstellt." | SOURCED | PARTLY | #229 (morning brief); principle 9 (generated views, design 1.2) | Client portfolio reports and management reports have no ticket |
| P62 | Report generator with portfolio statistics | S12 | "Komplexere Berichte wie zum Beispiel Portfolio-Statistiken" | SOURCED | PARTLY | As P61 | As P61 |
| P63 | Controlling of revenue, costs and success measures, with Excel templates and charts | S6 | "Ihre Einnahmen und Kosten, genauso wie auch Indikatoren zur Messung des Geschäftserfolgs" | SOURCED | PARTLY | #234 (model cost per matter) | Revenue, work in progress and margin per client and attorney |
| P64 | Data and documents put together for management | S7 | "liefern Sie der Geschäftsführung oder anderen Abteilungen" | SOURCED | PARTLY | As P61 | As P61 |

### 2.10 Rights, audit, tasks and workflows

| Id | PATORG feature | Source | Quote | Label | Coverage | Tickets and design | What is missing |
|---|---|---|---|---|---|---|---|
| P65 | Permissions so that only authorised staff do certain actions | S4 | "bestimmte Aktionen nur von autorisiertem, fachkundigem Personal durchgeführt werden kann" | SOURCED | COVERED | #227, #231; change classes (design 4.3) | Nothing |
| P66 | Change history: who changed which data, when and how | S4 | "Vollziehen Sie nach, wer welche Daten zu welchem Zeitpunkt wie verändert hat" | SOURCED | COVERED | #215; design 11 | Nothing |
| P67 | Guided dialogs that prevent wrong input | S4 | "Geführte, kontextorientierte Assistenz vereinfacht die Arbeit und vermeidet Fehleingaben." | SOURCED | COVERED | #230 (decision queue); principle 1 (design 1.2) | Nothing; other way (section 4) |
| P68 | Tasks linked to files, deadlines, documents and invoices | S4 | "verwalten Sie komfortabel Ihre Aufgaben integriert mit Akten, Fristen, Dokumenten und Rechnungen" | SOURCED | COVERED | #231 | Nothing |
| P69 | Workflow management; almost every manual action can be a workflow step | S6 | "Nahezu alle manuell ausführbaren Aktionen können dabei auch in Workflows einbezogen" | SOURCED | COVERED | Design 7.1; #221, #136 | Nothing; other way (section 4) |
| P70 | Sample configuration with examples from practice | S6 | "PatOrgs Musterkonfiguration zeigt anhand vieler Beispiele aus der Praxis" | SOURCED | COVERED | Default triggers (design 7.1); the 15 methods of `flowleap-methods` | Nothing |
| P71 | Several tasks of one kind made with one click | S7 | "verschiedene Aufgaben bestimmter Art mit einem Klick anlegen" | SOURCED | COVERED | #231, #242 (bulk actions) | Nothing |
| P72 | Conflict check when a matter opens | none | none | INFERRED | COVERED | #227; design 4.4 | Nothing |

### 2.11 Data exchange, import, export and interfaces

| Id | PATORG feature | Source | Quote | Label | Coverage | Tickets and design | What is missing |
|---|---|---|---|---|---|---|---|
| P73 | System-to-system link between a firm and a client that both use PATORG, encrypted, with an optional release of each message | S13 | "Optional lässt sich auch eine manuelle Freigabe jeder Kommunikation einstellen." | SOURCED | NOT COVERED | Design 9.1 names a plugin for a client's IP system "later"; #244 is read and instruct | A data exchange with a client's IP system |
| P74 | An API for own solutions, for example an app | S1 | "hat PatOrg eine API parat! Entwickeln Sie damit eigene Lösungen" | SOURCED | PARTLY | #77 (MCP door, after R5; design 12.3) | #77 is not an R ticket, and it is not a plain API for firm scripts |
| P75 | AI reads invoices of foreign associates and providers that have no API | S2 | "insbesondere solche von Auslandsvertretern und Dienstleistern ohne API-Anbindung automatisiert einlesen" | SOURCED | COVERED | #237 | Nothing |
| P76 | A test system beside production | S11 | "richten Sie ein Testsystem ein" | SOURCED | PARTLY | #246 (demo firm with public data) | A test copy of the firm's own record, for training and for checks before an update |

### 2.12 Deployment

| Id | PATORG feature | Source | Quote | Label | Coverage | Tickets and design | What is missing |
|---|---|---|---|---|---|---|---|
| P77 | On-premise or in the firm's private cloud | S1 | "auch ohne größeren Wartungsaufwand auf Ihrer eigenen IT-Infrastruktur" | SOURCED | COVERED | ADR 0002 decision 8; `flowleap-os` | Nothing |
| P78 | PatOrg Cloud: virtual Windows workplaces as a service | S11 | "Die PatOrg Cloud ist eine private Desktop-as-a-Service-Lösung (DaaS)" | SOURCED | OUT OF SCOPE | ADR 0002 decision 8 (self-hosted, no FlowLeap backend) | Nothing on purpose |
| P79 | Daily automated backups with checks | S11 | "Wir führen automatisierte tägliche Backups auf separaten Systemen durch" | SOURCED | COVERED | #238; restic backups (design 2.3) | Nothing |
| P80 | Access through VPN or two-factor sign-in | S11 | "Mit VPN oder 2-Faktor-Authentifizierung und modernster Firewall-Technologie" | SOURCED | COVERED | Entra sign-in proxy and tailnet (design 2.3) | Nothing |
| P81 | Regular updates of the system | S11 | "Wir führen regelmäßige Updates für Windows, PatOrg und weitere Software durch" | SOURCED | COVERED | Updater with rollback (design 2.3) | Nothing |
| P82 | Monitoring 24 hours a day | S11 | "Verlassen Sie sich auf unsere 24/7-Überwachung für maximale Ausfallsicherheit." | SOURCED | PARTLY | Health timer and disk guard (design 2.3) | A watch by people is a service offer, not code; the founder decides |
| P83 | Access through Citrix | S19 | "Citrix access / product access via authorization group" | SOURCED | COVERED | A browser app needs no Citrix (design 3.1) | Nothing |
| P84 | Local scanners and printers with the system | S11 | "Lokale Hardware wie Drucker oder Scanner funktionieren nahtlos mit der PatOrg Cloud." | SOURCED | COVERED | #240 (watched folder for scans) | Nothing |

### 2.13 The AI assistant

| Id | PATORG feature | Source | Quote | Label | Coverage | Tickets and design | What is missing |
|---|---|---|---|---|---|---|---|
| P85 | ChatGPT as a personal AI assistant | S1 | "PatOrg schenkt Ihnen durch die Integration von ChatGPT mehr wertvolle Zeit" | SOURCED | COVERED | The Patent Agent through the model gateway (design summary) | Nothing. PATORG's seven AI features are P10, P12, P16, P28, P36, P38, P39 and P75 |

### 2.14 Features for companies, not for firms

| Id | PATORG feature | Source | Quote | Label | Coverage | Tickets and design | What is missing |
|---|---|---|---|---|---|---|---|
| P86 | Invention portal and inventor remuneration (with remuneration letters) | S14, S12 | "Berechnen Sie die Vergütung von Erfindern gemäß den gesetzlichen Vorgaben." | SOURCED | OUT OF SCOPE | ADR 0002 decision 1 (the firm's system of record); F5 (first customers are firms) | Nothing on purpose. A firm receives disclosures by mail (#220) |

## 3. Gaps: proposed tickets

Each row joins the NOT COVERED and PARTLY features that one ticket would close. The phase is our proposal.

| # | Proposed ticket title | Phase | Features | Why a firm needs it |
|---|---|---|---|---|
| G1 | Trademark and design rights: right types, DPMA, EUIPO and WIPO deadlines, renewals | R6; a switch blocker for any firm with a trademark practice | P02 | PATORG keeps trademark files and oppositions. Most German patent firms also file trademarks [inferred]. Without them such a firm keeps two systems |
| G2 | Rule set v1 additions: priority year, PCT Art. 19 and Chapter II, EP validation periods | R2 (extend #224 and #225) | P20 | The priority year is the deadline whose loss cannot be repaired in most cases [inferred]. A docket without it is not complete |
| G3 | Deputies and absences, and escalation of internal dates with no act | R3 | P18, P19 | A deadline must not depend on one person being present. The firm's deadline system must work when staff are absent (EPO Guidelines E-VIII 3.2, cited in design 5) |
| G4 | Nightly docket PDF on the firm share | R2 | P22 | The paper fallback of design 11 when the host stops |
| G5 | Filing package for EPO Online Filing 2.0 and DPMAdirektPro, filed by a person | R3 | P23, P25 | PATORG prepares filings; without a package the PAFA types form data again |
| G6 | Outlook add-in: file a mail or an attachment to a matter | R5 | P26 | Staff file mail where they read it; forwarding every mail is slower |
| G7 | Search across the record and the e-file within the walls | R3 | P06 | Staff look for a past letter or a number many times a day |
| G8 | Parties, inventors and citations proposed from mail and office letters | R3 | P10, P12 | PATORG builds these records with AI; without them staff type addresses and inventors |
| G9 | Series letters and Excel outputs from firm templates | R3 | P29, P30 | Fee notices, address changes and annual lists go to many clients at once |
| G10 | Notes on matters and documents | R3 | P33 | Staff leave notes for each other on a file |
| G11 | PATORG import: documents from a CMIS DMS (agorum, d.3, DocuWare) | R2 for the pilot if it uses a DMS; R5 at the latest | P34 | In these firms the e-file is in the DMS, not in the PATORG export (S18) |
| G12 | Retention periods, legal hold and archive of closed matters | R5 | P35 | Professional rules and § 147 AO set retention periods; question P13 is open |
| G13 | Instruction chasers and per-client reminder rules | R3 | P17, P40 | A late client instruction is a common cause of a missed deadline [inferred] |
| G14 | Structured replies for associates and clients without a portal account | R7 | P37, P38 | PATORG lets partners answer a letter in the browser |
| G15 | Annuity provider depth: cost forecast, nightly reconciliation, provider invoices, new rights, the associate route | R6 (extend #243) | P42, P44, P45, P46, P47, P48 | Clients ask what renewals will cost; a date that differs from the provider's must be seen |
| G16 | Validation and translation orders after an EP grant through provider plugins | R6 | P49 | Each EP grant starts validation work in many states |
| G17 | Time rounding units and matter budgets with warnings | R4 | P51, P56 | Fee agreements set rounding; clients set cost caps |
| G18 | Offers, cost estimates and per-client invoice layouts | R4 | P57, P58 | Clients ask for a cost estimate before they instruct |
| G19 | Receivables: incoming payments, open items and payment reminders | R4 | P59, P60 | A firm must see who has not paid; DATEV alone does not show it in the matter |
| G20 | Reports: client portfolio lists and management controlling from the projections | R4 | P61, P62, P63, P64 | Clients ask for portfolio lists; partners ask for revenue and work in progress |
| G21 | Data exchange with a client's IP system, with a release per send | R8 | P73 | Corporate clients with PATORG or Anaqua expect data to arrive in their system |
| G22 | Record API for firm scripts (read and propose, within walls) | R8 (with #77) | P74 | Firms build their own small tools on PATORG's API |
| G23 | A test copy of the firm record for training and update checks | R5 | P76 | Staff train without risk to the real docket |
| G24 | Export of one matter as a bundle | R5 (extend #239) | P09 | A file goes to a new firm or to a client when a mandate ends |
| G25 | Country rule packs (first: US, the main EP validation states) | R8 | P21 | Reported deadlines then get an engine check (design 5.6) |
| G26 | Contract and licence matters with their dates | R8 | P03 | Licence and assignment work has notice and renewal dates |
| none | Two firms on one host (P07), voice timer (P55), monitoring by people (P82) | none | P07, P55, P82 | We propose no ticket. P07 conflicts with the one-firm host; P55 has low need; P82 is a support offer that the founder decides |

## 4. What FlowLeap does differently on purpose

FlowLeap does not copy PATORG's screens or its data model (ADR 0002, "What this record replaces"). For each PATORG way of working, this is the AI-native way.

| PATORG way | FlowLeap way | Where |
|---|---|---|
| The firm configures deadline rules by conditions (P14) | Rules are tested code in a public repository, each with its legal source, version and effective date, and a trace for each date. The firm configures only its internal dates | Design 5; #216, #224, #225 |
| A workflow builder with starters, rules and a pool (P69, P70) | A record event starts a Ticket with a Mandate; a method does the work; a person decides. The firm writes new rules in plain words, and the agent turns them into a typed trigger | Design 7.1; principle 6 |
| Guided dialogs and input masks (P04, P67) | No data entry: facts come from documents as proposals with evidence; a manual entry is a correction with a reason, and the firm sees the count as a defect metric | Design 1.2 principle 1; 4.3 |
| Form letters with conditional text and language variants (P29, P30) | The agent drafts from the firm template and the client's rules, and the Records app checks the draft against the rules before a person accepts it | Design 9.1; #217, #233 |
| Webletters for structured replies (P37) | The agent reads any reply, also free text, and proposes the instruction with the quoted passage; the portal offers the structured choice | Design 6.2, 9.2; #220, #244 |
| AI extracts deadlines and compares them with the docket (P16) | The AI proposes; tested code computes; a person and an independent check confirm; the AI never confirms or deletes | Design 5.5; F3; #219 |
| Timer templates and voice start (P52, P55) | Measured review time becomes a proposed entry; agent work reaches the invoice as fixed fees, never as hours | Design 8.1; F9; #234 |
| Report generator and Excel controlling (P61 to P64) | Read-only views generated over the projections, asked for in words; SQL on the projections for fixed reports | Design 1.2 principle 9; 3.1 |
| Separate data sets (P07) | Walls from Entra groups, enforced in the store | Design 4.4; #227 |
| DMS through CMIS (P34) | Content-hashed e-file with source spans to each fact; a DMS is a migration source, not a second store | Design 3.6; #232 |
| Change history (P66) | An append-only record log with a hash chain that a restore verifies | Design 11; #215, #238 |
| ChatGPT added to the old system (P85) | The agent works inside the record, reads as the person it acts for, and can only propose | ADR 0002 decisions 2, 3, 7 |
| Annuity reminder letters (P43) | A keep-or-drop report with the right's status and family; a lapse is a decision with the client's instruction as evidence | Design 8.3; #243 |
| System link between firm and client (P73) | Every send is a person's act and a record event (ADR 0002 decision 6) | Design 9 |

## 5. Method and limits

We read the vendor pages S1 to S14 on 2026-11-03, the agorum documentation S15 to S18, and the deployment page S19. The vendor site serves its page texts as data in each page, so some quotes come from that data at S1. We searched the web for PATORG with the words Fristen, Marken, DATEV, Kollisionsprüfung, Webletter, Dennemeyer, Questel, DPMAConnect, Epoline, EPO Mailbox and release notes, and for job adverts. Vendor marketing names features but not their depth, so a COVERED mark means that the job is covered, not that FlowLeap equals PATORG in each detail. The INFERRED rows are our reasoning about what a German patent docket must do; an attorney must confirm them.

**Counts.** 86 rows (P01 to P86): 82 SOURCED, 4 INFERRED (P20, P21, P22, P72). Coverage: 37 COVERED, 38 PARTLY, 9 NOT COVERED, 2 OUT OF SCOPE. A script counted the label and coverage columns of the tables.
