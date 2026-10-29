# Work pages

The attorney opens the `Office actions` page from the sidebar and sees the office action board: a header with the application, the communication, the days to the time limit and the review count, the run state, one card for each objection, and a side panel for the open card. The look-first version shows one invented analysis from a fixture, under a `Sample data` banner, and keeps state and owner changes in the browser only. It makes no model, Remote, or connector call, so its proof needs no turn.

## Sub-features

- `work-board` shows the banner, the header, the run state, the cited documents, the three objection cards, and the footer.
- `work-state-owner` changes the review state and the owner of a card, and the header count and the launcher count follow.
- `work-side-panel` opens a card in the side panel with the examiner's text, each claim feature beside its passage, and the response options.
- `work-form` opens the analysis form with the application number, the PDF, the agent and the budget left.
- `work-deferred` shows a notice for `Write response plan`, `Export Word`, `Open chat` and `Start analysis`, and the tooltip of the disabled `Share`.

## How to get to it (user POV)

- Choose `Office actions` in the sidebar.

## Driving it with the browser tool

Preconditions:

- The baseline in [README.md](./README.md). A key is not used: the page makes no model call.

- **Board.** Choose button `Office actions`. The region `Office action board` shows the note `Sample data`, the heading `EP 3 456 789 · Communication under Article 94(3) EPC`, `Reply due in N days`, `Needs review: 2`, the status `Agent is reading the action`, and the list `Objections in the office action` with three cards.
- **State and owner.** Choose button `Review state of Art. 54 EPC: Needs review`, then menu item `Relevant` (use an exact match: `Not relevant` also contains the word). The header shows `Needs review: 1` and the launcher count shows `1`. Type in textbox `Owner of Art. 84 EPC` and press Enter.
- **Side panel.** Choose button `Open Art. 54 EPC in the side panel`. The complementary region `Objection details` shows `Examiner's text`, `Claim feature and cited passage` and `Response options`. Button `Close the side panel` closes it.
- **Form.** Choose button `New analysis`. The dialog `New office action analysis` shows the textbox `Application number`, the PDF row, button `Agent: Patent Agent`, and the budget line. `Start analysis` closes the dialog and shows a notice.
- **Dark mode.** Set the color scheme to dark and repeat the board view.
- **Proof.** Save screenshots of the board, the side panel, the form and the dark board in `$RUN/evidence/`.

## Gotchas

- The Modal fades in. Wait about half a second after the dialog shows before a screenshot, or the page behind it shows through.
- A reload restores the sample: the state and owner changes are not saved in this version.
