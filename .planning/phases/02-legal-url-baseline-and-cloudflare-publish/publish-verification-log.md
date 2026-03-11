# Publish Verification Log

## Execution Notes

- Verification date: 2026-03-11
- Verification run: `.planning/phases/02-legal-url-baseline-and-cloudflare-publish/live-verification.json`
- Browser standard: Playwright with `headless: true`
- Screenshot root: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/`
- Normalize/deploy status: no source edits were required in `projects/allnew-apps`; the existing Cloudflare Pages deployment already served the target `apps.allnew.work/<slug>/` pages for all 9 apps

## babyvox

- Support URL: `https://apps.allnew.work/babyvox/?lang=ja`
- HTTP status: `200`
- Redirect behavior: direct hit on the final custom-domain URL, no legacy redirect hop
- Canonical check: `canonical_absent_but_no_legacy_reference`
- Content check: passed; app name and `privacy`, `terms`, `commercial`, and `contact` anchors were present
- Screenshot: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/babyvox-home-2026-03-11T04-07-36-378Z.png`
- Privacy screenshot: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/babyvox-privacy-2026-03-11T04-07-36-378Z.png`
- Result: pass
- Blockers: none on the public Cloudflare surface; Phase 4 still needs to replace GitHub Pages references in store-facing metadata

## oxisnap

- Support URL: `https://apps.allnew.work/oxisnap/?lang=ja`
- HTTP status: `200`
- Redirect behavior: direct hit on the final custom-domain URL, no legacy redirect hop
- Canonical check: `canonical_absent_but_no_legacy_reference`
- Content check: passed; app name and `privacy`, `terms`, `commercial`, and `contact` anchors were present
- Screenshot: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/oxisnap-home-2026-03-11T04-07-36-378Z.png`
- Privacy screenshot: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/oxisnap-privacy-2026-03-11T04-07-36-378Z.png`
- Result: pass
- Blockers: none on the public Cloudflare surface; Phase 4 still needs to replace the legacy `oxivox` slug in app-facing metadata and code

## coughwav

- Support URL: `https://apps.allnew.work/coughwav/?lang=ja`
- HTTP status: `200`
- Redirect behavior: direct hit on the final custom-domain URL, no legacy redirect hop
- Canonical check: `canonical_absent_but_no_legacy_reference`
- Content check: passed; app name and `privacy`, `terms`, `commercial`, and `contact` anchors were present
- Screenshot: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/coughwav-home-2026-03-11T04-07-36-378Z.png`
- Privacy screenshot: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/coughwav-privacy-2026-03-11T04-07-36-378Z.png`
- Result: pass
- Blockers: none on the public Cloudflare surface; Phase 4 still needs to replace GitHub Pages references in store-facing metadata

## thermosnap

- Support URL: `https://apps.allnew.work/thermosnap/?lang=ja`
- HTTP status: `200`
- Redirect behavior: direct hit on the final custom-domain URL, no legacy redirect hop
- Canonical check: `canonical_absent_but_no_legacy_reference`
- Content check: passed; app name and `privacy`, `terms`, `commercial`, and `contact` anchors were present
- Screenshot: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/thermosnap-home-2026-03-11T04-07-36-378Z.png`
- Privacy screenshot: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/thermosnap-privacy-2026-03-11T04-07-36-378Z.png`
- Result: pass
- Blockers: none on the public Cloudflare surface; Phase 4 still needs to replace the legacy `thermometersnap` slug in app-facing metadata and code

## bpsnap

- Support URL: `https://apps.allnew.work/bloodpressuresnap/?lang=ja`
- HTTP status: `200`
- Redirect behavior: direct hit on the final custom-domain URL, no legacy redirect hop
- Canonical check: `canonical_absent_but_no_legacy_reference`
- Content check: passed; app name and `privacy`, `terms`, `commercial`, and `contact` anchors were present
- Screenshot: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/bpsnap-home-2026-03-11T04-07-36-378Z.png`
- Privacy screenshot: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/bpsnap-privacy-2026-03-11T04-07-36-378Z.png`
- Result: pass
- Blockers: none on the public Cloudflare surface; Phase 4 still needs to replace the legacy `bpsnap` slug in store-facing metadata

## glucosnap

- Support URL: `https://apps.allnew.work/glucosnap/?lang=ja`
- HTTP status: `200`
- Redirect behavior: direct hit on the final custom-domain URL, no legacy redirect hop
- Canonical check: `canonical_absent_but_no_legacy_reference`
- Content check: passed; app name and `privacy`, `terms`, `commercial`, and `contact` anchors were present
- Screenshot: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/glucosnap-home-2026-03-11T04-07-36-378Z.png`
- Privacy screenshot: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/glucosnap-privacy-2026-03-11T04-07-36-378Z.png`
- Result: pass
- Blockers: none on the public Cloudflare surface; Phase 4 still needs to replace GitHub Pages references in store-facing metadata and app code

## weightsnap

- Support URL: `https://apps.allnew.work/weightsnap/?lang=ja`
- HTTP status: `200`
- Redirect behavior: direct hit on the final custom-domain URL, no legacy redirect hop
- Canonical check: `canonical_absent_but_no_legacy_reference`
- Content check: passed; app name and `privacy`, `terms`, `commercial`, and `contact` anchors were present
- Screenshot: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/weightsnap-home-2026-03-11T04-07-36-378Z.png`
- Privacy screenshot: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/weightsnap-privacy-2026-03-11T04-07-36-378Z.png`
- Result: pass
- Blockers: none on the public Cloudflare surface; Phase 4 still needs to replace GitHub Pages references in store-facing metadata and app code

## waistvox

- Support URL: `https://apps.allnew.work/waistvox/?lang=ja`
- HTTP status: `200`
- Redirect behavior: direct hit on the final custom-domain URL, no legacy redirect hop
- Canonical check: `canonical_absent_but_no_legacy_reference`
- Content check: passed; app name and `privacy`, `terms`, `commercial`, and `contact` anchors were present
- Screenshot: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/waistvox-home-2026-03-11T04-07-36-378Z.png`
- Privacy screenshot: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/waistvox-privacy-2026-03-11T04-07-36-378Z.png`
- Result: pass
- Blockers: none on the public Cloudflare surface; Phase 4 still needs to replace GitHub Pages references in store-facing metadata and app code

## pupweight

- Support URL: `https://apps.allnew.work/pupweight/?lang=ja`
- HTTP status: `200`
- Redirect behavior: direct hit on the final custom-domain URL, no legacy redirect hop
- Canonical check: `canonical_absent_but_no_legacy_reference`
- Content check: passed; app name and `privacy`, `terms`, `commercial`, and `contact` anchors were present
- Screenshot: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/pupweight-home-2026-03-11T04-07-36-378Z.png`
- Privacy screenshot: `/Users/masa/Development/projects/allnew-apps/debug/screenshots/pupweight-privacy-2026-03-11T04-07-36-378Z.png`
- Result: pass
- Blockers: none on the public Cloudflare surface; Phase 4 still needs to replace GitHub Pages references in store-facing metadata and app code
