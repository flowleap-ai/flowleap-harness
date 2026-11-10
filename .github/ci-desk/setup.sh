#!/bin/bash
# One-time setup of the desk CI runner. Run with sudo from this directory:
#   sudo bash setup.sh
# It creates the hidden standard user `ghci`, installs the launcher, asks for
# the runner registration token with a hidden prompt, keeps the Mac awake on
# power, and starts the LaunchDaemon. See README.md for the full guide.
set -euo pipefail

readonly CI_USER='ghci'
readonly CI_HOME="/Users/$CI_USER"
readonly LABEL='co.flowleap.dsh-ci-desk'
readonly PLIST="/Library/LaunchDaemons/$LABEL.plist"
readonly SOURCE="$(cd "$(dirname "$0")" && pwd)"

if [[ $EUID -ne 0 ]]; then
  echo 'Run this script with sudo.' >&2
  exit 1
fi
for tool in /opt/homebrew/bin/colima /opt/homebrew/bin/docker; do
  if [[ ! -x "$tool" ]]; then
    echo "Missing $tool. Run 'brew install colima docker docker-buildx' as your own user first." >&2
    exit 1
  fi
done

if ! id "$CI_USER" >/dev/null 2>&1; then
  # Nobody logs in as this user, so its random password is never stored.
  sysadminctl -addUser "$CI_USER" -fullName 'DSH CI runner' -home "$CI_HOME" -shell /usr/bin/false \
    -password "$(openssl rand -base64 32)"
  dscl . create "/Users/$CI_USER" IsHidden 1
  createhomedir -c -u "$CI_USER" >/dev/null
fi

install -d -o "$CI_USER" -g staff -m 0755 "$CI_HOME/ci-desk"
install -o "$CI_USER" -g staff -m 0644 "$SOURCE/Dockerfile" "$CI_HOME/ci-desk/Dockerfile"
install -o "$CI_USER" -g staff -m 0755 "$SOURCE/launcher.sh" "$CI_HOME/ci-desk/launcher.sh"
install -o "$CI_USER" -g staff -m 0644 "$SOURCE/job-started.sh" "$CI_HOME/ci-desk/job-started.sh"
install -d -o "$CI_USER" -g staff -m 0700 "$CI_HOME/.config" "$CI_HOME/.config/dsh-ci"
install -d -o "$CI_USER" -g staff -m 0755 "$CI_HOME/Library/Logs"

token_file="$CI_HOME/.config/dsh-ci/runner-token"
if [[ ! -s "$token_file" ]]; then
  read -r -s -p 'Paste the "desk runner registration" token (input is hidden): ' token
  echo
  if [[ -z "$token" ]]; then
    echo 'No token entered.' >&2
    exit 1
  fi
  (umask 077 && printf '%s' "$token" > "$token_file")
  unset token
  chown "$CI_USER":staff "$token_file"
  chmod 0600 "$token_file"
fi

# Keep the Mac awake on power so queued jobs do not wait for it to wake.
# A second run must keep the value from before the first run.
previous_sleep="$CI_HOME/.config/dsh-ci/previous-ac-sleep"
if [[ ! -s "$previous_sleep" ]]; then
  pmset -g custom | awk '/AC Power/{ac=1} ac && $1=="sleep"{print $2; exit}' > "$previous_sleep"
fi
pmset -c sleep 0

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>UserName</key><string>$CI_USER</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$CI_HOME/ci-desk/launcher.sh</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>HOME</key><string>$CI_HOME</string></dict>
  <key>WorkingDirectory</key><string>$CI_HOME</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>StandardOutPath</key><string>$CI_HOME/Library/Logs/dsh-ci-desk.log</string>
  <key>StandardErrorPath</key><string>$CI_HOME/Library/Logs/dsh-ci-desk.log</string>
</dict>
</plist>
PLIST
chown root:wheel "$PLIST"
chmod 0644 "$PLIST"
launchctl bootout "system/$LABEL" 2>/dev/null || true
launchctl bootstrap system "$PLIST"
echo "Started $LABEL. Log: $CI_HOME/Library/Logs/dsh-ci-desk.log"
