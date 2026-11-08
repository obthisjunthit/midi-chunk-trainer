#!/bin/sh
# MPCDev pull v1: fetch a published release from the user's fixed public GitHub repo.
# Never trusts HTTPS provided by the MPC's wget for authenticity: SHA256 is supplied
# independently by the iPhone over SSH after iPhone HTTPS retrieval and user approval.
# No firmware updates, startup hooks, or replacement of the existing MPCDev controller.
set -eu
umask 077

D=${MPCDEV_ROOT:-/sdcard/MPCDev}
URL=https://raw.githubusercontent.com/obthisjunthit/midi-chunk-trainer/main/public/latest.sh
fail() { printf '%s\n' "MPCDev pull: $*" >&2; exit 1; }
[ "$#" -eq 2 ] || fail 'usage: mpcdev-pull-v1.sh APPROVED_SHA256 test|run'
approved=$1
mode=$2
[ "${#approved}" -eq 64 ] || fail 'SHA-256 must contain exactly 64 characters'
case "$approved" in *[!0-9a-f]*) fail 'SHA-256 must be lowercase hexadecimal' ;; esac
case "$mode" in test|run) ;; *) fail 'mode must be test or run' ;; esac
[ -d "$D" ] && [ ! -L "$D" ] || fail 'invalid MPCDev directory'
[ -f "$D/mpcdev.sh" ] && [ ! -L "$D/mpcdev.sh" ] || fail 'existing MPCDev controller missing'
for sub in incoming releases state; do
  [ -d "$D/$sub" ] && [ ! -L "$D/$sub" ] || fail "invalid $sub directory"
done
[ -r /proc/sys/kernel/random/uuid ] || fail 'Linux UUID generator unavailable'
id=ios-$(cat /proc/sys/kernel/random/uuid)
[ "${#id}" -eq 40 ] || fail 'unexpected UUID length'
case "$id" in *[!A-Za-z0-9_-]*) fail 'unsafe UUID' ;; esac

lock="$D/incoming/.github-pull.lock"
mkdir "$lock" 2>/dev/null || fail 'pull busy; inspect incoming/.github-pull.lock'
cleanup() { rm -f "$lock/download"; rmdir "$lock"; }
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

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
