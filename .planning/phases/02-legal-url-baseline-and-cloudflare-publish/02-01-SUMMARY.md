# 02-01 Summary

## Completed

- Created `legal-url-matrix.csv` for all 9 target apps.
- Created `cloudflare-publish-template.md` based on the live `allnew-apps` Cloudflare Pages workflow and the BOTTO reference implementation.
- Created `cloudflare-cutover-checklist.md` to gate Phase 4 URL replacement on verified custom-domain evidence.

## Notes

- BOTTO confirms the target pattern is a self-contained `<slug>/index.html` page on Cloudflare Pages, not the older shared `ja/privacy.html?app=<slug>` flow.
- The matrix captures three classes of drift: legacy GitHub Pages, mixed GitHub Pages plus Cloudflare surfaces, and wrong-slug Cloudflare surfaces.

## Verification Targets

- `test "$(awk 'END {print NR-1}' .planning/phases/02-legal-url-baseline-and-cloudflare-publish/legal-url-matrix.csv)" = "9"`
- `rg -n 'apps\\.allnew\\.work' .planning/phases/02-legal-url-baseline-and-cloudflare-publish/legal-url-matrix.csv`
- `rg -n 'Cloudflare Pages|deploy.yml|BOTTO|app-data.js' .planning/phases/02-legal-url-baseline-and-cloudflare-publish/cloudflare-publish-template.md`
- `rg -n 'cutover_ready|GitHub Pages|canonical|HTTP 200' .planning/phases/02-legal-url-baseline-and-cloudflare-publish/cloudflare-cutover-checklist.md`
