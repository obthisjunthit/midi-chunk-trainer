#!/bin/sh
# The Key System: TEMPORARY USB-B UAC2+MIDI enumeration experiment.
# Only on verified Key 61 with usb-mux internal, zero existing gadgets, and no USB-mounted disks.
# Does not integrate audio with MPC. Has detached cleanup watchdog.
set -u
M=/sys/devices/platform/usb-mux/state
G=/sys/kernel/config/usb_gadget/keysystem_probe_001
UDC=ff580000.usb
D=/sdcard/MPCDev
L=$D/usb-enumeration-001.log

log() { printf '%s\n' "$*" >> "$L"; }

cleanup() {
    # Restore mux first so that the MPC retains internal controls and storage.
    if [ -w "$M" ] && [ "$(cat "$M" 2>/dev/null)" = external ]; then
        printf 'internal\n' > "$M" 2>/dev/null || true
    fi
    if [ -d "$G" ]; then
        if [ -w "$G/UDC" ]; then printf '\n' > "$G/UDC" 2>/dev/null || true; fi
        rm -f "$G/configs/c.1/midi.usb0" "$G/configs/c.1/uac2.usb0" 2>/dev/null || true
        rmdir "$G/configs/c.1/strings/0x409" 2>/dev/null || true
        rmdir "$G/configs/c.1" 2>/dev/null || true
        rmdir "$G/functions/midi.usb0" "$G/functions/uac2.usb0" 2>/dev/null || true
        rmdir "$G/strings/0x409" 2>/dev/null || true
        rmdir "$G" 2>/dev/null || true
    fi
    log "Cleanup: mux=$(cat "$M" 2>/dev/null || echo missing); temporary gadget removed=$([ ! -e "$G" ] && echo yes || echo no)"
}

prepare() {
    mkdir "$G" || return 1
    printf '0x1d6b\n' > "$G/idVendor" || return 1
    printf '0x0104\n' > "$G/idProduct" || return 1
    printf '0x0200\n' > "$G/bcdUSB" || return 1
    printf '0xEF\n' > "$G/bDeviceClass" || return 1
    printf '0x02\n' > "$G/bDeviceSubClass" || return 1
    printf '0x01\n' > "$G/bDeviceProtocol" || return 1
    mkdir "$G/strings/0x409" || return 1
    printf 'Key System USB Test\n' > "$G/strings/0x409/manufacturer" || return 1
    printf 'Key System Audio MIDI Probe\n' > "$G/strings/0x409/product" || return 1
    printf 'KSUSB001\n' > "$G/strings/0x409/serialnumber" || return 1
    mkdir "$G/configs/c.1" || return 1
    mkdir "$G/configs/c.1/strings/0x409" || return 1
    printf 'MIDI and Audio\n' > "$G/configs/c.1/strings/0x409/configuration" || return 1
    mkdir "$G/functions/uac2.usb0" || return 1
    printf '0x3\n' > "$G/functions/uac2.usb0/p_chmask" || return 1
    printf '0x3\n' > "$G/functions/uac2.usb0/c_chmask" || return 1
    printf '44100\n' > "$G/functions/uac2.usb0/p_srate" || return 1
    printf '44100\n' > "$G/functions/uac2.usb0/c_srate" || return 1
    printf '2\n' > "$G/functions/uac2.usb0/p_ssize" || return 1
    printf '2\n' > "$G/functions/uac2.usb0/c_ssize" || return 1
    mkdir "$G/functions/midi.usb0" || return 1
    printf '1\n' > "$G/functions/midi.usb0/in_ports" || return 1
    printf '1\n' > "$G/functions/midi.usb0/out_ports" || return 1
    ln -s "$G/functions/uac2.usb0" "$G/configs/c.1/uac2.usb0" || return 1
    ln -s "$G/functions/midi.usb0" "$G/configs/c.1/midi.usb0" || return 1
    return 0
}

case "${1:-run}" in
    test)
        sh -n "$0" || exit 1
        echo 'USB enumeration 001: syntax self-test passed; hardware not touched.'
        ;;
    status)
        [ -r "$L" ] && cat "$L" || echo 'No enumeration test log yet.'
        ;;
    cleanup)
        cleanup
        ;;
    worker)
        trap 'cleanup' 0 1 2 3 15
        log 'Worker starting; preparing temporary USB audio + MIDI gadget.'
        if ! prepare; then log 'FAIL: configfs gadget creation'; exit 1; fi
        if ! printf 'external\n' > "$M"; then log 'FAIL: usb mux switch'; exit 1; fi
        log "Mux switched external. Binding gadget to $UDC."
        if ! printf '%s\n' "$UDC" > "$G/UDC"; then log 'FAIL: bind gadget'; exit 1; fi
        sleep 5
        log "Initial USB state: $(cat /sys/class/udc/$UDC/state 2>/dev/null || echo missing)"
        log "Initial USB speed: $(cat /sys/class/udc/$UDC/current_speed 2>/dev/null || echo missing)"
        log 'Test device: Key System Audio MIDI Probe. This is enumeration-only; silence is expected.'
        sleep 35
        log "Final USB state: $(cat /sys/class/udc/$UDC/state 2>/dev/null || echo missing)"
        log "Final USB speed: $(cat /sys/class/udc/$UDC/current_speed 2>/dev/null || echo missing)"
        log 'Worker finished. Cleanup restoring internal mux and removing gadget.'
        ;;
    watchdog)
        sleep 65
        cleanup
        ;;
    run)
        mkdir -p "$D" || exit 1
        if [ -s "$L" ]; then
            cat "$L"
            exit 0
        fi
        : > "$L" || exit 1
        [ -w "$M" ] || { echo 'STOP: USB mux is not writable.'; exit 1; }
        [ "$(cat "$M")" = internal ] || { echo 'STOP: mux is not internal.'; exit 1; }
        grep -q 'inmusic,acvm' /proc/device-tree/compatible 2>/dev/null || {
            echo 'STOP: not verified Key 61 hardware'; exit 1;
        }
        [ ! -e "$G" ] || { echo 'STOP: test gadget already exists.'; exit 1; }
        for g in /sys/kernel/config/usb_gadget/*; do
            [ -d "$g" ] && { echo 'STOP: another USB gadget is configured.'; exit 1; }
        done
        if grep -qE ' /media/[^ ]+ ' /proc/mounts; then
            echo 'STOP: removable USB media is mounted. Eject/unmount it before trying again.'
            grep ' /media/' /proc/mounts
            exit 1
        fi
        log 'Starting 40-second USB-Audio + MIDI enumeration test.'
        nohup sh "$0" watchdog </dev/null >> "$L" 2>&1 &
        nohup sh "$0" worker </dev/null >> "$L" 2>&1 &
        echo 'USB enumeration experiment started. For ~40 seconds, check macOS Audio MIDI Setup for Key System Audio MIDI Probe.'
        echo 'When finished, run MPCDev Run again to see results. Automatic restoration is scheduled.'
        ;;
    *) echo 'usage: payload.sh test|run|status|cleanup'; exit 2 ;;
esac
