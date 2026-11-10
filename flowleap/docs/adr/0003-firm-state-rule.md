# A fact of the firm lives in the Firm Record or a firm service, a person's runtime keeps only that person's state, and a gate refuses new work that breaks this

**Status:** accepted (2026-11-10). The founder answered "I approve" to the rule, the recommendation and the decisions D1 to D11 of the design. The design is [2026-11-10-firm-organisation-design.md](../2026-11-10-firm-organisation-design.md); the facts are in [2026-11-10-firm-state-audit.md](../2026-11-10-firm-state-audit.md).

## Context

On a firm installation, flowleap-os runs one app runtime for each person ([ADR 0001](0001-self-hosted-firm-os.md) decision 3). The harness was built and proven where one app instance is the whole firm. The audit of 2026-11-10 found 20 wrong rows in 63. A firm secret is readable in every runtime, and the MyEPO secret is in one person's credential store. The firm identity, the docket, the client folders and the register watches live in one person's `/data`. Firm roles are a hand-edited file with three meanings of administrator. Any person can change every client's AI rules. The upstream stores have one scope only, the instance, and the development loop has one app instance, so no check showed the faults.

The founder agreed on 2026-11-10 to the working rule "a fact of the firm lives in the Firm Record or a firm service; an app instance keeps only the person's own state", and to the firm route for MyEPO.

## The decisions

1. **Classes of state.** Every piece of state has one class: firm fact, matter fact, matter file, firm secret, firm configuration, firm job state, person state or device state. Each class has one home and one kind of writer (design, section 2).
2. **Homes.** Firm and matter facts live in the Firm Record. Firm secrets live in host files that only the process which uses them can read. Firm configuration lives on the host and is read-only in each runtime. A person's runtime keeps only person and device state.
3. **Firm decisions are not made in a runtime.** The administrator sets secrets and host configuration in the Firm admin console, and firm facts in the Records app, both through the sign-in proxy. A runtime never checks a firm role to allow a write. The console and every Record command that needs the administrator or partner role are served on a second browser origin, so a script in a page that a runtime serves cannot send them.
4. **Architecture.** One isolated runtime for each person stays. An office proxy does the office token exchange and adds the office keys and the FlowLeap token to agent calls; no runtime holds one. One firm worker (the harness image with a profile that has no model, no shell, no chats and no inbound port) does the firm jobs one time for the firm. It is person `worker`, which no read policy admits, and it sends only insert-only observations; the Firm Record resolves their matter and makes tasks from their typed fields. A runtime reads facts only from the Firm Record, inside its walls, and asks for firm work with a proposal or a job request there.
5. **Roles.** Administrator, partner, attorney and formalities come from one role function of the Firm Record: the firm's Entra app roles, which the sign-in proxy already sends; the local administrator; and the roles of local accounts on the local firm and a firm of one. Each change is logged. Each Record command names the sender kinds and roles that may send it. A call from a runtime can only read or propose, whatever the roles of its person.
6. **Single-user.** A single-user install is a firm of one and runs the same plugins and the same Firm Record (PGlite on the desktop). No FlowLeap package branches on the composition. A spike of the Record on PGlite runs before any fact moves.
7. **The gate.** Every non-upstream package declares a plane. A check with the TypeScript type checker refuses, in a person-plane package, a call that persists (a file, a credential, or any upstream store) or a role check, except for rows of a state ledger; a ledger change is a pull request of its own that the founder signs off. flowleap-os tests refuse a firm secret in a runtime, a proxy answer with a token, and a Record command without a role entry. The development loop and a local-firm acceptance case run each new ledger row as two persons.

## What this record changes

- **ADR 0001 decision 8** ("Workspaces stay as they are", private to each attorney). A person's workspaces stay private. The files of a client and a matter are matter files, and their home is decided with M1 (design, section 6).
- **ADR 0002 F10** ("The intake owns the MyEPO credentials"). The firm worker holds the MyEPO secret and reads MyEPO; the intake files the letters (design, D8).
- **ADR 0001 decision 5** is unchanged. This record makes its office-key part the first step of the migration.

## Consequences

- The office-key and FlowLeap-token part of `keys.none-in-runtime` can move to proved after migration step 1; the Microsoft 365 part stays open.
- New invariants: the firm worker has no model, shell, chat store or inbound port and writes observations only (`worker.writes-observations-only`); a runtime can only read or propose; each Record command has a role entry; a keys document holds no firm secret; no answer of the office proxy holds a token; administrator commands are not accepted from the runtime's origin.
- `flowleap-connectors`, `flowleap-routines` and the `ui-flowleap-folder` Host split into a firm half and a person half. The office connectors get their base URL through the harness `ConnectorHost.fetch`; no vendored file changes.
- Add client, the MyEPO link and register watches are not offered to an outside firm until their migration steps land.
- Each new firm or matter feature costs a Record command, a role entry and a two-person acceptance case before its UI. This is the price of one writer and one log.

## Not decided here

The design of M1 (the matter memory) and of client walls. The home of matter files is decision D4 of the design.
