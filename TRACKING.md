# Linear tracking

[Workout Tracker project](https://linear.app/jakes-team/project/workout-tracker-46e3a86b107d)

Linear tracks delivery and blockers. SPEC.md and HANDOFF.md hold the detailed requirements. Local JAK-6 implementation started September 5, 2026; validation evidence will be recorded before marking it complete.

- [JAK-6: Build guided workout logging with durable session persistence](https://linear.app/jakes-team/issue/JAK-6/build-guided-workout-logging-with-durable-session-persistence) — local checkpoint verified September 5, 2026; Linear status/evidence update pending confirmation for the browser submission
- [JAK-8: Verify detailed ChatGPT workout access and health-context feasibility](https://linear.app/jakes-team/issue/JAK-8/verify-detailed-chatgpt-workout-access-and-health-context-feasibility) — Todo; live account check pending user unlock
- [JAK-7: Add workout history, backfill, corrections, and simple plan editing](https://linear.app/jakes-team/issue/JAK-7/add-workout-history-backfill-corrections-and-simple-plan-editing) — Backlog
- [JAK-10: Implement explainable load suggestions and warm-up rules](https://linear.app/jakes-team/issue/JAK-10/implement-explainable-load-suggestions-and-warm-up-rules) — Backlog
- [JAK-14: Generate trap-bar warm-ups with editable, collapsible equipment settings](https://linear.app/jakes-team/issue/JAK-14/generate-trap-bar-warm-ups-with-editable-collapsible-equipment) — implementation verified on isolated branch; integration/deployment pending
- [JAK-9: Verify offline reliability, private Pi deployment, and real-data integration](https://linear.app/jakes-team/issue/JAK-9/verify-offline-reliability-private-pi-deployment-and-real-data) — Backlog

## JAK-6 validation evidence — September 5, 2026

- `npm test`: 6/6 passing. Covers approved warm-up rounding, target override, confirmed 4-rep and zero-rep attempts, idempotent set and pull-up retries, pull-up undo/accumulation, PT unknown duration, explicit skips, server/database reopen, exact snapshot preservation, and persisted correction.
- `npm run build`: production Vite build successful.
- Local API health check: `GET /api/health` returned `{"ok":true}`.
- Browser QA at a 360 × 800 CSS-pixel viewport: Today selector A → C → A, Strength A start, 145 → 135 override showing 45/65/95/115 warm-ups, immediate advance after Log set, active non-blocking timer, and refresh/resume with the timer deadline and next set preserved.
- Physical iPhone, disconnected/offline continuity, Pi deployment, and ChatGPT account integration remain later milestones and were not claimed.

## JAK-14 validation evidence — September 5, 2026

- `npm test`: 10/10 passing, including trap-bar rounding, editable-setting persistence, API mutation coverage, existing-database migration, completed warm-up preservation, and the no-new-warm-ups-after-work rule.
- `npm run build`: production Vite build successful.
- Browser QA at a 360 × 800 CSS-pixel viewport: Strength C shows the canonical “Trap-bar squat” name; warm-up settings are collapsed by default and expand with 52 lb bar, 72 lb lightest total, 10 lb total-load increment, enabled warm-ups, and enabled final ramp. A 172 lb target visibly generated 72 × 8–10, 82 × 5, 122 × 3, and 142 × 1–2. No browser console errors were recorded.
- The change is implementation-ready on its isolated branch. It has not been integrated into the main checkout or deployed to the Pi.
