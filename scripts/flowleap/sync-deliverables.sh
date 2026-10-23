#!/usr/bin/env bash
# Record where the copied IDE deliverable code came from (S5 D1).
#
# `packages/host/flowleap-deliverables/src/report/**`, `src/ledger/types.ts`,
# `src/guard/completion.ts` and the writer schema are copies of flowleap-agent-v2
# files with their imports rewritten onto this package. The IDE stays the owner
# of those rules (port plan section 6, "No coupling to agent-v2"). SOURCE.json
# records the agent-v2 commit the copies came from and, per file, the IDE path,
# the IDE file's SHA-256 at that commit, and the local path.
#
#   scripts/flowleap/sync-deliverables.sh            # rewrite SOURCE.json from the agent-v2 checkout
#   scripts/flowleap/sync-deliverables.sh --check    # list the IDE files that changed since the pin
#
# FLOWLEAP_AGENT_V2_DIR overrides the agent-v2 checkout (default: the sibling
# `flowleap-agent-v2` directory of this repository's parent). The copies are
# hand-ported, so `--check` never rewrites them: a listed file is a rule to
# re-port by hand, not a silent fork.
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(cd "$here/../.." && pwd)
agent_v2=${FLOWLEAP_AGENT_V2_DIR:-$(cd "$root/.." && pwd)/flowleap-agent-v2}
package_dir="$root/packages/host/flowleap-deliverables"
source_file="$package_dir/SOURCE.json"
ide=extensions/copilot/src/extension

# IDE path => local path (relative to the package).
pairs=(
  "$ide/tools/common/patentReportTemplates.ts=src/report/templates.ts"
  "$ide/tools/common/patentReportProvenance.ts=src/report/provenance.ts"
  "$ide/tools/common/patentSecondRead.ts=src/report/second-read.ts"
  "$ide/tools/vscode-node/patentCandidateReview.ts=src/report/candidate-review.ts"
  "$ide/tools/vscode-node/patentFindBetter.ts=src/report/find-better.ts"
  "$ide/tools/vscode-node/patentFallbackLadder.ts=src/report/fallback-ladder.ts"
  "$ide/patentai/common/patentDocumentReference.ts=src/report/document-reference.ts"
  "$ide/tools/node/priorArtReportCompletion.ts=src/report/receipt.ts src/guard/completion.ts"
  "$ide/patentai/vscode-node/patentExecutionLedger.ts=src/ledger/types.ts"
  "$ide/tools/vscode-node/writePatentResultsTool.ts=src/writer.ts src/judge.ts"
  "extensions/copilot/package.json=src/writer-schema.ts"
  "$ide/tools/common/test/patentReportTemplates.spec.ts=tests/templates.spec.ts"
  "$ide/tools/common/test/patentReportProvenance.spec.ts=tests/provenance.spec.ts"
  "$ide/tools/common/test/patentSecondRead.spec.ts=tests/second-read.spec.ts"
  "$ide/tools/vscode-node/test/patentFallbackLadder.spec.ts=tests/fallback-ladder.spec.ts"
  "$ide/tools/vscode-node/test/patentWorkingRecord.spec.ts=tests/working-record.spec.ts"
  "$ide/tools/node/test/priorArtReportCompletion.spec.ts=tests/completion.spec.ts"
)

mode=sync
case "${1:-}" in
  '') ;;
  --check) mode=check ;;
  *) echo "usage: $0 [--check]" >&2; exit 2 ;;
esac

if [[ ! -d "$agent_v2/$ide" ]]; then
  echo "sync-deliverables: no agent-v2 checkout at $agent_v2 (set FLOWLEAP_AGENT_V2_DIR)" >&2
  exit 1
fi

hash_at() { # $1 = commit, $2 = path
  git -C "$agent_v2" show "$1:$2" | shasum -a 256 | cut -d' ' -f1
}

if [[ $mode == check ]]; then
  if [[ ! -f "$source_file" ]]; then
    echo "sync-deliverables --check: $source_file is missing; run the sync first" >&2
    exit 1
  fi
  pinned=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).agentV2Commit)' "$source_file")
  head_commit=$(git -C "$agent_v2" rev-parse HEAD)
  status=0
  while IFS=$'\t' read -r ide_path recorded; do
    current=$(hash_at "$head_commit" "$ide_path" 2>/dev/null || echo missing)
    if [[ $current != "$recorded" ]]; then
      echo "sync-deliverables --check: $ide_path changed since $pinned (now $current at $head_commit); re-port its rule by hand" >&2
      status=1
    fi
  done < <(node -e 'for (const f of JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).files) console.log(`${f.idePath}\t${f.ideSha256}`)' "$source_file")
  if [[ $status == 0 ]]; then
    echo "sync-deliverables --check: every copied IDE file is unchanged between $pinned and agent-v2 $head_commit"
  fi
  exit $status
fi

commit=$(git -C "$agent_v2" rev-parse HEAD)
dirty=$(git -C "$agent_v2" status --porcelain -- "$ide" extensions/copilot/package.json | wc -l | tr -d ' ')
{
  echo '{'
  echo '  "agentV2Repository": "https://github.com/abdullahatrash/flowleap-agent-v2",'
  echo "  \"agentV2Commit\": \"$commit\","
  echo "  \"agentV2Dirty\": $([[ $dirty == 0 ]] && echo false || echo true),"
  echo "  \"syncedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo '  "note": "Hand-ported copies with import rewrites; the IDE stays the owner of these rules. --check lists the IDE files that changed since the pin.",'
  echo '  "files": ['
  first=1
  for pair in "${pairs[@]}"; do
    ide_path=${pair%%=*}
    local_paths=${pair#*=}
    sha=$(hash_at "$commit" "$ide_path")
    [[ $first == 1 ]] || echo ','
    first=0
    printf '    { "idePath": "%s", "ideSha256": "%s", "localPaths": [%s] }' "$ide_path" "$sha" "$(for p in $local_paths; do printf '"%s", ' "$p"; done | sed 's/, $//')"
  done
  echo
  echo '  ]'
  echo '}'
} > "$source_file"
echo "sync-deliverables: SOURCE.json pinned to flowleap-agent-v2 $commit ($(( ${#pairs[@]} )) IDE files)"
