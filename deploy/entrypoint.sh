#!/usr/bin/env bash
# Container entry point: run the FlowLeap Patent AI profile of the harness.
#
# Environment (set by deploy/docker-compose.yml):
#   PUBLIC_URL    the HTTPS root browsers use, for example https://harness-alice.tailnet.ts.net/   (required)
#   TRUSTED_HOST  the authority of that root; several entries separated by spaces              (required)
#   PORT          listen port (default 3080)
#   BIND_HOST     loopback (default; use with a Tailscale sidecar sharing the network namespace),
#                 auto (the container's own address, for `docker run -p`), or one concrete IP
#   TLS_CERT, TLS_KEY   optional PEM files to terminate TLS on the listener itself
#   DSH_HOME      the harness home on the /data volume (set by the image)
#   PATCH_FILES   optional overlay files (`dsh --patch`), separated by spaces, applied in order after the profile
#
# Extra arguments are passed to `dsh --profile flowleap-web` unchanged.
set -euo pipefail

: "${PUBLIC_URL:?set PUBLIC_URL to the HTTPS root browsers use, ending in /}"
: "${TRUSTED_HOST:?set TRUSTED_HOST to the authority of PUBLIC_URL (host or host:port)}"
: "${DSH_HOME:?DSH_HOME must name the harness home}"
: "${DSH_BIN:?DSH_BIN must name the dsh entry point}"

port=${PORT:-3080}
mkdir -p "$DSH_HOME" "${HOME:-$DSH_HOME/home}"

# The launcher reads --patch only before the first application flag.
args=()
read -r -a patch_files <<< "${PATCH_FILES:-}"
for patch in ${patch_files[@]+"${patch_files[@]}"}; do
  [[ -f $patch && -r $patch ]] || { echo "harness-entrypoint: PATCH_FILES names $patch, which is not a readable file" >&2; exit 1; }
  args+=(--patch "$patch")
done
args+=(--profile flowleap-web --no-open --port "$port")

bind=${BIND_HOST:-loopback}
case "$bind" in
  loopback | '') bind=127.0.0.1 ;;
  auto)
    bind=$(hostname -i | awk '{ print $1 }')
    args+=(--host "$bind")
    ;;
  *) args+=(--host "$bind") ;;
esac
# The health check dials the same address the listener binds.
printf '%s\n' "$bind" > /tmp/harness-bind-host

args+=(--public-url "$PUBLIC_URL")
for authority in $TRUSTED_HOST; do
  args+=(--trusted-host "$authority")
done

if [[ -n ${TLS_CERT:-} || -n ${TLS_KEY:-} ]]; then
  : "${TLS_CERT:?TLS_CERT and TLS_KEY go together}"
  : "${TLS_KEY:?TLS_CERT and TLS_KEY go together}"
  args+=(--tls-cert "$TLS_CERT" --tls-key "$TLS_KEY")
fi

exec node "$DSH_BIN" "${args[@]}" "$@"
