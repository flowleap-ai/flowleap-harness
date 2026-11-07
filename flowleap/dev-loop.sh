#!/usr/bin/env bash
# The development loop of FlowLeap Patent AI on this Mac (flowleap/docs/dev-loop.md): the Firm Record of a
# flowleap-os checkout with the seed firm, and the flowleap-web app from this checkout's source with client watchers.
#
#   flowleap/dev-loop.sh up --os <flowleap-os checkout> [--as <seed handle>] [--port <port>] [--record-port <port>] [--no-letters]
#                           [--demo [--officecli <binary>] [--ocr-key-file <mistral.env>] [--image <runtime image>]]
#   flowleap/dev-loop.sh as <seed handle | admin>   act as that seed user in the Matters panel and in record_read; no restart
#   flowleap/dev-loop.sh restart                    restart the dsh host from source after a Host edit
#   flowleap/dev-loop.sh probe [file number|my-work] one record_read (default SF-2021-0011), or record_my_work, through the tool executor; no model call
#   flowleap/dev-loop.sh status                     what runs, the person, the model key names
#   flowleap/dev-loop.sh down                       stop everything; the record data and the Sessions stay in the run dir
#
# FLOWLEAP_DEV_RUN names the run dir (default ~/.local/share/flowleap-harness/dev-loop). `up` stores its options there,
# so the other commands take none. Ports: the app on <port> (default 3270) through the records proxy, dsh on <port>+1,
# the probe on <port>+2, the Ticket runtimes of --demo on <port>+10 and up; the record's local proxy on <record port> (default 8275) and its service on <record port>+1.
# The model keys come from this shell's environment only; with none, the app starts and chats fail at the model call.
# FLOWLEAP_DEV_PATCHES adds overlay files (colon-separated absolute paths) after the loop's own; give it to `up` and `restart`.
# --demo is the full first demo (flowleap/docs/dev-loop.md, "The full first demo"): the 18 seed letters with OCR, the
# mailbox reader loop, and the starter, which starts the Ticket runtime of the routed attorney when the Work router asks.
set -euo pipefail

HARNESS=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
RUN=${FLOWLEAP_DEV_RUN:-$HOME/.local/share/flowleap-harness/dev-loop}
LOGS=$RUN/logs
RECORD=$RUN/record

random_secret() { head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n'; }
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
    printf '%s\n' "$json" > "$RUN/records-headers.json.tmp" && mv "$RUN/records-headers.json.tmp" "$RUN/records-headers.json")
  # A person with a Ticket runtime keeps that runtime's token: the record finds a token in one person's file only.
  local reads='the Matters panel and record_read read the record as this person'
  if [[ -s $RUN/runtimes/$oid/record-token ]]; then
    reads="the Records screens read the record as this person; record_read cannot, because $handle's Ticket runtime holds the record token of $handle"
  else
    (umask 077; cp "$RUN/record-token" "$RECORD/runtime-tokens/.next" && mv "$RECORD/runtime-tokens/.next" "$RECORD/runtime-tokens/$oid")
  fi
  local previous; previous=$(cat "$RUN/person-oid" 2> /dev/null || true)
  [[ -z $previous || $previous == "$oid" ]] || ! cmp -s "$RUN/record-token" "$RECORD/runtime-tokens/$previous" || rm -f "$RECORD/runtime-tokens/$previous"
  printf '%s\n' "$oid" > "$RUN/person-oid"
  printf '%s\n' "$handle" > "$RUN/person"
  say "acting as $handle ($oid): $reads"
}

