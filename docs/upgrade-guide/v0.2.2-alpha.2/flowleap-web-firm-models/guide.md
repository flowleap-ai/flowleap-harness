---
kind: upgrade-guide
description: "The flowleap-web profile fixes its model routes and keys, ignores user patches for its locked rows, and refuses plugin installs."
---
# flowleap-web firm models

## Change

Before, an attorney on `flowleap-web` could add a model route, change an endpoint or key reference on the Models page, type an own API key, sign in with a Claude or ChatGPT subscription, switch DeepSeek rows on, and install plugins. Now:

- `llm-pi-ai` sets `fixedRoutes: true`: settings changes of routes are refused, and there is no subscription sign-in and no endpoint discovery.
- `credentials` sets `lockedRefs` for `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, and `MISTRAL_API_KEY`: a key typed in the browser is refused, and a key stored before is ignored.
- The Models page (`ui-settings-models` `managed: true`) shows the routes with a notice and no Edit or Add button.
- The bundle locks `llm-pi-ai`, `credentials`, `ui-settings-models`, `plugin-manager`, and the DeepSeek route and sign-in rows (`dsh.bundle.lockedRows`). A row for one of them, or an insert of another row of their plugins, in `$DSH_HOME/profiles/<profile>/cordis.patch.yml` or `$DSH_HOME/cordis.patch.yml` is ignored, and startup prints `ignoring the "<id>" row of <file>`. A Models page save from before this release is such a row.
- `plugin-manager` sets `installBundles: false` and `offeredBundles: []`: installs, updates, new bundle selections, and deselecting `flowleap-web` answer `deployment-locked`.

The `web` profile does not change.

## Migration

1. Remove each row that startup names (`ignoring the "llm-pi-ai" row …`) from the named `cordis.patch.yml`, and any row for a locked id from `$DSH_HOME/cordis.patch.yml`. These rows have no effect, so this only removes the warning.
2. Delete the `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, and `MISTRAL_API_KEY` entries from `$DSH_HOME/.credentials.yaml` if an attorney typed them before. They are ignored, but they stay on disk until you delete them. The deployment's keys come from the environment or the read-only keys file.
3. A deployment overlay (`--patch`) that restates the `llm-pi-ai` row must restate `fixedRoutes: true`; otherwise the `ui-settings-models` row fails at load and names the row.
4. Start the profile, open Settings > Models, and confirm the notice "Models run only through the firm's AI gateway" with no Edit and no Add model provider button.
