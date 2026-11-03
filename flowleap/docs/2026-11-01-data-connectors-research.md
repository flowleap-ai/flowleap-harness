# Next data connectors: free in the app or paid through FlowLeap

Status: research for the founder, 2026-11-01. The founder approved the ten tickets of section 7 on 2026-11-01: #149 to #158. It builds on ADR 0019 (`flowleap-agent-v2/docs/adr/0019-patent-data-connectors-are-one-library-with-two-hosts.md`), the [computer-use assessment](2026-10-23-computer-use-cua-assessment.md) and the [MCP door study](2026-11-01-mcp-door-study.md).

**The goal.** The founder open-sources the app and earns from paid plugins and data that work in the FlowLeap desktop, in the firm OS and in any agent through MCP. This study decides which data connectors come next, and for each one whether it is **free** (in the open-source app, on the user's own key, called from the user's machine) or **paid** (through the FlowLeap backend and the `fl_pat_` token).

**The answer in short.**

1. The best free connectors use keys the user already has, or no key. The USPTO Open Data Portal (ODP) key that the app already stores also opens the PTAB trial and appeal decisions and the office action APIs. Europe PMC and Crossref need no key. These make the free app stronger with no new setup step.
2. The strongest docketing connector is the MyEPO API (mailbox, due dates, due fees). Each firm must get its own credentials from the EPO, so it can only be free (the firm's key). FlowLeap can sell the setup.
3. A paid plugin cannot depend on exclusive data. The EPO gives DOCDB, INPADOC, EP full text, EP Register data and PATSTAT Global free of charge. What a firm cannot copy easily is the hosting and the processing: terabytes of loaded data, computed statistics, and verbs over them. The paid plugins are therefore hosted services on free bulk data: worldwide legal events and EP full text, Boards of Appeal case law, and PTAB and examiner statistics.
4. Do not build WIPO PATENTSCOPE, Lens, IEEE Xplore, UPC, CNIPA, UKIPO or PatentsView now. Each is blocked by its terms, has no API, or adds little next to EPO OPS.

## 1. Sources and method

Four research subagents read primary pages (office API pages, terms of use, price lists, developer portals) on 2026-11-01. They did not sign up for a service or accept terms. Their full notes, with a URL for each fact, are in the session notes of 2026-11-01 (`2026-11-01-data-connectors-research-{A-offices,B-bulk,C-prosecution-caselaw,D-literature}.md`, outside the repository). I read these claims again myself, because the ranking depends on them:

- The EPO price list gives DOCDB, INPADOC, EP full-text data, EP bibliographic data, European Patent Register data and "PATSTAT Global and EP Register" as "Free", and OPS as free up to 4 GB a week, then EUR 2 800 a year ([EPO price list](https://www.epo.org/en/service-support/ordering/patent-knowledge-products-services)).
- OpenAlex: "make basic queries with no key at all"; a free key gives a budget of "$1 a day" and "raises your daily budget 10×" ([OpenAlex rate limits](https://help.openalex.org/how-to-use-the-api/rate-limits-and-authentication), updated 2026-10-15). One subagent reported that keys are required for all requests, from a February 2026 blog post. The current documentation says otherwise, so this study follows the documentation.
- CourtListener: membership API access "may not be used to power a revenue-positive commercial product, service, or feature"; "internal tooling that supports an organization's operation" is commercial use; firms "with five or fewer attorneys" may use membership access ([Free Law Project, allowed API usage](https://free.law/membership/allowed-api-usage/)).

FlowLeap facts come from this repository: [`packages/host/flowleap-connectors/README.md`](../../packages/host/flowleap-connectors/README.md), [`vendor/flowleap-connectors/`](../../vendor/flowleap-connectors/README.md) and the backend glossary (`flowleap-backend/CONTEXT.md`), whose terms this study uses (**Examiner Baseline**, **PATSTAT**, **PATSTAT edition**, **Examiner-cited prior art**).

**Not verified.** All `jpo.go.jp` pages answered HTTP 403 to the fetcher, so the JPO API terms and quotas come from search summaries and a 2021 article. The DPMAconnectPlus contract PDF, the UPC decisions page and CMS terms (bot check and HTTP 522), the Europe PMC terms and rate limit (HTTP 403), the KIPRIS Plus fee and terms pages, and the cost and rate limits of the MyEPO API were not read. Each row below marks these gaps.

## 2. What exists today

| Layer | What it has | Source |
|---|---|---|
| Free, in the app | 34 office tools from `@flowleap/connectors` on the user's EPO OPS, USPTO ODP, Semantic Scholar and Mistral keys; OpenAlex and arXiv without a key; `compare_claims`, `read_pdf` | [connectors README](../../packages/host/flowleap-connectors/README.md) |
| Paid, hosted MCP | US full text and claims (Google Patents on BigQuery), PATSTAT and its graph verbs, Examiner Baseline, citation statistics, enriched citations, patent images, analytics | ADR 0019 decision 3 |

A new free connector is a change in the connector library, which lives in `flowleap-backend/packages/connectors` and reaches this repository through `scripts/flowleap/sync-connectors.sh` ([vendor README](../../vendor/flowleap-connectors/README.md)). Effort in this study:

- **S**: new tools on a provider the library already has (no new key, no new settings card). A few days.
- **M**: a new provider. A new member of `ConnectorProvider` (`vendor/flowleap-connectors/src/host.ts:20`), a credential record and settings card, a connection test, tools and recorded fixtures. About one to two weeks.
- **L**: a backend data pipeline (bulk load, storage, refresh, tools on the hosted MCP). Several weeks, plus running cost.

## 3. The ranked table

"Free" means the user's own key and a direct call from the user's machine. "Paid" means a FlowLeap service behind the `fl_pat_` token.

| Rank | Connector | Attorney need | Coverage | Cost to user | Auth | Terms for an app and caching | Effort | Free or paid | Main risk |
|---|---|---|---|---|---|---|---|---|---|
| 1 | USPTO PTAB trials and ex parte appeals, office action APIs (ODP) | Prosecution, appeals, case law | Trial decisions since Sept 2012 (IPR, PGR, CBM, DER); appeal decisions since July 1997 with outcome, issues, statutes, OCR text ([trials](https://data.uspto.gov/apis/ptab-trials/search-decisions), [appeals](https://data.uspto.gov/apis/ptab-appeals/search)); office action text, rejections and citations ([transition guide](https://data.uspto.gov/documents/support/transition-guide/transition.json)) | Free | The ODP key the app already stores; keys are per person and need ID.me ([ODP FAQ](https://data.uspto.gov/documents/faq.md)) | Public data under 37 CFR 1.11 and 1.14 (FAQ); written reuse terms not found (NOT VERIFIED); burst 1, 4 to 15 requests a second ([rate limits](https://data.uspto.gov/apis/api-rate-limits)) | S | **Free** | The portal changed its rules three times in 2026 (sign-in, MFA, profile fields) |
| 2 | OpenAlex per-user key | Literature | Already connected | Free key, $1 a day of calls; keyless budget is ten times smaller ([rate limits](https://help.openalex.org/how-to-use-the-api/rate-limits-and-authentication)) | Optional key; `POST https://api.openalex.org/api-keys` with the user's email issues a key for that person (same page) | Data is CC0 ([pricing](https://help.openalex.org/access/pricing.md)) | S | **Free** | Today the library sends one shared `mailto` for all users (`vendor/flowleap-connectors/src/npl-search/index.ts:219`), so heavy users can exhaust a keyless budget |
| 3 | Europe PMC | Literature (life sciences) | PubMed, Agricola, EPO and other sources; abstracts in the `core` result type; open access full text with a licence per article ([OA subset](https://europepmc.org/downloads/openaccess)) | Free | None | Licence per article for full text; terms and rate limit NOT VERIFIED (HTTP 403) | S | **Free** | Terms unread |
| 4 | Crossref | Literature (DOI lookup) | DOI metadata, some abstracts, no full text ([REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)) | Free | None; an email in `mailto` gives the polite pool (10 requests a second) ([access](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/)) | "you may use it for any purpose" for metadata (REST API page); the paid Plus tier is "solely for Subscriber's internal business purposes" ([Plus terms](https://www.crossref.org/services/metadata-retrieval/metadata-plus/terms/)) | S | **Free** | Low value as a search engine; use it for citation metadata |
| 5 | Fee tables (EPO, USPTO, PCT) | Docketing, cost estimates | USPTO schedule is a PDF only ([USPTO fees](https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule)); PCT fee tables are yearly PDFs ([WIPO PCT fees](https://www.wipo.int/en/web/pct-system/fees)); EPO has an HTML schedule ([EPO fees](https://www.epo.org/en/applying/fees/fees)) | Free | None | Public | S to M | **Free**, shipped as versioned data with a source URL and an effective date per row | A stale amount gives a wrong cost; FlowLeap must keep it current |
| 6 | MyEPO API (read-only: mailbox, due dates, due fees, portfolio) | Docketing | Mailbox communications, due dates with term descriptions, due fees, applications and portfolios, schedule of fees ([MyEPO API guide](https://link.epo.org/web/understand-our-services/exchange-data-with-us-using-an-api/en-myepo-feature-guide-apis-for-exchanging-information-with-ip-management-systems.pdf), [release notes](https://epo.org/en/applying/myepo-services/understand/api/release-notes)) | Not stated (NOT VERIFIED) | OAuth 2.0 client credentials; the firm asks EPO support for a business-to-business account, and the firm's MyEPO administrator gives it Mailbox rights (guide) | Credentials belong to one firm's MyEPO company; a pooled key is not possible (guide); rate limits NOT VERIFIED | M | **Free** (firm's credentials); FlowLeap sells the onboarding | Manual onboarding; confidential mailbox data must stay on the firm's machine; Online Filing writes have legal effect, so leave them out |
| 7 | PubMed (NCBI E-utilities) | Literature (biomedical) | PubMed citations and abstracts | Free | Optional key per user: 3 requests a second without, 10 with; NCBI asks software to let each user enter their own key ([NCBI 2017](https://ncbiinsights.ncbi.nlm.nih.gov/2017/11/02/new-api-keys-for-the-e-utilities/)) | Show NCBI's disclaimer; abstracts can carry publisher copyright ([NCBI policies](https://www.ncbi.nlm.nih.gov/home/about/policies/)) | S | **Free** | Mostly overlaps Europe PMC; current limits come from a 2017 page |
| 8 | JPO patent information API | Registers (JP) | Patents, designs, trade marks, not utility models; prosecution history and refusal notices (NOT VERIFIED, search summaries and a 2021 article) | Free (NOT VERIFIED) | Registration by emailed form, then an ID and a token; only registered users (NOT VERIFIED) | Terms unread: every `jpo.go.jp` page answered 403 | M | **Free** (user registers) | Terms, foreign eligibility and daily caps unknown; Japanese documents |
| 9 | DPMAconnectPlus | Registers (DE) | DE patents and utility models: register data, legal status, full text and claims; DE, DD, EP and WO facsimiles ([DPMAconnect](https://dpma.de/recherche/datenabgabe/dpmaconnect/index.html)) | EUR 200 once; retrieval free ([DPMA, English](https://dpma.de/english/search/data_supply_services/dpmaconnect/index.html)) | Signed paper contract with a stated purpose, then a user name and password (same page) | The older DPMAconnect contract is non-transferable and limits use to the stated purpose ([contract](https://www.dpma.de/docs/recherche/dienste/standardvertrag_dpmaconnect.pdf)); the Plus contract NOT VERIFIED | M | **Free** (firm's contract) | Paper process; eligibility of foreign firms NOT VERIFIED |
| 10 | EUIPO designs and trade marks | Designs, trade marks | Design and trade mark search, own portfolio, filing APIs ([EUIPO API catalogue](https://dev.euipo.europa.eu/product)) | Free ([FAQ](https://dev.euipo.europa.eu/faq)) | EUIPO account, app registration, sandbox tests, identity documents for production (FAQ) | Licence "non-transferable"; no circumventing rate limits "with different accounts"; no caching or resale clause found ([Conditions of Use v2](https://euipo.europa.eu/tunnel-web/secure/webdav/guest/document_library/contentPdfs/law_and_practice/decisions_president/EX-25-1_annex-1_v2_en.pdf)) | M | **Free** (user's account) | Heavy onboarding; outside the patent focus |
| 11 | CourtListener | Case law (US federal) | Opinions, RECAP dockets ([API v4](https://wiki.free.law/c/courtlistener/help/api/rest/v4/overview)); Federal Circuit coverage NOT VERIFIED | Free tier 5 a minute, 125 a day; tiers from $10 a month ([membership](https://free.law/membership)) | Token per person | Membership access only for firms with five or fewer attorneys; not for revenue products or firm internal tools ([allowed usage](https://free.law/membership/allowed-api-usage/)) | S to M | **Neither yet**: free only for small firms; a partnership is needed for others and for a paid plugin | Most pilot firms are outside the membership terms |
| 12 | KIPRIS Plus | Registers (KR) | About 50 REST APIs and 124 bulk sets ([portal](https://plus.kipris.or.kr/portal/main.do)) | One listing: 1,000 free calls a month ([data.go.kr](https://www.data.go.kr/data/15057376/openapi.do)) | Service key; foreign sign-up NOT VERIFIED | Terms NOT VERIFIED | M | Free, later | Korean portal, unknown terms |
| P1 | Worldwide legal events and EP full text (INPADOC, DOCDB, EP full text) | Legal status at scale, EP full-text search, families | INPADOC: events from over 50 authorities ([INPADOC](https://www.epo.org/en/searching-for-patents/legal/inpadoc)); EP-A since 1978, EP-B since 1980, backfile about 3.53 TB zipped ([EP full text](https://www.epo.org/en/searching-for-patents/data/bulk-data-sets/data)) | Free from the EPO (price list) | FlowLeap's own EPO licence | Allowed: "his own product"; forbidden: the data "as such" to the public; attribution text required ([EPO database terms](https://www.epo.org/en/service-support/ordering/raw-data-terms-and-conditions), clauses 5.2, 5.4, 10.2) | L | **Paid** | A search snippet of the EPO shop showed EUR 2,700 for DOCDB (NOT VERIFIED; the price list says free); storage and refresh cost |
| P2 | EPO Boards of Appeal decisions | Case law (EP) | Full text XML of all decisions since 1978, about 200 MB zipped, new backfile twice a year ([BoA bulk](https://www.epo.org/en/searching-for-patents/data/bulk-data-sets/boards-of-appeal-decisions)) | Licence price NOT VERIFIED | FlowLeap's own EPO licence | The same EPO database terms | M | **Paid** | Twice-yearly lag; the EPO must confirm that a hosted search returning decision text is "own product" |
| P3 | PTAB and examiner statistics | Prosecution strategy | Built from ODP bulk files, which need no key ([ODP FAQ](https://data.uspto.gov/documents/faq.md)), beside the existing Examiner Baseline | Free source | FlowLeap backend | Public data | M to L | **Paid** | Analytics firms sell the same; the value is the join with the firm's own matters |

**Not now.**

| Source | Reason | Evidence |
|---|---|---|
| WIPO PATENTSCOPE | Paid SOAP service for PCT data only (600 or 2,000 CHF a year), 10 actions a minute, redistribution only to identified users; EPO OPS already gives WO data; the free site bans scraping | [PATENTSCOPE data](https://www.wipo.int/en/web/patentscope/data), [PCT data terms](https://www.wipo.int/en/web/patentscope/data/terms), [site terms](https://www.wipo.int/en/web/patentscope/data/terms_patentscope) |
| Lens.org | Institutional subscription only; access "may not be transferred, sold or re-licensed"; no public price; new owner since 1 June 2026 | [Lens API terms](https://about.lens.org/policies/lens-api-terms-of-use/) |
| IEEE Xplore | Licence only for non-commercial work inside the licensee's institution; no use on behalf of a third party | [IEEE API terms](https://developer.ieee.org/API_Terms_of_Use2) |
| Unified Patent Court | The website bans automated crawlers without written permission; the CMS API's auth, terms and status are unknown | [UPC acceptable use](https://www.unifiedpatentcourt.org/en/acceptable-use-policy), [CMS API guide v1.4](https://www.unifiedpatentcourt.org/sites/default/files/upc_documents/upc-cms-public-api-documentation_v1_4.pdf) |
| CNIPA | No public developer API found; use EPO OPS for CN family and abstracts | [WIPO report on CNIPA](https://confluence.wipo.int/confluence/x/Yp7PYQ) |
| UKIPO | APIs are "in development", no date | [One IPO service details](https://www.gov.uk/government/publications/one-ipo-patents-service-details/one-ipo-patents-service-details) |
| PatentsView | Search and APIs paused from 2026-03-20; bulk data on ODP, through 2025-12-31 | [USPTO notice](https://www.uspto.gov/subscription-center/2026/patentsview-migrating-uspto-open-data-portal-march-20), [PatentsView page](https://www.uspto.gov/ip-policy/economic-research/patentsview) |
| CORE | Good open access full text, but a product that "might be monetised" must contact CORE for a licence | [CORE terms](https://core.ac.uk/terms) |
| Unpaywall | Runs on the OpenAlex database since late 2025, so it duplicates OpenAlex | [OpenAlex on Unpaywall](https://help.openalex.org/access/unpaywall.md) |
| More Google Patents tables | The current Marketplace licence page did not load; the CC BY 4.0 grant comes from a 2017 blog; the example repository was archived on 2026-04-18 | [Google blog 2017](https://cloud.google.com/blog/topics/public-datasets/google-patents-public-datasets-connecting-public-paid-and-private-patent-data), [repository](https://github.com/google/patents-public-data) |

## 4. Recommended order

### Free connectors: the free app is strong in ten minutes

The test: a new user who already has the EPO OPS and USPTO ODP keys from the first-run wizard gets the new tools with no new step.

1. **PTAB and office action tools on the ODP key** (rank 1). No new key, no new card. Attorneys answer office actions and prepare appeals every week; ex parte appeal outcomes since 1997 and the office action text are the evidence they look for.
2. **OpenAlex per-user key** (rank 2). An optional field on the literature card, filled by the agent-key flow from the user's email. This removes the shared `mailto` and gives each user ten times more budget.
3. **Europe PMC and Crossref** (ranks 3 and 4). No key at all. Europe PMC gives life-science abstracts and open access full text; Crossref resolves a DOI to citation metadata for the search report.
4. **Fee tables** (rank 5). Versioned data in the app with a source URL and an effective date per row. A paid plugin adds nothing here.

Then the connectors that need the firm's own paperwork. They stay free, and FlowLeap's setup service does the paperwork for the firm:

5. **MyEPO API, read-only** (rank 6). The highest value for docketing, and it feeds the docket agent of the [dsh-superagent study](2026-11-01-superagent-docket-agent-study.md). Ask the EPO for sandbox credentials first.
6. **JPO, DPMAconnectPlus, EUIPO** (ranks 8 to 10), each only after a person reads its terms or contract.

### Paid plugins: hard to copy

A firm can copy a free connector by reading the open-source code. It cannot easily copy a service that loads and refreshes terabytes, computes statistics over the whole corpus, and answers through verbs that the agent knows. This matches what FlowLeap already sells (PATSTAT, US full text, Examiner Baseline).

1. **P1, worldwide legal events and EP full text.** It answers what OPS cannot at scale: legal events across 50 offices in one query, and full-text search of every EP document. Start with a written question to the EPO (ticket 6).
2. **P2, Boards of Appeal case law.** Searchable decisions linked to the EP file and to the cited articles and rules. Small data, high attorney value.
3. **P3, PTAB and examiner statistics.** An extension of the Examiner Baseline: outcomes by art unit, examiner and issue type.

All three must return derived answers and excerpts, never raw dumps, and carry the EPO attribution line where EPO data is used (EPO database terms 5.2 and 10.2). They reach the desktop, the firm OS and any agent through the hosted MCP server with the `fl_pat_` token, like the paid tools today.

## 5. Rules that apply to every connector

- **Each user holds their own contract with the source.** EPO OPS treats each registered user as a contract party and calls "several contracts … to avoid or reduce payment" a serious breach ([OPS terms](https://www.epo.org/en/service-support/ordering/ops-terms-and-conditions), 8.3). ODP keys are per person ([ODP FAQ](https://data.uspto.gov/documents/faq.md)). EUIPO forbids extra accounts to get around rate limits (Conditions of Use 3.6c). So FlowLeap never creates keys for users, and a free connector never ships a FlowLeap key.
- **Caching stays on the user's machine.** ADR 0019 decision 4 already says so; no source above allows FlowLeap to pool free-tier results across users.
- **Paid means FlowLeap's own licence.** A paid plugin uses data that FlowLeap licenses itself (EPO bulk, ODP bulk). It never resells access to a source whose terms bar transfer (Lens, IEEE, CourtListener membership, Crossref Plus).

## 6. Questions for the source owners

The founder sends these; this study sent nothing.

1. **EPO.** Confirm that DOCDB, INPADOC, EP full text and Boards of Appeal data are free (the shop snippet said EUR 2,700), and that a hosted search for many firms is "own product" under clause 5.2. Ask for MyEPO sandbox credentials and the API's cost and rate limits.
2. **UPC.** Ask for written permission and the CMS API terms.
3. **Free Law Project.** Ask whether a firm with more than five attorneys may use its own token in an open-source desktop app, and the price of a partnership.
4. **JPO.** A person reads the API terms in a browser (the fetcher was refused) and checks foreign eligibility.
5. **CORE.** Ask the licence price for a monetised product.

## 7. Tickets

The founder approved these tickets on 2026-11-01. Labels follow the repository taxonomy. Library changes land in `flowleap-backend/packages/connectors` first and reach this repository by the sync script.

1. (#150) **PTAB and office action tools on the ODP key (connectors, free).** New tools on the existing `usptoOdp` provider: search PTAB trial decisions, search ex parte appeal decisions, read one decision, and search office action text and rejections. Recorded fixtures. Acceptance: with only the ODP key set, the agent finds the appeal decisions for one application and quotes the board's outcome with its source link.
2. (#151) **OpenAlex per-user key (connectors and settings, free).** An optional OpenAlex key on the literature card, a "get a free key" button that calls the agent-key endpoint with the user's email, and no shared `mailto`. Acceptance: two users run searches, and each request carries that user's key or that user's email.
3. (#152) **Europe PMC and Crossref (connectors, free).** `search_npl` and `get_npl_work` gain Europe PMC as a source; DOI lookups use Crossref with the user's email. Acceptance: a CRISPR prior-art search returns Europe PMC abstracts with the open access licence flag.
4. (#153) **Fee tables as data (connectors, free).** EPO, USPTO and PCT fee tables as versioned data with a source URL and an effective date per row, a `get_fees` tool, and a check that fails when a table is older than its next known change. Acceptance: the agent gives the EP examination fee with the effective date and the EPO link.
5. (#154) **MyEPO API, read-only (connectors and settings, free).** A `myepo` provider with the firm's client ID and secret, a settings card and a connection test, and tools for mailbox list and read, due dates and due fees. No Online Filing. Depends on EPO sandbox credentials. Acceptance on the sandbox: due dates for one application, with the term description.
6. (#149) **Owner questions (founder).** Send the five questions of section 6 and record the answers in this file. This ticket blocks #154, #155, #156 and #158.
7. (#155) **Paid: worldwide legal events and EP full text (backend).** Load INPADOC, DOCDB and EP full text, refresh weekly, and serve tools on the hosted MCP with the EPO attribution. First deliverable: a cost estimate for storage and refresh. Blocked by #149.
8. (#156) **Paid: Boards of Appeal case law (backend).** Load the decisions, link each one to its EP application, and serve search and read tools on the hosted MCP. Blocked by #149.
9. (#157) **Paid: PTAB and examiner statistics (backend).** Compute outcome statistics from the ODP bulk files and join them to the Examiner Baseline. Acceptance: for one art unit, the tool gives appeal outcomes and the numbers behind them.
10. (#158) **Free connectors with paperwork (connectors).** JPO, DPMAconnectPlus and EUIPO, one at a time, each after its terms are read. Blocked by #149 for JPO.
