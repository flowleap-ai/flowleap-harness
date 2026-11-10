#!/bin/bash
# The runner runs this hook (ACTIONS_RUNNER_HOOK_JOB_STARTED) before any step
# of a job. A fork pull request can edit `runs-on` in its own workflow file, so
# this check, which lives in the image and not in the repository, decides
# which jobs run on desk: a push to `flowleap`, or a pull request from this
# repository that Dependabot did not open. A non-zero exit fails the job
# before its first step.
set -euo pipefail

readonly REPOSITORY='flowleap-ai/flowleap-harness'

refuse() {
  echo "desk refuses this job: $*" >&2
  exit 1
}

[[ "${GITHUB_REPOSITORY:-}" == "$REPOSITORY" ]] || refuse "repository ${GITHUB_REPOSITORY:-unset}"
[[ -r "${GITHUB_EVENT_PATH:-}" ]] || refuse 'no event payload'

case "${GITHUB_EVENT_NAME:-}" in
  push)
    [[ "${GITHUB_REF:-}" == 'refs/heads/flowleap' ]] || refuse "push to ${GITHUB_REF:-unset}"
    ;;
  pull_request)
    head="$(jq -r '.pull_request.head.repo.full_name // ""' "$GITHUB_EVENT_PATH")"
    author="$(jq -r '.pull_request.user.login // ""' "$GITHUB_EVENT_PATH")"
    [[ "$head" == "$REPOSITORY" ]] || refuse "pull request from ${head:-an unknown repository}"
    [[ "$author" != 'dependabot[bot]' ]] || refuse 'Dependabot pull request'
    ;;
  *)
    refuse "event ${GITHUB_EVENT_NAME:-unset}"
    ;;
esac
[[ "${GITHUB_ACTOR:-}" != 'dependabot[bot]' ]] || refuse 'Dependabot actor'
echo "desk accepts ${GITHUB_EVENT_NAME} ${GITHUB_REF:-}"
