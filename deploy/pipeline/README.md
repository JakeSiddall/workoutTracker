# Workout release pipeline — JAK-11

Prepared September 5, 2026. No production deploy is authorized by this document.
JAK-9 owns provisioning and private HTTPS. This directory owns release and recovery
operations. See `deploy/pi/CONTRACT.md` when available for the agreed host contract.

## Delivery

PR → hosted ARM64 tests/build/smoke → reviewed merge to `main` → hosted tests and
publication → manual approval of the exact manifest → private host release.

`.github/workflows/ci.yml` uses Node 24, `npm ci`, application tests, controller
failure tests, a production dependency audit, and an ARM64 container check. All
actions are pinned to full commit IDs. PRs have read-only permissions and no
registry login. Only the publication job receives `packages: write`; it tests the
exact loaded image immediately before pushing that image. The tag includes the
commit, run ID and attempt. Deployment accepts only the resulting SHA-256 digest.
There is no `latest` deployment, auto-merge, self-hosted runner, SSH key, tailnet
credential, or production job in Actions.

The immutable uploaded release artifact includes `release.json` and this controller
directory. Its manifest binds image digest, source commit, runtime configuration,
and CI run/attempt. Keep those together. Compare the artifact's commit and run with
the green Actions run before approving it. Digest validation and OCI revision
checking do not independently prove trusted provenance: operator verification of
the GitHub run is required. The image's Node 24 base is a moving LTS tag at build
time; the final published image is immutable, but rebuilding a commit is not a
promise of byte-identical output. Store approved digests and their registry images.

Protect `main` with PR review and the `checks` status before daily use. Restrict
workflow changes to trusted review. Configure those GitHub rules explicitly; YAML
alone does not enforce branch protection. Controller updates are manual, reviewed
host changes; deployment never overwrites its own installed executable. A runtime
configuration change requires installing/reviewing the matching controller first.

## Host contract and prerequisites

JAK-9 must explicitly approve and provision:

- Docker on the 64-bit Pi, Python 3 and restic. No builds on the Pi.
- Root `/srv/apps/workout-tracker`, root-owned and private; `data/` owned
  `1000:1000`, mode `0700`, for `/data/workouts.sqlite` in the container.
- Only `127.0.0.1:3002:3001` published by Docker. Native Caddy on the Tailscale HTTPS
  address proxies to that loopback port. Caddy/DNS credentials are never mounted
  into the workout container. Finance remains independently managed.
- `/opt/workout-controller/` containing the reviewed controller files, root-owned.
- `/etc/workout-tracker/target.json` adapted from `target.example.json`. Keep
  `approved:false` until these prerequisites and explicit first-release approval
  exist. Changing the root/port after a release requires a separate reviewed host
  migration; the controller rejects drift from recorded successful state.
- An off-device restic repository, credentials, and password file. The destination
  is NOT selected yet. `restic.example.json` is only a placeholder; install the
  real JSON as `/etc/workout-tracker/restic.json` mode `0600`, and keep password and
  backend credentials outside source control. Provision with `restic init` only
  for the approved destination. Keep the password/recovery credentials in a second
  safe location so loss of the Pi does not also lose the backup key.

Restic encrypts the contents before storage. Supported repository prefixes are
off-device-capable transports; the operator must verify the configured endpoint
really is on a different device. No local SD-card path qualifies. Cloud CI receives
only synthetic databases. Host smoke containers use `--network none`, no secrets,
and disposable database copies. Private logs are inspected manually on the host.

## Manual operations after provisioning and approval

Run from a private host shell as the controller's operator. No ambient `IMAGE`
variable is needed, including logs/recovery. These commands are documentation,
not a request to run them during preparation.

```sh
sudo python3 /opt/workout-controller/workoutctl.py --target /etc/workout-tracker/target.json status
sudo python3 /opt/workout-controller/workoutctl.py --target /etc/workout-tracker/target.json --approve deploy /path/to/verified/release.json
sudo python3 /opt/workout-controller/workoutctl.py --target /etc/workout-tracker/target.json logs
sudo python3 /opt/workout-controller/workoutctl.py --target /etc/workout-tracker/target.json --approve rollback
sudo python3 /opt/workout-controller/workoutctl.py --target /etc/workout-tracker/target.json backup
sudo python3 /opt/workout-controller/workoutctl.py --target /etc/workout-tracker/target.json --approve recover
```

