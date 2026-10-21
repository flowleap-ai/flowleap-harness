---
description: "File-backed system-prompt persona for deployments that own the complete agent identity outside this repository, such as the FlowLeap Patent Agent prompt exported from flowleap-agent-v2."
kind: "package-reference"
---

# @deepseek-ai/dsh-flowleap-prompt

## Summary

`dsh-flowleap-prompt` puts the content of one Markdown file into the system prompt as the `flowleap:patent-agent` section at the persona slot, literally, so a prompt that is authored and versioned elsewhere drives a dsh agent without being copied into YAML. Choose it when another repository owns the persona text; use `personaPrefix` on `dsh-system-prompt` for a short inline persona. The file is read when the row applies; a missing file logs an error and the profile boots without the persona.

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

Mount the row beside `dsh-system-prompt` with the absolute path of the persona file; the whole file becomes one prompt section.

### When to choose it

Choose this row when the persona text lives in a file that another process writes — the FlowLeap Patent Agent prompt is rendered by `flowleap-agent-v2` and loaded here. Avoid it for a one-line persona: `personaPrefix` on [`dsh-system-prompt`](../../core/system-prompt/README.md) needs no file. Set `includeHarnessIdentity: false` on that row when the file owns the identity sentence, as the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
  config:
    includeHarnessIdentity: false
- name: '@deepseek-ai/dsh-flowleap-prompt'
  config:
    path: /srv/flowleap/patent-agent.md
```

| Field | Default | Meaning |
|---|---|---|
| `path` | required | Absolute path of the Markdown file whose whole content becomes the section text |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-flowleap-prompt) is the exhaustive source for every accepted field.

A relative `path` rejects at load. A path that cannot be read logs `flowleap-prompt: cannot read <path>` at error level and registers no section, so the agent runs on the remaining first-party sections. The file is read once per apply: edit the file, then reload the row (HMR reloads it when the Loader configuration changes) to pick up the new text. `{{…}}` groups in the file stay literal.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin is one `apply`: validate that the path is absolute, read the file synchronously, and register a `ctx.systemPrompt.section()` effect named `flowleap:patent-agent` at order `0` with `interpolate: false`. The deployment persona prefix also sits at order `0` under the name `deployment:persona-prefix`, which sorts first; a profile that uses this row leaves that prefix empty. Disposing the row removes the section.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Config schema, path validation, file read, section effect |
| [`tests/flowleap-prompt.spec.ts`](tests/flowleap-prompt.spec.ts) | Section text and order, missing file, relative path |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [System-prompt package](../../core/system-prompt/README.md) — the registry, section ordering, and `includeHarnessIdentity`.
- [dsh-flowleap-web bundle](../../bundle/flowleap-web/README.md) — the profile layer that mounts this row at the bundled placeholder.
- [dsh-persona](../../preset/persona/README.md) — the scope-only inline persona row for agent presets.
- [System-prompt subsystem](../../../docs/subsystems/system-prompt.md) — cross-package prompt assembly.

-----

<a id="model-experience"></a>
## Model Experience

### The patent-agent section

#### What the model sees

One system-prompt section, `flowleap:patent-agent`, whose text is the configured file's content, byte for byte: no variable interpolation and no trimming. It renders at order `0`, before every first-party guidance section and after the harness identity when a deployment keeps that opener. The text is file-owned and deployment-specific; the `dsh-flowleap-web` placeholder is one paragraph naming FlowLeap Patent AI.

#### Token effect

Fixed per request while the file is unchanged: the whole file's tokens on every request of every agent in the mounting scope. A missing file contributes nothing.

#### KV Cache effect

Prefix-stable while the file content is unchanged. A reload that reads different content changes the early prefix and may invalidate reuse from the first changed token; provider cache sharing is not guaranteed.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits describe when the row needs operational attention; they are current package constraints, not a task backlog.

- **The file is not watched** — the text is read when the row applies; an edited file reaches the model only after the row reloads.
- **Absolute paths only** — the row cannot resolve a bundle-relative or package-specifier path itself; the mounting patch computes the absolute path, as the `dsh-flowleap-web` patch does through the dsh installation.
- **A missing file is not a boot failure** — the profile starts without its persona and only the error log reports it; a deployment that must not run without the prompt checks the log or the first system message.
- **No `complete: true` mode yet** — the section joins the first-party sections; owning the complete prompt is the S2 slice in the FlowLeap handoff.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
