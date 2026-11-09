#!/bin/sh
# Key System: live USB audio + MIDI bridge for MPC Key 61 (ARMv7, MPC OS 3.x).
# MIT-licensed audio engine derived from Jacob Sabella's mpc-addin-usb-audio v1.2.0.
# This shell controller modifies ONLY /run systemd drop-ins + /sdcard files.
# Automatic fallback after 240 s from service activation; reboot also clears /run.
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
CANCEL=$D/cancel
READY=$D/ready
LOCK=$D/rollback.lock

log() { printf '%s\n' "$*" >> "$LOG"; }
show() {
    [ -f "$LOG" ] && tail -n 85 "$LOG" || echo 'No bridge log yet.'
    printf 'mux: '; cat "$M" 2>/dev/null || true
    printf 'USB state: '; cat "$U/state" 2>/dev/null || true
    printf 'USB speed: '; cat "$U/current_speed" 2>/dev/null || true
    if [ -f "$READY" ]; then
        echo 'Bridge session: live USB configured; MPC audio still requires listening verification'
    elif [ -f "$ACTIVE" ]; then
        echo 'Bridge session: initialization in progress (not yet connected)'
    else
        echo 'Bridge session: inactive'
    fi
    if [ -f "$CANCEL" ]; then echo 'Bridge session: rollback requested'; fi
    if [ -f "$D/service" ]; then
        svc_show=$(cat "$D/service" 2>/dev/null || true)
        case "$svc_show" in
            acvs|inmusic-mpc)
                systemctl is-active "$svc_show" 2>&1 || true
                systemctl show "$svc_show" -p ActiveState -p SubState -p MainPID 2>&1 || true ;;
        esac
    fi
    echo 'USB gadget status:'
    ls /sys/kernel/config/usb_gadget 2>&1 || true
    if [ -f "$KEEP" ]; then echo 'Bridge session: confirmed to stay until reboot or manual stop'; fi
    if [ -r "$D/usbaudio.log" ]; then
        echo '=== MPC AUDIO ENGINE ==='
        tail -n 35 "$D/usbaudio.log"
    fi
}
halt() {
    if ! mkdir "$LOCK" 2>/dev/null; then
        log 'Recovery already running; no duplicate service restart.'
        return 0
    fi
    : > "$CANCEL"
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
                systemctl restart --no-block "$svc" >> "$LOG" 2>&1 || log 'WARNING: service restart request failed; reboot to recover.'
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
    # A previously blocked worker may have switched the mux mid-rollback.
    if [ -w "$M" ] && [ "$(cat "$M" 2>/dev/null)" = external ]; then
        printf 'internal\n' > "$M" 2>/dev/null || true
    fi
    rm -f "$ACTIVE" "$KEEP" "$READY" || true
    log "Recovery finished. mux=$(cat "$M" 2>/dev/null || true)"
    rmdir "$LOCK" 2>/dev/null || true
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
    # The SHA-256 is from our pinned ARMv7 CI build, which already checks ELF.
    # BusyBox on this MPC lacks GNU od -An and head -c; do not recheck using them.
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
own_wait=45
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
    log 'Starting live PCM+MIDI bridge v002 with asynchronous MPC startup and readiness checks.'
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
    # The timeout starts at service activation, not at launch/download.
    nohup sh "$CONTROL" watchdog </dev/null >> "$LOG" 2>&1 &
    log 'Applying temporary systemd configuration.'
    if ! systemctl daemon-reload >> "$LOG" 2>&1; then
        log 'FAIL: daemon-reload'; halt; return 1
    fi
    if [ -f "$CANCEL" ] || [ ! -f "$ACTIVE" ]; then
        log 'STOP: watchdog/rollback fired during daemon-reload. Aborting activation.'
        return 1
    fi
    # Asynchronous restart: a blocking systemctl restart previously collided
    # with the watchdog and allowed the worker to switch USB back afterward.
    log 'Requesting non-blocking MPC application restart with patched audio library.'
    if ! systemctl restart --no-block "$svc" >> "$LOG" 2>&1; then
        log 'FAIL: MPC restart request'; halt; return 1
    fi
    # Keep the internal hub during startup. Only change mux after the MPC
    # process actually has our native audio library mapped in memory.
    i=0
    loaded=no
    while [ "$i" -lt 35 ]; do
        if [ -f "$CANCEL" ] || [ ! -f "$ACTIVE" ]; then
            log 'STOP: rollback requested while MPC was starting.'
            return 1
        fi
        apppid=$(pidof MPC 2>/dev/null | awk '{print $1}')
        if [ -n "$apppid" ] && [ -r "/proc/$apppid/maps" ] && grep -Fq "$LIB" "/proc/$apppid/maps"; then
            loaded=yes
            log "MPC PID $apppid loaded native audio bridge."
            break
        fi
        sleep 1
        i=$((i+1))
    done
    if [ "$loaded" != yes ]; then
        log 'FAIL: MPC process did not load native audio bridge within 35 seconds. Reverting.'
        if [ -r "$D/usbaudio.log" ]; then tail -n 30 "$D/usbaudio.log" >> "$LOG"; fi
        halt
        return 1
    fi
    if [ -f "$CANCEL" ] || [ ! -f "$ACTIVE" ]; then
        log 'STOP: rollback requested before USB mux switch.'
        return 1
    fi
    log 'MPC library loaded; switching USB mux external for Mac and waiting for gadget.'
    if ! printf 'external\n' > "$M"; then
        log 'FAIL: USB mux switch'; halt; return 1
    fi
    i=0
    connected=no
    while [ "$i" -lt 45 ]; do
        if [ -f "$CANCEL" ] || [ ! -f "$ACTIVE" ]; then
            log 'STOP: rollback requested before USB configured.'
            return 1
        fi
        if [ "$(cat "$U/state" 2>/dev/null)" = configured ]; then
            connected=yes
            break
        fi
        sleep 1
        i=$((i+1))
    done
    log "USB device state: $(cat "$U/state" 2>/dev/null || echo missing)"
    log "USB negotiated speed: $(cat "$U/current_speed" 2>/dev/null || echo missing)"
    log 'ConfigFS USB gadget names:'
    ls /sys/kernel/config/usb_gadget >> "$LOG" 2>&1 || true
    if [ -r "$D/usbaudio.log" ]; then
        log 'Native audio engine log:'
        tail -n 40 "$D/usbaudio.log" >> "$LOG"
    else
        log 'WARNING: native audio engine log was not produced.'
    fi
    if [ "$connected" != yes ]; then
        log 'FAIL: no configured USB gadget within 45 seconds after library loaded. Reverting.'
        halt
        return 1
    fi
    : > "$READY"
    log 'LIVE BRIDGE USB CONFIGURED. Check Mac Audio MIDI Setup and route audio in FL Studio.'
    log 'Audio transfer and MPC keyboard MIDI mapping are not yet confirmed.'
    log 'ALSA cards:'
    cat /proc/asound/cards >> "$LOG" 2>&1 || true
    restore_midi_node || true
    if [ -f "$CANCEL" ] || [ ! -f "$ACTIVE" ]; then
        log 'STOP: rollback occurred while MIDI endpoint was initializing.'
        return 1
    fi
    log 'The watchdog will restore after 240 seconds unless kept.'
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
        if [ -f "$ACTIVE" ]; then
            oldsvc=$(cat "$D/service" 2>/dev/null || true)
            if [ -n "$oldsvc" ] && [ -e "/run/systemd/system/$oldsvc.service.d/95-keysystem-usb-bridge.conf" ]; then
                show
                exit 0
            fi
            # /run is reset on reboot; don't misreport a stale SD-card marker.
            rm -f "$ACTIVE" "$KEEP" || true
        fi
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
        rm -f "$CANCEL" "$READY" || true
        nohup sh "$CONTROL" worker </dev/null >> "$LOG" 2>&1 &
        echo 'LIVE BRIDGE STARTING: MPC will restart and USB-B will switch to Mac. Automatic recovery after 4 minutes unless kept.'
        echo 'Tap MPCDev Run again to view logs. Manual undo: sh /sdcard/MPCDev/key61-bridge/control.sh stop'
        ;;
    status) show ;;
    keep)
        [ -f "$ACTIVE" ] && [ -f "$READY" ] && [ "$(cat "$U/state" 2>/dev/null)" = configured ] || {
            echo 'Cannot keep an unconfigured or inactive USB bridge. It will roll back automatically.'
            exit 1
        }
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