# Runs dsh from this checkout's source (the launch of `pnpm run start:web`) in <dir>/workspace with DSH_HOME <dir>/home,
# with the record token of DEV_TOKEN_FILE (default the moving dev token). Call it in a subshell: it exports the loop's
# variables and ends in exec.
dsh() {
  local dir=$1 port=$2; shift 2
  local tsx; tsx=$(cd "$HARNESS" && node --input-type=module -e "console.log(import.meta.resolve('tsx/esm'))")
  local p patch patches=()
  IFS=: read -ra patch <<< "${FLOWLEAP_DEV_PATCHES:-}"
  for p in ${patch[@]+"${patch[@]}"}; do [[ -z $p ]] || patches+=(--patch "$p"); done
  # Sign out goes to the person picker, once the records row of the bundle has signOutHref (harness PR 346).
  ! grep -q 'signOutHref' "$HARNESS/packages/bundle/flowleap-web/cordis.patch.yml" || patches=(--patch "$HARNESS/flowleap/dev-loop-signout.patch.yml" ${patches[@]+"${patches[@]}"})
  local skills=${FLOWLEAP_SKILLS_DIR:-$HOME/flowleap/flowleap-methods/skills}
  # The skill pack row fails at load when its folder does not exist; an empty folder means no FlowLeap skill.
  [[ -d $skills ]] || { skills=$RUN/no-skills; mkdir -p "$skills"; }
  mkdir -p "$dir/home" "$dir/workspace"
  FLOWLEAP_RECORD_TOKEN=$(< "${DEV_TOKEN_FILE:-$RUN/record-token}")
  export FLOWLEAP_SKILLS_DIR=$skills TSX_TSCONFIG_PATH=$HARNESS/tsconfig.json FLOWLEAP_DEV_RECORD_URL=http://127.0.0.1:$((RECORD_PORT + 1)) \
    FLOWLEAP_RECORD_TOKEN DSH_HOME=$dir/home DSH_AGENTS_HOME=$dir/home/agents
  cd "$dir/workspace" && exec node --import "$tsx" "$HARNESS/apps/cli/src/bin.ts" --profile flowleap-web \
    --patch "$HARNESS/apps/web/tests/pin-browse-picker.overlay.yml" --patch "$HARNESS/flowleap/dev-loop.patch.yml" ${patches[@]+"${patches[@]}"} "$@" --no-open --port "$port"
}
# The access link that dsh prints in <log> for <port>.
dsh_url() { grep -Eo "http://127\.0\.0\.1:${2:-$((PORT + 1))}/\?token=[^ ]*" "${1:-$LOGS/dsh.log}" 2> /dev/null | head -1 || true; }
# Waits until the dsh of <pid file> answers on its link in <log> for <port>; fails when it exits or after 120 s.
wait_ready() {
  local pid=$1 log=$2 port=$3 what=$4 t0=$SECONDS url
  for _ in $(seq 1 240); do
    alive "$pid" || { tail -20 "$log" >&2; say "$what exited: $log"; return 1; }
    url=$(dsh_url "$log" "$port")
    if [[ -n $url ]] && curl -fs -o /dev/null "$url"; then
      say "$what ready in $((SECONDS - t0)) s"
      ! grep -q 'did not activate' "$log" || say "WARN a row did not activate: $(grep -m1 'did not activate' "$log")"
      return 0
    fi
    sleep 0.5
  done
  say "$what not ready after 120 s: $log"
  return 1
}
start_dsh() {
  (dsh "$RUN" $((PORT + 1)) > "$LOGS/dsh.log" 2>&1 & echo $! > "$RUN/dsh.pid")
  wait_ready "$RUN/dsh.pid" "$LOGS/dsh.log" $((PORT + 1)) dsh || die "dsh did not start"
}

