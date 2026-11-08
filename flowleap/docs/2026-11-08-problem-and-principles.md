# FlowLeap Patent AI: the problem and the product principles

Status: draft for the founder's approval, 2026-11-08. It replaces the narrow framing "a letter becomes a deadline" with the problem that the R0–R8 design already named, and it orders the work by the value to the firm.

## The problem

AI agents are everywhere, but they do not improve the daily work of a patent firm, because each task starts without the firm's facts.

The facts exist: in the docket (dates), in Outlook (client instructions), on the file server (claims, replies, opinions), in the office registers (EPO, DPMA, UPC) and in people's heads (why the firm argued X, what the client really wants). They are spread out, and nothing selects the facts that a task needs. So the attorney selects them by hand for each task: find, upload, explain, ask. With confidential client files, a general chat tool cannot be used at all.

Every office letter and every court document is one step of a known procedure (EP grant, opposition, PCT, national, UPC). The firm started that procedure itself, years before. So the firm can know, for each matter, where it is, what can come next and what the next step needs. Today no system knows this.

## Who has the problem

| Firm type | Example | What we know |
|---|---|---|
| Small firm | Kreuels Henrichs Pannen, Düsseldorf: 4 patent attorneys, 2 lawyers | Wants to use AI heavily. Not interested in self-hosting. About 38 EP files at the firm, 2 clients hold two-thirds. Most work is probably DE national, trademark, design and disputes. |
| Large firm | Eisenführ Speiser: Bremen, Hamburg, Munich | Wants to use AI heavily. Wants to own the whole stack. About 1,315 EP publications in 2025. Patent and UPC litigation are core work. |

Open decision: which firm type is the main customer, and in which order.

What the KHP attorney said: AI is "great" for search and for finding arguments; he is critical of AI drafting texts and applications, because people "forget to think themselves".

No firm has described its day-to-day work in calls. We learn it by watching work, from the paralegal training rules, from the founder's own EPO and UPC system work, and from the PATORG feature cross-check.

## The product: an AI-native OS for patent firms

1. **Firm memory.** All facts of each matter in one place: its procedure and state, its events, its documents, the client's instructions, and the register data. Decisions become new facts.
2. **Task-aware selection.** The lifecycle of each procedure says which facts each task needs. For "R71(3) received": the text intended for grant, the last filed claims, the examiner's last objections, the client's decision about a divisional application, and the fees.
3. **The agent at the center of the information.** It prepares, searches, compares, finds arguments and checks. Every statement carries its evidence.
4. **People at the center of the decisions.** The attorney thinks and decides. The two-person rule protects deadlines. Everything is logged.

Evidence for point 2: a technical report (Marquis, 23 October 2026, synthetic data, not peer reviewed) found that task-selected context gave about 88 % of the best possible decision, against 48 % for general company context and 0 % for none, and that the gain came from selecting the right evidence, not from a special memory design.

## Product principles

1. **AI prepares and checks; the attorney decides and writes.** The agent never presents a finished letter as the answer. It presents the facts, the differences, the risks and the questions.
2. **Evidence for every statement.** A statement without its source is not shown.
3. **The matter knows its state.** Each matter has a procedure, a state, and the expected next steps with their time limits.
4. **The lifecycle selects the context.** The context for a task comes from the procedure rules, not from a guess by the model.
5. **The firm's facts stay under the firm's control.** No client fact leaves the firm without the firm's rule.
6. **Meet people where they work.** German firms work in Microsoft 365. Outlook is a main source of facts (client instructions, foreign associates, office mail), and Outlook and Teams are where people ask the agent and receive its prepared work, beside the FlowLeap app.

## What this changes in the current work

Keep: the Firm Record (one append-only log), the deadline engine, the two-person rule, the evidence rule of the Ticket run, and the R1 PRs that are almost done.

Change: no new features for the letter screens (the floating panel seam is paused). The firm memory moves forward from R8. The lifecycle sheets become the selection rules. The demo bar becomes: an attorney opens any matter, the agent knows its whole story and prepares the next step with evidence, and the attorney decides.

The re-ordered roadmap is in `2026-11-08-roadmap-reorder.md`.
