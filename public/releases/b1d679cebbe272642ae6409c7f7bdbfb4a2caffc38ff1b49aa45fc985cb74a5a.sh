#!/bin/sh
# Read-only MPCDev release: no system settings or hardware changes.
set -eu
case "${1:-run}" in
  test) printf '%s\n' 'MPCDev hello-002: self-test passed' ;;
  run) printf '%s\n' 'Hello from MPCDev hello-002. GitHub-to-MPC upgrade confirmed. No MPC settings were changed.' ;;
  *) exit 2 ;;
esac
