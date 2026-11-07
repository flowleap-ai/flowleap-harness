#!/usr/bin/env bash
# The development loop of FlowLeap Patent AI on this Mac (flowleap/docs/dev-loop.md): the Firm Record of a
# flowleap-os checkout with the seed firm, and the flowleap-web app from this checkout's source with client watchers.
#
#   flowleap/dev-loop.sh up --os <flowleap-os checkout> [--as <seed handle>] [--port <port>] [--record-port <port>] [--no-letters]
#   flowleap/dev-loop.sh as <seed handle | admin>   act as that seed user in the Matters panel and in record_read; no restart
#   flowleap/dev-loop.sh restart                    restart the dsh host from source after a Host edit
#   flowleap/dev-loop.sh probe [file number|my-work] one record_read (default SF-2021-0011), or record_my_work, through the tool executor; no model call
#   flowleap/dev-loop.sh status                     what runs, the person, the model key names
#   flowleap/dev-loop.sh down                       stop everything; the record data and the Sessions stay in the run dir
#
# FLOWLEAP_DEV_RUN names the run dir (default ~/.local/share/flowleap-harness/dev-loop). `up` stores its options there,
# so the other commands take none. Ports: the app on <port> (default 3270) through the records proxy, dsh on <port>+1,
# the probe on <port>+2; the record's local proxy on <record port> (default 8275) and its service on <record port>+1.
# The model keys come from this shell's environment only; with none, the app starts and chats fail at the model call.
set -euo pipefail

HARNESS=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
RUN=${FLOWLEAP_DEV_RUN:-$HOME/.local/share/flowleap-harness/dev-loop}
LOGS=$RUN/logs
RECORD=$RUN/record

