# Portfolio Inventory

This file is the operator-facing view of `portfolio-inventory.manifest.json`. Use the manifest as the SSOT and this table as the quick control-plane readout.

| app_key | display_name | repo_path | landing_slug | known_review_state | current_blocker_baseline | next_phase_touchpoint |
| --- | --- | --- | --- | --- | --- | --- |
| `babyvox` | BabyVox | `/Users/masa/Development/projects/BabyVox` | `babyvox` | `rejected_per_project_brief_pending_phase_3_live_pull` | Legal URL migration, rejection RCA, and creative refresh are all required. | Phase 2 legal URL matrix, then Phase 3 rejection capture. |
| `oxisnap` | OxiSnap | `/Users/masa/Development/projects/OxiVox` | `oxisnap` | `rejected_per_project_brief_pending_phase_3_live_pull` | Legal URL migration, rejection RCA, creative refresh, and alias drift handling are required. | Phase 2 legal URL matrix, then Phase 3 rejection capture. |
| `coughwav` | CoughWav | `/Users/masa/Development/projects/CoughWav` | `coughwav` | `rejected_per_project_brief_pending_phase_3_live_pull` | Legal URL migration, rejection RCA, and creative refresh are all required. | Phase 2 legal URL matrix, then Phase 3 rejection capture. |
| `thermosnap` | ThermoSnap | `/Users/masa/Development/projects/ThermoSnap` | `thermosnap` | `rejected_per_project_brief_pending_phase_3_live_pull` | Legal URL migration, rejection RCA, and creative refresh are all required. | Phase 2 legal URL matrix, then Phase 3 rejection capture. |
| `bpsnap` | BPSnap | `/Users/masa/Development/projects/BloodPressureSnap` | `bloodpressuresnap` | `rejected_per_project_brief_pending_phase_3_live_pull` | Legal URL migration, rejection RCA, creative refresh, and brand-to-slug drift handling are required. | Phase 2 legal URL matrix, then Phase 3 rejection capture. |
| `glucosnap` | GlucoSnap | `/Users/masa/Development/projects/GlucoSnap` | `glucosnap` | `pending_phase_3_live_pull` | Legal URL migration and creative refresh are required. | Phase 2 legal URL matrix, then Phase 3 live state pull. |
| `weightsnap` | WeightSnap | `/Users/masa/Development/projects/WeightSnap` | `weightsnap` | `pending_phase_3_live_pull` | Legal URL migration and creative refresh are required. | Phase 2 legal URL matrix, then Phase 3 live state pull. |
| `waistvox` | WaistVox | `/Users/masa/Development/projects/WaistVox` | `waistvox` | `pending_phase_3_live_pull` | Legal URL migration and creative refresh are required. | Phase 2 legal URL matrix, then Phase 3 live state pull. |
| `pupweight` | PupWeight | `/Users/masa/Development/projects/PupWeight` | `pupweight` | `pending_phase_3_live_pull` | Legal URL migration and creative refresh are required, with likely pet-specific outlier handling. | Phase 2 legal URL matrix, then Phase 3 live state pull. |

## Known Drift And Gaps

- Canonical alias decisions are recorded in `app-identity-map.csv`.
- Field-level evidence and placeholder rationale are recorded in `inventory-source-log.md`.
- Any `pending_phase_3_live_pull` review state must be replaced by a live ASC audit before Phase 4 remediation closes.
- BOTTO is not a target app and is referenced only as the Phase 2 implementation model.
