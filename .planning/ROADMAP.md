# Roadmap: Agent Governance Platform (agentgov)

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-15) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Production Readiness** — Phases 5-7 (shipped 2026-03-15) — [archive](milestones/v1.1-ROADMAP.md)
- 🚧 **v1.2 Developer Experience** — Phases 8-9 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-03-15</summary>

- [x] Phase 1: Budget Engine + Proxy Foundation (3/3 plans) — completed 2026-03-13
- [x] Phase 2: HITL + Approval Channels (2/2 plans) — completed 2026-03-13
- [x] Phase 3: Error Handling + Production Hardening (2/2 plans) — completed 2026-03-14
- [x] Phase 4: Dashboard + Python SDK + Self-Host (3/3 plans) — completed 2026-03-15

</details>

<details>
<summary>✅ v1.1 Production Readiness (Phases 5-7) — SHIPPED 2026-03-15</summary>

- [x] Phase 5: Provider Completeness (2/2 plans) — completed 2026-03-15
- [x] Phase 6: Python Async SDK + Budget CRUD (2/2 plans) — completed 2026-03-15
- [x] Phase 7: Cloudflare Workers Production Deploy (1/1 plan) — completed 2026-03-15

</details>

### 🚧 v1.2 Developer Experience (In Progress)

**Milestone Goal:** OSS公開に必要なドキュメントとCI/CDを整備し、開発者が発見→理解→導入→貢献できる状態にする

- [x] **Phase 8: Documentation + Legal + Changelog** - README.md全セクション、MIT LICENSE、CHANGELOG.mdを揃えてOSS公開可能な状態にする (completed 2026-03-16)
- [ ] **Phase 9: GitHub Actions CI** - push/PRで lint + test が自動実行される CI パイプラインを確立する

## Phase Details

### Phase 8: Documentation + Legal + Changelog
**Goal**: 開発者がリポジトリを訪問して問題理解→導入→デプロイまで完結できる公開ドキュメント一式が揃っている
**Depends on**: Phase 7 (all prior v1.1 code is the subject of documentation)
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, LEGAL-01, CHLOG-01
**Success Criteria** (what must be TRUE):
  1. A developer visiting the repository can read the problem statement, understand the solution, and run the Quick Start without any prior knowledge of agentgov
  2. The README contains an architecture diagram section showing the Proxy + SDK + Dashboard composition and a provider compatibility table (OpenAI / Anthropic / Gemini)
  3. The README contains working code examples for both TypeScript and Python SDK usage
  4. The README contains step-by-step deploy instructions for both Docker Compose and Cloudflare Workers
  5. A LICENSE file (MIT) exists at the repository root, and CHANGELOG.md records v1.0 and v1.1 history in Keep a Changelog format
**Plans:** 2/2 plans complete

Plans:
- [ ] 08-01-PLAN.md — README.md: Quick Start, architecture diagram, provider table, SDK examples, deploy instructions
- [ ] 08-02-PLAN.md — LICENSE (MIT) + CHANGELOG.md (v1.0 + v1.1 history in Keep a Changelog format)

### Phase 9: GitHub Actions CI
**Goal**: すべての push と PR で lint と test が自動実行され、コードベースの健全性が継続的に検証される
**Depends on**: Phase 8
**Requirements**: CI-01, CI-02
**Success Criteria** (what must be TRUE):
  1. Opening a pull request or pushing to any branch triggers a CI run that executes lint checks automatically
  2. Opening a pull request or pushing to any branch triggers a CI run that executes the full test suite (172+ tests) automatically
  3. A failing lint or test causes the CI check to report failure, visible on the GitHub PR status
**Plans**: TBD

Plans:
- [ ] 09-01: GitHub Actions workflows — lint + test automation

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1. Budget Engine + Proxy Foundation | v1.0 | 3/3 | Complete | 2026-03-13 |
| 2. HITL + Approval Channels | v1.0 | 2/2 | Complete | 2026-03-13 |
| 3. Error Handling + Production Hardening | v1.0 | 2/2 | Complete | 2026-03-14 |
| 4. Dashboard + Python SDK + Self-Host | v1.0 | 3/3 | Complete | 2026-03-15 |
| 5. Provider Completeness | v1.1 | 2/2 | Complete | 2026-03-15 |
| 6. Python Async SDK + Budget CRUD | v1.1 | 2/2 | Complete | 2026-03-15 |
| 7. Cloudflare Workers Production Deploy | v1.1 | 1/1 | Complete | 2026-03-15 |
| 8. Documentation + Legal + Changelog | 2/2 | Complete    | 2026-03-16 | - |
| 9. GitHub Actions CI | v1.2 | 0/1 | Not started | - |

**Total:** 9 phases, 18 plans, 37 requirements