# The starter of the full demo, as the host of a firm (flowleap-os lib/starter.mjs and lib/record/router.mjs): when a
# Ticket wakes a person, the Work router writes starter/requests/<person id> and waits for starter/runtimes/<person id>.json.
# The starter then starts that person's Ticket runtime: a dsh with the Ticket overlay, the Office rows, the firm templates
# and the OpenRouter model row, its own record token in runtime-tokens/<person id>, and the person's Ticket key.
TICKET_PATCHES=$HARNESS/packages/experimental/flowleap-ticket/examples/local-run/cordis.yml:$HARNESS/.agents/skills/verify/features/office.patch.yml:$HARNESS/flowleap/dev-loop-ticket.patch.yml
TEMPLATES=$HARNESS/packages/experimental/flowleap-ticket/examples/local-run/templates
ticket_runtime() {
  local oid=$1 dir=$RUN/runtimes/$1 port
  if alive "$dir/dsh.pid" && [[ -s $RECORD/starter/runtimes/$oid.json ]]; then return 0; fi
  # The Ticket runtimes listen on <port>+10, +11, ... in the order of their first start.
  [[ -s $dir/port ]] || { local n; n=$(find "$RUN/runtimes" -mindepth 1 -maxdepth 1 -type d 2> /dev/null | wc -l); mkdir -p "$dir"; echo $((PORT + 10 + n)) > "$dir/port"; }
  port=$(< "$dir/port")
  mkdir -p "$dir/runws"
  (umask 077
    [[ -s $dir/record-token ]] || random_secret > "$dir/record-token"
    cp "$dir/record-token" "$RECORD/runtime-tokens/.$oid" && mv "$RECORD/runtime-tokens/.$oid" "$RECORD/runtime-tokens/$oid"
    [[ -s $RECORD/ticket-keys/$oid ]] || random_secret > "$RECORD/ticket-keys/$oid")
  stop_pid "$dir/dsh.pid"
  (DEV_TOKEN_FILE=$dir/record-token FLOWLEAP_RECORD_URL=http://127.0.0.1:$((RECORD_PORT + 1)) FLOWLEAP_TICKET_SECRET=$(< "$RECORD/ticket-keys/$oid") \
    FLOWLEAP_TEMPLATES_DIR=$TEMPLATES FLOWLEAP_RUN_WORKSPACE=$dir/runws DSH_VERIFY_OFFICE_TEMPLATES=$TEMPLATES \
    DSH_VERIFY_OFFICECLI=$OFFICECLI DSH_VERIFY_OFFICECLI_SHA256=$OFFICECLI_SHA256 FLOWLEAP_DEV_PATCHES=$TICKET_PATCHES \
    dsh "$dir" "$port" > "$dir/dsh.log" 2>&1 & echo $! > "$dir/dsh.pid")
  wait_ready "$dir/dsh.pid" "$dir/dsh.log" "$port" "the Ticket runtime of $oid" || return 1
  printf '{"url":"http://127.0.0.1:%s/","session":"dev-loop"}\n' "$port" > "$RECORD/starter/runtimes/.$oid.json"
  mv "$RECORD/starter/runtimes/.$oid.json" "$RECORD/starter/runtimes/$oid.json"
}
starter() {
  load_options
  mkdir -p "$RECORD/starter/requests" "$RECORD/starter/runtimes"
  say "starter: waiting for the wake requests of the Work router in $RECORD/starter/requests"
  local request oid
  while :; do
    for request in "$RECORD/starter/requests"/*; do
      [[ -f $request ]] || continue
      oid=${request##*/}
      if [[ $oid =~ ^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$ ]]; then
        say "starter: the Work router wakes the runtime of $(head -1 "$request") ($oid)"
        if ticket_runtime "$oid"; then say "starter: the Ticket runtime of $oid is in starter/runtimes/$oid.json"
        else say "starter: the Ticket runtime of $oid did not start: $RUN/runtimes/$oid/dsh.log; the next wake request tries again"; fi
      fi
      rm -f "$request"
    done
    sleep 1
  done
}
app_link() { local url; url=$(dsh_url); printf '%s\n' "${url/:$((PORT + 1))\//:$PORT/}"; }

