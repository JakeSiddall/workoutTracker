# Workout Tracker

Personal, mobile-first strength tracker for Jake. Planned host: Raspberry Pi, reached over Tailscale at `https://workouts.jakesiddall.com`.

Status: JAK-6 local prototype implementation is in progress; not deployed.

- [SPEC.md](SPEC.md) is the single authoritative product/build specification. It replaces the v0.1–v0.4 chat drafts.
- [INTEGRATION-CHECK.md](INTEGRATION-CHECK.md) records the first milestone, its prerequisites, and verified versus unverified results.
- [fixtures/integration-sample.json](fixtures/integration-sample.json) contains fictional lifting history for the integration check. Never import it as Jake's training history.
- [HANDOFF.md](HANDOFF.md) is the fresh Astra task's starting brief and scope.
- [ACCEPTANCE.md](ACCEPTANCE.md) lists the first implementation checkpoint's tests.
- [design/approved-wireframe.html](design/approved-wireframe.html) is the portable approved v3 design reference. Its demo data and shortcuts are not production behavior.
- [TRACKING.md](TRACKING.md) links the five Linear deliverables.

First checkpoint: one complete workout saved and reopened correctly. Investigate ChatGPT feasibility in parallel; live account checks are waiting for the user to unlock the Mac and must not block local prototype work. Then complete history/settings and progression, phone reliability, private Pi deployment, and final real-data integration. The integration check must distinguish accessing lifting data in ChatGPT from accessing it alongside Apple Health/Kaiser in the same conversation.

The project does not need an LLM or an API call to run a workout or calculate its suggested weights.

The Linear project and five deliverables are prepared. No production data, secrets, public ingress, or remote repository have been created. JAK-6 implementation began September 5, 2026.

## Local development

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The API listens only on `127.0.0.1:3001`; SQLite data is stored in the ignored `data/` directory. Use `npm test` and `npm run build` for verification.

CI/CD preparation and the manual release/backup/recovery contract are documented in
[deploy/pipeline/README.md](deploy/pipeline/README.md). Hosted CI does not deploy to
the Pi. Production activation remains gated on the JAK-9 host and backup setup.
