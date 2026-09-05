# Astra implementation handoff

## Start here

Implement the personal workout tracker in this project. Read README.md, SPEC.md, ACCEPTANCE.md, INTEGRATION-CHECK.md, TRACKING.md, and the approved design reference before coding. SPEC.md is authoritative for behavior; the approved wireframe establishes the interaction/layout, not real training data or production architecture. Do not reconstruct superseded chat drafts.

First checkpoint: a working mobile-first app that can complete a Strength A workout, persist exact target and actual data to SQLite, restart, and reopen the same workout correctly. Build and verify this checkpoint, then report the result and remaining milestones for product review. Do not declare the whole project complete.

## Approved interaction decisions

- Today has a workout selector and recommendation. Only strength A/C; running belongs in Strava.
- Focus on one set at a time, with the full workout order and set history expandable.
- Log set confirms actuals, advances immediately, and resets the informational rest timer. No Start next set button or timer gate. Logging remains enabled during rest; invalid input does not reset the timer.
- Jake can lower the weight after the first set. Pending targets change; completed targets/actuals do not. Warm-ups follow the chosen work weight; no new warm-up sequence after work begins.
- Pull-ups: enter reps just completed (e.g. 6, then 4), Add reps accumulates the total and resets rest. No +1 counter or fixed number of sets. Undo last entry, correct total, finish below target, and retain over-target actuals. Total is authoritative history; keep the transient undo buffer in recoverable active-session state.
- Null is unknown, not zero; only confirmed data is actual performance.

## Implementation and delegation

Use React/Vite, Express/Node, and SQLite per SPEC.md. Establish schema, validation, and API contracts first. One lead agent owns architecture, integration, and end-to-end verification. The user authorizes selective subagents for bounded independent work after those contracts exist, such as pure progression/warm-up logic and tests or an independent review. Give each a concise brief, relevant project files, explicit ownership, and acceptance criteria. Avoid overlapping edits or separate competing app implementations.

Use Linear for deliverable status and meaningful blockers, not agent messaging or an issue per component. Mark JAK-6 In Progress only when implementation actually starts, and complete it only after its acceptance checks pass. Record validation evidence. Project files hold detailed product decisions; update them if the user changes requirements.

## Scope and unresolved details

- Proceed with local prototype work despite the locked-Mac account-check blocker. Do not guess account entitlement or claim detailed ChatGPT access works merely because a local MCP tool works.
- Do not deploy, modify the finance app, expose public ingress, create a remote repository, or import real training data for this first checkpoint. Local Git initialization, dependencies, implementation, and proportionate tests are normal implementation steps.
- The finance repo at `/Users/jacobsiddall/Projects/financialPlanningAgent` may be inspected read-only for operational patterns; do not copy secrets or databases. Keep this app's storage separate.
- Wireframe sample dates/weights, 18 pull-up reps, and 90-second pull-up rest are illustrative. The approved real pull-up target remains unset. The wireframe has deliberate shortcuts: some controls are placeholders, navigation may reset demo state, non-bench prescriptions are generic, and inputs are not fully persisted. Do not port these shortcuts.
- Time-away default in SPEC.md is explicitly an adjustable product heuristic, not a researched exact formula. Preserve that distinction in code/UI.
- A new project task is not yet launched at preparation time: the folder must first be registered as a local Codex project. Do not treat this document as evidence that an implementation agent is running.

## Ready-to-use task prompt

Implement the workout tracker in this project using HANDOFF.md as your starting brief and SPEC.md as the authoritative specification. Follow design/approved-wireframe.html, preserving the approved one-set flow and non-blocking rest timer. First complete and verify JAK-6: one workout saved and reopened correctly, with the acceptance checks in ACCEPTANCE.md. Establish the shared schema and API contracts before using selective subagents for isolated work. Keep Linear updated with meaningful progress and evidence. The ChatGPT account check is pending the user's Mac unlock; it must not block local implementation. Do not deploy or modify the finance app. Report a runnable prototype, verification results, and remaining work at the first checkpoint.
