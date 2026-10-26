#!/usr/bin/env bash
# FlowLeap fork: remove the Simplified Chinese documentation layer and its pairing records.
# Re-run after every upstream merge; it is idempotent. Code-level patches (gates, generators,
# website locale, specs, agent rules) live in ordinary commits and merge on their own.
#
# Carve-outs that stay bilingual because their tooling is bilingual by design and sealed by hash:
#   docs/persistence-changes/**            (persistence-formats/releases/changes scripts)
#   docs/persistence-catalog.*             (gen-persistence-catalog, persistence-formats)
#   docs/experimental-persistence-catalog.*
#   docs/session-format-status.*           (persistence-finalization)
#   .agents/notes/archived/**              (verify-archived-agent-notes: sealed md+zh+i18n triplets)
# Kept because they are UI resources, not documentation twins:
#   packages/**/docs/DETAIL.zh.md          (the Chinese plugin detail page that locale/zh.json meta.detail names)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

KEEP='^(docs/persistence-changes/|docs/persistence-catalog\.|docs/experimental-persistence-catalog\.|docs/session-format-status\.|\.agents/notes/archived/)|/docs/DETAIL\.zh\.md$'

# 1. Chinese pages and the translation pairing records, outside the carve-outs.
git ls-files -z -- '*.zh.md' '*.i18n.yaml' | tr '\0' '\n' | { grep -vE "$KEEP" || true; } | tr '\n' '\0' | xargs -0 -r git rm -qf --
find . -path ./node_modules -prune -o \( -name '*.zh.md' -o -name '*.i18n.yaml' \) -print \
  | sed 's|^\./||' | { grep -vE "$KEEP" || true; } | tr '\n' '\0' | xargs -0 -r rm -f --

# 2. The translation contract, prompt, brief, skill, gate entrypoints and the website's zh-CN fixtures.
for p in docs/i18n .agents/skills/dsh-translate-docs \
  scripts/gen-translation-brief.ts scripts/translation-brief.ts scripts/translation-brief.spec.ts \
  scripts/translation-prompt.ts scripts/translation-prompt.spec.ts scripts/translation-prompt.expected.spec.ts \
  scripts/verify-translation-pairing.ts scripts/verify-translation-prompt.ts; do
  if git ls-files --error-unmatch "$p" >/dev/null 2>&1; then git rm -rqf -- "$p"; fi
  rm -rf -- "$p"
done
git ls-files -z -- 'website/tests/expected/*.zh-CN.*' | xargs -0 -r git rm -qf --

# 3. The bilingual header line "English | [中文](X.zh.md)" at the top of every English page outside the carve-outs.
git ls-files -s -- '*.md' | awk '$1 != "120000" { sub(/^[^\t]*\t/, ""); print }' | { grep -vE "$KEEP" || true; } | tr '\n' '\0' \
  | xargs -0 -r perl -0pi -e 's/^English \| \[中文\]\([^)]*\)\n\n?//m'
