# JAK-11 preparation evidence

September 5, 2026. This evidence applies to local preparation, not production activation.

- `npm test`: 7 tests passed, including SQLite workout persistence and the new
  loopback HTTP readiness/Origin/JSON boundary test.
- Existing checkpoint testing exposed same-millisecond pull-up undo ordering by
  random UUID. Queries now use SQLite insertion order; a deterministic regression
  gives both entries the same timestamp and reverses lexical UUID order.
- `npm run build`: successful Vite production build.
- `npm audit --omit=dev --audit-level=high`: zero reported vulnerabilities.
- `python3 -m unittest discover -s deploy/pipeline/tests -v`, with restic on PATH:
  20 tests passed. Eighteen exercise real SQLite and injected Docker/backup
  failures, including full release recovery, crash journal, lock contention,
  restore failure/success, mutable-image rejection and changed target rejection.
  Two use/check the real restic adapter: disposable encrypted repository round
  trip, wrong-password failure, and rejection of a production local-only repository.
- actionlint 1.7.12: workflow syntax passed (`-shellcheck=''`; shellcheck was not
  installed). Official binary checksum matched its release checksum list.
- Restic 0.19.1 official binary checksum matched the release checksum list. It
  operated on fictional data in temporary directories; no real backup destination
  or credentials were used.
- `git diff --check` and tracked private-state guard passed.

Local Docker CLI is present but its daemon is stopped. Container execution and
Node 24/native ARM64 compatibility must be confirmed by the hosted PR check.
No workflow has been merged or production operation executed by this workstream.

Required before activation: green hosted container check, reviewed merge and
published digest artifact, approved/provisioned target, off-device restic
destination and separately recoverable password, actual Pi failed-update/rollback
and restore drills, verified nightly backup service, and JAK-9 private HTTPS/phone
checks. JAK-11 remains incomplete until the host-dependent gates pass.