# The mailbox of the full demo: seed-letters.mjs of flowleap-os sends the 18 seed letters from the scan mailbox once per run
# dir (reader 1 reads each scan with Mistral OCR), and its mailbox process then stays as the reader loop: reader 2 (OpenRouter,
# through a local model gateway) reads each filed letter. It stays for READERS_MINUTES (its most); `up` starts it again with
# --readers-only. Its OCR and reader containers run in the firm's runtime image IMAGE.
READERS_MINUTES=240
start_mailbox() {
  local args=(--local "$RECORD" --port $((RECORD_PORT + 1)) --image "$IMAGE" --readers "$READERS_MINUTES") t0=$SECONDS
  if [[ -f $RUN/seed/letters.done ]]; then
    args+=(--readers-only --out "$RUN/seed/readers-$(date +%Y%m%dT%H%M%S)")
  else
    args+=(--ocr-key-file "$OCR_KEY" --out "$RUN/seed/letters")
    say "seed letters: reader 1 reads each of the 18 scans with Mistral OCR (about USD 0.30); log $LOGS/mailbox.log"
  fi
  # Each start appends to the log; only the lines of this start count.
  local from; from=$(($({ wc -l < "$LOGS/mailbox.log"; } 2> /dev/null || echo 0) + 1))
  this() { tail -n "+$from" "$LOGS/mailbox.log"; }
  (exec node "$OS/acceptance/seed-letters.mjs" "${args[@]}" >> "$LOGS/mailbox.log" 2>&1 & echo $! > "$RUN/mailbox.pid")
  for _ in $(seq 1 1200); do
    this | grep -q 'reads the filed letters' && break
    alive "$RUN/mailbox.pid" || { this | tail -8 >&2; die "seed-letters.mjs ended: $LOGS/mailbox.log"; }
    sleep 0.5
  done
  this | grep -q 'reads the filed letters' || die "seed-letters.mjs did not reach its reader loop in 600 s: $LOGS/mailbox.log"
  touch "$RUN/seed/letters.done"
  say "mailbox: ready after $((SECONDS - t0)) s; $(this | grep -m1 'reads the filed letters' | sed 's/^seed-letters: //')"
}
# Ctrl-C ends the reader loop of seed-letters.mjs, which then stops its model gateway and writes its evidence.
stop_mailbox() {
  alive "$RUN/mailbox.pid" || { rm -f "$RUN/mailbox.pid"; return 0; }
  kill -INT "$(< "$RUN/mailbox.pid")" 2> /dev/null || true
  for _ in $(seq 1 120); do alive "$RUN/mailbox.pid" || break; sleep 0.5; done
  stop_pid "$RUN/mailbox.pid"
}

