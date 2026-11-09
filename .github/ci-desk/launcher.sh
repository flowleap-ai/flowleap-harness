#!/bin/bash
# Runs as the `ghci` macOS user from the co.flowleap.dsh-ci-desk LaunchDaemon.
# Each loop starts the colima VM if needed, registers one just-in-time runner,
# runs exactly one job in a fresh container, and deletes the container.
set -euo pipefail

readonly REPOSITORY='flowleap-ai/flowleap-harness'
readonly LABELS='["self-hosted","linux","arm64","desk"]'
readonly PROFILE='dsh-ci'
readonly HERE="$HOME/ci-desk"
readonly TOKEN_FILE="$HOME/.config/dsh-ci/runner-token"
readonly EMPTY_MOUNT="$HOME/.dsh-ci-empty"
readonly PRUNE_MARKER="$HOME/.dsh-ci-last-prune"

export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export DOCKER_HOST="unix://$HOME/.colima/$PROFILE/docker.sock"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }

start_vm() {
  if colima status --profile "$PROFILE" >/dev/null 2>&1; then return; fi
  mkdir -p "$EMPTY_MOUNT"
  # The only shared host path is one empty directory, read-only. Without an
  # explicit mount, colima would share the user's home folder.
  colima start --profile "$PROFILE" --vm-type vz --cpu 8 --memory 20 --disk 60 \
    --mount "$EMPTY_MOUNT"
  local shared
  shared="$(colima ssh --profile "$PROFILE" -- sh -c 'find /Users -mindepth 1 -not -path "*/.dsh-ci-empty" -not -path "/Users/ghci" 2>/dev/null | head -1')"
  if [[ -n "$shared" ]]; then
    log "refusing to run jobs: the VM can see host path $shared"
    colima stop --profile "$PROFILE"
    exit 1
  fi
  # bubblewrap needs unprivileged user namespaces; the hosted job does the same
  # through scripts/prepare-ci-bubblewrap.sh.
  colima ssh --profile "$PROFILE" -- sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0 \
    || log 'apparmor userns switch absent in the VM'
}

image_tag() {
  printf 'dsh-ci-runner:%s' "$(cat "$HERE/Dockerfile" "$HERE/job-started.sh" | shasum -a 256 | cut -c1-12)"
}

ensure_image() {
  local tag
  tag="$(image_tag)"
  if ! docker image inspect "$tag" >/dev/null 2>&1; then
    log "building $tag"
    docker build --tag "$tag" --file "$HERE/Dockerfile" "$HERE"
  fi
}

github_api() {
  # The token reaches curl on stdin, never in a process argument.
  printf 'header = "Authorization: Bearer %s"\n' "$(cat "$TOKEN_FILE")" | curl --config - \
    --fail --silent --show-error --header 'Accept: application/vnd.github+json' "$@"
}

# A fork pull request can name the desk label in its own workflow file, so
# desk registers no runner unless every outside contributor needs approval.
fork_approval_required() {
  local policy
  policy="$(github_api "https://api.github.com/repos/$REPOSITORY/actions/permissions/fork-pr-contributor-approval" \
    | jq -er .approval_policy)" || return 1
  [[ "$policy" == 'all_external_contributors' ]]
}

jit_config() {
  github_api --request POST \
    --data "{\"name\":\"desk-$(date +%s)\",\"runner_group_id\":1,\"labels\":$LABELS,\"work_folder\":\"_work\"}" \
    "https://api.github.com/repos/$REPOSITORY/actions/runners/generate-jitconfig" \
    | jq -er .encoded_jit_config
}

prune_weekly() {
  if [[ -f "$PRUNE_MARKER" ]] && [[ -z "$(find "$PRUNE_MARKER" -mtime +7)" ]]; then return; fi
  log 'weekly prune'
  docker container prune --force
  docker image prune --all --force --filter "until=168h"
  docker builder prune --all --force --filter "until=168h"
  touch "$PRUNE_MARKER"
}

while true; do
  start_vm
  ensure_image
  prune_weekly
  if ! fork_approval_required; then
    log 'refusing to register: the fork approval policy is not all_external_contributors; retrying in 300 s'
    sleep 300
    continue
  fi
  if ! config="$(jit_config)"; then
    log 'runner registration failed; retrying in 60 s'
    sleep 60
    continue
  fi
  log 'waiting for one job'
  # seccomp and AppArmor stay unconfined so bubblewrap can create user
  # namespaces inside the container; the VM is the isolation boundary.
  DSH_JITCONFIG="$config" docker run --rm --name dsh-ci-job --cpus 8 --memory 20g --env DSH_JITCONFIG \
    --security-opt seccomp=unconfined --security-opt apparmor=unconfined --security-opt systempaths=unconfined \
    "$(image_tag)" || log "job container exited with status $?"
  unset config
  sleep 5
done
