# EECOM — History

## Project Context
- **Project:** FastSaaS — Next-gen Microsoft Commercial Marketplace SaaS accelerator
- **Stack:** Node.js 22, TypeScript, PostgreSQL + Prisma, REST APIs
- **Key concerns:** Azure Marketplace integration, subscription lifecycle, multi-tenancy, metering
- **User:** dkirby-ms

## Current Work (Phase 1.5)
**Partner Center Integration (#97)** — Implementing Fulfillment Operations API for subscription resolve/acknowledge/update operations.


## Recent Sessions Summary
- **2026-06-01 to 2026-06-06:** Marketplace OAuth, Product Ingestion, marketplace linking, feature entitlements design. See history-archive.md for detailed session logs.

## 2026-06-07 — Feature Entitlements System Implementation

### Issues Completed
1. **#147: Feature Definitions Table** — Designed `feature_definitions` as global reference table (no tenant_id, no RLS). Implemented Prisma model with Kysely repository (no RLS wrapper). Migration `20260607T154900_feature_definitions.ts` with idempotent seed. InMemoryFeatureDefinitionRepository for tests.

2. **#148: planFeatureGateService Wiring** — Fixed 404 on feature gate routes. Root cause: `planFeatureGateService` never wired in server.ts. Applied minimal fix: imported repositories/service, added `createPlanFeatureGateRepository()` factory, instantiated in `bootstrap()`, passed to `createApp()`. Validation: typecheck ✓, tests ✓ (168 passed, 2 skipped, 26 todo), build ✓.

3. **#151: GET /v1/features Endpoint** — Implemented endpoint returning all plan feature gates. Uses `PlanFeatureGateService.listFeatures()` already in place. Wiring fix unblocked this.

### Bug Fixes
1. **publisher_plan_repository.ts JSON.stringify** — Fixed plan creation failure. Features array not JSON-stringified for JSONB column. Applied fix in repository insert logic.

2. **migrator.ts Missing Migrations** — Fixed missing 3 migrations from static registry:
   - `plan_feature_gates`
   - `remove_price_monthly`
   - `feature_definitions`
   Migrations were in codebase but not registered; re-registered for future deploys.

### Architecture
- Global feature registry (no tenant isolation)
- `requireFeature` middleware composes after `authorizeRoute` (RBAC → plan gate ordering)
- No feature state in JWT; live query on every check
- InMemoryPlanFeatureGateRepository for degraded mode (no database)

### Status
All backend infrastructure live and tested. Feature gates queryable, routes responding 200. Ready for portal integration.

## 2026-06-07 — Dark Mode Premium Gate (#155)

### Issue Completed
**#155: dark-mode gated to premium-1 plan** — Created seed migration `20260607T180000_seed_premium1_dark_mode` that:
- Inserts a `publisher_plans` row for `premium-1` with `publisher_tenant_id = ENTRA_TENANT_ID ?? 'publisher'`
- Inserts a `plan_feature_gates` row for `(publisher_tenant_id, 'premium-1', 'dark-mode', enabled=true)`
- Uses `ON CONFLICT DO NOTHING` for idempotency
- Uses `SET LOCAL app.bypass_rls = 'true'` to bypass FORCE RLS within the migration's implicit transaction (no nested `db.transaction()` — Kysely passes a Transaction to `up()`, not a Kysely instance)

### Learnings

1. **Kysely migration `up()` receives a Transaction, not a Kysely instance** — Calling `db.transaction().execute(...)` inside a migration throws "calling the transaction method for a Transaction is not supported". Use `sql` template or repository methods directly on `db`.

2. **FORCE RLS in migrations** — `publisher_plans` and `plan_feature_gates` have `FORCE ROW LEVEL SECURITY`. Migration user is `NOSUPERUSER`, subject to RLS. To bypass for seed inserts: `await sql\`SET LOCAL app.bypass_rls = 'true'\`.execute(db)` — this works because the app's RLS policy checks `app.bypass_rls` setting, and `SET LOCAL` scopes it to the current transaction.

3. **`publisher_tenant_id` in seed migrations** — Use `process.env.ENTRA_TENANT_ID ?? 'publisher'` as the single-publisher sentinel. This is safe and idiomatic for single-publisher deployments.

4. **`findEnabledByPlanAndKey` bypasses RLS** — This method (used by `hasFeature`) works for any `publisher_tenant_id` value since it uses `bypassRls: true`. The seed migration just needs to ensure the row exists for the correct `plan_id` and `feature_key`.

5. **Mock API (`packages/portal/lib/mock-api.ts`)** — Has no handler for `GET /v1/features`; returns an empty array (graceful degradation in portal). No change needed for feature gating.

6. **Key file paths:**
   - Migration: `packages/api/src/db/migrations/20260607T180000_seed_premium1_dark_mode.ts`
   - Migrator registry: `packages/api/src/db/migrator.ts`
   - Tests: `packages/api/src/__tests__/feature-entitlements.test.ts` (Section 5)
   - Portal layout (feature fetch): `packages/portal/app/(portal)/layout.tsx`

### Status
Draft PR #157 open. typecheck ✓, 195 tests passed, build ✓.
