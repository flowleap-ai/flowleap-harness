# Desktop model step

On the FlowLeap desktop profile (`flowleap-desktop`), the attorney adds a model on Settings > Models without help: **Connect OpenRouter** on the OpenRouter card, or an Anthropic or OpenAI key on its card, and **Test** on each card once a key is saved. A test or a connect goes only to the provider that the attorney chose. When the default model of new chats has no key, the first provider that works becomes the default, and the result line says "New chats use <model>." A chat turn without a model key shows a card with a button to the Models page, not the developer text; on the firm profile the card says to ask the administrator.

## Sub-features

- `model-step-controls` shows **Connect OpenRouter** on the OpenRouter card and no **Test** on a card without a saved key.
- `model-test-refused` saves a wrong OpenAI key and shows "The provider refused the key (HTTP 401)…" after **Test**.
- `model-test-ok` saves a working key and shows "The key works." after **Test**.
- `model-openrouter-connect` connects OpenRouter through the browser and shows "OpenRouter is connected. New chats use anthropic/claude-sonnet-5.5."
- `model-missing-card` sends a message with no model key and shows the missing-model card and its button to the Models page.

## How to get to it (user POV)

- Settings > Models: the Anthropic, OpenAI, and OpenRouter cards.
- A chat: send a message before a model is set up.

## Driving it with the browser tool

Preconditions:

- Start the instance with `DSH_VERIFY_PROFILE=flowleap-desktop`. The run reads no model key from the environment, and the model key store is writable. `web.sh doctor` shows `PASS profile: flowleap-desktop` and an `INFO key` line.
- The baseline in [README.md](./README.md), except the model: the composer shows no usable model until a step has worked.

Steps:

- **Controls.** Open Settings > Models. The OpenRouter card has the button `Connect OpenRouter` and the hint "Opens OpenRouter in your browser…". No card has `Test` yet.
- **Refused key.** In the OpenAI card, type a wrong key such as `sk-wrong` in `API key`, Apply, then `Test`. A `status` element holds "The provider refused the key (HTTP 401). Check the key and save it again." This call goes to `api.openai.com` and costs nothing, but ask the founder before you send it.
- **Working key.** Only the founder enters a real key. To test the founder's OpenRouter key without typing it, start the run with `DSH_VERIFY_PROFILE=flowleap-desktop DSH_VERIFY_KEEP_OPENROUTER=1`, then `Test` on the OpenRouter card: a `status` element holds "The key works. New chats use anthropic/claude-sonnet-5.5." and a new chat shows that model. Ask before each live call.
- **Connect.** `Connect OpenRouter` shows "Waiting for OpenRouter in your browser…", the link `Open the OpenRouter page again`, and `Cancel`; `Cancel` shows "The connection was cancelled." The browser pane blocks a popup that the agent's click opens, so the founder clicks `Connect OpenRouter`, signs in to OpenRouter, and approves; then a `status` element holds "OpenRouter is connected."
- **Missing model card.** Before any key is saved, send `Reply with exactly: FLOWLEAP-VERIFY-OK` in a new chat. The chat shows the missing-model card with its button; the button opens Settings > Models. No request leaves the machine.

## Gotchas

- The OpenRouter callback goes to a loopback port of the server, so drive the connect in a browser on the same machine as the instance.
- `web.sh stop` deletes the profile marker; the next `start` without `DSH_VERIFY_PROFILE` is the firm profile again.
