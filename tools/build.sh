#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
ID=${1:-hello-001}
case "$ID" in ''|*[!a-zA-Z0-9_-]*) exit 2;; esac
sh -n device/mpcdev.sh
sh -n "releases/$ID/payload.sh"
sh "releases/$ID/payload.sh" test
mkdir -p dist
cp device/mpcdev.sh dist/mpcdev.sh
cp "releases/$ID/payload.sh" "dist/$ID.sh"
(cd dist && sha256sum mpcdev.sh "$ID.sh" > SHA256SUMS)
cat dist/SHA256SUMS
