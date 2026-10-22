#!/usr/bin/env bash
# Vendor the FlowLeap connector library (`@flowleap/connectors`, flowleap-backend
# `packages/connectors`) into `vendor/flowleap-connectors` (ADR 0019 C2).
#
# The library is not on npm. Its source of truth is the backend checkout; this
# script copies `src/` verbatim plus the upstream `package.json` and
# `tsconfig*.json` (kept under `upstream/` for reference: the harness owns the
# manifest and build config beside them), then records the backend commit and a
# content hash in `SYNC.json`.
#
#   scripts/flowleap/sync-connectors.sh            # copy from the backend checkout
#   scripts/flowleap/sync-connectors.sh --check    # fail when the copy drifts
#
# FLOWLEAP_BACKEND_DIR overrides the backend checkout (default: the sibling
# `flowleap-backend` directory of this repository's parent).
#
# `src/harness/` is harness-owned (the mupdf stand-in) and is never copied or
# hashed. The hash covers every other file under `src/` and the three upstream
# manifests, so `--check` fails on an edited vendored file, on a changed backend
# file, and on a dependency the backend added.
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(cd "$here/../.." && pwd)
backend=${FLOWLEAP_BACKEND_DIR:-$(cd "$root/.." && pwd)/flowleap-backend}
source_dir="$backend/packages/connectors"
vendor_dir="$root/vendor/flowleap-connectors"
sync_file="$vendor_dir/SYNC.json"
manifests=(package.json tsconfig.json tsconfig.build.json)

mode=sync
case "${1:-}" in
  '') ;;
  --check) mode=check ;;
  *) echo "usage: $0 [--check]" >&2; exit 2 ;;
esac

if [[ ! -d "$source_dir/src" ]]; then
  echo "sync-connectors: no connectors package at $source_dir (set FLOWLEAP_BACKEND_DIR)" >&2
  exit 1
fi

# Content hash of one tree: sorted relative paths and per-file sha256, hashed once.
# $1 = directory holding `src/`, $2 = directory holding the upstream manifests.
content_hash() {
  local src_root=$1 manifest_root=$2
  {
    (cd "$src_root" && find src -type f ! -path 'src/harness/*' | LC_ALL=C sort | while IFS= read -r file; do
      printf '%s  %s\n' "$(shasum -a 256 "$file" | cut -d' ' -f1)" "$file"
    done)
    for name in "${manifests[@]}"; do
      printf '%s  %s\n' "$(shasum -a 256 "$manifest_root/$name" | cut -d' ' -f1)" "upstream/$name"
    done
  } | shasum -a 256 | cut -d' ' -f1
}

backend_commit=$(git -C "$backend" rev-parse HEAD)
backend_dirty=$(git -C "$backend" status --porcelain -- packages/connectors | wc -l | tr -d ' ')
source_hash=$(content_hash "$source_dir" "$source_dir")

if [[ $mode == check ]]; then
  status=0
  if [[ ! -f "$sync_file" ]]; then
    echo "sync-connectors --check: $sync_file is missing; run the sync first" >&2
    exit 1
  fi
  recorded_hash=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).contentHash)' "$sync_file")
  recorded_commit=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).backendCommit)' "$sync_file")
  vendored_hash=$(content_hash "$vendor_dir" "$vendor_dir/upstream")
  if [[ $vendored_hash != "$recorded_hash" ]]; then
    echo "sync-connectors --check: the vendored copy was edited (hash $vendored_hash, SYNC.json records $recorded_hash)" >&2
    status=1
  fi
  if [[ $source_hash != "$recorded_hash" ]]; then
    echo "sync-connectors --check: the backend checkout differs from the vendored copy (backend $backend_commit${backend_dirty:+ with $backend_dirty uncommitted connector change(s)}, SYNC.json records $recorded_commit); re-run the sync" >&2
    status=1
  fi
  # The harness manifest mirrors the upstream runtime dependencies by hand.
  node - "$vendor_dir/package.json" "$vendor_dir/upstream/package.json" <<'NODE' || status=1
const { readFileSync } = require('node:fs')
const [harness, upstream] = process.argv.slice(2).map(file => JSON.parse(readFileSync(file, 'utf8')))
// `mupdf` (AGPL-3.0) is not installed in the harness: `src/harness/mupdf.ts`
// stands in for it (see vendor/flowleap-connectors/README.md).
const REPLACED = new Set(['mupdf'])
const sorted = deps => JSON.stringify(Object.fromEntries(Object.entries(deps ?? {}).filter(([name]) => !REPLACED.has(name)).sort()))
const ours = sorted(harness.dependencies)
const theirs = sorted(upstream.dependencies)
if (ours !== theirs) {
  console.error(`sync-connectors --check: vendor/flowleap-connectors/package.json dependencies ${ours} differ from upstream ${theirs}; mirror them`)
  process.exit(1)
}
NODE
  if [[ $status == 0 ]]; then
    echo "sync-connectors --check: vendor/flowleap-connectors matches flowleap-backend $backend_commit (hash $vendored_hash)"
  fi
  exit $status
fi

mkdir -p "$vendor_dir/src" "$vendor_dir/upstream"
rsync -a --delete --exclude 'harness/' "$source_dir/src/" "$vendor_dir/src/"
for name in "${manifests[@]}"; do
  cp "$source_dir/$name" "$vendor_dir/upstream/$name"
done
upstream_version=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).version)' "$source_dir/package.json")
cat > "$sync_file" <<JSON
{
  "package": "@flowleap/connectors",
  "upstreamVersion": "$upstream_version",
  "backendRepository": "https://github.com/abdullahatrash/flowleap-backend",
  "backendPath": "packages/connectors",
  "backendCommit": "$backend_commit",
  "backendDirty": $([[ $backend_dirty == 0 ]] && echo false || echo true),
  "contentHash": "$source_hash",
  "syncedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON
echo "sync-connectors: copied flowleap-backend $backend_commit packages/connectors (hash $source_hash) into vendor/flowleap-connectors"
