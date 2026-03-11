# Stack Research

**Domain:** Brownfield App Store portfolio remediation and release-readiness operations for existing iOS apps
**Researched:** 2026-03-11
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Cloudflare Workers Static Assets + custom domain routing | Workers runtime pinned by `compatibility_date` (`2026-02-12` or newer verified date) | Host legal/support documents on `apps.allnew.work`, preserve stable URLs, and add redirect logic where needed | Cloudflare now supports code + static assets as one deploy unit with global caching. That fits a brownfield legal-doc migration better than keeping a split Pages + custom logic setup. | High |
| Wrangler CLI | 4.x | Deploy, route, configure, tail logs, and manage secrets for the legal-doc Worker | It is the official control plane for Workers assets/routing and matches the existing Cloudflare ops skill workflow (`secret put`, `deploy`, `tail`). | High |
| App Store Listing Director + appagent-mcp | Director skill `3.0.0` + current workspace MCP | API-first ASC audit, pull, remediation, push, screenshot upload, preview upload, and pre-submit checks | This is already the local portfolio-ready ASC workflow. It scales across multiple existing apps and keeps browser automation limited to Apple fields the API cannot operate. | High |
| Figma Desktop + `figma-llm-max-bridge` | Bridge `1.0.0` | Figma-based creative production, batch edits, export automation, and reusable frame composition | The bridge gives real canvas editing and export control through the local plugin/API path. That is materially better than manual per-frame work for a 9-app brownfield portfolio. | High |
| GitHub Projects | Cloud service (2026 feature set) | Portfolio tracking across apps, workstreams, blockers, owners, target dates, and evidence URLs | Projects supports custom fields, board/table/roadmap views, templates, and insights while staying close to issues/PRs and remediation evidence. That keeps release-readiness visible next to the actual work. | Medium-High |
| Node.js | `22.22.0` LTS | Shared runtime for Workers tooling, Figma bridge scripts, Playwright compositor, and validation utilities | Using one current LTS runtime across Cloudflare, Figma, and Playwright reduces operational drift and simplifies brownfield maintenance. | High |

### Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| `playwright` | `1.57.0` | Headless browser automation for screenshot compositing, browser-only ASC checks, and evidence capture | Use for all browser automation on macOS. Keep `headless: true`, save screenshots on important steps, and use it as the default browser automation layer. | High |
| `@playwright/test` | `1.57.0` | Visual regression and deterministic screenshot QA | Use when comparing new App Store creatives against approved baselines before upload or before broad portfolio rollout. | High |
| `hono` | 4.x | Thin routing layer on Workers for locale routing, old URL redirects, and health/version endpoints | Use only if the Cloudflare legal-doc host needs logic beyond pure static asset serving. Skip it if asset-first routing alone is enough. | Medium |
| `zod` | 4.x | Schema validation for legal-doc manifests, portfolio status payloads, and creative handoff JSON | Use when importing app matrices, per-app remediation manifests, or Figma/export metadata so drift is caught before deploy or push. | High |
| `@cloudflare/workers-types` | 4.x-aligned | Type support for Worker code and route handlers | Use if the legal-doc host is implemented in TypeScript. Keep it aligned with the Wrangler major version in the repo. | Medium-High |

### Development Tools

| Tool | Purpose | Notes | Confidence |
|------|---------|-------|------------|
| `app-preview-compositor` | Turn HTML/CSS templates into App Store screenshot masters | Local package version is `1.0.0` and already pins `playwright@1.57.0`. Use a 6.7-inch master set and let ASC scale down when possible. | High |
| `figma-llm-max-bridge` CLI | Query, edit, tag, and export Figma frames in batches | Run the bridge on `http://localhost:3210`, use the `codex-claude-max` channel, and load fonts before text edits. Keep it localhost-only. | High |
| `wrangler deploy` / `wrangler tail` / `wrangler secret put` | Deploy and verify Cloudflare legal-doc hosting changes | Follow the Cloudflare ops rule: change one variable at a time, deploy, then verify with direct requests and logs. | High |
| `appstore_video_*` MCP tools | Produce App Store preview videos when a preview materially helps conversion or review readiness | Optional, not baseline. Lock the screenshot narrative first, then add previews only for apps where motion explains value better than static frames. | Medium-High |
| GitHub Project templates + Insights | Reuse a common portfolio board and generate rollups | Define custom fields such as `App`, `Track`, `ASC Status`, `Legal Host`, `Creative Status`, `Risk`, `Owner`, `Evidence URL`, and `Target Date`. | Medium-High |
| `appagent-mcp` live checks | Read back ASC state after edits and uploads | Use this instead of trusting upload success alone. Completion should mean the live ASC state is consistent, not just that a command returned success. | High |

