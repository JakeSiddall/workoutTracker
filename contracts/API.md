# JAK-6 API contract

All mutation requests carry a unique `requestId`. Reusing it returns the original successful response and never repeats the mutation. Session mutations also carry the caller's current `revision`; a stale revision returns HTTP 409 with the current session.

- `GET /api/today` — active templates, recommendation, and resumable session.
- `POST /api/sessions` — `{requestId, templateId, performedDate, timezone}`; creates one active session and snapshots its ordered prescription.
- `GET /api/sessions/:id` — complete session, exercise snapshots, sets, pull-up undo state, and rest deadline.
- `PATCH /api/sessions/:id/exercises/:exerciseId/target` — `{requestId, revision, chosenTargetLoad}`; changes pending targets and eligible pending warm-ups.
- `PATCH /api/sessions/:id/exercises/:exerciseId/warmup-settings` — `{requestId, revision, barWeight, equipmentMinimum, loadStep, warmupEnabled, optionalFinalRamp}`; persists external-total equipment defaults for future sessions, updates the active session snapshot, and recalculates only eligible pending warm-ups.
- `POST /api/sessions/:id/sets/:setId/log` — `{requestId, revision, actualLoad, actualReps, rir?}`; confirms exactly one set and advances focus.
- `POST /api/sessions/:id/sets/:setId/skip` — `{requestId, revision}`.
- `POST /api/sessions/:id/exercises/:exerciseId/reps` — `{requestId, revision, reps}`; appends a recoverable pull-up batch and updates the authoritative total.
- `POST /api/sessions/:id/exercises/:exerciseId/reps/undo` — `{requestId, revision}`; removes only the last active-session batch.
- `PATCH /api/sessions/:id/exercises/:exerciseId/total` — `{requestId, revision, actualTotalReps, actualAddedLoad}`.
- `POST /api/sessions/:id/exercises/:exerciseId/complete` — `{requestId, revision, actualDurationSeconds?}`.
- `POST /api/sessions/:id/exercises/:exerciseId/skip` — `{requestId, revision}`.
- `POST /api/sessions/:id/complete` — `{requestId, revision}`.
- `PATCH /api/sets/:setId` — `{requestId, sessionId, revision, actualLoad, actualReps, rir?}`; corrects a confirmed set.

Null means unknown. Zero reps is a confirmed attempt. Set-based actuals exist only after log confirmation. Every successful logging mutation stores a rest deadline where applicable; reads never reset it.

Warm-up equipment values are total loads in the exercise unit. `equipmentMinimum` must include at least `barWeight`, and `loadStep` must be positive. Changing settings after a work set has resolved does not insert or replace warm-up rows. Canonical exercise-name corrections affect future sessions; existing `name_snapshot` values remain historical records.
