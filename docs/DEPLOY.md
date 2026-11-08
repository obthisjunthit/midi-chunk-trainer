# First deployment and existing controller integration

## 1. Transfer the harmless release

Download `dist/mpcdev.sh`, `dist/hello-001.sh`, and `dist/SHA256SUMS` from Codex output to your iPhone. Alternatively push the reviewed repository and run the manual **MPCDev release** GitHub Actions workflow, then download its artifact. No public download service is required.

In your existing SFTP app, inspect `/sdcard/MPCDev/` for conflicts with `mpcdev.sh`, `state/`, `releases/hello-001`, and `incoming/hello-001.sh`. Preserve existing files; if a name is already in use, stop and reconcile it. Upload the controller to `/sdcard/MPCDev/mpcdev.sh` and the release to `/sdcard/MPCDev/incoming/hello-001.sh`. Do not overwrite `control.sh`.

## 2. Verify bootstrap, approve, install, and test

Compare the controller hash below against the value shown in your trusted Codex review. The checksum file uploaded alongside the code alone cannot authenticate it. Run this in your existing Shortcuts **Run Script over SSH** action on Wi-Fi, using your MPC's existing SSH connection:

```sh
set -eu
cd /sdcard/MPCDev
EXPECTED=a5a70e48178b049f30b4ca973e2b6c73f3b155a4c013c82063dc00cf90b2df81
ACTUAL=$(sha256sum mpcdev.sh)
ACTUAL=${ACTUAL%% *}
[ "$ACTUAL" = "$EXPECTED" ] || { echo 'Controller SHA256 mismatch'; exit 1; }
sh ./mpcdev.sh status
sh ./mpcdev.sh install hello-001 723edb90fe46b4ef6cfa0a0dabe135777baef0dfc4f7938e987e960546215bb1
sh ./mpcdev.sh test
sh ./mpcdev.sh run
```

Expected final output: `Hello from MPCDev hello-001. No MPC settings were changed.` The first release has no previous release; rollback will refuse without changing anything. Subsequent releases retain the former active ID.

## 3. Shortcuts controller actions

Add independent SSH actions using your existing host/login; no changes to `control.sh` are required:

```sh
sh /sdcard/MPCDev/mpcdev.sh status
sh /sdcard/MPCDev/mpcdev.sh test
sh /sdcard/MPCDev/mpcdev.sh run
sh /sdcard/MPCDev/mpcdev.sh rollback
```

For a future release, upload `incoming/NEW_ID.sh`, review its source and approved SHA256 in Codex, explicitly confirm in Shortcuts, then invoke `install NEW_ID APPROVED_SHA256`. Use fixed validated ID/hash values, not an arbitrary AI-generated SSH command. Do not create an unattended auto-install shortcut. If your existing control.sh offers custom hooks, route those hooks to these commands only after reviewing its actual interface; no hook interface is assumed here.

Keep SSH output as the immediate test result. To retain a log without losing command status:

```sh
sh /sdcard/MPCDev/mpcdev.sh test > /sdcard/MPCDev/logs/mpcdev-test.log 2>&1
result=$?
cat /sdcard/MPCDev/logs/mpcdev-test.log
exit "$result"
```

On a failed install the active reference remains unchanged. Inspect retained `.stage-ID` before removing it. After a killed process or reboot, a lock may remain: first confirm no companion command is running, then remove only the empty `state/deploy.lock` directory with `rmdir`. Never automatically clear it.

MPC wget cannot verify TLS: do not bootstrap or deploy with it. iPhone HTTPS download plus SFTP and independently approved hashes is the default. Verify the MPC SSH host identity in your clients. Do not expose root SSH to the Internet. Future direct Cloud connectivity would require separately configured private-network access; it is not assumed here.
