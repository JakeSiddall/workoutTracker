# Workout Tracker — consolidated specification

Status: implementation baseline after Astra review. User requirements are settled; explicitly labeled product defaults may be adjusted after prototype use. Account-specific integration feasibility is still unverified (see INTEGRATION-CHECK.md).

## 1. Purpose and scope

Open the app, select or accept the recommended strength workout, follow exercises and warm-ups, record actual performance, and retain detailed history that ChatGPT can query.

Keep it simple. Single user, one active plan, four screens: Today, Workout, History, Settings. Strava handles running/cycling; aerobic Session B is not represented or required for progression in this app. The app cannot infer recovery from runs, rides, sleep, or Kaiser records it has not imported.

Required: strength logging; weight suggestions and overrides; warm-ups; rest timer; total-reps pull-ups; timed/PT completion; last-performed displays; past-workout entry and corrections; editable templates; recovery from phone/network interruptions; read-only detailed ChatGPT access.

Deferred: HealthKit companion, automatic Strava import, coaching chatbot, automatic medical/recovery decisions, charts, multiple users, elaborate periodization, plate-inventory optimization, one-off live workout builder, reminder system, recommendation approval queue.

## 2. Screens and interaction

### Today

- Show Resume if a session is in progress. Only one active session at a time for this single-user prototype.
- Otherwise recommend the next active template after the most recently completed, template-linked session in the active plan. Initially alternate Strength A and Strength C. With no history, recommend the first template in plan order.
- Keep a selector for all active templates. Recommendation is a convenience, not an instruction to exercise every day; no weekday scheduling in v1.
- Finishing a partial workout with skipped exercises counts as completing that template. Abandoning it does not. A completed manual session with no matching template does not advance the template sequence.
- Show the last strength session and the selected template's last performed date, e.g. “Strength C · last completed 9 days ago.” No historical record means “Not logged yet,” not “Never performed.”
- Provide Start and Log past workout. Historical sessions sort by when performed, not when entered.

### Workout

- Preview the ordered exercises; show previous actual performance and days since the exact exercise was last performed across all templates/plans.
- One prominent set at a time within the current exercise, with editable work weight, target rep range, expandable warm-up/work-set overview, and a rest timer. This focused-set layout is approved. Expand history, notes, and optional RIR only when needed.
- A suggestion pre-fills the chosen work weight. Editing it changes pending work-set target weights and regenerates pending warm-ups. Completed records remain unchanged.
- For a normal set, show target weight and rep range. One Complete action can confirm those values as actual; prefilled actual inputs alone are not evidence of a performed set. Default rep input is the range's lower bound. Jake may edit actual reps/load before or after confirmation.
- A shortfall is still a completed set with actual reps; missed target is a derived outcome. Allow explicit skipped sets and zero-rep attempts. Null actual values mean unrecorded, not zero.
- Store original exercise-level suggestion and prescription snapshot plus chosen target; no need to retain every intermediate keystroke or target revision.
- Add one extra set or skip a set with simple controls. Substitution selects an exercise from the catalog and is session-only; retain the original prescribed exercise reference. A different exercise starts its own history and does not inherit load recommendations blindly.
- Pull-ups use a target total and actual total, optional added weight, and no required set count. Enter “Reps just completed” in a blank numeric-entry field, then “Add reps” adds that batch to the running total and clears the field. Support undo of the last entry and direct total correction. “Finish pull-ups” is available at any total, including below target; reaching the target does not auto-finish or truncate an entry. Keep the actual total as the authoritative historical result; the in-progress entry/undo buffer is UI state, not a new programming model. Default added weight is explicitly bodyweight/0 lb. Changing load partway through is recorded in notes in v1; do not invent a uniform load for an unknown mixed-load total.
- PT uses a duration range and a Done/Skip control; actual duration is optional. No pain diagnosis or automatic load algorithm for PT.
- “Log set” confirms actual performance, advances to the next set, and starts/restarts the between-set reference countdown in one action. The timer is informational: never disable logging while it runs, require a “Start next set” action, or require acknowledgment when it expires. Show the timer before the next-set card. Each subsequent successful log resets the countdown from that moment, whether the prior countdown is running or finished; validation failures do not reset it. Allow extending rest. Use the exercise's configured rest default; earlier warm-ups may use a shorter configurable rest. Pull-up “Add reps” uses this same one-action cycle. The wireframe's 90-second pull-up rest is illustrative, not an approved program prescription.
- While resting, Jake can lower the chosen weight for all remaining work sets. Keep completed actuals and targets unchanged, and do not insert new warm-ups after work has begun. Editing only a set's actual weight does not silently change future targets.
- Finish shows what was actually logged, including skipped/unknown items. No per-exercise accept/reject recommendation workflow.