The controller locks the whole operation, pulls the candidate, and journals the
previous complete release before quiescing writes. It stops the app, takes a WAL-
aware SQLite backup, uploads it encrypted, downloads that exact snapshot, and
verifies its hash, integrity, foreign keys, and startup under the previous release.
It tests fresh initialization, then candidate startup on a database copy, verifies
old column declarations/rows are preserved, and starts the actual previous image
on the candidate-migrated copy. All of this occurs before candidate startup on live
data. First deployment still tests fresh initialization and must upload/retrieve
its newly initialized live database before being committed as successful.

The app is unavailable during quiesced tests and backup verification; expect
minutes, not zero downtime. Do releases between workouts. This approach favors a
consistent final backup and a check against the exact stopped database.

State publication is a single fsync'd JSON replacement carrying both `current` and
`previous` complete release manifests. Launch and health failures restart the
previous image/configuration. A failed first launch is stopped, with any initialized
data retained for inspection. Code rollback never silently restores an older DB.
A failed rollback leaves the transaction journal intact and reports failure.
After a process crash or power interruption, further changes fail closed until an
operator runs `recover`; recovery retries the stored prior release. No unattended
power-loss recovery is claimed. Review the journal before recovery if a candidate
may already have served writes.

Schema/data preservation is a conservative gate, not proof of semantic migration
compatibility. There is no commit-message bypass. Renames, removals, or rewriting
existing values require a separate migration/recovery plan. Prior-image startup is
an additional gate; behavioral compatibility of cached clients still requires app
tests and the later phone checks. Never enable automatic production deployment
based only on text scanning or a green `/api/health` response.

## Backup and restore

Every backup uploads a consistent standalone SQLite snapshot, restores the exact
restic snapshot into a temporary directory, and compares bytes plus SQLite checks.
`backup` records `{id, path}` in `last-backup.json`; successful releases also carry a
backup receipt in `state.json`. The receipt's `path` is the original source path
inside the restic snapshot, even after that temporary source has been removed.
Preserve receipts off-device alongside release manifests; `restic snapshots` and
`restic ls <exact-id>` can reconstruct them after total host loss.

After an approved destination is tested, JAK-9 may install and enable the included
backup service/timer. It runs nightly and catches up after downtime. Verify both
`systemctl list-timers` and an actual successful service run. A failed backup exits
nonzero for service monitoring. Retention/deletion is deliberately manual in this
first release: choose an off-device retention policy and monitor capacity before
daily use. Nothing prunes images, release manifests, or recovery databases.

To restore live data, prepare a JSON file with the exact receipt `{id, path}` and
explicitly approve losing all writes since that snapshot:

```sh
sudo python3 /opt/workout-controller/workoutctl.py --target /etc/workout-tracker/target.json --approve restore /path/to/receipt.json
```

The controller downloads/decrypts and smoke-tests it first, then stops the app and
takes a final verified off-device safety backup. The whole current data directory
(including WAL sidecars) is moved to a unique `pre-restore-*` directory before the
restored DB is installed. If launch fails, the full original directory is restored.
Rejected restore directories are retained for inspection. Delete none of these
until a human confirms recovery. For total-host loss, provision a new isolated
host, restore the encrypted backup to a disposable directory, verify it, provision
data ownership, and reinstall the corresponding approved release/controller;
do not improvise by copying a live WAL database file.

## Validation and activation status

Local verification commands:

```sh
npm test
npm run build
python3 -m unittest discover -s deploy/pipeline/tests -v
python3 deploy/pipeline/check_tracked.py
actionlint .github/workflows/ci.yml
```

Container checks require Docker. Remote backup/restore, an actual failed-container
rollout, host recovery, the timer, and the first private HTTPS deployment require
the JAK-9 environment. Those are explicit activation gates; unit tests with fake
Docker/backup adapters do not establish production readiness.

References: [GitHub hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
[Docker Actions](https://docs.docker.com/build/ci/github-actions/),
[Node release schedule](https://github.com/nodejs/Release),
[restic restore](https://restic.readthedocs.io/en/stable/050_restore.html).
