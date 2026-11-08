#!/bin/sh
# MPCDev pull v3: content-addressed GitHub release delivery with duplicate protection.
# SHA-256 comes from iPhone after user approval, not the MPC's unverified HTTPS.
# Keeps the existing controller, rollback, and firmware untouched.
set -eu
umask 077

D=${MPCDEV_ROOT:-/sdcard/MPCDev}
URL_BASE=https://raw.githubusercontent.com/obthisjunthit/midi-chunk-trainer/main/public/releases
fail() { printf '%s\n' "MPCDev pull: $*" >&2; exit 1; }
[ "$#" -eq 2 ] || fail 'usage: mpcdev-pull-v3.sh APPROVED_SHA256 test|run'
approved=$1
mode=$2
[ "${#approved}" -eq 64 ] || fail 'SHA-256 must contain exactly 64 characters'
case "$approved" in *[!0-9a-f]*) fail 'SHA-256 must be lowercase hexadecimal' ;; esac
case "$mode" in test|run) ;; *) fail 'mode must be test or run' ;; esac
URL="$URL_BASE/$approved.sh"
[ -d "$D" ] && [ ! -L "$D" ] || fail 'invalid MPCDev directory'
[ -f "$D/mpcdev.sh" ] && [ ! -L "$D/mpcdev.sh" ] || fail 'existing MPCDev controller missing'
for sub in incoming releases state; do
  [ -d "$D/$sub" ] && [ ! -L "$D/$sub" ] || fail "invalid $sub directory"
done
[ -r /proc/sys/kernel/random/uuid ] || fail 'Linux UUID generator unavailable'

lock="$D/incoming/.github-pull.lock"
mkdir "$lock" 2>/dev/null || fail 'pull busy; inspect incoming/.github-pull.lock'
cleanup() { rm -f "$lock/download"; rmdir "$lock"; }
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

# Already running identical bytes? Stop before downloading, changing refs, or executing.
current_file="$D/state/current"
if [ -e "$current_file" ] || [ -L "$current_file" ]; then
  [ -f "$current_file" ] && [ ! -L "$current_file" ] || fail 'invalid current reference'
  current=$(cat "$current_file")
  case "$current" in ''|*[!A-Za-z0-9_-]*) fail 'unsafe current release ID' ;; esac
  [ "${#current}" -le 64 ] || fail 'invalid current release ID length'
  active="$D/releases/$current"
  if [ -d "$active" ] && [ ! -L "$active" ] &&
     [ -f "$active/SHA256" ] && [ ! -L "$active/SHA256" ]; then
    stored=$(cat "$active/SHA256")
    if [ "$stored" = "$approved" ]; then
      [ -f "$active/payload.sh" ] && [ ! -L "$active/payload.sh" ] || fail 'active payload missing or symlink'
      actual=$(sha256sum "$active/payload.sh"); actual=${actual%% *}
      [ "$actual" = "$approved" ] || fail 'active payload checksum mismatch'
      printf '%s\n' "Already active: $current (same SHA-256). No download, reinstallation, or execution."
      sh "$D/mpcdev.sh" status
      exit 0
    fi
  fi
fi

id=ios-$(cat /proc/sys/kernel/random/uuid)
[ "${#id}" -eq 40 ] || fail 'unexpected UUID length'
case "$id" in *[!A-Za-z0-9_-]*) fail 'unsafe UUID' ;; esac
printf '%s\n' 'Downloading approved release from GitHub...'
wget -q -O "$lock/download" "$URL" || fail 'download failed (verify MPC Wi-Fi and GitHub access)'
bytes=$(busybox wc -c < "$lock/download")
[ "$bytes" -gt 0 ] && [ "$bytes" -le 10485760 ] || fail 'release must be between 1 byte and 10 MiB'
actual=$(sha256sum "$lock/download"); actual=${actual%% *}
[ "$actual" = "$approved" ] || fail 'digest mismatch: GitHub release differs from iPhone-approved copy; nothing executed'
sh -n "$lock/download" || fail 'shell syntax check failed'
incoming="$D/incoming/$id.sh"
[ ! -e "$incoming" ] && [ ! -L "$incoming" ] || fail 'release ID collision'
( set -C; cat "$lock/download" > "$incoming" ) || fail 'cannot create incoming release'
actual=$(sha256sum "$incoming"); actual=${actual%% *}
[ "$actual" = "$approved" ] || fail 'copied release checksum mismatch'

sh "$D/mpcdev.sh" install "$id" "$approved"
sh "$D/mpcdev.sh" test
if [ "$mode" = run ]; then
  sh "$D/mpcdev.sh" run
fi
sh "$D/mpcdev.sh" status
printf '%s\n' "MPCDev pull complete: $id"
