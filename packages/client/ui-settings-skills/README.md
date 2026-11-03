---
description: "The read-only Skills settings section of the dsh web client: each skill of the agent with its source, description, full text, and replace note, and the skill files with faults, over the skillInventory Remote."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-skills

## Summary

Open **Settings** and select **Skills** to see the skills of the agent that a new chat gets. Each skill is one read-only card with its name, its source tag (a plugin product name such as **FlowLeap methods**, **Firm**, **Mine**, or **Project**), its description, and **Show full text**. When two skills have the same name, both cards say which one replaces the other. A skill file with a frontmatter fault shows under **Skills with faults** with its path and the reason. The page has no edit control. The Host half serves the `skillInventory` Remote over [`ctx.skills.inspect()`](../../skill/skill/README.md).

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the row in a web composition that mounts `dsh-skill`. The [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the id `ui-settings-skills`, and the FlowLeap desktop profile stacks on that bundle, so both show the section.

```yaml
- id: ui-settings-skills
  name: '@deepseek-ai/dsh-client-ui-settings-skills'
  config:
    pluginNames:
      flowleap: FlowLeap methods
```

`pluginNames` maps a skill provider name to the product name on the source tag. A provider without an entry shows its own name.

### The view

The section opens with the line "A skill is a method that your agent follows for one type of task." The page shows the view of a new chat: the default working directory and the default agent preset's standing scope, which is the view of the `/` list of a new chat. The list holds every skill of that view, also a skill that only the agent starts (its card says so) and a skill that only the user starts from the `/` list. The page reads the inventory each time the section opens; there is no live update while it is open.

### Sources

The source tag comes from the skill's discovery source, a fixed provider protocol value:

| Source | Tag |
|---|---|
| `user-dsh`, `user-agents` | **Mine** |
| `project-dsh`, `project-agents` | **Project** |
| `firm` | **Firm** |
| any other | the `pluginNames` entry of the provider, else the provider name |

### Observable success and failures

While the inventory loads, a spinner is centered in the section. When the read fails, the section shows "The skills could not be read." with **Retry**. When a provider failed during discovery, a line says that some skill folders could not be read. When the view has no skill, the section says so. When the full text cannot be read, the card shows the failure with **Retry**; when the skill file is gone, it asks the user to open the page again. Each fault kind has its own sentence: no frontmatter block, frontmatter that is not valid YAML, a missing `name` or `description` field, an invalid name, an invalid invocation field, or a file that is not text.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host half is the `SkillInventoryService`, a `TypertRemoteService` under the key and namespace `skillInventory` that injects `skills` and `workingDirectory`. `list()` calls `ctx.skills.inspect()` with the default working directory and a lease from `agentPresets.acquireScope(undefined)` when the preset registry is mounted, and maps each entry, each `replacedBy`, and each fault to a `SkillOrigin`. `read({ name, provider, source })` calls `ctx.skills.read()` in the same view and throws `skill/not-found` when the view holds no such candidate. A failed discovery throws `gateway/internal`. Both endpoints are `owner-only` for a LiveShare viewer.

The browser half keeps one `SkillsStore` over `ctx.remote.skillInventory`: the inventory read as a closed status union, and one full-text read per candidate key. A reload drops the full texts. The section registers into `settings.section` with id `skills` and `locale: NS`, so its copy arrives through the framework `t` seat in the eight shipped UI languages (en, zh, ja, es, fr, de, ru, pt). The full text renders through the shared `DetailDocument`, so raw HTML in a skill body is omitted.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host half: the `skillInventory` Remote, the `pluginNames` Config, and the origin rule |
| [`src/types.ts`](src/types.ts) | the Remote's request and response types |
| [`src/client/index.ts`](src/client/index.ts) | dictionaries and the section registration |
| [`src/client/skills-store.ts`](src/client/skills-store.ts) | page state and the Remote calls |
| [`src/client/SkillsSection.tsx`](src/client/SkillsSection.tsx) | the section, its states, and the faults group |
| [`src/client/SkillCard.tsx`](src/client/SkillCard.tsx) | one card, the source tag, the replace notes, and the full text |
| [`tests/`](tests/) | the Remote over a real registry, the section as rendered, and the plugin registration |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-skill](../../skill/skill/README.md) — `inspect()`, `read()`, and the merge rule that decides which skill replaces which.
- [dsh-skill-filesystem](../../skill/skill-filesystem/README.md) — the provider that reports the faults.
- [Skills subsystem](../../../docs/subsystems/skills.md) — the registry, the providers, and the Remotes.
- [ui-settings](../ui-settings/README.md) — the settings shell and the `settings.section` slot.
- [ui-primitives](../ui-primitives/README.md) — `Tag`, `Button`, `PathLabel`, `StateDot`, and `DetailDocument`.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side settings surface that registers no model surface.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **One view only** — the page shows the view of a new chat with the default agent preset; a chat on another preset or in another working directory can have other skills.
- **No live update** — a skill file changed while the page is open shows after the section opens again; the `skills/change` event does not reach the browser.
- **Two skills of one provider and source with one name** — the replaced one opens the text of the one in use, because a skill reference has no path.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
