#!/usr/bin/env bash
# Record where the copied IDE deliverable code came from (S5 D1, D2, D3).
#
# `packages/host/flowleap-deliverables/src/report/**`, `src/ledger/types.ts`,
# `src/guard/completion.ts`, the writer schema, `src/drafting/**`, `src/docx/**`,
# the drafting tool shells and the gate edits are copies of flowleap-agent-v2 files with
# their imports rewritten onto this package. The IDE stays the owner
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
  # S5 D2: the Application Drafting layer, the Word builders and the two tool shells.
  "$ide/tools/common/drafting/checklist.ts=src/drafting/checklist.ts"
  "$ide/tools/common/drafting/claimValidators.ts=src/drafting/claim-validators.ts"
  "$ide/tools/common/drafting/claims.ts=src/drafting/claims.ts"
  "$ide/tools/common/drafting/draftDiff.ts=src/drafting/draft-diff.ts"
  "$ide/tools/common/drafting/figureRules.ts=src/drafting/figure-rules.ts"
  "$ide/tools/common/drafting/figureValidators.ts=src/drafting/figure-validators.ts"
  "$ide/tools/common/drafting/figures.ts=src/drafting/figures.ts"
  "$ide/tools/common/drafting/filingDocuments.ts=src/drafting/filing-documents.ts"
  "$ide/tools/common/drafting/filingManifest.ts=src/drafting/filing-manifest.ts"
  "$ide/tools/common/drafting/finding.ts=src/drafting/finding.ts"
  "$ide/tools/common/drafting/findingsFile.ts=src/drafting/findings-file.ts"
  "$ide/tools/common/drafting/folderContract.ts=src/drafting/folder-contract.ts"
  "$ide/tools/common/drafting/frontmatter.ts=src/drafting/frontmatter.ts"
  "$ide/tools/common/drafting/fullReviewCopy.ts=src/drafting/full-review-copy.ts"
  "$ide/tools/common/drafting/inventorAnswers.ts=src/drafting/inventor-answers.ts"
  "$ide/tools/common/drafting/outline.ts=src/drafting/outline.ts"
  "$ide/tools/common/drafting/outlineValidators.ts=src/drafting/outline-validators.ts"
  "$ide/tools/common/drafting/sourceMarkers.ts=src/drafting/source-markers.ts"
  "$ide/tools/common/drafting/specValidators.ts=src/drafting/spec-validators.ts"
  "$ide/tools/common/drafting/styleFolder.ts=src/drafting/style-folder.ts"
  "$ide/tools/common/drafting/validateDraft.ts=src/drafting/validate-draft.ts"
  "$ide/tools/common/drafting/workingRecord.ts=src/drafting/working-record.ts"
  "$ide/tools/vscode-node/draftingWorkspace.ts=src/drafting/workspace.ts"
  "$ide/tools/vscode-node/draftDocx.ts=src/docx/draft.ts"
  "$ide/tools/vscode-node/inventorQuestionsDocx.ts=src/docx/inventor-questions.ts"
  "$ide/tools/vscode-node/exportDraftDocxTool.ts=src/tools/export-draft-docx.ts"
  "$ide/tools/vscode-node/inventorQuestionsTool.ts=src/tools/inventor-questions.ts"
  # S5 D3: the drafting saves, the three tool shells and the gates (the pure parts of the lens and the contribution).
  "$ide/tools/vscode-node/draftApplicationSave.ts=src/drafting/draft-application-save.ts"
  "$ide/tools/vscode-node/draftOutlineSave.ts=src/drafting/draft-outline-save.ts"
  "$ide/tools/vscode-node/startApplicationDraftTool.ts=src/tools/start-application-draft.ts"
  "$ide/tools/vscode-node/validateDraftTool.ts=src/tools/validate-draft.ts"
  "$ide/tools/vscode-node/removeClaimTool.ts=src/tools/remove-claim.ts"
  "$ide/tools/vscode-node/draftingGateLens.ts=src/gates/edits.ts"
  "$ide/tools/vscode-node/draftingGateContribution.ts=src/gates/commands.ts src/gates/questions.ts"
  "$ide/tools/vscode-node/test/applicationDraftingTools.spec.ts=tests/drafting-gates-tools.spec.ts"
  "$ide/tools/vscode-node/test/draftingGateLens.spec.ts=tests/gates-edits.spec.ts"
  "$ide/tools/vscode-node/test/draftingGateContribution.spec.ts=tests/gates-commands.spec.ts"
  "$ide/tools/common/test/draftingChecklist.spec.ts=tests/drafting-checklist.spec.ts"
  "$ide/tools/common/test/draftingClaimValidators.spec.ts=tests/drafting-claim-validators.spec.ts"
  "$ide/tools/common/test/draftingClaims.spec.ts=tests/drafting-claims.spec.ts"
  "$ide/tools/common/test/draftingDraftDiff.spec.ts=tests/drafting-draft-diff.spec.ts"
  "$ide/tools/common/test/draftingFigureValidators.spec.ts=tests/drafting-figure-validators.spec.ts"
  "$ide/tools/common/test/draftingFigures.spec.ts=tests/drafting-figures.spec.ts"
  "$ide/tools/common/test/draftingFilingManifest.spec.ts=tests/drafting-filing-manifest.spec.ts"
  "$ide/tools/common/test/draftingFindingsFile.spec.ts=tests/drafting-findings-file.spec.ts"
  "$ide/tools/common/test/draftingFolderContract.spec.ts=tests/drafting-folder-contract.spec.ts"
  "$ide/tools/common/test/draftingFrontmatter.spec.ts=tests/drafting-frontmatter.spec.ts"
  "$ide/tools/common/test/draftingImportBoundary.spec.ts=tests/drafting-import-boundary.spec.ts"
  "$ide/tools/common/test/draftingInventorAnswers.spec.ts=tests/drafting-inventor-answers.spec.ts"
  "$ide/tools/common/test/draftingOutline.spec.ts=tests/drafting-outline.spec.ts"
  "$ide/tools/common/test/draftingOutlineValidators.spec.ts=tests/drafting-outline-validators.spec.ts"
  "$ide/tools/common/test/draftingSourceMarkers.spec.ts=tests/drafting-source-markers.spec.ts"
  "$ide/tools/common/test/draftingSpecValidators.spec.ts=tests/drafting-spec-validators.spec.ts"
  "$ide/tools/common/test/draftingValidateDraft.spec.ts=tests/drafting-validate-draft.spec.ts"
  "$ide/tools/common/test/draftingWorkingRecord.spec.ts=tests/drafting-working-record.spec.ts"
  "$ide/tools/common/test/draftingTestClaims.ts=tests/drafting-test-claims.ts"
  "$ide/tools/vscode-node/test/draftDocx.spec.ts=tests/docx-draft.spec.ts"
  "$ide/tools/vscode-node/test/inventorQuestionsDocx.spec.ts=tests/docx-inventor-questions.spec.ts"
  "$ide/tools/vscode-node/test/inventorQuestionsDocxTestUtils.ts=tests/docx-test-utils.ts"
  "$ide/tools/common/test/fixtures/pipe-clamp/claims.md=tests/fixtures/pipe-clamp/claims.md"
  "$ide/tools/common/test/fixtures/pipe-clamp/draft-application.md=tests/fixtures/pipe-clamp/draft-application.md"
  "$ide/tools/common/test/fixtures/pipe-clamp/draft-outline.md=tests/fixtures/pipe-clamp/draft-outline.md"
  "$ide/tools/common/test/fixtures/pipe-clamp/feature-list.md=tests/fixtures/pipe-clamp/feature-list.md"
  "$ide/tools/common/test/fixtures/pipe-clamp/figures.md=tests/fixtures/pipe-clamp/figures.md"
  "$ide/tools/common/test/fixtures/pipe-clamp/inventor-answers.md=tests/fixtures/pipe-clamp/inventor-answers.md"
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
