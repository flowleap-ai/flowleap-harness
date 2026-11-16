# DPMA is a library connector for public register data with its own mirror, and one docket read joins it with the MyEPO mirror

**Status:** accepted (2026-11-16). The founder answered "agree" to the questions Q1 to Q14 of a design interview on that date. Decision 2 has a condition: the answer of the DPMA about the contract. The older plan is the section "The DPMA counterpart: DPMAconnectPlus" of [2026-11-09-myepo-api-study.md](../2026-11-09-myepo-api-study.md).

## Context

DPMAconnectPlus is the REST interface of the DPMA to DPMAregister. Its interface description ([PDF](https://www.dpma.de/fileadmin/user_upload/Dokumente/Recherchieren/schnittstellenbeschreibungdpmaconnectplus.pdf), read on 2026-11-16) gives these functions for patents and utility models: `search` (expert query, a maximum of 1000 hits, 100 with a test access), `getRegisterInfo` (one register record as XML in the DPMA extension of WIPO ST.36), `getRegisterabzuege` (a ZIP of register changes for a day, week, month or year) and weekly publication packages. It uses HTTP Basic authentication. It gives no letters, no non-public files and no due dates.

MyEPO is one vertical slice in the code. Its types, routes, tables and UI copy have MyEPO names, and an application number must match `EP` plus 8 digits. The connector library has a closed list of four connectors (`CONNECTOR_IDS` in `packages/host/flowleap-connectors/src/types.ts`), and MyEPO is not one of them.

FlowLeap has no contract with the DPMA on 2026-11-16. The public repository [patent-dev/dpma-connect-plus](https://github.com/patent-dev/dpma-connect-plus) (Go, MIT licence) has recorded answers of the live API, the official XSD files and an unofficial OpenAPI file.

## The decisions

1. **The job.** The connector gives the DE docket of the firm (DE patents and utility models) and a daily watch of legal status. Trade marks and designs are out. Public DE data for the agent is office coverage of the backend and comes later.
2. **The contract.** FlowLeap holds one contract, and the hosted backend reads the DPMA for the firms. The location of the credentials is one setting, so a firm with its own contract can read from its own installation. **Condition:** the DPMA must confirm that the contract permits this. The study of 2026-11-09 says that a third-party analysis reads § 3.2 of the contract as a ban on passing data records on. If the DPMA says no, each firm signs its own contract, as the study planned, and no code changes.
3. **A library connector, not a second MyEPO slice.** DPMA becomes the fifth library connector, `dpma`, with the fields `username` and `password`. The office-neutral register service gets DE. The same client code runs in the backend and on a firm installation.
4. **Two mirrors, one docket read.** The MyEPO mirror in the Firm Record stays as it is. A DPMA register mirror is added beside it. One docket read joins the two and gives each row an office and a source. The two sources are different in kind (private data with letters and due dates, against public register data), so one table for the two is not used.
5. **One Applications page.** Each row has an office. The views are `All`, `EP` (with `EPC` and `UPP`) and `DE`. There is no toggle between sources. A DE row shows register data only. This connector does not change the Letters page; DPMA letters come through the forwarded-mail intake.
6. **A DE row is an application, not a matter.** Its key is the leading file number of the register. It shows below its EP matter through the priority claim. It becomes a matter only when a person marks it.
7. **How the docket is found.** First from the Firm Record: DE priority numbers of EP matters and DE files of clients. Then "Import your DE docket": a search on the representative name, split by filing year, which a person confirms before it is recorded.
8. **A register change updates the row only.** It makes no office event, no task and no deadline proposal. DE deadline rules are a separate project in flowleap-deadlines.
9. **Before the contract.** The wire schemas come from the XSD and the recorded answers of the public Go client. A DPMA double gives seed records in that shape. The seed records are built records: FlowLeap makes them from the public DPMAregister pages of the 5 DE priority files of the seed firm and marks them as built. After the contract, recorded API answers replace them.

## Consequences

- `CONNECTOR_IDS` gets `dpma`. The test that refuses `set('dpma', …)` changes.
- The docket read and the Applications page lose the rule that a number is `EP` plus 8 digits. The MyEPO mirror keeps it.
- The Applications page is no longer a mirror of MyEPO only. Its copy names the source on each row.
- New invariant for the backend path: the backend keeps no log of the file numbers that a firm asks for, beyond what billing and rate limits need.
- The recorded answers of the Go client are public register data of the DPMA. A fixture that copies one names the repository and the DPMA as its source. The OpenAPI file of that repository is unofficial; the XSD and the recorded answers are the stronger sources.
- The bulk endpoints for publications are not verified by the Go client. The docket needs only `search`, `getRegisterInfo` and `getRegisterabzuege`, which are verified there.

## Not decided here

The office column of the Letters page for DPMA letters. The DE deadline rules and the DPMA calendar. The exact field code of the representative in the expert search, the search limit in practice, and a fixed IP address: these wait for a test access.
