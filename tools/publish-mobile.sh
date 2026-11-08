#!/bin/sh
# Run in Codex Cloud, then commit public/latest.sh and public/latest.sha256.
set -eu
cd "$(dirname "$0")/.."
[ "$#" -eq 1 ] || { echo 'usage: sh tools/publish-mobile.sh RELEASE_ID' >&2; exit 2; }
id=$1
case "$id" in ''|*[!a-zA-Z0-9_-]*) echo 'unsafe release ID' >&2; exit 2;; esac
src="releases/$id/payload.sh"
[ -f "$src" ] && [ ! -L "$src" ] || { echo "missing release: $src" >&2; exit 2; }
sh -n "$src"
sh "$src" test
mkdir -p public
cp "$src" public/latest.sh
hash=$(sha256sum public/latest.sh); hash=${hash%% *}
printf '%s' "$hash" > public/latest.sha256
printf '\nREADY: %s\nSHA-256: %s\nCommit public/latest.sh and public/latest.sha256 after reviewing the change.\n' "$id" "$hash"