### History

- List sessions by performed date with details and edit/correct actions. Session corrections must recalculate future suggestions, not rewrite snapshots of subsequent completed workouts.
- Log past workout: pick a date, optionally a time, and an active or archived template, or a blank manual session. Reuse the same exercise and set components without timers.
- Prefill planned fields only. Do not fill actual values unless Jake confirms them. Unknown warm-ups, weights, reps, duration, or RIR stay unknown; a template is not proof the prescribed work occurred.
- Date-only records have `time_precision=date`; do not invent start/end times or duration. Within a date, use explicit times when known, otherwise a stable UI order; do not use ambiguous same-day order to award an increase.
- Allow corrections and deleting an erroneous workout with confirmation. Editing a template never alters a completed session. Archive templates/exercises referenced by history instead of deleting their identity.

### Settings

- Current plan: rename/add/archive templates; select active plan; order templates/exercises; edit exercise, set count, rep range or total target, duration, rest, and load increment. This same small editor is sufficient for replacing the program later.
- Catalog exercises have stable IDs. Rename preserves identity; changing to a meaningfully different variation uses a different ID.
- Per exercise, configure equipment minimum, practical load step, warm-up on/off, and optional final ramp. No stock tracking for individual plates in v1.
- Units default to lb. Each historical load records its unit and basis. No automatic unit conversion or merging differently configured exercises in v1.
- Provide data export (JSON) and backup instructions. Recovery is part of the product, not a later analytics feature.

## 3. Seed plan and historical facts

Use the prior training document and workbook as sources, with the following accepted changes. Historical values are dated observations, never new completed sets and never assumed current capabilities.

| Template | Exercise | Target | Rest | Historical observation |
|---|---|---|---|---|
| A | Bench press | 3 × 5–6 | 165 sec | 145 lb, Aug 4, 2026 |
| A | Romanian deadlift | 3 × 6–8 | 165 sec | 95 lb, Jul 19, 2026 |
| A | Pull-ups | Total reps, target initially unset | Optional | No verified entry |
| A | Knee/PT slot | 8–10 min, Done/Skip | None | Movement remains PT-specified |
| A | Calf raise | 2 × 10–15 | 90 sec | No verified load |
| C | Knee/PT slot | 8–10 min, Done/Skip | None | Movement remains PT-specified |
| C | Trap-bar deadlift | 3 × 5–6 | 165 sec | No verified lift-specific load |
| C | Overhead press | 3 × 5–6 | 150 sec | 95 lb, Aug 4, 2026 |
| C | Barbell row | 3 × 6–8 | 120 sec | 115 lb, Jul 4, 2026 |
| C | Hip thrust/glute bridge | 2 × 8–12 | 105 sec | Choose exact variation before load history |
| C | Push-ups, optional | 2 × 8–15 | 90 sec | Bodyweight |

The pull-up example of 20 total reps in earlier drafts was illustrative, not approved programming. Ask for a target on first use; allow actual-total logging with target unset. Do not silently convert 3 × 3–8 into an invented total.

The old combined “Front Squat / Trap DL” 132 lb observation stays in the import preview as unassigned, with its source/date. It cannot drive either exercise's suggestion until Jake identifies it. Only verified actual set details may be imported as sets. A load-only observation may populate an exercise performance with `record_kind=load_only`, actual load/date/source, no fabricated sets, and no eligibility for automatic progression.

Before import, inspect sources and show the mapping. Imports require a stable source key so rerunning does not duplicate data. Keep original files outside Git and preserve them.

Source files already located:

- `/Users/jacobsiddall/Downloads/jake_training_system_v1.docx`
- `/Users/jacobsiddall/Downloads/jake_lift_log_CURRENT.xlsx`
- `/Users/jacobsiddall/Documents/Codex/2026-08-22/referenced-chatgpt-conversation-this-is-an/outputs/01a02b09-9b4c-7b50-a4b6-0c48fb522de1/jake_training_tracker.xlsx`

## 4. One progression policy

Use rep-range double progression, preserving the original plan's top-of-range plus RIR criterion. Do not combine it with the distinct 2-for-2 rule. The engine runs when opening an exercise or requesting a preview, using history before that session's performed time.

### Most recent actual performance is the starting point

Use the latest completed performance of the exact exercise with matching load basis/unit and recorded work. A deliberate lighter session replaces an older heavier anchor. An override does not edit the template but the resulting actual work informs future suggestions.

