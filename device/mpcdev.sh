#!/bin/sh
# Independent companion to the existing control.sh. Never replaces it.
set -eu
umask 077
ROOT=${MPCDEV_ROOT:-/sdcard/MPCDev}
fail() { printf '%s\n' "MPCDev: $*" >&2; exit 1; }
valid_id() { case "$1" in ''|*[!a-zA-Z0-9_-]*) return 1;; esac; [ "${#1}" -le 64 ]; }
valid_hash() { [ "${#1}" -eq 64 ] || return 1; case "$1" in *[!0-9a-f]*) return 1;; esac; }
[ -d "$ROOT" ] && [ ! -L "$ROOT" ] || fail 'root must be an existing real directory'
for dir in incoming releases logs state; do
  [ ! -L "$ROOT/$dir" ] || fail "symlink directory: $dir"
  mkdir -p "$ROOT/$dir"
done
# Serialize readers and writers. Never automatically remove a stale lock.
mkdir "$ROOT/state/deploy.lock" 2>/dev/null || fail 'busy; inspect state/deploy.lock before removing a stale lock'
trap 'rmdir "$ROOT/state/deploy.lock"' EXIT
trap 'exit 1' HUP INT TERM
read_ref() {
  REF=
  if [ -e "$ROOT/state/$1" ]; then
    [ -f "$ROOT/state/$1" ] && [ ! -L "$ROOT/state/$1" ] || fail 'invalid reference'
    REF=$(cat "$ROOT/state/$1")
    valid_id "$REF" || fail 'invalid release id in reference'
  fi
}
verify() {
  valid_id "$1" || fail 'invalid release id'
  D="$ROOT/releases/$1"
  [ -d "$D" ] && [ ! -L "$D" ] || fail 'release missing'
  for f in payload.sh SHA256; do
    [ -f "$D/$f" ] && [ ! -L "$D/$f" ] || fail 'release file missing or symlink'
  done
  EXPECTED=$(cat "$D/SHA256")
  valid_hash "$EXPECTED" || fail 'invalid stored digest'
  ACTUAL=$(sha256sum "$D/payload.sh"); ACTUAL=${ACTUAL%% *}
  [ "$ACTUAL" = "$EXPECTED" ] || fail 'release integrity check failed'
}
write_ref() {
  # Same-directory rename is atomic. A leftover .new file is never active.
  [ ! -L "$ROOT/state/$1.new" ] || fail 'unsafe temporary reference'
  printf '%s\n' "$2" > "$ROOT/state/$1.new"
  mv -f "$ROOT/state/$1.new" "$ROOT/state/$1"
}
case "${1:-status}" in
  install)
    [ "$#" -eq 3 ] || fail 'usage: install ID APPROVED_SHA256'
    ID=$2; HASH=$3
    valid_id "$ID" && valid_hash "$HASH" || fail 'invalid id or approved SHA256'
    SRC="$ROOT/incoming/$ID.sh"
    [ -f "$SRC" ] && [ ! -L "$SRC" ] || fail 'incoming payload missing or symlink'
    [ ! -e "$ROOT/releases/$ID" ] && [ ! -L "$ROOT/releases/$ID" ] || fail 'release id already exists; use a new id'
    STAGE="$ROOT/releases/.stage-$ID"
    [ ! -e "$STAGE" ] && [ ! -L "$STAGE" ] || fail 'staging exists; inspect it first'
    mkdir "$STAGE"
    cp "$SRC" "$STAGE/payload.sh"
    ACTUAL=$(sha256sum "$STAGE/payload.sh"); ACTUAL=${ACTUAL%% *}
    [ "$ACTUAL" = "$HASH" ] || fail 'approved SHA256 mismatch; staging retained for inspection'
    printf '%s\n' "$HASH" > "$STAGE/SHA256"
    # Parse and test only AFTER authenticating against the independently approved hash.
    sh -n "$STAGE/payload.sh"
    sh "$STAGE/payload.sh" test
    mv "$STAGE" "$ROOT/releases/$ID"
    read_ref current; OLD=$REF
    if [ -n "$OLD" ]; then verify "$OLD"; write_ref previous "$OLD"; fi
    write_ref current "$ID"
    printf '%s\n' "Activated $ID (previous: ${OLD:-none})"
    ;;
  run|test)
    CMD=$1; read_ref current
    [ -n "$REF" ] || fail 'no active release'
    verify "$REF"
    sh "$D/payload.sh" "$CMD"
    ;;
  rollback)
    read_ref previous; TARGET=$REF
    [ -n "$TARGET" ] || fail 'no previous release; nothing changed'
    verify "$TARGET"
    read_ref current; OLD=$REF
    # Keep previous unchanged: interrupted rollback is safe and retryable.
    write_ref current "$TARGET"
    printf '%s\n' "Rolled back ${OLD:-none} to $TARGET; no code executed"
    ;;
  status)
    read_ref current; printf 'current: %s\n' "${REF:-none}"
    read_ref previous; printf 'previous: %s\n' "${REF:-none}"
    ;;
  *) fail 'commands: install ID SHA256 | status | test | run | rollback' ;;
esac
