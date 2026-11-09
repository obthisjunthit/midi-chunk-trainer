#!/bin/sh
# The Key System: read-only USB-B connectivity probe (ARMv7 / BusyBox).
# No writes, USB rebinding, service changes, rootfs modifications, or restarts.
set -eu

show_file() {
    if [ -r "$1" ]; then
        printf '%s: ' "$2"
        tr '\000\n' '  ' < "$1"
        printf '\n'
    else
        printf '%s: unavailable\n' "$2"
    fi
}

report() {
    printf '%s\n' '=== THE KEY SYSTEM: USB-B PROBE ==='
    show_file /proc/device-tree/model 'Hardware model'
    printf 'Kernel: %s\n' "$(uname -r)"

    printf '\n%s\n' '--- USB device controllers (UDC) ---'
    found=no
    for d in /sys/class/udc/*; do
        [ -d "$d" ] || continue
        found=yes
        printf 'Controller: %s\n' "${d##*/}"
        show_file "$d/state" 'USB connection state'
        show_file "$d/current_speed" 'USB negotiated speed'
        show_file "$d/maximum_speed" 'USB maximum speed'
    done
    [ "$found" = yes ] || printf '%s\n' 'No USB device controllers exposed in /sys/class/udc.'

    printf '\n%s\n' '--- USB configfs gadgets ---'
    found=no
    for g in /sys/kernel/config/usb_gadget/*; do
        [ -d "$g" ] || continue
        found=yes
        printf 'Gadget: %s\n' "${g##*/}"
        show_file "$g/UDC" 'Bound controller'
        show_file "$g/idVendor" 'Vendor ID'
        show_file "$g/idProduct" 'Product ID'
        printf '%s\n' 'Functions:'
        if [ -d "$g/functions" ]; then
            for f in "$g"/functions/*; do
                [ -e "$f" ] || continue
                printf '  %s\n' "${f##*/}"
            done
        else
            printf '%s\n' '  unavailable'
        fi
        printf '%s\n' 'Enabled configuration links:'
        if [ -d "$g/configs" ]; then
            for f in "$g"/configs/*/*; do
                [ -L "$f" ] || continue
                printf '  %s\n' "$f"
            done
        fi
    done
    [ "$found" = yes ] || printf '%s\n' 'No configfs USB gadgets visible.'

    printf '\n%s\n' '--- Kernel support (read only) ---'
    if [ -r /proc/config.gz ]; then
        zcat /proc/config.gz 2>/dev/null | grep -E '^CONFIG_(USB_(DWC2|GADGET|CONFIGFS|CONFIGFS_F_MIDI|CONFIGFS_F_UAC2|F_UAC2)|SND_USB_AUDIO)=' || true
    else
        printf '%s\n' '/proc/config.gz is unavailable; kernel support not established.'
    fi

    printf '\n%s\n' '--- USB mux indicators ---'
    if [ -d /sys/devices/platform/usb-mux ]; then
        printf '%s\n' 'USB mux device exists at /sys/devices/platform/usb-mux'
        ls -l /sys/devices/platform/usb-mux 2>/dev/null || true
    else
        printf '%s\n' 'No device found at the common /sys/devices/platform/usb-mux path.'
    fi
    printf '\n%s\n' 'Interpretation: UDC configured = an active USB device connection. No UDC or gadget does not prove the USB-B port is unusable; wiring, mux and firmware need investigation.'
    printf '%s\n' 'PROBE COMPLETE: no configuration changes made.'
}

case "${1:-run}" in
    test)
        # Structural self-test only; do not inspect or modify the hardware.
        [ -r /proc/version ] && [ -d /sys ] || exit 1
        printf '%s\n' 'Key System usb-probe-001: self-test passed'
        ;;
    run) report ;;
    *) printf '%s\n' 'usage: payload.sh test|run' >&2; exit 2 ;;
esac