- For consistent recorded work-set weights, use that actual weight as the anchor.
- For mixed work-set weights, use the lowest recorded weight among positive-rep work sets as a conservative product fallback; label it “mixed loads last time.” Do not increase automatically.
- A zero-rep-only attempt retains the attempted load as context and blocks an increase; ask Jake to adjust if appropriate. A later entry with missing actual weights blocks an increase rather than silently skipping it. Show the last known load/date as incomplete evidence if available.
- With no recorded load, ask Jake to choose it once. Never invent an initial load. Load-only imports may prefill a last-known load but cannot justify an increase.
- Bodyweight-only, total-reps, and timed exercises have no automatic load increases in v1. Weighted pull-up data can be logged; retain its last added load unless manually changed.

### Increase or hold

For set-based external-load work, increase only when the latest comparable performance has the same prescribed work-set count and rep range, every required work set is recorded at one load, every set reaches the rep-range maximum, and every required set has recorded RIR ≥ 2. Extra sets do not create eligibility or invalidate otherwise complete prescribed sets. Exclude warm-ups. Missing RIR or missing work means hold, with an explanation. RIR remains optional for logging; it is only required for automatic increase eligibility.

Increase by one configured increment, rounded to the practical load step. Retain original plan defaults: bench/OHP/row 5 lb; RDL/trap-bar/hip thrust/calf 10 lb. These are editable program defaults, not universal percentages. New or materially changed prescriptions hold the last actual load until there is comparable evidence. A marked pain/technique concern suppresses an increase; the app does not diagnose or prescribe an automatic pain-driven reduction.

### Time away: explicit prototype default

No source reviewed establishes a universal load-loss curve. Adopt a simple **product heuristic**, clearly labeled in Settings and suggestion reasons:

- Less than 14 calendar days since the exercise's latest recorded actual work: apply the ordinary increase/hold rule.
- At least 14 days: suppress the increase and prefill **90% of the latest actual load**, rounded down to a practical load. The user can override immediately.
- Do not compound repeated reductions without a newly performed workout. Refreshing the page does not reduce the weight again.
- If the timestamp is unknown, show last-known weight and request a choice; do not infer a gap. Unknown intervening loads cannot justify progression.
- Cap at the equipment minimum; explain if a 10% reduction is not achievable. For load below an equipment minimum, request the correct equipment/load instead of coercing the input.

The 14-day/10% default is a transparent, adjustable convention for this prototype, **not claimed as an ACSM or StrongLifts rule** and not a medical return-to-training protocol. StrongLifts supports the general break-aware deload interaction, not these exact numbers. This choice resolves the behavior without inventing a sophisticated model. Jake's response to the suggestion remains authoritative.

Examples: 145 lb bench, eligible with a 5 lb increment and a 6-day gap → 150 suggested. Latest actual session deliberately reduced to 125, not eligible → 125, never the older 145. Latest actual 145 and a 16-day gap, 5 lb step → 130 suggested. Changing 130 to 140 regenerates warm-ups from 140; actual logged work at 140 anchors the next recommendation.

## 5. Warm-ups and overrides

Reuse the existing tracker workbook's approximate ramp: equipment minimum × 8–10, 50% of chosen work weight × 5, 70% × 3, optional 85% × 1–2. This is inherited programming, not a newly validated universal formula. Bench/OHP/RDL can default to a 45 lb bar and 5 lb step, visibly editable; floor pulls need a confirmed practical starting load/bar configuration.

- Round percentage loads to the nearest equipment step relative to the configured minimum; tie goes down. Clamp to the minimum, then discard duplicate loads and any ramp at/above the chosen work weight. Do not discard the selected work set itself.
- Warm-ups reference the current chosen target, not the algorithm's suggestion. A set's independently edited actual weight records what happened; it does not silently revise the remaining targets.
- Before an exercise starts, generate its warm-up rows. On target change, keep completed warm-ups and regenerate pending ramps above the last completed warm-up load but below the new chosen work weight. If no such ramp remains, show the work sets; never invent a descending warm-up path.
- After a work set is logged, changing the chosen weight updates remaining work targets but does not automatically insert another warm-up sequence.
- Warm-ups can be skipped or their actuals corrected. They never count toward work progression or reported work-set volume.
- Bench at 145 with minimum 45, step 5, optional ramp on: 45 × 8–10; 70 × 5; 100 × 3; 125 × 1–2. At a chosen 135: 45; 65; 95; 115 with the same rep prescriptions.
- No automatic weighted ramp for total-reps bodyweight exercises or timed PT. Accessories default to warm-up off; simple ramp can be enabled when equipment is defined.

## 6. Data model: six core tables

