# Key System — live Key 61 USB audio/MIDI bridge

This is an experimental, **integrated bridge** for an MPC Key 61 running standalone MPC OS and a Mac connected directly to USB-B. It replaces the earlier enumeration and note-generator tests.

## Build

GitHub Actions builds a modified version of the MIT-licensed `jacob-sabella/mpc-addin-usb-audio` (upstream release v1.2.0, pinned commit `d0f1c4e13658f41429940af8f85111fbe378240f`). The narrow patch adds USB MIDI to the upstream standalone UAC2 gadget. The upstream library handles audio:
- MPC ALSA output (ACVM codec, card 1, stereo at 44.1 kHz) → Mac USB audio input
- Mac USB audio output → injected into MPC ALSA physical audio input stream
- A class-compliant USB MIDI interface is exposed in the *same* gadget

Unlike our USB note-generator scripts, **no synthetic notes are transmitted**. MPC keyboard/sequence routing to the f_midi ALSA interface must be configured inside MPC, if OS MIDI routing can see the dynamically created endpoint. The build does not claim automatic MIDI note capture from the keyboard, or guarantee the MIDI path is available as a track output.

On merge of `.github/workflows/key61-bridge-build.yml`, the ARMv7 library is built with QEMU and its SHA-256 and upstream MIT license are committed under `public/key61-bridge/`. The release `payload.sh` downloads only that published binary, verifies SHA-256, and refuses to run until it exists.

## Deploy

1. Save the MPC project. Close any sensitive work and eject mounted USB disks. Keep the USB-B cable connected to the Mac.
2. Ensure the ARMv7 build completed and the file exists at `public/key61-bridge/libmpc_usb_audio.so`.
3. Press iPhone **MPCDev Deploy**, which installs and runs the approved mobile shell payload. This **restarts the MPC application**, switches the USB mux `external`, loads a patched `LD_PRELOAD` audio bridge, and creates a composite UAC2+MIDI device after 8 seconds.
4. In macOS Audio MIDI Setup, select **Key System 61 Bridge**; in FL Studio, select the device as your CoreAudio interface. Make a simple FL instrument play: it should arrive at the MPC's audio input channels once an MPC audio track monitors those inputs. Conversely, MPC main output should reach FL Studio's recording input.
5. Press **MPCDev Run** for the last 85 log lines plus USB state and audio engine log.

This is a **four-minute live trial**. Unless explicitly kept, a separate watchdog switches the mux back to internal, removes the temporary systemd override and restarts MPC. No vendor root filesystem modification is part of our shell controller.

## Keep or roll back

While the trial is active, run via your iPhone Shortcuts SSH action:

```sh
sh /sdcard/MPCDev/key61-bridge/control.sh keep
```

This keeps the bridge running **only for the current boot** (systemd override is under `/run`, erased by reboot). It is not yet permanently installed.

Manual immediate rollback:

```sh
sh /sdcard/MPCDev/key61-bridge/control.sh stop
```

Fallback: reboot to clear the temporary systemd override. If the mux remains `external` after an abnormal shutdown, use the shell with care or power-cycle; the temporary shell controller's watchdog is not a guarantee against a kernel hang.

## Boundaries and risk

- **Not guaranteed fully functional** on the Key 61. The upstream audio bridge has hardware verification on a Key 37; our modified Key 61 build has not been used on this hardware yet.
- USB recognition is already verified, but audio taps, drift handling, USB MIDI routing, Mac CoreAudio and FL Studio behavior remain unverified.
- The Key 61's mux switches external, which may temporarily disconnect internal USB devices and removable USB storage. All user projects should be saved before deployment.
- The `LD_PRELOAD` override preserves the environment from the running MPC process and is isolated to a temporary systemd drop-in; other launchers that rewrite `LD_PRELOAD` at exec may override it.
- A restart, bad third-party addin, or firmware incompatibility can crash MPC or cause loss of unsaved work. It is not safe to assume all risks can be eliminated with automatic rollback.
