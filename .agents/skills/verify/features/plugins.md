# Plugins page

The sidebar row `Plugins` opens the Plugins page in both profiles. Its first group, `Included plugins`, shows each running FlowLeap plugin that adds a tool or a part of the interface: the product name, the description, `Tools: N` (the tool names show on hover), `Interface`, and the state. No card shows a package name such as `@deepseek-ai/dsh-…`, a row id, or an install spec. On the firm (`flowleap-web`) the page is read-only: the intro says that the firm administrator manages the plugins, no control changes a plugin, and the Host refuses each change. The desktop (`flowleap-desktop`) keeps its switches and plugin settings and offers no `Add plugin`, because it installs no package.

## Sub-features

- `plugins-firm-readonly` shows the read-only intro, the `Included plugins` cards with what each adds and its state, and no switch, `Add plugin`, `More`, or `Built-in plugin settings` group.
- `plugins-product-names` shows product names only, on the cards and on a plugin's page, in both profiles.
- `plugins-desktop-controls` shows the switches and the `Built-in plugin settings` group on the desktop, and no `Add plugin`.
- `plugins-host-refuses` refuses each plugin change on the firm with `deployment-locked`. The page has no control for it, so [`apps/web/tests/flowleap-attorney-pages.e2e.ts`](../../../../apps/web/tests/flowleap-attorney-pages.e2e.ts) proves it on the real firm composition: a plugin switch, the deselection of `dsh-flowleap-firm`, and an install.

## How to get to it (user POV)

Select `Plugins` in the sidebar, or open `?page=plugins`.

## Driving it with the browser tool

Preconditions:

- The baseline in [README.md](./README.md). No model turn is needed.
- For the desktop, start a second instance with `DSH_VERIFY_PROFILE=flowleap-desktop` on another port.

- **Firm.** Open `Plugins`. Wait for the text `See the plugins that your agent uses. Your firm administrator manages them.` The group `Included plugins` lists `Patent data connectors` with `Tools: N` and `Interface`, `Patent deliverables` with `Tools: N`, and the pages such as `Dashboard` and `Office actions` with `Interface`; each shows `Running`. `find` returns no `switch` and no button `Add plugin`.
- **Names.** `get_page_text` contains no `@deepseek-ai` and no `dsh-`.
- **Desktop.** Open `Plugins` on the desktop instance. The intro is `Install, enable, and configure plugins`; `Included plugins` shows the same cards plus `FlowLeap model step`; `Experimental plugins` has switches; there is no button `Add plugin`. Open an experimental plugin: its page shows no package name and no `Source` section.

## Gotchas

- The page reads the deployment from the page global `__DSH_PLUGIN_MANAGER_DEPLOYMENT__`; after a Host change, start the instance again and load the page again.
- `MCP client` is the row of the paid FlowLeap tools (`mcp__flowleap__*`); without a signed-in `flowleap` CLI it shows no tools.
- A row that adds no tool and no interface part, such as the Patent Agent prompt or an agent preset declaration, has no card.
