# Codex instructions — MPCDev (Akai MPC Key 61)

This repository develops optional shell applications for a root-accessible MPC Key 61 running MPC Standalone OS 3.10 / ARMv7 Linux. **The user is the release approver.** The iPhone shortcut called **MPCDev Deploy** installs a release from this repository after an explicit approval.

## Standard release process

1. Implement a focused, inspectable `releases/<release-id>/payload.sh` with `test` and `run` commands. Use portable `/bin/sh` and documented MPC features. Do not require Python, git, or curl on the MPC.
2. Ensure `sh -n releases/<release-id>/payload.sh` and `sh releases/<release-id>/payload.sh test` pass in the Codex environment. Tests must have no side effects on device hardware, settings, or user projects.
3. Run `sh tools/publish-mobile.sh <release-id>`. It creates `public/latest.sh`, `public/latest.sha256`, and immutable `public/releases/<sha256>.sh`.
4. Run `sh tests/mobile-publish-check.sh` and `sh tests/smoke.sh`. Fix errors before proposing the release.
5. Include the source, the public pointer files, and the immutable blob in the same pull request. Explain the feature, expected behavior, operational risks, test evidence, and the exact checksum. Ask the user to review the diff and merge only when ready.
6. After merge the existing **MPCDev Deploy** iPhone Shortcut fetches the checksum and installs the immutable blob using `mpcdev-pull-v3.sh`. The shortcut handles repeat deployments without changing rollback history.

## Safety and scope

- Never deploy, merge, or run device modifications without the user's approval.
- MPC release payloads run with root privileges. Treat any unreviewed source changes as potentially dangerous. Hash verification guarantees bytes match an approved hash, not that source code is safe.
- Preserve the working firmware, MPC projects, `/sdcard/MPCDev/mpcdev.sh`, and working iPhone shortcuts. Use additive features, checks, and reversible changes when feasible.
- Never add reboot, startup persistence, destructive disk operations, or modifications to the Akai user interface or audio engine unless the user has explicitly requested and reviewed them.
- The current mobile publish pipeline supports a **single standalone shell payload**, capped at 10 MiB by the MPC receiver. Native binaries, multiple assets, or persistent services will need a separately designed and reviewed package format.
- The MPC's built-in `wget` lacks TLS certificate validation; approved SHA-256 is the integrity requirement. `public/latest.sha256` is a mutable pointer from the same repository. Human review of the proposed release remains important.
- Live/hot reloading is **not** part of the current requirement. A feature may require manually restarting its process or the MPC, depending on what it changes.
