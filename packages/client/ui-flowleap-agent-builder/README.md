---
description: "The FlowLeap agent builder in the dsh web client: New agent and Edit agent rows in the new-session agent picker and the agent form (name, description, instructions, files, connectors) over the flowleapAgents Remote."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-flowleap-agent-builder

## Summary

The new-session agent picker shows a **New agent** row after the presets, and an **Edit <name>** row while the chosen preset is one of the user's own agents. Both open the agent form: name, description, instructions, files (PDF, DOCX, TXT, MD) and the connector rows of the Host. **Save** creates or changes the agent through the `flowleapAgents` Remote of [`dsh-flowleap-agent-builder`](../../host/flowleap-agent-builder/README.md), then uploads the new files; the form then shows each file's index state and the agent's mode.

## Table of Contents

- [Use this package](#use-this-package)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the row beside [`ui-agent-preset`](../ui-agent-preset/README.md) in a web composition; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the id `ui-flowleap-agent-builder`. The rows register into the `agentPreset.menu.actions` list slot of the agent picker (the Edit row reads the `currentId` owner prop), and the form into `shell.overlay`. The package needs the `flowleapAgents` Remote of [`dsh-flowleap-agent-builder`](../../host/flowleap-agent-builder/README.md). All copy is in the `flowleapAgentBuilder` locale namespace in the eight shipped UI languages (en, zh, ja, es, fr, de, ru, pt).

A firm agent is read only and has no Edit row. A connector that the Host reports as not configured cannot be selected. **Save** sends each file added since the last Save to the Host upload route, one by one. After a create, or after **Save changes** with new files, the form stays open on the saved agent: each file row shows its state (Uploads on save, Indexing, Ready, Cannot read), and a line shows the mode, "All files in context" or "Search over files". **Save changes** without new files closes the form. The rows follow `flowleap-agents/changed`, and the new agent shows in the picker through `agent-preset/roster-changed`. Removing a saved file removes it on the Host; **Delete agent** asks for confirmation through the `RiskConfirmation` primitive. A Host refusal shows as an error line, and the draft stays. A failed upload names the file and one reason that the attorney can act on: no connection to the server, a server failure, a file above the size limit, a file type other than PDF, DOCX, TXT or MD, or another Host refusal. The file stays in the list as Uploads on save, and the next Save sends it again. A Peer without access to `flowleapAgents/list` (a Live Share viewer) sees no row.

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-agent-preset](../ui-agent-preset/README.md) — the agent picker and its `agentPreset.menu.actions` slot.
- [flowleap-agent-builder](../../host/flowleap-agent-builder/README.md) — the Host plugin: agent folders, presets, file index and the `flowleapAgents` Remote.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side surface that registers no model-facing tools or messages.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- After a create, the form does not select the new agent for the blank Session; the attorney chooses it in the picker. The agent-preset seat stages a choice through state that this package cannot reach without a new seam.
- A file upload shows no byte progress; the row shows Uploads on save until the Host answers.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
