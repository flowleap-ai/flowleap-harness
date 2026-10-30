# Work pages

The attorney opens the `Office actions` page from the sidebar and sees the office action board of each saved office action analysis: a header with the application, the communication, the days to the time limit and the review count, the saved analysis with its chat link, the cited documents, one card for each objection, and a side panel for the open card. The board reads `<report>.work.json`, which a `write_patent_results` save with `office-action-scaffold` and `officeAction` writes beside the report. The state, the owner and the note of a card go into that file through the `flowleapWorkPages` Remote. The page makes no model or connector call: `Write response plan` sends a chat message, and `New analysis` opens a chat with a drafted message.

## Sub-features

- `work-empty` shows `No office action analysis yet` before any analysis is saved.
- `work-form` opens the form with the application number and opens a new chat with `Analyse the office action for <number>.` drafted, not sent.
- `work-board` shows the board of a saved analysis: one card per objection of `officeAction`, with the claims hit and the cited passages.
- `work-resave` saves the same analysis again: the review fields of each unchanged objection stay, and the result names the fields it could not keep.
- `work-review` changes the state, the owner and the note of a card; the file holds them, a reload keeps them, and the header count and the launcher dot follow.
- `work-side-panel` opens a card with the fields of its block and the claim tables of the claims it hits.
- `work-plan` sends the response plan message into the chat of the analysis; the next model read of the work page file shows the review fields in the Session log.
- `work-disabled` shows `Export Word` and `Share` disabled, with their tooltips.

## How to get to it (user POV)

- Choose `Office actions` in the sidebar.

## Driving it with the browser tool

Preconditions:

- The baseline in [README.md](./README.md).
- An analysis needs a live turn: the preconditions of [office-action-analysis.md](./office-action-analysis.md) (the skill pack under test, `Anthropic: Claude Sonnet 5.5` in the model picker). One EP run is enough. The empty state, the form, and a board from a copied work page need no turn.

- **Empty state.** Choose button `Office actions`. The region `Office action board` shows `No office action analysis yet`.
- **Form.** Choose button `New analysis`. The dialog `New office action analysis` shows textbox `Application number` and the PDF hint. Set the number (for example `EP 4814394`; the browser tool's `form_input` fills it reliably) and choose `Open the chat`. A new chat opens with the request in the composer. Choose the model, then send.
- **Board.** When the delivery card of the report shows, choose `Office actions`. The header shows `<application> · <communication>` and `Needs review: N`, and the list `Objections in the office action` has one card per objection of the report.
- **Review.** On a card, choose button `Review state of objection <id>: Needs review`, then menu item `Relevant` (exact match). Type in textbox `Owner of objection <id>` and press Enter. Type in textbox `Note on objection <id>` and leave the field. The header count changes. Read `$RUN/workspace/deepseek-harness/default-workspace/office-actions/<application>/<report>.work.json`: its `review` holds the values. Reload the page: the values stay.
- **Side panel.** Choose button `Open objection <id> in the side panel`. The complementary region `Objection details` shows the ground, the examiner's reasoning, the cited documents, the response options, and `Reply must address`.
- **Plan.** Choose `Write response plan`. The chat of the analysis opens with the message `Write the response plan for the office action analysis of …`. The run log shows a read of the `.work.json` file (a `read` call, or `cat` through `bash`) whose result holds the review fields, and the plan follows them: an objection marked `Not relevant` is left out.
- **Proof.** Save screenshots of the empty state, the form, the board, the side panel and the plan message in `$RUN/evidence/`, and the session log summary of the chat.

## Gotchas

- The Modal fades in. Wait about half a second after the dialog shows before a screenshot, or the page behind it shows through.
- The board lists a page only when the save had a chat; a report saved by hand, or by a save without an Agent, has a file but no card.
- The model can save the response plan with the same `office-action-scaffold` template. A plan has no `officeAction`, so its result line says `Work page: none, …` and the board keeps the analysis page only.
- The skill of flowleap-cli v0.12.1 writes the analysis in Markdown. The first save is refused with `This content is an office action analysis in Markdown. …`, and the model saves again with `officeAction`. The log shows two `write_patent_results` calls; that is expected until the skill names `officeAction`.
- **Re-save.** After a review change, send `Save the analysis again without changes.` in the chat of the analysis. The result line names the work page and no `Review fields not kept` line for an unchanged objection. The file keeps the review fields.
