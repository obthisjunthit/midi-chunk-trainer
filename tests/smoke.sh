#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export MPCDEV_ROOT="$TMP/mpc"
mkdir -p "$MPCDEV_ROOT/incoming"
ctl() { sh device/mpcdev.sh "$@"; }
cp releases/hello-001/payload.sh "$MPCDEV_ROOT/incoming/hello-001.sh"
HASH=$(sha256sum releases/hello-001/payload.sh); HASH=${HASH%% *}
ctl install hello-001 "$HASH"
ctl test
ctl run
if ctl rollback; then exit 1; fi
cp releases/hello-001/payload.sh "$MPCDEV_ROOT/incoming/hello-002.sh"
ctl install hello-002 "$HASH"
[ "$(cat "$MPCDEV_ROOT/state/current")" = hello-002 ]
ctl rollback
[ "$(cat "$MPCDEV_ROOT/state/current")" = hello-001 ]
ctl test
printf '\n#tampered\n' >> "$MPCDEV_ROOT/releases/hello-001/payload.sh"
if ctl run; then exit 1; fi
cp releases/hello-001/payload.sh "$MPCDEV_ROOT/incoming/bad.sh"
if ctl install bad aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; then exit 1; fi
[ "$(cat "$MPCDEV_ROOT/state/current")" = hello-001 ]
if ctl install '../escape' "$HASH"; then exit 1; fi
mkdir "$MPCDEV_ROOT/state/deploy.lock"
if ctl status; then exit 1; fi
rmdir "$MPCDEV_ROOT/state/deploy.lock"
printf 'exit 1\n' > "$MPCDEV_ROOT/incoming/failing.sh"
FAILHASH=$(sha256sum "$MPCDEV_ROOT/incoming/failing.sh"); FAILHASH=${FAILHASH%% *}
if ctl install failing "$FAILHASH"; then exit 1; fi
[ "$(cat "$MPCDEV_ROOT/state/current")" = hello-001 ]
printf '%s\n' 'PASS: install, test, run, first-release rollback refusal, upgrade, rollback, tamper rejection, wrong digest, path rejection, locking'
