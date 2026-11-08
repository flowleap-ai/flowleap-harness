# Roadmap re-order: firm memory first

Status: proposal for the founder's approval, 2026-11-08. It re-orders the phases of [the IPMS design](2026-11-03-ai-native-ipms-design.md) after [the problem and the product principles](2026-11-08-problem-and-principles.md). No phase starts before the founder approves it, and each new process gets its researched state machine sheet first.

## Why re-order

The R stages were ordered by trust: the record, then the docket, then letters, and the matter memory last (R8). That order is safe, but it puts the main value at the end, and the R1 work narrowed it further to one letter path. A firm that sees only a docket sees a copy of PATORG with AI on top. The new order keeps the trusted base and brings the firm memory and the prepared work forward.

## The new order

| Step | Name | What a firm sees at the end | Content | Size |
|---|---|---|---|---|
| R0 | Record tracer | done | The Firm Record, one deadline end to end | done |
| R1 | Close R1 | The base is merged and stable | Merge the open PRs with the founder's permission for each: deadlines 3; os 85 to 88; harness 344, 346, 347 and 349; seed-firm 2; harness 343. No new features for the letter screens. The floating panel seam is paused. | S |
| M1 | Matter memory | "Open any matter: FlowLeap knows its whole story." | The matter timeline from the EP Register events and the publications (FlowLeap patent-data plugin); the import of a matter's own documents from the firm's file folder, with their text (the E-file, task T17 moves here); the Outlook connector (Microsoft 365): the mail of each matter with the client's instructions as facts with their source mail; a matter story view; the agent reads all of it with evidence; the agent is available in Outlook and Teams | M to L |
| M2 | Lifecycle and selection | "FlowLeap knows where each matter is and what comes next." | Sheet 0 (the map of procedures and actors) and sheet 2 (the EP grant procedure), approved first; the state of each matter computed from its events; for each state, the evidence that a task needs; the expected next letter and an alarm when it is late (rules first, then times from PATSTAT) | M |
| M3 | Prepare and check | "When a letter arrives, the attorney gets the facts, the differences, the risks and the questions, not a ghost-written letter." | The R71(3) review: text intended for grant against the last filed claims, the divisional question, the fees, the questions for the client. The Art. 94(3) preparation: the objections, the cited prior art, a search, candidate arguments with their evidence. The attorney writes. | M |
| R2 | Trusted docket | The firm can trust FlowLeap's dates | Rule sets for EP, PCT and DE; the docket lifecycle; walls; the PATORG import, which also fills the matter memory; shadow mode | L |
| U1 | UPC | The firm runs UPC matters | Sheet 5 (UPC proceedings, from the Rules of Procedure and the founder's CMS knowledge), then the UPC matter types | L |
| R3 to R7 | Run the matter, money, switch, annuities, portal | as in the design | as in the design, after M3 and R2 | as in the design |

The new demo bar: an attorney opens any matter, the agent knows its whole story and prepares the next step with evidence, and the attorney decides.

## What moves and what stays

- The matter memory moves from R8 to M1. The E-file (T17) moves from R3 to M1.
- The prediction of the next letter (level 1 rules, level 2 times) is new in M2.
- The draft letters of R1 stay in the code, but the agent shows prepared facts first (principle 1).
- The trusted docket (R2) keeps its content and moves after M3. The deadline engine and the two-person rule from R0 and R1 stay in use.
- MyEPO intake stays in R3. The UPC work becomes its own step, U1.

## Open decisions for the founder

1. The main customer type: the large firm (self-hosted) or the small firm (hosted), and the order.
2. Hosting for small firms: keep "self-hosted only" for now, or plan a hosted option.
3. M1 needs a matter's own documents. Which firm gives us a real folder export to test on, with its consent?
