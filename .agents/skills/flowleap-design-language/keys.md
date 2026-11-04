# Key map

One key for each act, the same on every screen (rule R16). A button, a ⌘K item and a group hint that runs an act carry its `data-act` id in the mockups, and `scripts/check-mockups.mjs` fails when the key that one of them shows differs from this table, or when a key shows without a `data-act`. Mockups show the macOS keys; a German mockup shows the German keycap where this table names one.

In the client each act is a command in the shortcut registry ([`packages/client/shortcuts`](../../../packages/client/shortcuts/README.md)) with these keys as its `web:macos` and `web:windows` defaults, and a person can rebind it in the shortcut reference ([`ui-shortcuts`](../../../packages/client/ui-shortcuts/README.md)). A button therefore shows the current binding from the registry's catalog, never a typed key label.

| Act | `data-act` | macOS | Windows | German keycap | Labels |
|---|---|---|---|---|---|
| Open the command menu | `search` | ⌘K | Ctrl K | | Search |
| Record the decision (the primary button of a decision bar) | `record` | ⌘↵ | Ctrl ↵ | | Accept and file, Confirm deadline, Record decision |
| Accept one proposed part | `accept` | 1 | 1 | | Accept |
| Reject or mark not relevant (opens the reason step) | `reject` | 2 | 2 | | Not relevant…, Reject… |
| File on another matter | `other-matter` | M | M | | Other matter…, File on another matter… |
| Preview the work product | `preview` | Space | Space | Leer | Preview |
| Show the deadline calculation | `calculation` | C | C | | Calculation |
| Open the source letter | `open-letter` | O | O | | Open the letter |
| Try again after an error | `retry` | R | R | | Try again |
| Record an office event | `record-event` | E | E | | Record office event |
| Show what was filed today | `show-filed` | F | F | | Show filed today |
| Go to the matter | `go-matter` | G M | G M | | Matter … |
| Go to Intake | `go-intake` | G I | G I | | Intake |
| Next or previous row, item | | J, K, ↓, ↑ | J, K, ↓, ↑ | | The "1 / N" control in a detail's top bar |
| Open the row | | ↵ | ↵ | | |
| Close a menu, a step or a detail | | Esc | Esc | | |

`G M` and `G I` are sequences (G, then M). The shortcut registry has two-key chords that need overlapping presses but no sequences yet ([client-gaps.md](client-gaps.md)).
