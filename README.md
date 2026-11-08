# MPCDev

Small, reviewable shell releases for an Akai MPC Key 61 running modified MPC OS 3.10 / ARMv7 Linux. No Python, Git, curl, daemon, build tool, or reboot is needed on the MPC. The first release only prints a greeting.

## Architecture

1. Prompt Codex from iPhone. Codex edits this repository, builds and tests in Cloud, and presents the diff and SHA256 approval values.
2. Review the payload and controller changes before approving. Download the `dist` files to iPhone using authenticated HTTPS (or a GitHub Actions artifact).
3. Transfer files by your existing SFTP connection over Wi-Fi. Cloud never needs access to the MPC's private address.
4. Invoke the companion controller using your existing Shortcuts SSH action. It verifies the exact approved digest, syntax-checks and self-tests the candidate, then switches a small reference file.
5. Run immediately. Roll back the reference to the previous retained release when needed. No reboot or service restart.

The companion `mpcdev.sh` does not replace or call your existing `control.sh`, whose interface is unknown. Both use `/sdcard/MPCDev/`; the companion adds `state/` and uses release IDs containing only letters, digits, hyphens and underscores. Check for naming collisions before initial deployment.

```text
/sdcard/MPCDev/
  control.sh                 existing, untouched
  mpcdev.sh                  reviewed companion
  incoming/hello-001.sh       uploaded candidate
  releases/hello-001/
    payload.sh               installed payload
    SHA256                   approved digest
  state/current              active release ID
  state/previous             previous release ID
  state/deploy.lock/          command lock
  logs/                      existing logs; capture SSH output here if wanted
```

## Build and validate in Cloud

```sh
sh tools/build.sh hello-001
sh tests/smoke.sh
```

No dependencies to install. Output: `dist/mpcdev.sh`, `dist/hello-001.sh`, `dist/SHA256SUMS`. A manual GitHub Actions workflow also validates and uploads these as an artifact; publishing or downloading that artifact requires a pushed commit. Nothing has been pushed or deployed by this setup.

See [deployment instructions](docs/DEPLOY.md) for the exact first deployment and Shortcuts commands, and [safety contract](docs/SAFETY.md) before creating real releases.

## Downloadable handoff

`dist/MPCDev-hello-001.zip` contains the original `mpcdev.sh` and `hello-001.sh` bytes, `DEPLOY.md`, and `SHA256SUMS` covering all three files. The ZIP's own checksum is in `dist/MPCDev-hello-001.zip.sha256`. Rebuild it in Cloud with `python3 tools/package.py` after `sh tools/build.sh`. Python is used only in Cloud, never on the MPC. Extract the ZIP on your iPhone and follow `DEPLOY.md`; packaging does not deploy anything.
