# 01-02 Summary

## Completed

- Created `wave-control-board.csv` with rejected apps seeded ahead of the remaining portfolio.
- Created `evidence-tracker.json` as the single app-level tracker for Phases 2 through 6.
- Created `tracker-operating-rules.md` to define allowed states, evidence slots, and status discipline.

## Notes

- Wave 1 contains the five apps explicitly marked as rejected in the project brief.
- Wave 2 contains the reusable health-metric apps that should inherit the Wave 1 remediation pattern.
- Wave 3 contains the PupWeight outlier to keep the pet-focused copy and legal differences explicit.

## Verification Targets

- `test "$(awk 'END {print NR-1}' .planning/phases/01-portfolio-intake-and-wave-control/wave-control-board.csv)" = "9"`
- `jq -e '.apps | length == 9' .planning/phases/01-portfolio-intake-and-wave-control/evidence-tracker.json`
- `jq -e 'all(.apps[]; (.state == "not_started" or .state == "in_progress" or .state == "blocked" or .state == "submission_ready"))' .planning/phases/01-portfolio-intake-and-wave-control/evidence-tracker.json`
- `rg -n 'babyvox|oxisnap|coughwav|thermosnap|bpsnap' .planning/phases/01-portfolio-intake-and-wave-control/wave-control-board.csv`
