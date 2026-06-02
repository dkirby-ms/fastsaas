# EECOM — History

## Project Context
- **Project:** FastSaaS — Next-gen Microsoft Commercial Marketplace SaaS accelerator
- **Stack:** Node.js 22, TypeScript, PostgreSQL + Prisma, REST APIs
- **Key concerns:** Azure Marketplace integration, subscription lifecycle, multi-tenancy, metering
- **User:** dkirby-ms

## Current Work (Phase 1.5)
**Partner Center Integration (#97)** — Implementing Fulfillment Operations API for subscription resolve/acknowledge/update operations.

## Recent Learnings (2026-06-01)

- Marketplace change webhooks must validate operations via Fulfillment Operations API before persisting plan/quantity/tenant ownership changes
- External customer RBAC now falls back from JWT app roles to tenant membership records
- Tenant member invites enforce role-assignment ceilings: Owners→any role; Admins→Admin or Member only
- Marketplace purchase token redaction is centralized in `packages/api/src/lib/marketplace-token-redaction.ts`
- Metering writes gated by RBAC `metering:write`; marketplace subscription ID stored for worker submissions
- Client API errors sanitized to `{code, message}`; upstream Marketplace bodies logged server-side only

## Completed Phase 1.5 PRs
- **PR #62:** Tenant isolation security suite — APPROVED & MERGED (28/33 tests; 5 RLS-only tests awaiting #45)
- **PR #64:** Tenant RLS enforcement & migrations — Migrations run at API startup; fail if DATABASE_URL set but migration cannot apply
- **PR #59 v2:** Publisher admin routes (Kysely-backed /v1/publisher/*) — Blocked on @fastsaas/shared type exports

## Cross-Team Blockers
- **PR #59 blocking:** Missing Publisher type exports (PublisherDashboardData, PublisherPlan, PublisherPlanStatus, PublisherTenantDetail, etc.) from @fastsaas/shared

## Key Patterns Established
- RLS enforcement via `packages/api/src/db/execution-context.ts` and `packages/api/src/db/rls.ts`
- RBAC centralized in `packages/api/src/middleware/rbac.ts` with `authorizeRoute` middleware
- Audit logging split between service layer and append-only migration
- Marketplace token redaction applied at write and read (defense in depth)
- API startup validates required secrets; fails closed in non-dev/test environments

## Previous Phase 1 Completions
- **PR #7:** API foundation (Express + JWT + tenant middleware + OpenAPI) — COMPLETE
- **PR #10:** Subscription lifecycle (state machine, webhooks, fulfillment client) — COMPLETE
- **PR #9:** Metering ingestion (outbox, retry, DLQ, SLA dashboard) — COMPLETE
- **PR #24:** PostgreSQL firewall rules for public-mode deployments — COMPLETE (Kranz approved)
- **PR #61 v0.1.0 tag fix:** Semantic-release baseline established — COMPLETE

**See history-archive.md for detailed session records.**

## Learnings
- **2026-06-02T00:44:50.069+00:00:** Partner Center publisher connectivity now lives in `packages/api/src/services/partner-center-service.ts` and `packages/api/src/services/partner-center-auth.ts`, with tenant-scoped persistence in `packages/api/src/repositories/partner-center-repository.ts`, RLS-aware tables from `packages/api/src/db/migrations/20260602T004450_partner_center_connections.ts`, and publisher endpoints mounted from `packages/api/src/routes/v1/publisher.ts`.
- **2026-06-02T01:33:55.352+00:00:** Fixed `packages/api/src/routes/v1/metering.ts` by adding Express 4 async error forwarding (`next` + try/catch) to the `POST /v1/metering/events` and `GET /v1/metering/dashboard` handlers, following the established route pattern in `packages/api/src/routes/v1/subscriptions.ts` so tenant-isolation metering failures reach error middleware instead of hanging tests.
- **2026-06-02T01:49:24.679+00:00:** Product Ingestion support now lives in `packages/api/src/lib/product-ingestion-client.ts` and `packages/api/src/lib/product-ingestion-types.ts`, using `PartnerCenterAuthProvider.acquireGraphToken(...)` for Graph auth, injectable `fetch`/`sleep` seams for mockable integration tests, exponential backoff on 429/5xx, and `ProductIngestionJobFailedError` to flatten resource-level configure failures from `configure/<jobId>/status`.
- **2026-06-02T01:49:24.679+00:00:** PR #110 — ProductIngestionClient library (#98) MERGED. Typed resources, retry logic with exponential backoff, error handling, unit tests. Branch `squad/98-product-ingestion-client`. Typecheck + tests pass.
- **2026-06-02T12:03:22.730+00:00:** Product Ingestion job tracking now persists tenant-scoped configure jobs in `packages/api/src/db/migrations/20260602T120322_marketplace_jobs.ts` and `packages/api/src/repositories/marketplace-job-repository.ts`, with polling/cancel orchestration in `packages/api/src/services/job-polling-service.ts`, background processing in `packages/api/src/jobs/configure-job-poller.ts`, and publisher job endpoints at `packages/api/src/routes/v1/publisher.ts`.
- **2026-06-02T12:03:22.730+00:00:** Configure-job polling state uses exponential backoff metadata stored in `marketplace_jobs.result.poll` so retries survive restarts without adding extra schema columns, while failed job responses are flattened into resource-level errors for `GET /v1/publisher/jobs/:jobId`.
- **2026-06-02T12:03:22.730+00:00:** Marketplace product ingestion now persists tenant-scoped product, plan, submission, and raw resource snapshots through `packages/api/src/services/product-catalog-service.ts` and `packages/api/src/repositories/product-catalog-repository.ts`, with RLS tables from `packages/api/src/db/migrations/20260602T120322_marketplace_catalog.ts` and publisher endpoints at `/v1/publisher/products*` for import, detail, resource-tree, and sync flows.
- **2026-06-02T14:18:30.747+00:00:** Marketplace OAuth long-lived credentials are now named `MARKETPLACE_CLIENT_SECRET` and `MARKETPLACE_METERING_CLIENT_SECRET` end-to-end across `packages/api/src/config.ts`, `packages/api/src/server.ts`, `packages/api/src/metering/runtime.ts`, `infrastructure/env/staging-api.env`, and the `scripts/set-secrets.*` helpers; fulfillment and metering clients keep sending Bearer headers directly until the Phase 2 token-exchange TODO is implemented.
- **2026-06-02T15:45:00.000+00:00:** Phase 2A Product Ingestion routes live in `packages/api/src/routes/v1/publisher.ts`, where `/v1/publisher/offers*` aliases mirror the existing `/products*` catalog handlers and `/v1/publisher/offers/:offerId/submissions*` reuses `JobPollingService.submitConfigureJob/getJob/cancelJob` with `productId` scoping for offer-specific configure workflows.
- **2026-06-02T15:45:00.000+00:00:** Marketplace deployment config now carries fallback Partner Center app registration metadata in `packages/api/src/config.ts` and `packages/api/.env.example` via `MARKETPLACE_CLIENT_ID`, `MARKETPLACE_TENANT_ID`, `MARKETPLACE_TOKEN_SCOPE`, and `MARKETPLACE_PRODUCT_INGESTION_BASE_URL`, with GitHub secret prompts added to `scripts/set-secrets.sh` and `scripts/set-secrets.ps1`.
