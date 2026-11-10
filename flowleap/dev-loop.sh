#!/usr/bin/env bash
# The development loop of FlowLeap Patent AI on this Mac (flowleap/docs/dev-loop.md): the Firm Record of a
# flowleap-os checkout with the seed firm, and the flowleap-web app from this checkout's source with client watchers.
#
#   flowleap/dev-loop.sh up --os <flowleap-os checkout> [--as <seed handle>] [--port <port>] [--record-port <port>] [--no-letters]
#                           [--patch <overlay>] [--model <provider>/<model id>] [--myepo-double]
#   flowleap/dev-loop.sh as <seed handle | admin>   act as that seed user in the Matters panel and in record_read; no restart
#   flowleap/dev-loop.sh restart                    restart the dsh host from source after a Host edit
#   flowleap/dev-loop.sh probe [file number|my-work] one record_read (default SF-2021-0011), or record_my_work, through the tool executor; no model call
#   flowleap/dev-loop.sh status                     what runs, the person, the model key names
#   flowleap/dev-loop.sh down                       stop everything; the record data and the Sessions stay in the run dir
#
# FLOWLEAP_DEV_RUN names the run dir (default ~/.local/share/flowleap-harness/dev-loop). `up` stores its options there,
# so the other commands take none. Ports: the app on <port> (default 3270) through the records proxy, dsh on <port>+1,
# the probe on <port>+2; the record's local proxy on <record port> (default 8275) and its service on <record port>+1.
# --myepo-double also starts the MyEPO double (public sample data of the seed firm) on <port>+3 and points the MyEPO
# link at it; link it on Settings -> Connectors with the double's client ID and secret, which its log prints. It also starts
# the firm's MyEPO letter reader against the double, which sends each new letter to the Firm Record's intake every 5 s, so
# 'curl -X POST http://127.0.0.1:<port>+3/_double/arrive' files the Rule 71(3) letter of SF-2023-0045. The seed letters
# then leave out the rows that the reader takes from the double; a run dir whose seed letters have them needs a new run dir.
# The model keys come from this shell's environment only; with none, the app starts and chats fail at the model call.
# --model sets the default model of new chats; up refuses a default whose provider has no key while another key is set.
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
# Converges one process to the options of this `up`: it stops the process when it runs with other options than
# <signature>, so the start below starts it again with the new ones. Each start writes its signature next to its pid.
converge() {
  local name=$1 signature=$2
  [[ $(cat "$RUN/$name.sig" 2> /dev/null) == "$signature" ]] || stop_pid "$RUN/$name.pid"
  printf '%s\n' "$signature" > "$RUN/$name.sig"
}
load_options() {
  [[ -s $RUN/loop.env ]] || die "no loop in $RUN: run 'flowleap/dev-loop.sh up --os <flowleap-os checkout>' first"
  MODEL=
  MYEPO_DOUBLE=
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
    FLOWLEAP_RECORD_TOKEN DSH_HOME=$dir/home DSH_AGENTS_HOME=$dir/home/agents FLOWLEAP_MYEPO_DOUBLE_URL=http://127.0.0.1:$((PORT + 3))
  cd "$dir/workspace" && exec node --import "$tsx" "$HARNESS/apps/cli/src/bin.ts" --profile flowleap-web \
    --patch "$HARNESS/apps/web/tests/pin-browse-picker.overlay.yml" --patch "$HARNESS/flowleap/dev-loop.patch.yml" \
    ${PATCH:+--patch "$PATCH"} ${MODEL:+--patch "$RUN/model.patch.yml"} ${MYEPO_DOUBLE:+--patch "$HARNESS/flowleap/myepo-double.patch.yml"} \
    "$@" --no-open --port "$port"
}
# The model keys that the loop reads from the shell, and the key of one provider route (none for another route).
MODEL_KEYS='OPENROUTER_API_KEY ANTHROPIC_API_KEY DEEPSEEK_API_KEY'
key_of() { case $1 in anthropic) echo ANTHROPIC_API_KEY ;; openrouter) echo OPENROUTER_API_KEY ;; deepseek) echo DEEPSEEK_API_KEY ;; esac; }

