# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

This repository has one FlowLeap context (single-context layout, kept under `flowleap/`):

- **`flowleap/docs/GLOSSARY.md`**: the FlowLeap glossary.
- **`flowleap/docs/adr/`**: read ADRs that touch the area you're about to work in.

Upstream dsh terms come from `docs/glossary.md` and its decisions from `.agents/notes/`. FlowLeap documents use those terms as defined there and never redefine them. A FlowLeap term that also exists upstream gets a different name.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── docs/glossary.md                   ← upstream dsh terms (not ours)
├── .agents/notes/                     ← upstream dsh decisions (not ours)
└── flowleap/docs/
    ├── GLOSSARY.md                    ← FlowLeap terms (created by /domain-modeling)
    └── adr/
        └── 0001-self-hosted-firm-os.md
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `flowleap/docs/GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