## Installation

```bash
# Assumes Node.js 22 LTS

# Cloudflare legal-doc host
npm install hono zod
npm install -D wrangler @cloudflare/workers-types typescript

# Browser automation and creative QA
npm install playwright @playwright/test

# Existing local Figma bridge tool
cd /Users/masa/Development/tools/Figma連携/figma-llm-max-bridge
npm install
npm test

# Existing local App Store screenshot compositor
cd /Users/masa/Development/mcp/app-store-director/scripts/composite
npm install
npx playwright install chromium
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative | Confidence |
|-------------|-------------|-------------------------|------------|
| Cloudflare Workers Static Assets | Cloudflare Pages | Only if the site already lives on Pages, has no redirect or Worker logic requirements, and the migration itself would create unnecessary delivery risk in the current cycle. | High |
| GitHub Projects | Linear | Use Linear only if portfolio planning already lives there organization-wide and code/review evidence is secondary. For repo-coupled brownfield remediation, GitHub Projects stays closer to execution. | Medium |
| Figma bridge automation | Manual Figma-only production | Use manual-only editing for final visual polish of one or two locked frames, not as the primary production system for a portfolio. | High |
| App Store Listing Director + appagent-mcp | Raw ASC Web UI / Playwright-first scripts | Use browser-only flow exclusively for Apple fields the API cannot manage or for explicitly human-owned submission steps. | High |
| Hono on Workers | Pure asset-only Worker | Use pure asset-only hosting when the legal-doc site needs zero request logic. Add Hono only when redirects, health endpoints, or app-aware routing are actually required. | Medium |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Cloudflare Pages as the new default hosting target for this migration | It keeps the brownfield system split across more surfaces and works against Cloudflare's current direction toward Workers static assets for unified deploys. | Cloudflare Workers Static Assets, optionally with a thin Hono layer |
| ASC Web automation as the primary remediation path | It is brittle, harder to audit, and violates the local API-first operating model for portfolio work. Browser automation should be the exception, not the stack. | App Store Listing Director + appagent-mcp, with browser-only handling for non-operable Apple fields |
| Headed browser automation on macOS by default | It steals focus, interrupts other work, and violates the browser automation standard for this workspace. | Playwright with `headless: true` and saved screenshots |
| Manual Figma editing as the only creative workflow | It does not scale across 9 apps, makes copy/layout parity hard to maintain, and leaves a weak audit trail for revisions. | Structured brief -> Figma bridge batch edits -> Playwright export/QA |
| Spreadsheet or Notion as the only source of truth for portfolio status | Status drifts away from issues, PRs, screenshots, and legal evidence. Brownfield remediation needs evidence-linked tracking, not just a list of rows. | GitHub Projects backed by repo issues and evidence artifacts |
| A new React/Next.js SPA or CMS just to host legal pages | It adds rendering/runtime complexity to content that should stay stable, cacheable, and reviewable. That is the wrong tradeoff for release-readiness work. | Versioned static HTML/assets on Workers |
| KV/D1 as the primary storage for legal page bodies | Legal/support pages are mostly static and should be versioned in git. Database-backed content increases rollback and consistency risk for little benefit. | Markdown/HTML assets in repo, deployed through Workers |
| Direct HTML-only editing in the deployed legal host | It creates source drift between legal markdown, localized HTML, and ASC URLs. Brownfield compliance work needs a clear editable source of truth. | Markdown source + generated HTML + deployment pipeline |
| Rebuilding or replatforming the iOS apps as part of this program | This is a brownfield operations project. Rebuild work expands scope and delays the actual goal: make existing apps review-ready again. | Fix existing apps, legal docs, metadata, creatives, and submission settings in place |

## Stack Patterns by Variant

**If legal docs are mostly static but old GitHub Pages URLs must keep working:**
- Use Cloudflare Workers Static Assets with asset-first routing and a thin Hono redirect layer.
- Because brownfield migration needs stable URLs, locale handling, and selective redirect logic without turning the docs into a full app.

**If an app is already in `Rejected`, `Metadata Rejected`, or `Developer Rejected`:**
- Use App Store Listing Director + appagent pull/audit/push flow first, then browser-only steps for Apple fields outside API coverage.
- Because Apple allows screenshot and preview updates in those states, and API-first remediation is more repeatable than manual UI repair.

**If the workstream is creative refresh only:**
- Use simulator capture + Figma bridge + `app-preview-compositor` + `@playwright/test` visual baselines.
- Because the bottleneck is asset throughput and QA consistency, not a full metadata redesign.

**If leadership needs weekly portfolio rollups across all apps:**
- Use a GitHub Project template with saved board/table/roadmap views and required custom fields.
- Because you need both summary visibility and drill-down into the exact issue, PR, screenshot set, or legal evidence blocking release-readiness.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `node@22.22.0` | `wrangler@4.x`, `playwright@1.57.0`, `figma-llm-max-bridge@1.0.0` | Keep one Node LTS across Workers, creative tooling, and QA scripts. |
| Cloudflare Workers `compatibility_date >= 2026-02-12` | `wrangler@4.x` | Pin the compatibility date per deploy to avoid silent runtime drift. |
| `app-preview-compositor@1.0.0` | `playwright@1.57.0`, `@playwright/test@1.57.0` | This pairing already exists in the local compositor package. |
| `figma-llm-max-bridge@1.0.0` | Figma Desktop plugin manifest + local bridge on `http://localhost:3210` | Keep the bridge on localhost and treat font loading as mandatory before text mutation. |
| `App Store Listing Director@3.0.0` | current `appagent-mcp` workspace tooling | Treat it as the orchestration layer over the ASC API and upload tools, not as a promise that every Apple setting is API-operable. |
| `hono@4.x` | Cloudflare Workers Static Assets + `zod@4.x` | Good fit for redirect/health/manifests, but optional for a pure static docs host. |