Templates describe future plans; dated sessions describe performed history. The active plan is a small settings object with a name and ordered template IDs. No separate program-version, recommendation, substitution, trend, or equipment tables are required in v1. Shared equipment defaults can live in settings; per-exercise overrides are scalar fields.

| Table | Purpose and essential fields |
|---|---|
| `exercises` | Stable `id`, `name`, `tracking_mode` (`sets`, `total_reps`, `duration`), `load_basis` (`external_total`, `per_hand`, `added_bodyweight`, `none`), unit, minimum/step, warm-up defaults, archived flag |
| `workout_templates` | `id`, name, plan label, active/archived state, sort order |
| `template_exercises` | `id`, template/exercise FKs, order, work-set count, rep min/max OR total-rep target OR duration min/max seconds, rest seconds, increment, warm-up settings |
| `sessions` | UUID `id`, nullable template FK, template-name snapshot, performed local date, optional UTC performed time, timezone, time precision, optional actual start/end, status (`in_progress`, `completed`, `abandoned`), entry source (`live`, `backfill`, `import`), unique optional import source key, notes, created/updated timestamps, revision |
| `session_exercises` | UUID `id`, session FK, actual exercise FK, prescribed exercise FK, order, name/mode/load-basis/unit/prescription snapshots, `record_kind` (`performed`, `load_only`), suggestion load/reason/policy version/evidence date, chosen target load, optional actual total reps/load/duration, status (`pending`, `completed`, `skipped`), optional concern/note/source |
| `sets` | UUID `id`, session-exercise FK, order, `kind` (`warmup`, `work`), optional prescribed-set ordinal, target load/rep min/rep max, actual load/reps, optional RIR and note, status (`pending`, `completed`, `skipped`), optional performed timestamp |

Use SQLite foreign keys, unique IDs and ordering constraints, transactions, and validation. Store one small `app_settings` record separately if convenient; it is configuration, not another behavioral subsystem.

### Value semantics

- Bench 145 lb means total loaded bar, including bar. Dumbbell per-hand loads must say “per hand.” Pull-up added load 0 means confirmed bodyweight-only, not zero bodyweight or zero work.
- Target/actual weights and reps are distinct. Original suggestion and chosen target are distinct. No separate override boolean is necessary; derive it from suggestion versus choice.
- Units and load basis are snapshotted on history; later catalog edits do not reinterpret old numbers.
- Set-based actual totals are derived from completed rows. Do not persist a second authoritative `actual_total_reps` at exercise level for set-based work.
- Total-reps performances store exercise-level target/actual totals and optional added load; they have no set rows. Duration mode stores target duration range, Done/Skip, and optional actual duration, with no rep/load fields.
- Missing actual values stay null. Completed sets may contain explicit zero reps; they are not skipped. Target attainment is derived, not a set status.
- Retrospective unknown sets are not synthesized. Date-only work is not assigned fictional seconds, duration, or timezone-adjusted midnight.
- Same-day ambiguous history and different prescriptions must be reported as such; do not claim exact ordering or performance equivalence.
- Cross-template exercise recency uses stable exercise identity. Skipped or merely planned work is excluded. Session completion and exercise completion are separate, so a partial/abandoned visit's confirmed sets remain real exercise history.
- Pull-up total-reps trends omit set distribution, rest, and sometimes added load/bodyweight. MCP must state that limitation and must not infer precise strength gains or total tonnage from it.

## 7. Phone reliability and private deployment

Use React/Vite, Express/Node, SQLite, and an ARM64 Docker image, matching the finance project's operational pattern. No dependency on OpenAI calls in the exercise runner.

- Serve `https://workouts.jakesiddall.com` privately through Caddy; trusted HTTPS is required for service-worker offline reopening. Use DNS-validated certificates when configuring the custom domain. Verify actual DNS-provider support during deployment. Do not copy the finance proxy's global `auto_https off` blindly.
- Tailscale remains the web/API access boundary. No public port forwarding or automatic Funnel fallback. Add the workout host route without changing finance behavior or mounting its data.
- Persist SQLite separately from the image. Health check, additive migrations, consistent SQLite backups, and one verified restore/rollback exercise are required before live use.
- Cache the app and active session on the phone. Save every confirmed edit in IndexedDB before showing “saved on this phone”; show “synced” only after Pi acknowledgment. First-ever offline launch is not supported.
- Retry on app opening, foregrounding, network recovery, and manual Retry. Do not depend on background sync. UUIDs prevent duplicate sessions/sets on retries. Use a session revision for optimistic concurrency: stale writes return conflict, never overwrite unseen newer data.
- For the single-user v1, a conflicting second-device session is read-only until Jake chooses/reconciles versions. Retain the unsynced local copy; no silent last-write-wins.
- Store a rest end timestamp; calculate remaining time on foreground/reload. Do not promise lock-screen alarms. Keep-screen-awake is best effort. A real iPhone test includes screen lock and switching apps.
- Validate mutation requests and reject unexpected origins. Read-only MCP annotations are descriptive; server code must enforce no writes.

