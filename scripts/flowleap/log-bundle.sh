#!/usr/bin/env bash
# Build the support log bundle FlowLeap asks for: flowleap-support-<host>-<date>.tar.gz
# in the current directory, with the doctor report (text and JSON), SYNC.json,
# brand.json, the harness log tail (2,000 lines), the `--dump-config` output and a
# MANIFEST. Every text file passes the doctor's scrub; the config dump also has
# every apiKey*/token*/secret* value blanked. The bundle never contains the
# credential store, the storages directory or the FlowLeap CLI's own files, and
# it prints what it refused.
#
#   scripts/flowleap/log-bundle.sh --container harness-alice        # a Docker instance (docker logs + docker exec)
#   scripts/flowleap/log-bundle.sh --log ./harness.log              # this checkout, with a captured log file
#   scripts/flowleap/log-bundle.sh --dsh-home /srv/alice/.dsh       # a non-default harness home
#   scripts/flowleap/log-bundle.sh --include ./extra-notes.txt      # one more file (refused if it is a secret store)
#
# Local mode runs the doctor through tsx from this checkout (or through
# $HARNESS_ROOT/flowleap/doctor.mjs on an installed image root).
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(cd "$here/../.." && pwd)

container=''
log_file=''
dsh_home=${DSH_HOME:-$HOME/.dsh}
profile=flowleap-web
out_dir=$PWD
includes=()

usage() {
  sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --container) container=$2; shift 2 ;;
    --log) log_file=$2; shift 2 ;;
    --dsh-home) dsh_home=$2; shift 2 ;;
    --profile) profile=$2; shift 2 ;;
    --out) out_dir=$2; shift 2 ;;
    --include) includes+=("$2"); shift 2 ;;
    -h | --help) usage; exit 0 ;;
    *) echo "log-bundle: unknown argument $1" >&2; usage >&2; exit 2 ;;
  esac
done

# ── the doctor and its scrub, in the mode chosen ─────────────────────────────
if [[ -n $container ]]; then
  docker container inspect "$container" > /dev/null 2>&1 || { echo "log-bundle: no container named $container" >&2; exit 1; }
  doctor() { docker exec "$container" harness-doctor "$@"; }
  scrub() { docker exec -i "$container" harness-doctor --scrub "$@"; }
  dump_config() { docker exec "$container" sh -c 'exec node "$DSH_BIN" "$@"' sh --profile "$profile" --dump-config; }
  host_label=$container
elif [[ -f ${HARNESS_ROOT:-/nonexistent}/flowleap/doctor.mjs ]]; then
  doctor() { node "$HARNESS_ROOT/flowleap/doctor.mjs" --dsh-home "$dsh_home" --profile "$profile" "$@"; }
  scrub() { node "$HARNESS_ROOT/flowleap/doctor.mjs" --scrub "$@"; }
  dump_config() { node "${DSH_BIN:-$HARNESS_ROOT/node_modules/@deepseek-ai/dsh/lib/bin.js}" --profile "$profile" --dump-config; }
  host_label=$(hostname -s)
else
  doctor() { (cd "$root" && pnpm -s exec tsx scripts/flowleap/doctor.ts --dsh-home "$dsh_home" --profile "$profile" "$@"); }
  scrub() { (cd "$root" && pnpm -s exec tsx scripts/flowleap/doctor.ts --scrub "$@"); }
  dump_config() { (cd "$root" && DSH_HOME=$dsh_home node --import tsx/esm apps/cli/src/bin.ts --profile "$profile" --dump-config); }
  host_label=$(hostname -s)
fi

# ── refuse secret stores ─────────────────────────────────────────────────────
excluded=()
refused() {
  local candidate
  candidate=$(cd "$(dirname "$1")" 2> /dev/null && pwd -P)/$(basename "$1") || candidate=$1
  local home_real
  home_real=$(cd "$dsh_home" 2> /dev/null && pwd -P) || home_real=$dsh_home
  case "$candidate" in
    "$home_real"/.credentials* | */.credentials.yaml | */.credentials.yaml.* | */storages/* | */.flowleap/* | */.config/flowleap/* | */.env | */.env.*)
      return 0 ;;
  esac
  return 1
}

stamp=$(date -u +%Y%m%d-%H%M%S)
name="flowleap-support-${host_label}-${stamp}"
staging=$(mktemp -d "${TMPDIR:-/tmp}/${name}.XXXXXX")
bundle_dir="$staging/$name"
mkdir -p "$bundle_dir"
trap 'rm -rf "$staging"' EXIT

note() { printf 'log-bundle: %s\n' "$*" >&2; }

# ── collect ──────────────────────────────────────────────────────────────────
doctor_args=()
if [[ -n $log_file ]]; then
  if refused "$log_file"; then
    excluded+=("$log_file (a secret store, not a log)")
    log_file=''
  else
    doctor_args+=(--log "$log_file")
  fi
fi

