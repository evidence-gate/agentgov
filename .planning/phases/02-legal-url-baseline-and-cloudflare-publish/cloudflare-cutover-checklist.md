# Cloudflare Cutover Checklist

Use this checklist before any Phase 4 URL replacement is allowed.

## Required Status Labels

- `published_but_not_verified`: the page exists or a deploy ran, but live checks are incomplete
- `cutover_ready`: all HTTP, content, and canonical checks passed on the final custom domain

## Per-App Checks

For each app, check the support URL plus the legal anchors listed in `legal-url-matrix.csv`.

1. Custom-domain check
   - Confirm the live URL is under `https://apps.allnew.work/<slug>/`
   - Confirm the target slug matches the Phase 1 canonical app key mapping

2. HTTP status check
   - `GET` and browser navigation must return `HTTP 200`
   - Redirect chains must not touch `github.io`, `mueno.github.io`, or any temporary preview hostname

3. Canonical check
   - If a canonical link tag exists, it must point to the final `apps.allnew.work` URL
   - If no canonical tag exists, record `canonical_absent_but_no_legacy_reference` and verify the final URL remains stable after load

4. Content-marker check
   - Page title must contain the app display name
   - The page must expose the Privacy, Terms, Tokusho, and Contact sections
   - The section anchors `#privacy-ja`, `#privacy-en`, `#terms-ja`, `#terms-en`, and `#commercial-ja` must be reachable when applicable

5. Legacy-leakage check
   - No visible link or redirect may reference GitHub Pages for support, privacy, or marketing
   - No visible contact block may use an obsolete domain or obsolete support mailbox

6. Evidence capture check
   - Save headless browser screenshots under `projects/allnew-apps/debug/screenshots/`
   - Save failure screenshots under `projects/allnew-apps/debug/errors/`
   - Record HTTP evidence and screenshot paths in `publish-verification-log.md`

## Playwright Evidence Standard

- Browser automation must use Playwright with `headless: true`
- Capture at least one top-of-page screenshot and one legal-section screenshot per app
- If an anchor jump is used, capture the final scrolled state after navigation

## Failure Handling

- If HTTP is not `200`, mark the row `published_but_not_verified`
- If the slug or alias is wrong, keep `safe_for_phase_4=no` even if the page renders
- If any legacy GitHub Pages URL appears in the redirect chain or visible content, the app is not `cutover_ready`
- If canonical behavior is unclear, keep the app blocked and record the ambiguity explicitly

## Evidence Recording Location

- Human-readable log: `.planning/phases/02-legal-url-baseline-and-cloudflare-publish/publish-verification-log.md`
- Machine-readable gate set: `.planning/phases/02-legal-url-baseline-and-cloudflare-publish/cutover-ready-url-set.csv`

## Cutover-Ready Decision

An app may be marked `cutover_ready` only when all of the following are true.

- final custom-domain URL is correct
- HTTP 200 is confirmed
- canonical behavior is clean
- expected content markers exist
- no GitHub Pages leakage remains
- screenshot and HTTP evidence are recorded
