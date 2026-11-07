# Key map

One key for each act, the same on every screen (rule R16). A button, a menu item and a ⌘K item that runs an act carry its `data-act` id in the mockups, and `scripts/check-mockups.mjs` fails when the key that one of them shows differs from the macOS column, when a key shows without a `data-act`, when a key is typed into a label, and when a key shows on a touch screen. The mockups show the macOS desktop defaults; a German mockup shows the German keycap where the table names one.

## How the client binds these keys

Each act is a command in the shortcut registry ([`packages/client/shortcuts`](../../../packages/client/shortcuts/README.md)), so a person can rebind it in [`ui-shortcuts`](../../../packages/client/ui-shortcuts/README.md) and a button shows the current binding from the registry's catalog, never a typed label.

- **Modifier defaults follow the registry rules.** Desktop takes the macOS and Windows columns. Web keeps its binding restrictions: a default without Alt becomes Mod+Alt, and a default with Alt becomes Mod+Shift. `⌘↵` is not free: the composer's fixed `Mod+Enter` holds it, and fixed combinations cannot be assigned to editable commands, so Record the decision is `⇧⌘↵`. Plain `↵` is not free either: the composer registers plain Enter as fixed (`packages/client/ui-conversation/src/client/apply.ts`), so `↵` (Open the row) cannot be an editable command. It is a fixed key of the view-scoped layer: the layer registers it with `registerFixed()` as a read-only row of the shortcut reference, and a person cannot rebind it. `⌘K` is the app's `session.search`; the IPMS command menu extends that command to the open item (one ⌘K for the app, as in Linear), so it keeps `⌘K` on desktop and `⌥⌘K` on Web.
- **Single keys and `G` sequences need a view-scoped layer** ([client-gaps.md](client-gaps.md) item 4). The registry gives every effective binding priority over editors, so a registry single key would fire while a person types a reason. The layer: single keys (/, 1, 2, M, Space, C, O, R, E, F, X, J, K), the fixed `↵` and the `G` sequences work only when an IPMS view has focus and focus is not in a text field, an editable element or a menu. Each single key and sequence is a rebindable registry command (not `registerFixed()`), shown in the shortcut reference with its view as the scope; `↵` is the one fixed key (see above).
- **Context menu.** While a row's context menu is open, the menu handles the keys it shows, and each acts on that row (the context row), not on the open item. With the menu closed, the layer runs a key on the focused row or the open item.
- **Touch.** Keys hide on a coarse pointer, as the `Menu` key hints do ([`ui-primitives`](../../../packages/client/ui-primitives/README.md)); every act stays reachable by a button or a menu.

## Acts

| Act | `data-act` | Command | macOS | Windows | Web | German keycap | Labels |
|---|---|---|---|---|---|---|---|
| Open the command menu | `search` | `session.search` | ⌘K | Ctrl K | ⌥⌘K, Ctrl Alt K | | Search |
| Find a matter by file number, title, client, application number or person (Linear opens Search with `/`) | `find` | `records.search.find` | / | / | / (layer) | | Find a matter |
| Record the decision (the primary button of a decision bar) | `record` | `records.decision.record` | ⇧⌘↵ | Ctrl Shift ↵ | ⇧⌘↵, Ctrl Shift ↵ | | File, Confirm, Enter office event, Record decision (Accept and file and Confirm deadline in the Records reference mockups) |
| Accept one proposed part | `accept` | `records.part.accept` | 1 | 1 | 1 (layer) | | Accept |
| Reject or mark not relevant (opens the reason step) | `reject` | `records.part.reject` | 2 | 2 | 2 (layer) | | Not relevant…, Reject… |
| File on another matter | `other-matter` | `records.intake.otherMatter` | M | M | M (layer) | | Other matter…, File on another matter… |
| Preview the work product | `preview` | `records.work.preview` | Space | Space | Space (layer) | Leer | Preview |
| Show the deadline calculation | `calculation` | `records.deadline.calculation` | C | C | C (layer) | | Calculation |
| Open the source letter | `open-letter` | `records.letter.open` | O | O | O (layer) | | Open the letter |
| Try again after an error | `retry` | `records.retry` | R | R | R (layer) | | Try again |
| Record an office event | `record-event` | `records.event.record` | E | E | E (layer) | | Record office event |
| Show what was filed today | `show-filed` | `records.intake.showFiled` | F | F | F (layer) | | Show filed today |
| Open the row | `open` | (fixed: `↵`, view-scoped layer) | ↵ | ↵ | ↵ (layer, fixed) | | Open |
| Go to the matter | `go-matter` | `records.go.matter` | G M | G M | G M (layer) | | Matter …, Open matter (the My work row menu) |
| Go to Intake | `go-intake` | `records.go.intake` | G I | G I | G I (layer) | | Intake |
| Next or previous row, item | | `records.list.next`, `records.list.previous` | J, K, ↓, ↑ | J, K, ↓, ↑ | J, K (layer), ↓, ↑ | | The up and down buttons of a detail's top bar |
| Select a row for a bulk act | | `records.list.select` | X, ⇧ click | X, Shift click | X (layer), ⇧ click | | The checkbox in the status slot |
| Close a menu, a step or a detail; clear the selection | | (fixed: `Esc`) | Esc | Esc | Esc | | |

`G M` and `G I` are sequences (G, then M). The registry has two-key chords with overlapping presses but no sequences, and `registerFixed()` sequences cannot be rebound, so the view-scoped layer adds rebindable sequences.