## Sources

- `/Users/masa/gsd-workspace/.planning/PROJECT.md` - Portfolio scope, brownfield constraints, app list, and program objectives. Confidence: High.
- `/Users/masa/.codex/get-shit-done/templates/research-project/STACK.md` - Required structure for this research artifact. Confidence: High.
- `/Users/masa/Development/mcp/app-store-director/skills/appstore-listing/SKILL.md` - Current ASC workflow, API/browser boundary, screenshot pipeline, and pre-submit model. Confidence: High.
- `/Users/masa/.codex/skills/cloudflare-workers-ops-docs/SKILL.md` - Cloudflare Worker deploy, secret, and log-tail operating model. Confidence: High.
- `/Users/masa/.codex/skills/appstore-promo-director-ja/SKILL.md` - Creative orchestration flow and QA gate expectations. Confidence: High.
- `/Users/masa/Development/.claude/commands/figma-max-bridge.md` - Figma bridge setup, command catalog, and local security model. Confidence: High.
- `/Users/masa/Development/tools/Figma連携/figma-llm-max-bridge/package.json` - Local bridge version `1.0.0`. Confidence: High.
- `/Users/masa/Development/mcp/app-store-director/scripts/composite/package.json` - Local compositor version `1.0.0` and `playwright@1.57.0` dependency. Confidence: High.
- `/Users/masa/Development/IOS_APP_POLICY.md` - ASC metadata, compliance, legal-doc, and browser automation rules for the current iOS portfolio. Confidence: High.
- `https://developers.cloudflare.com/workers/static-assets/` - Unified code + assets deploy model, routing, and caching on Workers. Confidence: High.
- `https://developers.cloudflare.com/workers/static-assets/migration-guides/` - Official migration direction from Pages to Workers. Confidence: High.
- `https://developers.cloudflare.com/workers/wrangler/configuration/` - Current Wrangler config surface for assets and routing. Confidence: High.
- `https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots/` - Editable statuses, upload rules, and high-resolution auto-scaling behavior. Confidence: High.
- `https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/` - Apple screenshot specification source. Confidence: High.
- `https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects` - Projects fields, views, templates, workflows, and insights. Confidence: High.
- `https://docs.github.com/enterprise-cloud%40latest/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/changing-the-layout-of-a-view` - Board, table, and roadmap layout options. Confidence: High.
- `https://nodejs.org/en/about/previous-releases` - Node.js `22.22.0` in the LTS line. Confidence: High.
- `https://playwright.dev/docs/screenshots` - Screenshot capture capabilities for browser automation and creative export. Confidence: High.
- `https://playwright.dev/docs/test-snapshots` - Visual comparison model for deterministic creative QA. Confidence: High.
- `https://www.figma.com/plugin-docs/figma-ui-postmessage/` - Plugin UI to bridge communication model. Confidence: High.
- `https://www.figma.com/plugin-docs/figma-ui-onmessage/` - Plugin message handling model. Confidence: High.
- `https://developers.figma.com/docs/rest-api/` - Official Figma API boundary; useful as a complement, not a replacement, for canvas editing via plugin/bridge. Confidence: High.

---
*Stack research for: Brownfield App Store portfolio remediation and release-readiness operations for existing iOS apps*
*Researched: 2026-03-11*
