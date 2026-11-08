#!/bin/sh
# Run in Codex Cloud. Commit all generated public files together.
set -eu
cd "$(dirname "$0")/.."
[ "$#" -eq 1 ] || { echo 'usage: sh tools/publish-mobile.sh RELEASE_ID' >&2; exit 2; }
id=$1
case "$id" in ''|*[!a-zA-Z0-9_-]*) echo 'unsafe release ID' >&2; exit 2;; esac
src="releases/$id/payload.sh"
[ -f "$src" ] && [ ! -L "$src" ] || { echo "missing release: $src" >&2; exit 2; }
sh -n "$src"
sh "$src" test
mkdir -p public/releases
hash=$(sha256sum "$src"); hash=${hash%% *}
blob="public/releases/$hash.sh"
if [ -e "$blob" ]; then
  existing=$(sha256sum "$blob"); existing=${existing%% *}
  [ "$existing" = "$hash" ] || { echo "hash filename collision" >&2; exit 1; }
else
  cp "$src" "$blob"
fi
cp "$src" public/latest.sh
printf '%s' "$hash" > public/latest.sha256
printf '\nREADY: %s\nSHA-256: %s\nImmutable URL file: %s\n' "$id" "$hash" "$blob"
echo 'Review the diff, then commit public/latest.sh, public/latest.sha256 and the immutable blob together.'
