---
description: "The FlowLeap agent builder in the dsh web client: a New agent row in the new-session agent picker and the agent form (name, description, instructions, files, connectors)."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-flowleap-agent-builder

## Summary

The new-session agent picker shows a **New agent** row after the presets. The row opens the agent form: name, description, instructions, files (drag and drop), and the configured connectors as check boxes. A connector without a key shows as not configured and cannot be selected.

This version shows sample data for the look-first review of ticket #55; the form saves nothing yet.

## Table of Contents

- [Use this package](#use-this-package)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount the row beside [`ui-agent-preset`](../ui-agent-preset/README.md) in a web composition; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the id `ui-flowleap-agent-builder`. The row registers into the `agentPreset.menu.actions` list slot of the agent picker, and the form into `shell.overlay`. All copy is in the `flowleapAgentBuilder` locale namespace in the eight shipped UI languages (en, zh, ja, es, fr, de, ru, pt).

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-agent-preset](../ui-agent-preset/README.md) — the agent picker and its `agentPreset.menu.actions` slot.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side surface that registers no model-facing tools or messages.

#### KV Cache effect

None.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- The form shows sample agent data and sample connector rows, and Save only closes the form.
