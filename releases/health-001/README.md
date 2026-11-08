# health-001

Read-only, foreground health report for MPCDev. `run` prints:

- Kernel release from `uname -r`.
- Available memory from `/proc/meminfo` (`MemAvailable`, in kB). Older kernels without it show clearly labeled `MemFree` instead; these values are not equivalent.
- Filesystem free space from `busybox df -Pk /sdcard`. Read the `Available` column in 1 KiB blocks; this reports the filesystem containing `/sdcard`.

The payload writes only to stdout/stderr. It does not modify files, settings, services, firmware, or projects, and needs no reboot. The deployment controller itself still performs its normal installation bookkeeping when the user later approves deployment.

`test` validates memory parsing, fallback behavior, and missing-data failure using in-memory fixtures. It does not need `/sdcard`. `run` exits nonzero if `/sdcard` or a required diagnostic is unavailable. Cloud self-tests do not establish MPC hardware compatibility or report the MPC's live health.

Publish with `sh tools/publish-mobile.sh health-001`; include both pointer files and the generated immutable blob in the PR. Review the source and SHA-256 before any future merge or deployment. This release does not change the controller or Shortcuts.
