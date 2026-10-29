#!/usr/bin/env bash
# Start, check, and stop one isolated flowleap-web instance for a verification run.
#
#   web.sh start <run-dir> [port]   boot from this checkout's built tree; prints the URL (with its access token) when ready
#   web.sh doctor <run-dir>         read-only: is this run's instance worth driving?
#   web.sh stop <run-dir>           stop the instance this run started; keeps <run-dir>/evidence
#
# start copies the flowleap-connectors/* records of the founder's credential file
# (DSH_VERIFY_CREDENTIALS, else ~/.dsh/.credentials.yaml) to <run-dir>/firm-keys.yaml,
# which the overlay mounts as readOnlyPath; stop deletes that copy.
# FLOWLEAP_SKILLS_DIR names the skill pack, else the founder's flowleap-plugins checkout below $HOME.
# DSH_VERIFY_PATCH names one more overlay for start, after verify.patch.yml.
#
# <run-dir> holds the scratch DSH_HOME, the workspace, the server log, the PID, and evidence/.
set -euo pipefail

skill_dir=$(cd "$(dirname "$0")/.." && pwd)
repo=$(cd "$skill_dir/../../.." && pwd)
cmd=${1:?usage: web.sh start|doctor|stop <run-dir> [port]}
run=${2:?usage: web.sh start|doctor|stop <run-dir> [port]}
mkdir -p "$run"
run=$(cd "$run" && pwd)
pid_file="$run/server.pid"
log="$run/server.log"
firm_keys="$run/firm-keys.yaml"
skills_dir=${FLOWLEAP_SKILLS_DIR:-$HOME/flowleap/flowleap-plugins/plugins/flowleap/skills}

alive() { [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; }
url() { grep -Eo 'https?://(127\.0\.0\.1|\[::1\]|localhost):[0-9]+/?[^ ]*' "$log" 2>/dev/null | head -1 || true; }

case "$cmd" in
  start)
    port=${3:-3180}
    alive && { echo "already running: PID $(cat "$pid_file") $(url)"; exit 0; }
    [[ -d "$repo/apps/web/dist" ]] || { echo "no apps/web/dist: run 'pnpm run build:artifacts' first" >&2; exit 1; }
    [[ -n "${OPENROUTER_API_KEY:-}" ]] || { echo "OPENROUTER_API_KEY is not set" >&2; exit 1; }
    # The skill pack row fails at load when its folder does not exist; the default is the release image's folder.
    [[ -d "$skills_dir" ]] || { echo "no skill pack at $skills_dir: set FLOWLEAP_SKILLS_DIR" >&2; exit 1; }
    mkdir -p "$run/home" "$run/workspace" "$run/evidence"
    # Only the connector records: the server must write its own browser-session record.
    (umask 077 && cd "$repo/packages/credentials/credentials-local" && node --input-type=module -e "
      import { readFileSync, writeFileSync } from 'node:fs'
      import { parse, stringify } from 'yaml'
      const source = process.env.DSH_VERIFY_CREDENTIALS ?? process.env.HOME + '/.dsh/.credentials.yaml'
      const store = parse(readFileSync(source, 'utf8'))
      const records = Object.fromEntries(Object.entries(store.records ?? {}).filter(([key]) => key.startsWith('flowleap-connectors/')))
      writeFileSync(process.argv[1], stringify({ version: store.version, records, refs: {} }))
      console.log('firm keys: ' + Object.keys(records).join(', '))
    " "$firm_keys")
    # The server cwd is the scratch workspace, so tsx and its tsconfig paths resolve from the checkout.
    tsx=$(cd "$repo" && node --input-type=module -e "console.log(import.meta.resolve('tsx/esm'))")
    (
      cd "$run/workspace"
      DSH_VERIFY_FIRM_KEYS="$firm_keys" FLOWLEAP_SKILLS_DIR="$skills_dir" TSX_TSCONFIG_PATH="$repo/tsconfig.json" DSH_HOME="$run/home" DSH_AGENTS_HOME="$run/home/agents" \
        exec node --import "$tsx" "$repo/apps/cli/src/bin.ts" --profile flowleap-web \
        --patch "$repo/apps/web/tests/pin-browse-picker.overlay.yml" \
        --patch "$skill_dir/verify.patch.yml" \
        ${DSH_VERIFY_PATCH:+--patch "$DSH_VERIFY_PATCH"} \
        --no-open --port "$port"
    ) >"$log" 2>&1 &
    echo $! >"$pid_file"
    for _ in $(seq 1 120); do
      alive || { echo "server exited; last lines of $log:" >&2; tail -20 "$log" >&2; exit 1; }
      u=$(url)
      if [[ -n "$u" ]] && curl -fs -o /dev/null "$u"; then echo "ready: $u (PID $(cat "$pid_file"))"; exit 0; fi
      sleep 1
    done
    echo "not ready after 120 s; see $log" >&2
    exit 1
    ;;
  doctor)
    ok=1
    if alive; then echo "PASS process: PID $(cat "$pid_file")"; else echo "FAIL process: no live PID in $pid_file"; ok=0; fi
    u=$(url)
    shown=${u%%\?token=*}
    if [[ -n "$u" ]] && curl -fs -o /dev/null "$u"; then echo "PASS http: $shown"; else echo "FAIL http: ${shown:-no URL in $log}"; ok=0; fi
    if [[ -f "$pid_file" ]] && ps -o command= -p "$(cat "$pid_file")" 2>/dev/null | grep -q -- '--profile flowleap-web'; then
      echo "PASS profile: flowleap-web"
    else
      echo "FAIL profile: the PID is not a flowleap-web server"; ok=0
    fi
    echo "INFO checkout: $(git -C "$repo" rev-parse --short HEAD) $(git -C "$repo" status --porcelain | wc -l | tr -d ' ') changed paths"
    if [[ -n "${OPENROUTER_API_KEY:-}" ]]; then echo "PASS key: OPENROUTER_API_KEY set"; else echo "FAIL key: OPENROUTER_API_KEY unset"; ok=0; fi
    if command -v flowleap >/dev/null; then
      flowleap mcp --check >/dev/null 2>&1 && echo "PASS flowleap CLI: signed in" || echo "WARN flowleap CLI: 'flowleap mcp --check' failed; paid mcp__flowleap__* tools are absent"
    else
      echo "WARN flowleap CLI: not on PATH; paid mcp__flowleap__* tools are absent"
    fi
    if grep -q 'did not activate' "$log"; then
      echo "FAIL plugins: $(grep 'did not activate' "$log" | head -1)"; ok=0
      grep -E '\): (ValidationError|Error)' "$log" | head -5 | sed 's/^/LOG /'
    else
      echo "PASS plugins: every entry activated"
    fi
    [[ $ok == 1 ]]
    ;;
  stop)
    if alive; then
      pid=$(cat "$pid_file")
      kill "$pid"
      for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid"
      echo "stopped PID $pid"
    else
      echo "no live instance for $run"
    fi
    rm -f "$pid_file" "$firm_keys"
    echo "evidence kept in $run/evidence"
    ;;
  *) echo "unknown command: $cmd" >&2; exit 2 ;;
esac