note "doctor report"
# `${arr[@]+"${arr[@]}"}` expands an empty array to nothing under `set -u` on bash 3.2 (macOS) as well.
doctor ${doctor_args[@]+"${doctor_args[@]}"} > "$bundle_dir/doctor.txt" || note "doctor (text) exited non-zero; its output is kept"
doctor ${doctor_args[@]+"${doctor_args[@]}"} --json > "$bundle_dir/doctor.json" || note "doctor (json) exited non-zero; its output is kept"

note "library pin and brand"
if [[ -n $container ]]; then
  docker exec "$container" cat /opt/harness/flowleap/SYNC.json > "$bundle_dir/SYNC.json" 2> /dev/null || note "SYNC.json not found in the container"
  # brand.json sits inside the deployed closure; resolve it through the dsh package, as the profile layer does.
  docker exec "$container" node -e 'const fs = require("node:fs"); const r = require("node:module").createRequire(fs.realpathSync(process.env.DSH_BIN)); process.stdout.write(fs.readFileSync(r.resolve("@deepseek-ai/dsh-flowleap-web/brand/brand.json")))' > "$bundle_dir/brand.json" 2> /dev/null || note "brand.json not found in the container"
  docker exec "$container" cat /opt/harness/BUILD_INFO.json > "$bundle_dir/BUILD_INFO.json" 2> /dev/null || true
else
  sync_json="${HARNESS_ROOT:-$root}/vendor/flowleap-connectors/SYNC.json"
  [[ -f $sync_json ]] || sync_json="${HARNESS_ROOT:-$root}/flowleap/SYNC.json"
  [[ -f $sync_json ]] && cp "$sync_json" "$bundle_dir/SYNC.json" || note "SYNC.json not found"
  brand_json=${FLOWLEAP_BRAND_PATH:-$root/packages/bundle/flowleap-web/brand/brand.json}
  [[ -f $brand_json ]] || brand_json="${HARNESS_ROOT:-$root}/node_modules/@deepseek-ai/dsh-flowleap-web/brand/brand.json"
  [[ -f $brand_json ]] && cp "$brand_json" "$bundle_dir/brand.json" || note "brand.json not found"
fi

note "harness log tail (2,000 lines, scrubbed)"
if [[ -n $container ]]; then
  docker logs --tail 2000 "$container" 2>&1 | scrub > "$bundle_dir/harness.log" || true
elif [[ -n $log_file ]]; then
  tail -n 2000 "$log_file" | scrub > "$bundle_dir/harness.log"
else
  printf 'no log given: pass --log <file> (the harness writes its log to stdout/stderr) or --container <name>\n' > "$bundle_dir/harness.log"
fi

note "profile tree (--dump-config, key values blanked)"
dump_config 2> "$bundle_dir/dump-config.stderr" | scrub --config > "$bundle_dir/dump-config.yml" || note "dump-config exited non-zero; its output is kept"
[[ -s $bundle_dir/dump-config.stderr ]] || rm -f "$bundle_dir/dump-config.stderr"

for extra in ${includes[@]+"${includes[@]}"}; do
  if refused "$extra"; then
    excluded+=("$extra")
    continue
  fi
  if [[ -f $extra ]]; then
    scrub < "$extra" > "$bundle_dir/include-$(basename "$extra")"
  else
    note "--include $extra is not a file; skipped"
  fi
done

# ── manifest, self-check, archive ────────────────────────────────────────────
{
  printf 'FlowLeap support bundle %s\n' "$name"
  printf 'created %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'mode %s\n' "${container:+container $container}${container:-local checkout $root}"
  printf '\nfiles (bytes  name)\n'
  (cd "$bundle_dir" && find . -type f ! -name MANIFEST | sort | while IFS= read -r file; do
    printf '%10d  %s\n' "$(wc -c < "$file" | tr -d ' ')" "${file#./}"
  done)
  printf '\nnever included: %s/.credentials* (the key store), %s/storages/ (session storage), the FlowLeap CLI files under $HOME/.flowleap and $HOME/.config/flowleap, any .env\n' "$dsh_home" "$dsh_home"
  if [[ ${#excluded[@]} -gt 0 ]]; then
    printf 'refused on request:\n'
    printf '  %s\n' "${excluded[@]}"
  fi
} > "$bundle_dir/MANIFEST"

if grep -rqE 'fl_pat_[A-Za-z0-9_-]{4,}|sk-[A-Za-z0-9_-]{20,}' "$bundle_dir" --exclude=MANIFEST; then
  note "scrub check FAILED: a token pattern survived; no bundle written"
  exit 1
fi

mkdir -p "$out_dir"
tarball="$out_dir/$name.tar.gz"
tar -C "$staging" -czf "$tarball" "$name"
note "wrote $tarball"
if [[ ${#excluded[@]} -gt 0 ]]; then
  note "refused: ${excluded[*]}"
fi
printf '%s\n' "$tarball"
