#!/usr/bin/env bash
# Container health check: the index route of the harness must answer. Without a
# session cookie the index answers 401, with the launch token 303, with a cookie
# 200; any of the three means the process serves.
set -u
host=$(cat /tmp/harness-bind-host 2>/dev/null || echo 127.0.0.1)
port=${PORT:-3080}
scheme=http
if [[ -n ${TLS_CERT:-} ]]; then scheme=https; fi
code=$(curl -k -s -o /dev/null --max-time 4 -w '%{http_code}' "${scheme}://${host}:${port}/" || echo 000)
case "$code" in
  200 | 303 | 401) exit 0 ;;
  *) echo "index answered ${code}" >&2; exit 1 ;;
esac
