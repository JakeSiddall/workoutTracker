# JAK-14 review and integration

Reviewed September 6, 2026 against issue acceptance criteria and current main
0627454 (including JAK-13). Original implementation: 6065213.

Review fixes:
- Resolve startup, HTTP route/test, and CSS conflicts while retaining JAK-13 exits,
  same-day expiry, keyed exercise components, and mutation serialization.
- Run the seed/snapshot upgrade atomically and only while upgrading the exact
  legacy exercise seed. Match the legacy snapshot name, step, and both toggles;
  preserve custom equipment/snapshots and completed/skipped exercise or set state.
- Advance active-session revision after snapshot migration so cached clients must
  reconcile before writing. Reopening the DB is idempotent.
- Refresh actual-load input when the pending set target changes without a new ID.
- Clarify that equipment inputs are total loads, not per-side plate weights.

The issue explicitly authorizes the canonical Trap-bar squat correction. Historical
session names remain Trap-bar deadlift. The defaults are editable 52/72/10 lb;
172 lb with the final ramp produces 72/82/122/142 lb. SPEC documents the seeded
compound audit and preserves automatic-ramp-off defaults for pull-ups/calf raises.

Validation:
- 27 application tests passed, including JAK-13 regression coverage, HTTP settings,
  legacy/customized snapshots and equipment, revision conflicts, startup
  idempotence, exact completed/skipped records, invalid inputs, persistence,
  and no added ramps after completed or skipped work.
- Production Vite build passed. Locked dependency install reported zero vulnerabilities.
- Controller suite: 18 passed; two restic tests unavailable locally, run in hosted CI.
- Tracked-private-state guard passed. No workflow/controller changes.
- 360 x 800 browser QA on a disposable SQLite DB: collapsed and expanded settings,
  52/72/10 defaults, 172 target and exact four ramps, minimum edit to 82 updating
  the active ramp, return to 72, clear total/per-side wording; no console errors.

## Production release gate (outside this task)

Merging publishes an image and immutable release artifact; it does not deploy.
Before any release, verify the green main run, commit and exact digest/manifest.
The existing controller conservatively rejects rewrites of existing row values.
This migration changes legacy exercise/template defaults and eligible active
snapshots, so an existing legacy DB can fail that gate even though app tests pass.
Do not bypass it or retry against live data blindly.

JAK-9/release owner must prepare and approve a separate migration/recovery procedure:
1. Take and restore-verify an off-device backup during a quiesced release window.
2. Rehearse this exact candidate on that disposable restored DB. Verify the only
   changed existing values are the documented legacy seed defaults and eligible
   pending trap-bar snapshots/session revision. Verify all recorded sets/names,
   custom equipment and started sessions remain unchanged.
3. Verify previous-image startup and behavior against the migrated copy. Approve
   a narrowly reviewed mechanism for these expected changes; the current generic
   controller intentionally has no migration exception. Keep its gate intact until
   that separate change is reviewed. If the DB needs no rewrites, normal gating applies.
4. With JAK-9 provisioning/backup prerequisites satisfied, explicitly approve the
   verified manifest and run the documented private-host controller deploy command.
   Follow the existing recovery/restore contract on failure; never auto-restore over
   newer workout records.

No production data was accessed or changed. Parent JAK-10 remains open.