## 8. ChatGPT integration: prove two separate outcomes

Detailed lifting access is required; HealthKit cannot substitute for it. Start with three read tools: `list_sessions`, `get_session`, `get_exercise_history`. Date filters, pagination, explicit units/bases, targets/actuals, warm-up classification, data-source labels, and missing-data limitations are required. No arbitrary SQL, bulk file access, writes, or access to finance data.

Preferred private connection to evaluate: OpenAI Secure MCP Tunnel, initiated outbound from a host able to reach the workout MCP service. It requires account permissions/workspace association, runtime credentials, and a supported client deployment. This is a candidate documented by OpenAI, not yet a verified entitlement or working Pi installation for Jake.

Milestone 0 tests:

1. From the intended ChatGPT interface, retrieve synthetic dated bench sets and accurately describe their progression.
2. In the same intended health conversation, determine whether the workout connector and existing Apple Health/Kaiser context are actually available together. Connector transport alone does not prove this.

A tunnel does not write lifting data into Health records or guarantee future chats remember it. Query the source again when needed. If same-conversation access is unavailable, record partial feasibility and explicitly choose a fallback with Jake; do not declare the holistic requirement complete. Public HTTPS + OAuth is a fallback proposal, not an approved automatic deployment.

Synthetic integration fixtures must remain separate from real history. A successful local tool test does not count as an end-to-end ChatGPT test.

## 9. Build order and acceptance tests

### Milestone 0 — integration feasibility

Execute INTEGRATION-CHECK.md before claiming the architecture meets the holistic-health requirement. While account access is blocked, prepare the schema/UI locally, but do not substitute a different chat experience without discussing the result.

### Milestone 1 — one complete workout

Implement schema, initial templates, Today selector, runner, warm-up override, optional RIR, total-reps pull-ups and PT completion. Tests: 145 suggested overridden to 135 recalculates the expected ramp; completed warm-up remains unchanged; set 4/6 is counted as four actual reps; null and zero stay distinct; pull-ups record a total with no invented sets.

### Milestone 2 — continuity

Implement the precise suggestion policy, recency, History/backfill/corrections, and Settings plan editing. Tests: recent deliberate 125 replaces older 145; no increase with missing RIR; 14-day boundary and no repeated deload; template edits preserve history; date-only/backfilled events sort correctly; ambiguous 132 lb never seeds a lift; editing an old session recomputes future suggestions; no repeated import.

### Milestone 3 — daily-use deployment

Private trusted HTTPS, offline resume/sync, no duplicate retry writes, clock-based timer, Pi storage/backup/recovery. Real iPhone test: confirm sets, disconnect Tailscale, continue, close/reopen, reconnect, verify exactly one of each record on Pi. Test stale second-device writes and restore a disposable database backup before enabling real use.

### Milestone 4 — real-data handoff

Implement the three read-only MCP tools against persisted data using the verified connection method. Query a real session and exercise history, ensure raw actuals match the UI, test missing/unauthorized access, and verify the agreed health-context workflow. No migration of synthetic fixture data to production.

## 10. Sources and evidence boundaries

- [ACSM 2009 progression position stand](https://pubmed.ncbi.nlm.nih.gov/19204579/) supports performance-based progression generally. It does not validate this app's exact RIR gate, fixed increments, or 14-day/10% heuristic.
- [StrongLifts progression settings](https://support.stronglifts.com/article/71-progression) provides precedent for explained progression and an adjustable return-from-break suggestion, not the exact prototype default.
- Warm-up percentages and original exercise prescriptions/rests come from the existing training tracker and its builder at `/Users/jacobsiddall/Documents/Codex/2026-08-22/referenced-chatgpt-conversation-this-is-an/work/lift_log_builder.mjs`.
- [OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) documents private connectivity; account access and coexistence with Health integrations need live verification.
- [OpenAI connector testing](https://developers.openai.com/plugins/deploy/connect-chatgpt) describes testing actual tool discovery and invocation.
- [MDN service worker requirements](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) explains HTTPS/secure-context requirements for offline support.

No new training target has been chosen for pull-ups, no PT movement prescribed, and no uncertain historic load promoted to a verified exercise. These are first-use inputs, not blockers to implementing the schema or UI.