up() {
  local as='' letters=1
  OS=${FLOWLEAP_OS:-}; PORT=3270; RECORD_PORT=8275; DEMO=0; OFFICECLI=${FLOWLEAP_OFFICECLI:-}
  OCR_KEY=$HOME/.config/flowleap/mistral.env IMAGE=registry.flowleap.co/flowleap/runtime:current
  while (($#)); do
    case $1 in
      --os) OS=$2; shift 2 ;;
      --as) as=$2; shift 2 ;;
      --port) PORT=$2; shift 2 ;;
      --record-port) RECORD_PORT=$2; shift 2 ;;
      --no-letters) letters=0; shift ;;
      --demo) DEMO=1; shift ;;
      --officecli) OFFICECLI=$2; shift 2 ;;
      --ocr-key-file) OCR_KEY=$2; shift 2 ;;
      --image) IMAGE=$2; shift 2 ;;
      *) die "unknown option $1" ;;
    esac
  done
  # The demo starts with the formalities person of SF-2023-0045, who files the letter.
  [[ -n $as ]] || { ((DEMO)) && as=tobias || as=jonas; }
  OFFICECLI_SHA256=''
  if ((DEMO)); then
    ((letters)) || die "--demo needs the seed letters: leave out --no-letters"
    [[ -n ${OPENROUTER_API_KEY:-} ]] || die "--demo needs OPENROUTER_API_KEY in this shell: the Ticket run uses OpenRouter"
    [[ -n $OFFICECLI && -x $OFFICECLI ]] || die "--demo needs the OfficeCLI 1.0.160 binary of this Mac: --officecli <binary> or FLOWLEAP_OFFICECLI"
    OFFICECLI=$(cd "$(dirname "$OFFICECLI")" && pwd)/$(basename "$OFFICECLI")
    OFFICECLI_SHA256=$(shasum -a 256 "$OFFICECLI" | cut -d' ' -f1)
    [[ -r $OCR_KEY ]] || die "--demo reads the 18 seed letters with Mistral OCR: no key file $OCR_KEY (a line MISTRAL_API_KEY=...; --ocr-key-file <file>)"
    OCR_KEY=$(cd "$(dirname "$OCR_KEY")" && pwd)/$(basename "$OCR_KEY")
    docker image inspect "$IMAGE" > /dev/null 2>&1 || die "--demo runs the readers in the firm's runtime image: no image $IMAGE (--image <image>)"
  fi
  [[ -n $OS ]] || die "give --os <flowleap-os checkout> (or FLOWLEAP_OS)"
  OS=$(cd "$OS" && pwd)
  [[ -f $OS/.claude/skills/verify/scripts/record-local.sh && -f $OS/acceptance/seed-firm.mjs ]] || die "$OS is not a flowleap-os checkout"
  [[ -d $HARNESS/node_modules ]] || die "no node_modules: run 'pnpm install' in $HARNESS"
  local t0=$SECONDS
  mkdir -p "$LOGS" "$RUN/seed"
  printf 'OS=%q\nPORT=%q\nRECORD_PORT=%q\nDEMO=%q\nOFFICECLI=%q\nOFFICECLI_SHA256=%q\nOCR_KEY=%q\nIMAGE=%q\n' \
    "$OS" "$PORT" "$RECORD_PORT" "$DEMO" "$OFFICECLI" "$OFFICECLI_SHA256" "$OCR_KEY" "$IMAGE" > "$RUN/loop.env"
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
  # The person picker of the records proxy (Sign out) lists the seed persons.
  (cd "$OS/acceptance" && node --input-type=module -e "import { loadSeed } from 'flowleap-seed-firm'
console.log(JSON.stringify(loadSeed().users.map((u) => ({ handle: u.handle, name: u.name, role: u.firmRole }))))") > "$RUN/people.json"
  # The firm roles of the seed name the confirmers and the escalation chains of the tasks (atlas sheet 0); an os checkout
  # before the task model has no --roles, and its record-local.sh ignores RECORD_ROLES. The seed's file numbers are SF-<year>-<number>.
  # The seed's domain is the firm domain of the notices and of the scan mailbox scan@<domain> that seed-letters sends from.
  local roles='' domain
  if grep -q -- '--roles' "$OS/acceptance/seed-firm.mjs"; then roles=$(node "$OS/acceptance/seed-firm.mjs" --roles) || die "seed-firm.mjs --roles failed"; fi
  domain=$(cd "$OS/acceptance" && node --input-type=module -e "import { loadSeed } from 'flowleap-seed-firm'; console.log(loadSeed().firm.domain)")
  RECORD_INTAKE_PERSONS=$intake RECORD_ROLES=$roles RECORD_ALLOWED_DOMAINS=$domain RECORD_FILE_NUMBER_PATTERN='^SF-\d{4}-\d{4}$' \
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
  if ((DEMO)); then
    # The demo setup goes first: reader 2 reads a letter only with the provider contract and the client's AI wishes.
    node "$HARNESS/flowleap/dev-loop-demo-setup.mjs" "$RECORD" $((RECORD_PORT + 1)) "$OS" > "$LOGS/demo-setup.log" 2>&1 ||
      { cat "$LOGS/demo-setup.log" >&2; die "the demo setup failed"; }
    say "demo setup: $(tail -1 "$LOGS/demo-setup.log")"
    alive "$RUN/mailbox.pid" || start_mailbox
  # A second run records each letter again as a duplicate, so the letters go in once per run dir.
  elif ((letters)) && [[ ! -f $RUN/seed/letters.done ]]; then
    node "$OS/acceptance/seed-letters.mjs" --local "$RECORD" --port $((RECORD_PORT + 1)) --out "$RUN/seed/letters" > "$LOGS/seed-letters.log" 2>&1 ||
      { tail -5 "$LOGS/seed-letters.log" >&2; die "seed-letters.mjs failed: $LOGS/seed-letters.log"; }
    touch "$RUN/seed/letters.done"
    say "seed letters: $(tail -1 "$LOGS/seed-letters.log")"
  fi

  [[ -s $RUN/record-token ]] || (umask 077; random_secret > "$RUN/record-token")
  act_as "$as"

  local keys=() k
  for k in OPENROUTER_API_KEY ANTHROPIC_API_KEY DEEPSEEK_API_KEY; do [[ -z ${!k:-} ]] || keys+=("$k"); done
  ((${#keys[@]})) && say "model keys from this shell: ${keys[*]}" || say "no model key in this shell: the app starts, chats fail at the model call, the record tools work"

  if ! alive "$RUN/watch.pid"; then
    (cd "$HARNESS" && exec node --import tsx/esm scripts/dev-web.ts --poll --skip-build --no-serve > "$LOGS/watch.log" 2>&1 & echo $! > "$RUN/watch.pid")
  fi
  alive "$RUN/dsh.pid" || start_dsh
  if ((DEMO)) && ! alive "$RUN/starter.pid"; then
    (FLOWLEAP_DEV_RUN=$RUN exec "$HARNESS/flowleap/dev-loop.sh" starter > "$LOGS/starter.log" 2>&1 & echo $! > "$RUN/starter.pid")
    say "starter: the Work router's wake request starts the routed person's Ticket runtime (log $LOGS/starter.log)"
  fi
  if ! alive "$RUN/proxy.pid"; then
    (FLOWLEAP_DEV_RUN=$RUN exec node "$HARNESS/.agents/skills/verify/scripts/records-proxy.mjs" "$PORT" "http://127.0.0.1:$((PORT + 1))" \
      "http://127.0.0.1:$((RECORD_PORT + 1))" "$RUN" "$HARNESS/flowleap/dev-loop.sh" > "$LOGS/proxy.log" 2>&1 & echo $! > "$RUN/proxy.pid")
    for _ in $(seq 1 20); do grep -q 'records-proxy:' "$LOGS/proxy.log" 2> /dev/null && break; sleep 0.25; done
  fi
  say "up in $((SECONDS - t0)) s. Open (the token is this instance's access key; keep it out of PRs and notes):"
  app_link
}

restart() {
  load_options
  local t0=$SECONDS
  stop_pid "$RUN/dsh.pid"
  # The Ticket runtimes start again from source at the next wake.
  for f in "$RUN"/runtimes/*/dsh.pid; do [[ ! -f $f ]] || stop_pid "$f"; done
  rm -f "$RECORD"/starter/runtimes/*.json
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
  for f in watch dsh proxy starter mailbox; do printf '%-7s %s\n' "$f" "$(alive "$RUN/$f.pid" && echo "running (pid $(< "$RUN/$f.pid"))" || echo stopped)"; done
  for f in "$RUN"/runtimes/*/dsh.pid; do
    [[ -f $f ]] || continue
    printf 'ticket  %s on port %s: %s\n' "$(basename "$(dirname "$f")")" "$(< "$(dirname "$f")/port")" "$(alive "$f" && echo running || echo stopped)"
  done
  "$OS/.claude/skills/verify/scripts/record-local.sh" doctor "$RECORD" "$RECORD_PORT" | sed 's/^/record /'
  printf 'person  %s\napp     http://127.0.0.1:%s/ (dsh %s)\n' "$(cat "$RUN/person" 2> /dev/null || echo none)" "$PORT" $((PORT + 1))
}

down() {
  load_options
  local f
  stop_mailbox
  for f in starter proxy dsh watch; do stop_pid "$RUN/$f.pid"; done
  for f in "$RUN"/runtimes/*/dsh.pid; do [[ ! -f $f ]] || stop_pid "$f"; done
  # A stopped Ticket runtime is not there for the Work router: the next wake asks the starter again.
  rm -f "$RECORD"/starter/runtimes/*.json
  "$OS/.claude/skills/verify/scripts/record-local.sh" stop "$RECORD" "$RECORD_PORT"
  say "stopped; the record data, the seed and the Sessions stay in $RUN (remove it to start fresh)"
}

cmd=${1:-}; shift || true
case $cmd in
  up) up "$@" ;;
  as) [[ -n ${1:-} ]] || die "give a seed handle (jonas, lena, anna, partner, sabine, ...) or admin"; load_options; act_as "$1" ;;
  restart) restart ;;
  starter) starter ;;
  probe) probe "$@" ;;
  status) status ;;
  down) down ;;
  *) sed -n '2,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
