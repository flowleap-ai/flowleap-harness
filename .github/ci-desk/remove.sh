#!/bin/bash
# Removes everything setup.sh created on desk. Run with sudo:
#   sudo bash remove.sh
# The GitHub side (runner registrations, DSH_CI_DESK, the status secret, and
# both tokens) is removed separately; README.md lists those steps.
set -euo pipefail

readonly CI_USER='ghci'
readonly CI_HOME="/Users/$CI_USER"
readonly LABEL='co.flowleap.dsh-ci-desk'
readonly PLIST="/Library/LaunchDaemons/$LABEL.plist"

if [[ $EUID -ne 0 ]]; then
  echo 'Run this script with sudo.' >&2
  exit 1
fi

launchctl bootout "system/$LABEL" 2>/dev/null || true
rm -f "$PLIST"

if id "$CI_USER" >/dev/null 2>&1; then
  sudo -u "$CI_USER" -H /opt/homebrew/bin/colima delete --profile dsh-ci --force 2>/dev/null || true
  previous="$(cat "$CI_HOME/.config/dsh-ci/previous-ac-sleep" 2>/dev/null || true)"
  if [[ "$previous" =~ ^[0-9]+$ ]]; then pmset -c sleep "$previous"; fi
  sysadminctl -deleteUser "$CI_USER"
fi
echo "Removed $LABEL, the $CI_USER user, and its colima VM."
