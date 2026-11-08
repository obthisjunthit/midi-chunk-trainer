#!/bin/sh
# No writes, services, hardware access, or reboot.
set -eu
case "${1:-run}" in
  test) printf '%s\n' 'MPCDev hello-001: self-test passed' ;;
  run) printf '%s\n' 'Hello from MPCDev hello-001. No MPC settings were changed.' ;;
  *) exit 2 ;;
esac