die() { printf 'dev-loop: %s\n' "$*" >&2; exit 1; }
say() { printf 'dev-loop: %s\n' "$*"; }
alive() { [[ -f $1 ]] && kill -0 "$(< "$1")" 2> /dev/null; }
tree() { local child; for child in $(pgrep -P "$1"); do tree "$child"; done; echo "$1"; }
any_alive() { local p; for p in "$@"; do ! kill -0 "$p" 2> /dev/null || return 0; done; return 1; }
# Stops the process of a pid file and every process below it: SIGTERM to dev-web.ts does not reach its Vite stage.
stop_pid() {
  alive "$1" || { rm -f "$1"; return 0; }
  local pids; pids=$(tree "$(< "$1")")
  # shellcheck disable=SC2086 # one pid per word
  kill $pids 2> /dev/null || true
  for _ in $(seq 1 40); do any_alive $pids || break; sleep 0.25; done
  # shellcheck disable=SC2086
  ! any_alive $pids || kill -9 $pids 2> /dev/null || true
  rm -f "$1"
}
load_options() {
  [[ -s $RUN/loop.env ]] || die "no loop in $RUN: run 'flowleap/dev-loop.sh up --os <flowleap-os checkout>' first"
  # shellcheck source=/dev/null
  source "$RUN/loop.env"
}
# Prints the JSON of one seed user ({ handle, objectId, signIn, name }) from the seed package pinned by the os checkout.
seed_user() {
  (cd "$OS/acceptance" && node --input-type=module -e "
    import { loadSeed } from 'flowleap-seed-firm'
    const user = loadSeed().users.find((u) => u.handle === process.argv[1])
    if (user === undefined) { console.error('no seed user ' + process.argv[1] + '; the users are ' + loadSeed().users.map((u) => u.handle).join(', ')); process.exit(1) }
    console.log(JSON.stringify(user))" "$1")
}

# The person switch. The records proxy reads records-headers.json at each request, and the Firm Record reads
# runtime-tokens/ at each use, so moving the one dev token to the new person's file changes both at once.
act_as() {
  local handle=$1 oid json
  if [[ $handle == admin ]]; then
    oid='admin'
    json=$(node -e 'console.log(JSON.stringify({ "x-flowleap-starter": process.argv[1], "x-flowleap-user": "admin" }))' "$(< "$RECORD/starter-secret")")
  else
    local user; user=$(seed_user "$handle") || exit 1
    oid=$(node -e 'console.log(JSON.parse(process.argv[1]).objectId)' "$user")
    # X-Flowleap-Name carries the UTF-8 bytes of the name as Latin-1, as the sign-in proxy sends them.
    json=$(node -e '
      const user = JSON.parse(process.argv[1])
      console.log(JSON.stringify({ "x-flowleap-starter": process.argv[2], "x-flowleap-oid": user.objectId, "x-flowleap-signin": user.signIn,
        "x-flowleap-name": Buffer.from(user.name, "utf8").toString("latin1") }))' "$user" "$(< "$RECORD/starter-secret")")
  fi
  (umask 077
    printf '%s\n' "$json" > "$RUN/records-headers.json.tmp" && mv "$RUN/records-headers.json.tmp" "$RUN/records-headers.json"
    cp "$RUN/record-token" "$RECORD/runtime-tokens/.next" && mv "$RECORD/runtime-tokens/.next" "$RECORD/runtime-tokens/$oid")
  local previous; previous=$(cat "$RUN/person-oid" 2> /dev/null || true)
  [[ -z $previous || $previous == "$oid" ]] || rm -f "$RECORD/runtime-tokens/$previous"
  printf '%s\n' "$oid" > "$RUN/person-oid"
  printf '%s\n' "$handle" > "$RUN/person"
  say "acting as $handle ($oid): the Matters panel and record_read read the record as this person"
}

# Runs dsh from this checkout's source (the launch of `pnpm run start:web`) in <dir>/workspace with DSH_HOME <dir>/home.
# Call it in a subshell: it exports the loop's variables and ends in exec.
dsh() {
  local dir=$1 port=$2; shift 2
  local tsx; tsx=$(cd "$HARNESS" && node --input-type=module -e "console.log(import.meta.resolve('tsx/esm'))")
  local skills=${FLOWLEAP_SKILLS_DIR:-$HOME/flowleap/flowleap-methods/skills}
  # The skill pack row fails at load when its folder does not exist; an empty folder means no FlowLeap skill.
  [[ -d $skills ]] || { skills=$RUN/no-skills; mkdir -p "$skills"; }
  mkdir -p "$dir/home" "$dir/workspace"
  FLOWLEAP_RECORD_TOKEN=$(< "$RUN/record-token")
  export FLOWLEAP_SKILLS_DIR=$skills TSX_TSCONFIG_PATH=$HARNESS/tsconfig.json FLOWLEAP_DEV_RECORD_URL=http://127.0.0.1:$((RECORD_PORT + 1)) \
    FLOWLEAP_RECORD_TOKEN DSH_HOME=$dir/home DSH_AGENTS_HOME=$dir/home/agents
  cd "$dir/workspace" && exec node --import "$tsx" "$HARNESS/apps/cli/src/bin.ts" --profile flowleap-web \
    --patch "$HARNESS/apps/web/tests/pin-browse-picker.overlay.yml" --patch "$HARNESS/flowleap/dev-loop.patch.yml" "$@" --no-open --port "$port"
}
dsh_url() { grep -Eo "http://127\.0\.0\.1:$((PORT + 1))/\?token=[^ ]*" "$LOGS/dsh.log" 2> /dev/null | head -1 || true; }
start_dsh() {
  local t0=$SECONDS
  (dsh "$RUN" $((PORT + 1)) > "$LOGS/dsh.log" 2>&1 & echo $! > "$RUN/dsh.pid")
  for _ in $(seq 1 240); do
    alive "$RUN/dsh.pid" || { tail -20 "$LOGS/dsh.log" >&2; die "dsh exited: $LOGS/dsh.log"; }
    local url; url=$(dsh_url)
    if [[ -n $url ]] && curl -fs -o /dev/null "$url"; then
      say "dsh ready in $((SECONDS - t0)) s"
      ! grep -q 'did not activate' "$LOGS/dsh.log" || say "WARN a row did not activate: $(grep -m1 'did not activate' "$LOGS/dsh.log")"
      return 0
    fi
    sleep 0.5
  done
  die "dsh not ready after 120 s: $LOGS/dsh.log"
}
app_link() { local url; url=$(dsh_url); printf '%s\n' "${url/:$((PORT + 1))\//:$PORT/}"; }

up() {
  local as=jonas letters=1
  OS=${FLOWLEAP_OS:-}; PORT=3270; RECORD_PORT=8275
  while (($#)); do
    case $1 in
      --os) OS=$2; shift 2 ;;
      --as) as=$2; shift 2 ;;
      --port) PORT=$2; shift 2 ;;
      --record-port) RECORD_PORT=$2; shift 2 ;;
      --no-letters) letters=0; shift ;;
      *) die "unknown option $1" ;;
    esac
  done
  [[ -n $OS ]] || die "give --os <flowleap-os checkout> (or FLOWLEAP_OS)"
  OS=$(cd "$OS" && pwd)
  [[ -f $OS/.claude/skills/verify/scripts/record-local.sh && -f $OS/acceptance/seed-firm.mjs ]] || die "$OS is not a flowleap-os checkout"
  [[ -d $HARNESS/node_modules ]] || die "no node_modules: run 'pnpm install' in $HARNESS"
  local t0=$SECONDS
  mkdir -p "$LOGS" "$RUN/seed"
  printf 'OS=%q\nPORT=%q\nRECORD_PORT=%q\n' "$OS" "$PORT" "$RECORD_PORT" > "$RUN/loop.env"
  say "harness $(git -C "$HARNESS" rev-parse --short HEAD), flowleap-os $(git -C "$OS" rev-parse --short HEAD) ($OS), run dir $RUN"

  if [[ ! -d $HARNESS/apps/web/dist ]]; then
    say "first run in this checkout: pnpm run build:artifacts (about 3 minutes; log $LOGS/build.log)"
    (cd "$HARNESS" && pnpm run build:artifacts > "$LOGS/build.log" 2>&1) || die "build:artifacts failed: $LOGS/build.log"
  fi
  [[ -d $OS/acceptance/node_modules/flowleap-seed-firm ]] ||
    (cd "$OS/acceptance" && npm ci --no-audit --no-fund > "$LOGS/acceptance-npm-ci.log" 2>&1) || die "npm ci in $OS/acceptance failed"

  # The intake persons are the seed's formalities users, as on the local firm (scripts/local-firm.sh write_firm_env).
  local intake
  intake=$(cd "$OS/acceptance" && node --input-type=module -e "import { loadSeed } from 'flowleap-seed-firm'
console.log(loadSeed().users.filter((u) => u.firmRole === 'formalities').map((u) => u.objectId).join(' '))")
  # The firm roles of the seed name the confirmers and the escalation chains of the tasks (atlas sheet 0); an os checkout
  # before the task model has no --roles, and its record-local.sh ignores RECORD_ROLES. The seed's file numbers are SF-<year>-<number>.
  local roles=''
  if grep -q -- '--roles' "$OS/acceptance/seed-firm.mjs"; then roles=$(node "$OS/acceptance/seed-firm.mjs" --roles) || die "seed-firm.mjs --roles failed"; fi
  RECORD_INTAKE_PERSONS=$intake RECORD_ROLES=$roles RECORD_FILE_NUMBER_PATTERN='^SF-\d{4}-\d{4}$' \
    "$OS/.claude/skills/verify/scripts/record-local.sh" start "$RECORD" "$RECORD_PORT" > "$LOGS/record-start.log" 2>&1 ||
    { cat "$LOGS/record-start.log" >&2; die "record-local.sh start failed"; }
  node -e '
    const persons = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).intake.persons.join(" ")
    if (persons !== process.argv[2]) { console.error("dev-loop: " + process.argv[1] + " has other intake persons: the flowleap-os checkout needs RECORD_INTAKE_PERSONS in record-local.sh; then run down, remove " + process.argv[3] + " and up again"); process.exit(1) }' \
    "$RECORD/settings.json" "$intake" "$RECORD"
  say "Firm Record up in $((SECONDS - t0)) s (service 127.0.0.1:$((RECORD_PORT + 1)))"

  node "$OS/acceptance/seed-firm.mjs" --local "$RECORD" --port $((RECORD_PORT + 1)) --out "$RUN/seed/firm" > "$LOGS/seed-firm.log" 2>&1 ||
    { tail -5 "$LOGS/seed-firm.log" >&2; die "seed-firm.mjs failed: $LOGS/seed-firm.log"; }
  say "seed firm: $(grep -m1 'chain after' "$LOGS/seed-firm.log" || tail -1 "$LOGS/seed-firm.log")"
  # A second run records each letter again as a duplicate, so the letters go in once per run dir.
  if ((letters)) && [[ ! -f $RUN/seed/letters.done ]]; then
    node "$OS/acceptance/seed-letters.mjs" --local "$RECORD" --port $((RECORD_PORT + 1)) --out "$RUN/seed/letters" > "$LOGS/seed-letters.log" 2>&1 ||
      { tail -5 "$LOGS/seed-letters.log" >&2; die "seed-letters.mjs failed: $LOGS/seed-letters.log"; }
    touch "$RUN/seed/letters.done"
    say "seed letters: $(tail -1 "$LOGS/seed-letters.log")"
  fi

  [[ -s $RUN/record-token ]] || (umask 077; head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n' > "$RUN/record-token")
  act_as "$as"

  local keys=() k
  for k in OPENROUTER_API_KEY ANTHROPIC_API_KEY DEEPSEEK_API_KEY; do [[ -z ${!k:-} ]] || keys+=("$k"); done
  ((${#keys[@]})) && say "model keys from this shell: ${keys[*]}" || say "no model key in this shell: the app starts, chats fail at the model call, the record tools work"

  if ! alive "$RUN/watch.pid"; then
    (cd "$HARNESS" && exec node --import tsx/esm scripts/dev-web.ts --poll --skip-build --no-serve > "$LOGS/watch.log" 2>&1 & echo $! > "$RUN/watch.pid")
  fi
  alive "$RUN/dsh.pid" || start_dsh
  if ! alive "$RUN/proxy.pid"; then
    (node "$HARNESS/.agents/skills/verify/scripts/records-proxy.mjs" "$PORT" "http://127.0.0.1:$((PORT + 1))" "http://127.0.0.1:$((RECORD_PORT + 1))" "$RUN" \
      > "$LOGS/proxy.log" 2>&1 & echo $! > "$RUN/proxy.pid")
    for _ in $(seq 1 20); do grep -q 'records-proxy:' "$LOGS/proxy.log" 2> /dev/null && break; sleep 0.25; done
  fi
  say "up in $((SECONDS - t0)) s. Open (the token is this instance's access key; keep it out of PRs and notes):"
  app_link
}

restart() {
  load_options
  local t0=$SECONDS
  stop_pid "$RUN/dsh.pid"
  start_dsh
  say "host restarted in $((SECONDS - t0)) s; the open page reconnects, or reload it"
}

probe() {
  load_options
  local target=${1:-SF-2021-0011} dir=$RUN/probe out tool arguments
  if [[ $target == my-work ]]; then tool=record_my_work arguments='{}'; else tool=record_read arguments="{\"file_number\":\"$target\"}"; fi
  rm -rf "$dir"; mkdir -p "$dir"
  # The probe plugin of flowleap-os sends one call of FLOWLEAP_PROBE_TOOL through ctx.tools.execute, prints its line and ends dsh.
  (FLOWLEAP_PROBE_TOOL=$tool FLOWLEAP_PROBE_ARGUMENTS=$arguments dsh "$dir" $((PORT + 2)) --patch "$OS/scripts/local-firm/record-read-probe.patch.yml" > "$dir/probe.log" 2>&1 & echo $! > "$dir/pid")
  for _ in $(seq 1 240); do alive "$dir/pid" || break; sleep 0.5; done
  stop_pid "$dir/pid"
  out=$(grep -m1 '^FLOWLEAP-RECORD-PROBE ' "$dir/probe.log" || true)
  [[ -n $out ]] || die "the probe gave no answer: $dir/probe.log"
  printf '%s\n' "${out#FLOWLEAP-RECORD-PROBE }"
  [[ $out == *'"recordSeq"'* ]]
}

status() {
  load_options
  local f
  for f in watch dsh proxy; do printf '%-7s %s\n' "$f" "$(alive "$RUN/$f.pid" && echo "running (pid $(< "$RUN/$f.pid"))" || echo stopped)"; done
  "$OS/.claude/skills/verify/scripts/record-local.sh" doctor "$RECORD" "$RECORD_PORT" | sed 's/^/record /'
  printf 'person  %s\napp     http://127.0.0.1:%s/ (dsh %s)\n' "$(cat "$RUN/person" 2> /dev/null || echo none)" "$PORT" $((PORT + 1))
}

down() {
  load_options
  local f
  for f in proxy dsh watch; do stop_pid "$RUN/$f.pid"; done
  "$OS/.claude/skills/verify/scripts/record-local.sh" stop "$RECORD" "$RECORD_PORT"
  say "stopped; the record data, the seed and the Sessions stay in $RUN (remove it to start fresh)"
}

cmd=${1:-}; shift || true
case $cmd in
  up) up "$@" ;;
  as) [[ -n ${1:-} ]] || die "give a seed handle (jonas, lena, anna, partner, sabine, ...) or admin"; load_options; act_as "$1" ;;
  restart) restart ;;
  probe) probe "$@" ;;
  status) status ;;
  down) down ;;
  *) sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
