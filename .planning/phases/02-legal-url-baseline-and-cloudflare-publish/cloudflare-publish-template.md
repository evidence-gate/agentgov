# Cloudflare Publish Template

## Active Brownfield Pattern

The active legal and support surface for `apps.allnew.work` is Cloudflare Pages, not GitHub Pages and not a Workers-only site rewrite.

- Deploy path: `projects/allnew-apps/.github/workflows/deploy.yml`
- Deploy command: `pages deploy . --project-name=allnew-apps`
- Trigger: push to `main`
- Build model: no build step; the repository root is deployed as static content
- URL model: static folder path equals public URL path, so `<slug>/index.html` becomes `https://apps.allnew.work/<slug>/`

## BOTTO Reference

BOTTO is the reference implementation for the final legal-page shape.

- Source file: `projects/allnew-apps/botto/index.html`
- Pattern: one self-contained static page per app directory
- Sections in the same page: FAQ, Privacy, Terms, Specified Commercial Transactions Act, and Contact
- Localization shape: `?lang=ja` or `?lang=en` entry plus hash anchors like `#privacy-ja`, `#terms-en`, `#commercial-ja`, `#contact-en`
- Operational rule: prefer the BOTTO-style self-contained `<slug>/index.html` page over the older shared `ja/privacy.html?app=<slug>` system

## Shared Legacy Layer

The repo still contains shared legal pages driven by `projects/allnew-apps/app-data.js`.

- Shared files: `ja/privacy.html`, `ja/terms.html`, `ja/tokusho.html`, `en/privacy.html`, `en/terms.html`, `en/legal-notice.html`
- Data source: `app-data.js`
- Historical URL shape: `.../ja/privacy.html?app=weightsnap`
- Current recommendation: keep this layer documented as legacy fallback only; do not choose it for the target migration when a per-app page already exists

## Required Source Files Per App

For each migrated app, verify these source surfaces.

- `projects/allnew-apps/<slug>/index.html`
- `projects/allnew-apps/data/landing-apps.generated.json`
- `projects/allnew-apps/landing-automation/config/app_catalog.json` if the landing catalog needs regeneration
- `projects/allnew-apps/landing-automation/cloudflare-worker/config/app_slug_map.json` if ASC-to-slug mapping is required for automation
- `projects/allnew-apps/_headers` for response-header policy

## Header And Cache Baseline

The current Cloudflare Pages deployment already applies shared headers via `projects/allnew-apps/_headers`.

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy` allows self-hosted content plus Google Fonts and Vercel Insights

Per-page HTML such as BOTTO also retains meta-based CSP, referrer, and noindex rules. Do not remove these without a documented reason.

## Canonical URL Conventions

Use these final URL conventions for the 9-app migration.

- Support URL: `https://apps.allnew.work/<slug>/?lang=ja`
- Marketing URL: `https://apps.allnew.work/<slug>/?lang=ja`
- Privacy JA: `https://apps.allnew.work/<slug>/?lang=ja#privacy-ja`
- Privacy EN: `https://apps.allnew.work/<slug>/?lang=en#privacy-en`
- Terms JA: `https://apps.allnew.work/<slug>/?lang=ja#terms-ja`
- Terms EN: `https://apps.allnew.work/<slug>/?lang=en#terms-en`
- Tokusho JA: `https://apps.allnew.work/<slug>/?lang=ja#commercial-ja`

## Publish Runbook

1. Confirm the app has a self-contained `projects/allnew-apps/<slug>/index.html` page.
2. Confirm `landing-apps.generated.json` points `support_path` at `<slug>/?lang=ja`.
3. If landing automation is in scope, keep `app_catalog.json` and `app_slug_map.json` aligned with the final slug and `asc_app_id`.
4. Push the `allnew-apps` repo to `main`, which triggers `deploy.yml`.
5. Verify the live `apps.allnew.work/<slug>/` endpoints before any Phase 4 metadata replacement.

## Validation Aids

- `projects/allnew-apps/landing-automation/scripts/validate_app_readiness.py` checks catalog, slug map, onboarding image, and `<slug>/index.html`.
- `projects/allnew-apps/landing-automation/docs/new-app-onboarding.md` still mentions GitHub Pages in places; treat that as stale documentation because the live workflow is Cloudflare Pages.
- `projects/allnew-apps/landing-automation/runtime/landing-runtime.js` appends the active `lang` to `support_path` links surfaced on the landing experience.

## Decision Rule For This Portfolio

For this portfolio, the target operating model is:

- keep Cloudflare Pages as-is
- use one self-contained `/<slug>/index.html` page per app
- treat the shared `ja/` and `en/` legal pages as legacy support only
- never promote a target URL into App Store metadata until the live custom-domain verification passes
