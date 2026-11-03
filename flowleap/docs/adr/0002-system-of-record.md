# FlowLeap Patent AI is the firm's system of record: it owns matters, the docket, money and the client portal, and the AI only proposes changes to the record

**Status:** accepted (2026-11-03)

On 2026-11-03 the founder decided that FlowLeap Patent AI becomes the AI-native IP management system of a patent firm and its system of record. It is not an AI layer on top of PATORG (Brügmann Software), which most German patent firms use today. The founder's reason: an AI layer can be copied by an incumbent that adds a simple AI chat, but a system of record that is built for agents from the first line cannot be copied without a rewrite. Trust is a design requirement, not a reason to wait. The design that follows from this record, with the module map, the data model, the deadline engine, the migration and the roadmap, is [2026-11-03-ai-native-ipms-design.md](../2026-11-03-ai-native-ipms-design.md). The research behind it is the augmented firm study (harness PR 212, `flowleap/docs/2026-11-03-augmented-firm-research.md`).

## What this record replaces

- **ADR 0001 decision 8** ("Workspaces stay as they are ... Rejected: a client and matter object model"). FlowLeap now has a matter record, with clients, parties, rights, deadlines and walls. Folders (workspaces) and chats (Sessions) stay as they are inside each runtime; a chat can now belong to a matter.
- **The rule of 2026-11-01 "PATORG only through an adapter; no own docket or billing for v1".** PATORG becomes a migration source: an import and a shadow mode, not a permanent partner. FlowLeap does not copy PATORG's data model.
- **Design rule 2 and decision D4 of the augmented firm study** ("on top of the docket, never the docket"; "FlowLeap reads, drafts and checks, PATORG keeps the docket"). The rule that the AI never writes a deadline stays (decision 4 below); the docket itself is now FlowLeap's.
- **"Docketing connectors" in the "Not decided here" list of ADR 0001.** A docket connector is no longer needed for the firm's own matters; connectors to a client's IP system or to a renewal provider are plugins (decision 9).

ADR 0001 stays valid in every other decision. Decisions 3 (one isolated runtime per attorney), 5 (no key in a runtime), 20 (everything the agent does is a plugin), 21 (nothing leaves the firm without a person) and 27 (routines) are the base of this record.

## The decisions

1. **System of record.** FlowLeap owns these records for each firm: files and matters, families and rights, parties (clients, applicants, inventors, foreign associates, opponents), documents, office events, deadlines, tasks and handovers, decisions and approvals, time entries, costs and invoices, and annuities. The firm can run without another IP management system.
2. **One writer.** The record is held by one control-plane service on the firm host, which is the only writer of its store (ADR 0001 decision 20). Each change is an append-only record event with the actor, the time, the reason and the evidence. Attorney runtimes, routines, the intake and the console read and propose through that service; nothing writes the store directly.
3. **The AI proposes, a person decides.** An agent can propose any change to the record, but it cannot apply a change that the firm's rules give to a person. The service, not the prompt, enforces this: an agent's credential can create proposals only.
4. **Deadlines.** The rules that compute a deadline are tested code, not model output. Each rule names its legal source (an Article or Rule of the EPC, the PCT, the PatG or a national law), a rule version and an effective date. The AI only proposes a deadline; a person confirms it, and the confirmer is never the proposer (the two-person rule). A firm with only one person who may confirm (the small entity of [EPO Guidelines E-VIII 3.2](https://www.epo.org/en/legal/guidelines-epc/2025/e_viii_3_2.html)) records such a confirmation as a single check. Every change to a deadline is a logged record event. Deleting a deadline, or closing it without its act, needs an attorney and attached evidence. A firm starts in observe mode: FlowLeap computes and compares its deadlines with the firm's current docket and changes nothing until the firm switches.
5. **Workflows are agents with a Mandate.** A workflow that PATORG configures without code (note a deadline, create a file, generate a letter or an invoice) is an agent method (a skill) that a record event starts, under a fixed Mandate (tickets #135 to #138), and that ends in a person's Decision.
6. **Nothing leaves the firm without a person.** ADR 0001 decision 21 applies to every work product: client letters, instructions to foreign associates, filings, payments and invoices are drafts until a named person sends, files or pays them.
7. **Walls.** Each matter has a wall: its team and its screens. A user or an agent sees a matter's records, documents and memory only when the wall admits them. A screen beats a membership. Enforcement is in the service, never in the prompt.
8. **Self-hosted, no FlowLeap backend.** The record lives only on the firm's host and in the firm's backups. The core calls no FlowLeap service. Paid data, renewal providers and other vendors are plugins that the firm installs.
9. **Migration.** A firm moves from PATORG through an import, a shadow period with a difference report, and a cut-over checklist that the firm signs. A firm can export its whole record in an open, documented format at any time.

## Consequences

- The roadmap gains the record, the deadline engine, intake, money and the portal as phases; the [design](../2026-11-03-ai-native-ipms-design.md) sets the order and what changes in phases A to E.
- The security invariant register (ADR 0001 decision 26) gains rows for decisions 3, 4 and 7, each with a test that the release gate runs.
- The firm's professional liability and the duty to supervise stay with the firm's attorneys. FlowLeap's job is to make each act visible, checked and logged.

## Not decided here

The store technology, the client portal's network exposure, the e-invoice and DATEV formats, the annuity providers, and the support of national laws other than EP, PCT and DE. The design document proposes each; each gets a founder decision or its own record.
