# Inventory Source Log

## Scope

This log explains how the Phase 1 inventory was derived for the 9 target apps. BOTTO is excluded from the target roster and is tracked only as the Phase 2 reference implementation for Cloudflare-hosted legal pages.

## Primary Sources

| Source | Role |
| --- | --- |
| `/Users/masa/Development/projects/*` directory scan | Confirms canonical local repo roots and reveals naming drift such as `OxiVox` and `BloodPressureSnap`. |
| `/Users/masa/Development/projects/allnew-apps/data/landing-apps.generated.json` | Confirms landing slugs, bundle identifiers, support paths, and the one locally populated ASC id for WeightSnap. |
| User project brief from 2026-03-11 | Confirms which apps are already known to be rejected and which outcomes are required. |
| Same-day session capture of `appagent_list_apps` on 2026-03-11 | Confirms ASC app ids for all 9 target apps after local landing data proved incomplete. |

## Field-Level Derivation

| app_key | repo_path evidence | landing and bundle evidence | ASC id evidence | review-state evidence | blocker baseline rationale |
| --- | --- | --- | --- | --- | --- |
| `babyvox` | `/Users/masa/Development/projects/BabyVox` exists in the local repo scan. | `landing-apps.generated.json` has `slug=babyvox` and `bundle_id=jp.allnew.babyvox`. | Same-day `appagent_list_apps` capture returned `6759076543`. | User brief says BabyVox is currently rejected in ASC. | All apps need legal URL migration and creative refresh; rejected apps also need rejection RCA and fixes. |
| `oxisnap` | `/Users/masa/Development/projects/OxiVox` exists in the local repo scan. | `landing-apps.generated.json` has `slug=oxisnap` and `bundle_id=jp.allnew.oxisnap`. | Same-day `appagent_list_apps` capture returned `6759076145`. | User brief says OxiSnap is currently rejected in ASC. | The repo name drift requires explicit alias handling in addition to legal and creative work. |
| `coughwav` | `/Users/masa/Development/projects/CoughWav` exists in the local repo scan. | `landing-apps.generated.json` has `slug=coughwav` and `bundle_id=jp.allnew.coughwav`. | Same-day `appagent_list_apps` capture returned `6759076606`. | User brief says CoughWav is currently rejected in ASC. | Rejection RCA joins the common legal and creative backlog. |
| `thermosnap` | `/Users/masa/Development/projects/ThermoSnap` exists in the local repo scan. | `landing-apps.generated.json` has `slug=thermosnap` and `bundle_id=jp.allnew.thermosnap`. | Same-day `appagent_list_apps` capture returned `6759076372`. | User brief says ThermoSnap is currently rejected in ASC. | Rejection RCA joins the common legal and creative backlog. |
| `bpsnap` | `/Users/masa/Development/projects/BloodPressureSnap` exists in the local repo scan. | `landing-apps.generated.json` has `slug=bloodpressuresnap` and `bundle_id=jp.allnew.bloodpressuresnap`. | Same-day `appagent_list_apps` capture returned `6759076255`. | User brief says BPSnap is currently rejected in ASC. | Brand-to-slug drift must be preserved while the app is remediated. |
| `glucosnap` | `/Users/masa/Development/projects/GlucoSnap` exists in the local repo scan. | `landing-apps.generated.json` has `slug=glucosnap` and `bundle_id=jp.allnew.glucosnap`. | Same-day `appagent_list_apps` capture returned `6759076419`. | User brief does not mark this app as rejected, so live review truth is deferred to Phase 3. | Still blocked by legacy legal hosting and stale creatives. |
| `weightsnap` | `/Users/masa/Development/projects/WeightSnap` exists in the local repo scan. | `landing-apps.generated.json` has `slug=weightsnap`, `bundle_id=jp.allnew.weightsnap`, and the already populated ASC id and App Store URL. | Local landing data already carries `6758825019`; same-day session context confirmed it. | User brief does not mark this app as rejected, so live review truth is deferred to Phase 3. | Still blocked by legacy legal hosting and stale creatives. |
| `waistvox` | `/Users/masa/Development/projects/WaistVox` exists in the local repo scan. | `landing-apps.generated.json` has `slug=waistvox` and `bundle_id=jp.allnew.waistvox`. | Same-day `appagent_list_apps` capture returned `6759076494`. | User brief does not mark this app as rejected, so live review truth is deferred to Phase 3. | Still blocked by legacy legal hosting and stale creatives. |
| `pupweight` | `/Users/masa/Development/projects/PupWeight` exists in the local repo scan. | `landing-apps.generated.json` has `slug=pupweight` and `bundle_id=jp.allnew.pupweight`. | Same-day `appagent_list_apps` capture returned `6759076505`. | User brief does not mark this app as rejected, so live review truth is deferred to Phase 3. | Still blocked by legacy legal hosting and stale creatives, but the pet-focused positioning may make it a later-wave outlier. |

## Known Drift Cases

- `OxiVox` versus `OxiSnap`: the repo directory is `OxiVox`, but the landing slug and public name are `OxiSnap`. Phase 1 resolves this by using `oxisnap` as the canonical app key and preserving `OxiVox` as a repo alias.
- `BloodPressureSnap` versus `BPSnap`: the repo directory and landing slug use `bloodpressuresnap`, but the public display name is `BPSnap`. Phase 1 resolves this by using `bpsnap` as the canonical app key while preserving `bloodpressuresnap` as the existing slug and repo alias.

## Known Gaps

- Live ASC review states, reviewer notes, and version-level status are not trusted yet. Phase 3 must replace the current placeholders with a fresh ASC audit.
- During Phase 1 execution, the live AppAgent MCP transport was closed. The inventory therefore uses the same-day session capture that had already recorded the 9 ASC ids.
- Legal URL evidence still needs per-app file and route inspection in Phase 2. The current baseline comes from the user brief plus the presence of allnew-apps landing slugs.

## BOTTO Note

BOTTO exists under `/Users/masa/Development/projects/allnew-apps/botto` and is intentionally excluded from the target inventory. It is the reference implementation for Phase 2 legal-page migration to `apps.allnew.work`.
