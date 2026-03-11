# Tracker Operating Rules

## SSOT

- `evidence-tracker.json` is the only state tracker for app-level execution across Phases 2 through 6.
- `wave-control-board.csv` is the execution-order view and must use the same `app_key` ordering as `evidence-tracker.json`.
- Later phases may create detailed artifacts, but they must update `evidence-tracker.json` instead of inventing parallel status documents.

## Allowed States

- `not_started`: no later-phase evidence has been created for the app yet.
- `in_progress`: at least one later-phase artifact is actively being produced and the app has an owner driving the next action.
- `blocked`: the app cannot advance because a blocker is active. The tracker entry must include both the blocker description and the owner accountable for unblocking it.
- `submission_ready`: the app has complete evidence for legal hosting, ASC audit, metadata lock, creative refresh, and readiness review, and there are no unresolved blockers.

## State Transition Rules

- `not_started` -> `in_progress`: allowed only when a concrete artifact path has been created or updated for the current `next_action`.
- `in_progress` -> `blocked`: allowed only when `current_blockers` is updated with the blocker text and the owner remains non-empty.
- `blocked` -> `in_progress`: allowed only when the blocker is removed or rewritten and the artifact that resolved it is cited in the relevant evidence slot.
- `in_progress` -> `submission_ready`: allowed only when every required evidence slot has a real artifact path plus a non-pending status.
- `not_started` -> `submission_ready`: never allowed.
- `blocked` -> `submission_ready`: never allowed.

## Evidence Slot Contract

- `legal_url_matrix`: populated by Phase 2 when the app's legacy legal URLs and replacement Cloudflare URLs are documented.
- `cloudflare_publish_log`: populated by Phase 2 when publish evidence exists for the app's `apps.allnew.work` route.
- `asc_live_audit`: populated by Phase 3 when live ASC state version and review evidence is recorded.
- `rejection_rca`: populated by Phase 3 only if the app is rejected or otherwise blocked by review findings.
- `metadata_lock`: populated by Phase 4 when legal URLs metadata and build/compliance choices are fixed.
- `creative_bundle`: populated by Phase 5 when screenshots previews and upload evidence are recorded.
- `readiness_packet`: populated by Phase 6 when the app passes the readiness gate.

## Status Discipline

- Every status change must cite a concrete artifact path inside the evidence object.
- `blocked` requires both a blocker description in `current_blockers` and a non-empty `owner`.
- `submission_ready` requires all of the following to be true:
  - `legal_url_matrix` is no longer pending.
  - `cloudflare_publish_log` is no longer pending.
  - `asc_live_audit` is no longer pending.
  - `metadata_lock` is no longer pending.
  - `creative_bundle` is no longer pending.
  - `readiness_packet` is no longer pending.
- `rejection_rca` may remain `not_applicable_until_phase_3` only if Phase 3 proves the app is not rejected and not blocked by review findings.

## Wave Sync Rules

- If `wave-control-board.csv` changes the priority or wave for an app, the corresponding `evidence-tracker.json` entry must keep the same canonical `app_key`.
- Wave reassignment is allowed only when a new blocker or dependency is recorded in tracker evidence.
- The top-ranked rejected apps must remain ahead of Wave 2 and Wave 3 apps until their Phase 3 evidence exists.

## Review Discipline

- Summaries for each plan must mention which evidence slots changed.
- State updates without artifact paths are invalid and should be reverted in the next tracker edit.
- Browser-only ASC evidence must be stored alongside screenshots or logs produced in the relevant later phase before the tracker can cite it.
