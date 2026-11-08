#!/bin/sh
# Validate the exact bytes that MPCDev Pull v3 will download and execute.
set -eu
cd "$(dirname "$0")/.."
fail() { printf '%s\n' "MPCDev mobile publish check: $*" >&2; exit 1; }

[ -f public/latest.sha256 ] && [ ! -L public/latest.sha256 ] || fail 'checksum pointer missing'
[ -f public/latest.sh ] && [ ! -L public/latest.sh ] || fail 'latest payload missing'

approved=$(cat public/latest.sha256)
[ "${#approved}" -eq 64 ] || fail 'SHA-256 length must be 64'
case "$approved" in *[!0-9a-f]*) fail 'SHA-256 must be lowercase hex' ;; esac

actual=$(sha256sum public/latest.sh); actual=${actual%% *}
[ "$approved" = "$actual" ] || fail 'latest payload does not match checksum'

blob="public/releases/$approved.sh"
[ -f "$blob" ] && [ ! -L "$blob" ] || fail 'immutable release blob missing'
actual=$(sha256sum "$blob"); actual=${actual%% *}
[ "$actual" = "$approved" ] || fail 'immutable blob checksum mismatch'
cmp -s public/latest.sh "$blob" || fail 'latest and immutable release bytes differ'

sh -n "$blob"
sh "$blob" test
printf '%s\n' "PASS: published release syntax, self-test, SHA-256 and immutable blob ($approved)"
