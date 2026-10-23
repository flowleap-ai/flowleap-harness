#!/usr/bin/env bash
# `harness-doctor` inside the image: the bundled scripts/flowleap/doctor.ts.
#   docker exec harness-alice harness-doctor            # text report
#   docker exec harness-alice harness-doctor --json     # the same as JSON
#   docker exec -i harness-alice harness-doctor --scrub < file
# HARNESS_ROOT, DSH_BIN and DSH_HOME come from the image environment.
set -euo pipefail
exec node "${HARNESS_ROOT:-/opt/harness}/flowleap/doctor.mjs" "$@"
