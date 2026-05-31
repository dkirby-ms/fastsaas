# EECOM Tenant RLS Rollout Decision

- **Date:** 2026-05-31T21:35:32.766+00:00
- **Owner:** EECOM
- **Context:** Issue #45 requires tenant middleware enforcement plus PostgreSQL row-level security for tenant-scoped backend data in `packages/api/`.
- **Decision:** Standardize tenant isolation on request-scoped execution context stored in `src/db/execution-context.ts`, propagating JWT-derived tenant IDs into PostgreSQL session settings (`app.current_tenant`, `app.bypass_rls`) before Kysely or raw SQL repository work. Enable RLS policies for tenant-scoped tables through reusable helpers in `src/db/rls.ts` and the Kysely migration `src/db/migrations/20260531T213532_tenant_rls.ts`.
- **Why:** This keeps API middleware and database enforcement aligned across both Kysely-backed subscription flows and raw-SQL metering flows, while preserving explicit system-bypass paths for webhook processing and the metering worker.
- **Validation:** `cd packages/api && npm run typecheck && npm run test && npm run build`
