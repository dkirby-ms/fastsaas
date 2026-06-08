# Kranz — History

## Project Context
- **Project:** FastSaaS — Next-gen Microsoft Commercial Marketplace SaaS accelerator
- **Stack:** Node.js 22, TypeScript, Next.js + React + Tailwind, PostgreSQL + Prisma, Turborepo monorepo
- **Deployment:** Azure Container Apps (default), App Service migration path
- **User:** dkirby-ms
- **Design doc:** `docs/design-document.md`

## 2026-05-29 to 2026-05-30 Session Summary

Completed comprehensive Phase 1 review cycle:
- **PR Reviews:** #6, #7, #8, #9, #10 (all initially rejected, all approved after team fixes)
- **Pattern Enforcement:** Infrastructure toggle bidirectionality, auth/token production alignment, marketplace API v2 compliance, webhook security, idempotency, durability
- **Issue Triage:** Created squad routing labels and assigned Phase 1 issues to squads
- **Infrastructure:** Approved PR #14 (Bicep dependency fixes), PR #24 (optional private endpoints), PR #28 (staging bootstrap fix with region optimization and Redis workaround)
- **Team Skill:** Defined Team Commentary Skill for lightweight cross-agent sharing of findings

See `.squad/agents/kranz/history-archive.md` for detailed 2026-05-29 and 2026-05-30 session notes.


## Recent Sessions Summary
- **2026-05-29 to 2026-06-03:** Phase 1.5 infrastructure, PR reviews, tenant isolation, publisher admin routes, asset visibility. See history-archive.md for details.

## 2026-06-07 — Feature Entitlements Architecture & Issue #131 Scoping

### Session Activities
1. **Alignment Update** — Updated `.squad/identity/now.md` and `.squad/decisions.md` to reflect current state (Phase 1 complete, 2 open issues). Documented architecture invariants (single-publisher model, OAuth scope separation, JWT webhook auth, shared types in @fastsaas/shared, server-side portal subscription gate).

2. **Feature Entitlements Architecture Design** — Designed orthogonal plan-gate ⊥ RBAC model with global `feature_definitions` registry, `requireFeature` middleware composing after `authorizeRoute`, 60s portal TTL, no feature state in JWT. Specified 4 demo features (dark-mode, advanced-analytics, export-csv, custom-webhooks) with full conditional rendering and upgrade prompts.

3. **Issue #131 Scoping** — Evaluated 3 options for "customer-deployed resources" (Option A: self-reporting, Option B: Resource Graph sync, Option C: managed apps). Recommended Phase 1 Option A (customer_resources table with CRUD API), Phase 2 Option B (Lighthouse + sync). Assigned to EECOM + FIDO. Included IP protection analysis.

4. **PR #153 Review** — Approved Coordinator's PR merging 6 feature entitlements issues (#147–#152).

### Key Decisions Documented
- Feature entitlements are orthogonal to RBAC (both axes must pass)
- No mocks for features in portal — always use real API
- Portal feature TTL: 60s revalidate (upgrades reflected within 60s)
- No feature state in JWT; query live on every check
- Removed all mock feature gates from codebase

### Status
All documentation updated, architecture design finalized, Issue #131 scoped with recommendation ready for team review.

## 2026-06-07 — PR #157 Review (Issue #155: Dark Mode Premium Gate)

### Reviewed
PR `squad/155-dark-mode-premium-gate` — seeds `dark-mode` feature gate for `premium-1` plan via Kysely migration.

**Migration (`20260607T180000_seed_premium1_dark_mode.ts`):**
- Inserts `publisher_plans` row first (FK parent), then `plan_feature_gates` row — correct FK dependency order
- Both inserts idempotent via `ON CONFLICT DO NOTHING` (no conflict target needed; composite PK catches all violations)
- `ENTRA_TENANT_ID?.trim() ?? 'publisher'` is the correct single-publisher tenant ID pattern
- `SET LOCAL app.bypass_rls = 'true'` correctly scoped to Kysely transaction — both tables have `FORCE ROW LEVEL SECURITY`, bypass required for seed inserts
- `down()` mirrors `up()` with same RLS bypass, deletes in reverse FK order
- Registered as last entry in migrator's `MIGRATIONS` map

**Tests (Section 5, `feature-entitlements.test.ts`):**
- 4 tests: premium-1 has dark-mode, plan-starter/plan-basic/plan-free don't, both `listFeaturesForTenant` and `hasFeature` paths exercised
- Fresh deps + randomized IDs per test — no cross-contamination

**Validation:**
- `typecheck` ✅ clean
- `test` ✅ 195 passed, 0 failed
- `build` ✅ clean

### Verdict
**APPROVED.** Left approval comment on PR (GitHub blocked formal approval — same-actor restriction). Mergeable as-is.

## Learnings
- Seed migrations into RLS-protected tables require `SET LOCAL app.bypass_rls = 'true'` — this sets the pattern for all future seed migrations into `publisher_plans` or `plan_feature_gates`.
- `ON CONFLICT DO NOTHING` without explicit conflict target is safe for composite PKs in PostgreSQL.
- Seed migration must insert FK parent (`publisher_plans`) before child (`plan_feature_gates`).
