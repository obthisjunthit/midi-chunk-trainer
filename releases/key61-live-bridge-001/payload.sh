#!/bin/sh
# Key System: live USB audio + MIDI bridge for MPC Key 61 (ARMv7, MPC OS 3.x).
# MIT-licensed audio engine derived from Jacob Sabella's mpc-addin-usb-audio v1.2.0.
# This shell controller modifies ONLY /run systemd drop-ins + /sdcard files.
# Automatic fallback after 240 s unless explicitly kept. A reboot also clears /run.
set -u
D=/sdcard/MPCDev/key61-bridge
M=/sys/devices/platform/usb-mux/state
G=/sys/kernel/config/usb_gadget/keysystembridge
U=/sys/class/udc/ff580000.usb
LIB=$D/libmpc_usb_audio.so
LOG=$D/bridge.log
BASE=https://raw.githubusercontent.com/obthisjunthit/midi-chunk-trainer/main/public/key61-bridge
CONTROL=$D/control.sh
MARK=$D/node-created-by-bridge
KEEP=$D/keep
ACTIVE=$D/active

log() { printf '%s\n' "$*" >> "$LOG"; }
show() {
    [ -f "$LOG" ] && tail -n 85 "$LOG" || echo 'No bridge log yet.'
    printf 'mux: '; cat "$M" 2>/dev/null || true
    printf 'USB state: '; cat "$U/state" 2>/dev/null || true
    printf 'USB speed: '; cat "$U/current_speed" 2>/dev/null || true
    if [ -f "$ACTIVE" ]; then echo 'Bridge session: active or initializing'; else echo 'Bridge session: inactive'; fi
    if [ -f "$KEEP" ]; then echo 'Bridge session: confirmed to stay until reboot or manual stop'; fi
    if [ -r "$D/usbaudio.log" ]; then
        echo '=== MPC AUDIO ENGINE ==='
        tail -n 35 "$D/usbaudio.log"
    fi
}
halt() {
    # Restore MPC access to the built-in USB hub before restarting its process.
    if [ -w "$M" ] && [ "$(cat "$M" 2>/dev/null)" = external ]; then
        printf 'internal\n' > "$M" 2>/dev/null || true
    fi
    svc=$(cat "$D/service" 2>/dev/null || true)
    case "$svc" in
        acvs|inmusic-mpc)
            drop=/run/systemd/system/$svc.service.d/95-keysystem-usb-bridge.conf
            if [ -e "$drop" ]; then
                rm -f "$drop" || true
                systemctl daemon-reload || true
                log 'Removed temporary LD_PRELOAD override; restarting MPC application.'
                systemctl restart "$svc" >> "$LOG" 2>&1 || log 'WARNING: service restart failed; reboot to recover.'
            fi
            ;;
    esac
    if [ -f "$MARK" ]; then
        node=$(cat "$MARK" 2>/dev/null || true)
        case "$node" in
            /dev/snd/midiC[0-9]*D0)
                name=$(basename "$node")
                if [ ! -e "/sys/class/sound/$name/dev" ] && [ -c "$node" ]; then
                    rm -f "$node" 2>/dev/null || true
                    log "Removed temporary MIDI node $node"
                fi
                ;;
        esac
        rm -f "$MARK" || true
    fi
    rm -f "$ACTIVE" "$KEEP" || true
    log "Recovery finished. mux=$(cat "$M" 2>/dev/null || true)"
}
download_lib() {
    mkdir -p "$D" || return 1
    if ! wget -q -O "$D/lib.sha256.new" "$BASE/libmpc_usb_audio.so.sha256"; then
        log 'STOP: ARMv7 bridge build not yet published; no changes made to MPC.'
        return 1
    fi
    if ! wget -q -O "$D/lib.new" "$BASE/libmpc_usb_audio.so"; then
        log 'STOP: bridge library download failed; no changes made to MPC.'
        return 1
    fi
    # The checksum is published by our pinned GitHub Actions ARMv7 build.
    mv "$D/lib.new" "$LIB" || return 1
    mv "$D/lib.sha256.new" "$D/lib.sha256" || return 1
    if ! (cd "$D" && sha256sum -c lib.sha256) >> "$LOG" 2>&1; then
        rm -f "$LIB"
        log 'STOP: binary checksum mismatch.'
        return 1
    fi
    if [ "$(od -An -tx1 -N4 "$LIB" | tr -d ' \n')" != 7f454c46 ]; then
        log 'STOP: downloaded file is not ELF.'
        return 1
    fi
    log 'Verified ARMv7 bridge library checksum.'
}
make_config() {
    cat > "$D/usbaudio.conf" <<'CFG'
enabled=1
# PCM hooks tap the MPC's built-in ACVM codec (card 1), not USB keyboard card 0.
tap_card=1
rate=44100
sample_bytes=2
to_host=out1,out2
host_channels=2
to_mpc_in=host1,host2
input_mode=sum
target_frames=256
fwd_period=64
fwd_periods=4
hs_bint=4
test_tone=0
gadget=standalone
instance=usbaudio
configfs=/sys/kernel/config/usb_gadget
standalone_create=1
own_gadget=keysystembridge
own_wait=8
hub_mux_check=0
iad_class=1
function_name=Key System 61 Bridge
log=/sdcard/MPCDev/key61-bridge/usbaudio.log
CFG
}
restore_midi_node() {
    # Vendor devtmpfs sometimes lacks a node for newly-created f_midi.
    i=0
    while [ "$i" -lt 18 ]; do
        card=$(awk '/MIDI Gadget|f_midi/ {print $1; exit}' /proc/asound/cards)
        case "$card" in
            ''|*[!0-9]*) sleep 1 ;;
            *)
                node=/dev/snd/midiC$(printf %s "$card")D0
                sys=/sys/class/sound/midiC$(printf %s "$card")D0/dev
                if [ -c "$node" ]; then log "MIDI device ready: $node"; return 0; fi
                if [ -e "$node" ]; then
                    log "MIDI node exists but is not a character device: $node; leaving untouched."
                    return 1
                fi
                if [ -r "$sys" ]; then
                    IFS=: read -r major minor < "$sys"
                    case "$major:$minor" in
                        116:[0-9]*)
                            case "$minor" in
                                *[!0-9]*|'') log "Bad MIDI minor: $minor"; return 1;;
                                *)
                                    if mknod "$node" c "$major" "$minor" 2>>"$LOG"; then
                                        printf '%s\n' "$node" > "$MARK"
                                        chmod 660 "$node" || true
                                        chgrp audio "$node" 2>/dev/null || true
                                        log "Reconstructed MIDI port $node ($major:$minor)"
                                        return 0
                                    fi
                                    ;;
                            esac ;;
                    esac
                fi
                sleep 1
                ;;
        esac
        i=$((i+1))
    done
    log 'MIDI endpoint registered but no working /dev/snd node was created.'
    return 1
}
worker() {
    log 'Starting live PCM+MIDI bridge. No firmware/rootfs changes.'
    if ! download_lib; then rm -f "$ACTIVE"; return 1; fi
    if ! grep -q 'inmusic,acvm' /proc/device-tree/compatible 2>/dev/null; then
        log 'STOP: unsupported device tree.'
        rm -f "$ACTIVE"; return 1
    fi
    if [ "$(cat "$M" 2>/dev/null)" != internal ]; then
        log 'STOP: mux not internal.'
        rm -f "$ACTIVE"; return 1
    fi
    if grep -qE '^/dev/sd[a-z]+[0-9]*[[:space:]]' /proc/mounts; then
        log 'STOP: USB/SATA storage mounted; eject it and retry.'
        rm -f "$ACTIVE"; return 1
    fi
    for g in /sys/kernel/config/usb_gadget/*; do
        if [ -d "$g" ]; then
            log "STOP: existing USB gadget $g; refusing to replace it."
            rm -f "$ACTIVE"; return 1
        fi
    done
    svc=
    if systemctl cat acvs >/dev/null 2>&1; then svc=acvs
    elif systemctl cat inmusic-mpc >/dev/null 2>&1; then svc=inmusic-mpc
    else log 'STOP: MPC service not recognized'; rm -f "$ACTIVE"; return 1
    fi
    printf '%s\n' "$svc" > "$D/service"
    make_config || { log 'STOP: cannot write config'; rm -f "$ACTIVE"; return 1; }
    pid=$(pidof MPC 2>/dev/null | awk '{ print $1 }')
    prior=
    if [ -n "$pid" ] && [ -r "/proc/$pid/environ" ]; then
        prior=$(tr '\000' '\n' < "/proc/$pid/environ" | sed -n 's/^LD_PRELOAD=//p' | head -n1)
    fi
    # Protect any firmware/addin preloads. A runtime override is removed on reboot.
    case "$prior" in
        *'"'*|*'\\'*) log 'STOP: unsupported LD_PRELOAD characters'; rm -f "$ACTIVE"; return 1 ;;
    esac
    case ":$prior:" in *":$LIB:"*) newpre=$prior ;; *)
        if [ -n "$prior" ]; then newpre=$prior:$LIB; else newpre=$LIB; fi ;;
    esac
    dropdir=/run/systemd/system/$svc.service.d
    mkdir -p "$dropdir" || { log 'STOP: cannot make runtime drop-in'; rm -f "$ACTIVE"; return 1; }
    drop=$dropdir/95-keysystem-usb-bridge.conf
    if [ -e "$drop" ]; then log "STOP: runtime override already exists"; rm -f "$ACTIVE"; return 1; fi
    {
        echo '[Service]'
        printf 'Environment="LD_PRELOAD=%s"\n' "$newpre"
    } > "$drop" || { log 'STOP: cannot write runtime override'; rm -f "$ACTIVE"; return 1; }
    log "Temporary MPC service override for $svc installed (clears on reboot)."
    if ! systemctl daemon-reload >> "$LOG" 2>&1; then
        log 'FAIL: daemon-reload'; halt; return 1
    fi
    # Put the USB-B physical hub on the computer before the addin creates its gadget.
    if ! printf 'external\n' > "$M"; then
        log 'FAIL: mux switch'; halt; return 1
    fi
    log 'Mux external; restarting MPC application to activate injected PCM hooks.'
    if ! systemctl restart "$svc" >> "$LOG" 2>&1; then
        log 'FAIL: MPC service restart'; halt; return 1
    fi
    # Some firmware toggles the mux back to internal on MPC restart.
    if [ "$(cat "$M" 2>/dev/null)" = internal ]; then
        printf 'external\n' > "$M" 2>> "$LOG" || true
    fi
    sleep 11
    log "USB device state: $(cat "$U/state" 2>/dev/null || echo missing)"
    log "USB negotiated speed: $(cat "$U/current_speed" 2>/dev/null || echo missing)"
    log 'ALSA cards:'
    cat /proc/asound/cards >> "$LOG" 2>&1 || true
    restore_midi_node || true
    log 'Full bridge trial running. In Mac Audio MIDI Setup choose Key System 61 Bridge; in FL Studio choose it as audio interface and MIDI port.'
    log 'Unless kept, an independent watchdog will restore MPC after 240 seconds.'
}
watchdog() {
    sleep 240
    if [ -f "$KEEP" ]; then
        log 'Full bridge kept active for this boot; no automatic rollback.'
    elif [ -f "$ACTIVE" ]; then
        log 'Fallback deadline reached. Reverting the full bridge.'
        halt
    fi
}
if [ "$#" -eq 0 ]; then set -- run; fi
case "$1" in
    test)
        sh -n "$0" || exit 1
        echo 'Key System live USB bridge: syntax passed; hardware not touched.'
        ;;
    run)
        mkdir -p "$D" || exit 1
        if [ -f "$ACTIVE" ]; then show; exit 0; fi
        if [ -f "$D/service" ]; then
            svc=$(cat "$D/service" 2>/dev/null || true)
            if [ ! -e "/run/systemd/system/$svc.service.d/95-keysystem-usb-bridge.conf" ]; then
                rm -f "$D/service" "$KEEP" || true
            fi
        fi
        if [ "$0" != "$CONTROL" ]; then cp "$0" "$CONTROL" || exit 1; fi
        : > "$LOG" || exit 1
        rm -f "$KEEP"
        : > "$ACTIVE"
        nohup sh "$CONTROL" watchdog </dev/null >> "$LOG" 2>&1 &
        nohup sh "$CONTROL" worker </dev/null >> "$LOG" 2>&1 &
        echo 'LIVE BRIDGE STARTING: MPC will restart and USB-B will switch to Mac. Automatic recovery after 4 minutes unless kept.'
        echo 'Tap MPCDev Run again to view logs. Manual undo: sh /sdcard/MPCDev/key61-bridge/control.sh stop'
        ;;
    status) show ;;
    keep)
        [ -f "$ACTIVE" ] || { echo 'No bridge session to keep.'; exit 1; }
        : > "$KEEP"
        log 'User kept full bridge active for this boot.'
        echo 'Full bridge will remain active until reboot or manual stop (runtime-only service override).'
        ;;
    stop|rollback)
        halt
        show
        ;;
    worker) worker ;;
    watchdog) watchdog ;;
    *) echo 'Usage: control.sh run|status|keep|stop|test'; exit 2 ;;
esac
