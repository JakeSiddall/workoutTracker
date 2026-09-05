# First checkpoint: one workout survives reopening

All sample data is fictional test data in a disposable database. These tests describe production behavior; the wireframe is not the test harness.

1. Open Today, see recommended A, select C, and select A again. Start one active session with the correct ordered prescription snapshots. No Strava/running session is required.
2. With a test bench target of 145 lb, override to 135 before beginning. Confirm pending warm-ups follow the chosen weight and configured equipment rounding. Never mutate completed actuals.
3. Confirm work set 1 at 145 lb × 5. During the rest countdown choose 135 lb for remaining work. Set 1 remains 145 × 5; set 2 targets 135; no new warm-up sequence appears.
4. Log set 2 while the prior timer still runs. Exactly one set is added and the timer restarts from the configured duration. No additional Start next set click, countdown wait, or expiry acknowledgment is needed. Clock expiry does not disable logging. Invalid data neither logs nor resets the timer.
5. Log a 4-rep set against a 5–6 target. Actual remains 4; it is completed, not skipped. Distinguish explicit zero attempts, blank/unknown values, and skipped rows. Prefills do not become actuals before confirmation.
6. Enter pull-up batches 6 and 4 with successive Add reps actions, including during an active countdown: total is 10 and each action resets rest. Undo removes only the last addition. Blank/negative/fractional batches are rejected. Finish below target; allow over-target entries without truncation. Do not invent a fixed set count.
7. Mark a PT slot done without actual duration, and skip another exercise. Preserve done/unknown/skipped distinctions. Finish and show only confirmed actuals.
8. Restart both app and server using the same SQLite storage. Reopen the session and verify every exercise, target snapshot, actual, unit, and warm-up/work distinction matches. Correct a real logged value and confirm persistence.
9. Retry a write with the same ID/request identity. There is only one record and no duplicate pull-up addition. Use atomic operations and an active-session revision; stale changes do not silently overwrite newer history. Rapid accidental repeat submits must not create phantom performed sets.
10. Refresh during an active session. Preserve confirmed inputs and the timer deadline; do not restart rest just because the page loads. Full disconnected-phone reopening and cross-device reconciliation are later JAK-9 checks, not assumed complete here.
11. Check the UI at 360px with real browser rendering and accessible form labels/keyboard operation. The prior wireframe received syntax and DOM-stub interaction checks, not successful browser-based layout QA.

Handoff evidence: commands run, pass/fail results, local run instructions, screenshots where supported, exact remaining limitations. Tests requiring a physical phone/account remain explicitly unverified until performed.
