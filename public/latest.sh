#!/bin/sh
# Read-only diagnostics: no files, settings, services, or hardware are modified.
set -eu

memory_report() {
    available=
    free=
    while read -r key value unit rest; do
        case "$key" in
            MemAvailable:) available="$value $unit" ;;
            MemFree:) free="$value $unit" ;;
        esac
    done
    if [ -n "$available" ]; then
        printf 'Available memory (MemAvailable): %s\n' "$available"
    elif [ -n "$free" ]; then
        # Older kernels may omit MemAvailable. MemFree is not equivalent.
        printf 'Available memory: unavailable on this kernel; MemFree: %s\n' "$free"
    else
        printf '%s\n' 'MPCDev health-001: memory information missing' >&2
        return 1
    fi
}

case "${1:-run}" in
    test)
        result=$(memory_report <<'MEM'
MemTotal: 2048000 kB
MemFree: 128000 kB
MemAvailable: 512000 kB
MEM
        )
        [ "$result" = 'Available memory (MemAvailable): 512000 kB' ]
        result=$(memory_report <<'MEM'
MemFree: 128000 kB
MEM
        )
        [ "$result" = 'Available memory: unavailable on this kernel; MemFree: 128000 kB' ]
        if memory_report </dev/null 2>/dev/null; then
            exit 1
        fi
        printf '%s\n' 'MPCDev health-001: self-test passed'
        ;;
    run)
        printf '%s\n' 'MPCDev health-001 — read-only health report'
        kernel=$(uname -r)
        printf 'Kernel version: %s\n' "$kernel"
        memory_report < /proc/meminfo
        [ -d /sdcard ] || {
            printf '%s\n' 'MPCDev health-001: /sdcard is unavailable' >&2
            exit 1
        }
        printf '%s\n' 'Free space on /sdcard (Available column, 1 KiB blocks):'
        busybox df -Pk /sdcard
        ;;
    *)
        printf '%s\n' 'usage: payload.sh [test|run]' >&2
        exit 2
        ;;
esac