# Prints the default model of new chats, <provider>/<model id>: --model, else the agent-default-model row of the profile.
default_model() {
  if [[ -n $MODEL ]]; then printf '%s\n' "$MODEL"; return; fi
  (cd "$HARNESS" && node --input-type=module -e "
    import { readFileSync } from 'node:fs'
    import { parse } from 'yaml'
    const row = parse(readFileSync('packages/bundle/flowleap-web/cordis.patch.yml', 'utf8'), { logLevel: 'error' }).find((item) => item?.id === 'agent-default-model')
    if (row === undefined) { console.error('the flowleap-web profile has no agent-default-model row'); process.exit(1) }
    console.log(row.config.provider + '/' + row.config.model)")
}

# Writes the overlay that makes --model the default model of new chats; agent-default-model validates it at load.
model_overlay() {
  local provider=${MODEL%%/*} model=${MODEL#*/}
  [[ $MODEL == */* && -n $provider && -n $model ]] || die "--model needs <provider>/<model id>, for example openrouter/anthropic/claude-sonnet-5.5"
  # shellcheck disable=SC2016 # a JavaScript template literal
  node -e 'console.log(`# Written by dev-loop.sh up --model.\n- id: agent-default-model\n  config:\n    provider: ${JSON.stringify(process.argv[1])}\n    model: ${JSON.stringify(process.argv[2])}`)' \
    "$provider" "$model" > "$RUN/model.patch.yml"
}

# Refuses a default model whose provider has no key in this shell while the shell has the key of another provider.
check_model_keys() {
  local keys=() k model provider
  for k in $MODEL_KEYS; do [[ -z ${!k:-} ]] || keys+=("$k"); done
  if ((${#keys[@]} == 0)); then say "no model key in this shell: the app starts, chats fail at the model call, the record tools work"; return; fi
  say "model keys from this shell: ${keys[*]}"
  model=$(default_model) || die "cannot read the default model"
  provider=${model%%/*}
  k=$(key_of "$provider")
  [[ -z $k || -n ${!k:-} ]] ||
    die "new chats use $model, and this shell has no $k: export it, or give --model <provider>/<model id> for a provider with a key (${keys[*]})"
  say "new chats use $model"
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
# The MyEPO double (packages/host/flowleap-connectors/tests/myepo-double/README.md) on <port>+3, from source.
start_double() {
  alive "$RUN/double.pid" && return 0
  (cd "$HARNESS" && exec node --import tsx/esm packages/host/flowleap-connectors/tests/myepo-double/bin.ts --port $((PORT + 3)) \
    > "$LOGS/myepo-double.log" 2>&1 & echo $! > "$RUN/double.pid")
  for _ in $(seq 1 40); do
    grep -q 'control http' "$LOGS/myepo-double.log" 2> /dev/null && { sed 's/^/dev-loop: /' "$LOGS/myepo-double.log"; return 0; }
    alive "$RUN/double.pid" || break
    sleep 0.25
  done
  tail -5 "$LOGS/myepo-double.log" >&2
  die "the MyEPO double did not start: $LOGS/myepo-double.log"
}
# The seed rows, comma-separated, without the rows that the MyEPO reader takes from the double (tests/myepo-double/seed-data.ts).
seed_rows_without_myepo() {
  local skip; skip=$(cd "$HARNESS" && node --import tsx/esm --input-type=module -e "
    import { unhandledRows } from './packages/host/flowleap-connectors/tests/myepo-double/seed-data.ts'
    console.log(unhandledRows().join(','))")
  (cd "$OS/acceptance" && node --input-type=module -e "
    import { loadSeed } from 'flowleap-seed-firm'
    const skip = new Set(process.argv[1].split(',').map(Number))
    console.log(loadSeed().matters.flatMap((m) => m.documents.map((d) => d.row)).filter((r) => !skip.has(r)).join(','))" "$skip")
}
# The firm's MyEPO letter reader (packages/host/flowleap-connectors/tests/myepo-reader/bin.ts) against the double, with the
# double's public test client and the record's intake token, both in a folder that only this account reads.
start_reader() {
  alive "$RUN/reader.pid" && return 0
  local dir=$RUN/myepo-reader
  (umask 077; mkdir -p "$dir"; printf 'public-sample-data\n' > "$dir/client-secret"; cp "$RECORD/intake-token" "$dir/intake-token"
    chmod 600 "$dir/client-secret" "$dir/intake-token"
    printf '{"recordUrl":"http://127.0.0.1:%s/records/api/","myepo":{"baseUrl":"http://127.0.0.1:%s/latest","tokenUrl":"http://127.0.0.1:%s/token","clientId":"flowleap-myepo-double","clientSecretFile":"client-secret","requestsPerSecond":2,"timeoutSeconds":30},"download":"on-arrival","everySeconds":5}\n' \
      $((RECORD_PORT + 1)) $((PORT + 3)) $((PORT + 3)) > "$dir/config.json")
  (cd "$HARNESS" && exec node --import tsx/esm packages/host/flowleap-connectors/tests/myepo-reader/bin.ts "$dir" \
    > "$LOGS/myepo-reader.log" 2>&1 & echo $! > "$RUN/reader.pid")
  for _ in $(seq 1 40); do
    grep -q 'myepo-reader: reads' "$LOGS/myepo-reader.log" 2> /dev/null && { sed 's/^/dev-loop: /' "$LOGS/myepo-reader.log"; return 0; }
    alive "$RUN/reader.pid" || break
    sleep 0.25
  done
  tail -5 "$LOGS/myepo-reader.log" >&2
  die "the MyEPO reader did not start: $LOGS/myepo-reader.log"
}
app_link() { local url; url=$(dsh_url); printf '%s\n' "${url/:$((PORT + 1))\//:$PORT/}"; }

up() {
  local as=jonas letters=1
  OS=${FLOWLEAP_OS:-}; PORT=3270; RECORD_PORT=8275; PATCH=; MODEL=; MYEPO_DOUBLE=
  while (($#)); do
    case $1 in
      --os) OS=$2; shift 2 ;;
      --as) as=$2; shift 2 ;;
      --port) PORT=$2; shift 2 ;;
      --record-port) RECORD_PORT=$2; shift 2 ;;
      --no-letters) letters=0; shift ;;
      --patch) PATCH=$(cd "$(dirname "$2")" && pwd)/$(basename "$2"); shift 2 ;;
      --model) MODEL=$2; shift 2 ;;
      --myepo-double) MYEPO_DOUBLE=1; shift ;;
      *) die "unknown option $1" ;;
    esac
  done
  [[ -n $OS ]] || die "give --os <flowleap-os checkout> (or FLOWLEAP_OS)"
  OS=$(cd "$OS" && pwd)
  [[ -f $OS/.claude/skills/verify/scripts/record-local.sh && -f $OS/acceptance/seed-firm.mjs ]] || die "$OS is not a flowleap-os checkout"
  [[ -d $HARNESS/node_modules ]] || die "no node_modules: run 'pnpm install' in $HARNESS"
  local t0=$SECONDS
  mkdir -p "$LOGS" "$RUN/seed"
  printf 'OS=%q\nPORT=%q\nRECORD_PORT=%q\nPATCH=%q\nMODEL=%q\nMYEPO_DOUBLE=%q\n' "$OS" "$PORT" "$RECORD_PORT" "$PATCH" "$MODEL" "$MYEPO_DOUBLE" > "$RUN/loop.env"
  [[ -z $MODEL ]] || model_overlay
  check_model_keys
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
  # The firm roles (firm.roles) of the seed users name the confirmers and the escalation chains of the tasks; an older checkout has none.
  # The seed's file numbers are SF-<year>-<number>, so a letter with an SF- reference gets its proposed matter.
  local roles
  roles=$(cd "$OS" && node acceptance/seed-firm.mjs --roles 2> /dev/null) || roles=
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
  # With the MyEPO reader, the letters that it takes from the double are not loaded as mail too (letters.done says which).
  if [[ -n $MYEPO_DOUBLE && -f $RUN/seed/letters.done && $(< "$RUN/seed/letters.done") != myepo* ]]; then
    die "$RUN has the seed letters as mail, so the MyEPO letters would collide with them: give a new FLOWLEAP_DEV_RUN for --myepo-double"
  fi
  if ((letters)) && [[ ! -f $RUN/seed/letters.done ]]; then
    local rows=()
    [[ -z $MYEPO_DOUBLE ]] || rows=(--rows "$(seed_rows_without_myepo)")
    node "$OS/acceptance/seed-letters.mjs" --local "$RECORD" --port $((RECORD_PORT + 1)) ${rows[@]+"${rows[@]}"} --out "$RUN/seed/letters" > "$LOGS/seed-letters.log" 2>&1 ||
      { tail -5 "$LOGS/seed-letters.log" >&2; die "seed-letters.mjs failed: $LOGS/seed-letters.log"; }
    printf '%s\n' "${MYEPO_DOUBLE:+myepo}" > "$RUN/seed/letters.done"
    say "seed letters: $(tail -1 "$LOGS/seed-letters.log")"
  fi

  [[ -s $RUN/record-token ]] || (umask 077; head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n' > "$RUN/record-token")
  act_as "$as"

  if ! alive "$RUN/watch.pid"; then
    (cd "$HARNESS" && exec node --import tsx/esm scripts/dev-web.ts --poll --skip-build --no-serve > "$LOGS/watch.log" 2>&1 & echo $! > "$RUN/watch.pid")
  fi
  if [[ -n $MYEPO_DOUBLE ]]; then
    converge double "$((PORT + 3))"
    start_double
    converge reader "$PORT|$RECORD_PORT"
    start_reader
  else
    stop_pid "$RUN/reader.pid"
    stop_pid "$RUN/double.pid"
  fi
  converge dsh "$PORT|$RECORD_PORT|$PATCH|$MODEL|$MYEPO_DOUBLE"
  alive "$RUN/dsh.pid" || start_dsh
  converge proxy "$PORT|$RECORD_PORT"
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
  check_model_keys
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
  for f in watch dsh proxy double reader; do printf '%-7s %s\n' "$f" "$(alive "$RUN/$f.pid" && echo "running (pid $(< "$RUN/$f.pid"))" || echo stopped)"; done
  "$OS/.claude/skills/verify/scripts/record-local.sh" doctor "$RECORD" "$RECORD_PORT" | sed 's/^/record /'
  printf 'person  %s\napp     http://127.0.0.1:%s/ (dsh %s)\nmodel   %s\n' "$(cat "$RUN/person" 2> /dev/null || echo none)" "$PORT" $((PORT + 1)) "$(default_model)"
}

down() {
  load_options
  local f
  for f in proxy dsh watch reader double; do stop_pid "$RUN/$f.pid"; done
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
  *) sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
