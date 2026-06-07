# EECOM — History

## Project Context
- **Project:** FastSaaS — Next-gen Microsoft Commercial Marketplace SaaS accelerator
- **Stack:** Node.js 22, TypeScript, PostgreSQL + Prisma, REST APIs
- **Key concerns:** Azure Marketplace integration, subscription lifecycle, multi-tenancy, metering
- **User:** dkirby-ms

## Active Assignments (Phase 1)

**2026-05-29 — Kranz Triage Decision**

Assigned to EECOM:
- **#1 [BLOCKING]:** API foundation and auth baseline
  - Owner: EECOM
  - Dependencies: None (priority for all backend work)
  - Sequence: Immediate start
  
- **#2 [BLOCKING]:** Subscription lifecycle and fulfillment
  - Owner: EECOM
  - Dependencies: #1 (API routes)
  - Sequence: After #1 ships
  
- **#3 [BLOCKING]:** Metering ingestion and submission
  - Owner: EECOM
  - Dependencies: #1 (API routes)
  - Sequence: Parallel with #2 after #1 ships

**Execution Plan:** Start #1 immediately. After #1 stabilizes, run #2 and #3 in parallel. Coordinate API contracts with FIDO (#4 portal) and GNC (#5 deployment).

## Learnings

- **2026-06-01T00:04:54.260+00:00:** PR #63 runbook validation now requires checking the actual Marketplace-registered webhook URL against the live Container Apps ingress, and the drill harness now drives metering retries through the real HTTP client with 429/503/dead-endpoint responses.

## Orchestration — 2026-05-29T19:30:29Z

**#1 API Foundation — COMPLETE (PR #7)**
- Express + TypeScript API with JWT auth, tenant middleware, OpenAPI docs, structured logging, error handling, integration tests
- Ready for FIDO portal integration and GNC staging deployment
- Portal mock adapter supports stable development; FIDO can integrate live endpoints when ready

**Cross-team info:**
- FIDO (portal) uses TanStack Query against mock adapter; ready to consume real EECOM endpoints
- GNC staging uses two-phase Bicep deployment; Container Apps always reference valid image tags
- Decision: Portal abstracted API client supports mock/real switching for zero rework on integration

## Learnings

- **2026-05-29T19:30:29Z:** API foundation complete. JWT auth and tenant middleware ready for multi-tenant SaaS operations. Portal scaffold (FIDO) ready to integrate live endpoints.
## PR #61 — Semantic-Release Version Baseline Fix (2026-05-31T20:29:23.499+00:00)

**Status:** Complete (tag v0.1.0 created and pushed)

**Context:** Kranz rejected PR #61 (semantic-release config by GNC) because semantic-release defaults to v1.0.0 on first run if no git tag exists. The repo is pre-1.0 (package.json v0.1.0), so the initial release would cut the wrong version.

**Fix applied:**
- Created git tag `v0.1.0` on the merge-base commit (`d450a34`) — the point before semantic-release config was added
- Pushed tag to remote (`git push origin v0.1.0`)
- This establishes v0.1.0 as the version baseline semantic-release will recognize

**Outcome:** Semantic-release config now correctly defaults to computing next version from 0.1.0 baseline. GNC can re-merge after Kranz's re-review.

## Learnings

- **2026-05-31T20:29:23.499+00:00:** Semantic-release requires an existing git tag to establish the version baseline; without it, it defaults to 1.0.0 on first run. Tag the merge-base with the intended baseline version before merging release config changes.
- **2026-05-29T14:30:29.387-05:00:** API foundation now lives in `packages/api/` with Express + TypeScript, `packages/shared/src/index.ts` carries shared auth/response types, and the protected bootstrap route is `GET /v1/auth/context`.
- **2026-05-29T14:30:29.387-05:00:** Auth uses `jose` JWT verification plus tenant-context middleware that reads `tenant_id`, `tid`, or `extension_tenant_id`, and global JSON logging/error handling is wired through `src/middleware/`.
- **2026-05-29T14:30:29.387-05:00:** OpenAPI bootstrap is published at `/openapi.json` and `/docs`, with integration coverage in `packages/api/src/__tests__/app.integration.test.ts` for 401, 403, 200, and spec validation.
- **2026-05-29T14:30:29.387-05:00:** Metering ingestion now uses a tenant-scoped outbox model with derived idempotency keys (`tenant:eventId:timestamp`), retry scheduling for 429/5xx, DLQ capture after retry exhaustion, and a dashboard summary endpoint for SLA timeliness.
- **2026-05-30T21:21:50.014+00:00:** PostgreSQL Flexible Server public-mode deployments must create explicit firewall rules; this branch now adds Azure-services and dev-wide public rules only when no delegated subnet is configured, leaving private-mode deployments unchanged.
- **2026-05-31T18:54:21.897+00:00:** Prisma API containers should use Debian-based Node images instead of Alpine; `node:22-slim` plus `binaryTargets = ["native", "debian-openssl-3.0.x"]` avoids musl/OpenSSL engine crashes in runtime containers.
- **2026-06-01T00:18:00.000+00:00:** Subscription lifecycle routes now enforce Admin/Owner authorization after tenant ownership lookup, so same-tenant Member/Viewer calls fail with `403` while cross-tenant probes still collapse to `404` without leaking record existence.

## PR #24 — PostgreSQL Firewall Fix (2026-05-30T21:21:50.014+00:00)

**Status:** Complete (commit 55a6ab4)

**Context:** GNC opened PR #24 to make private endpoints optional (default: public for dev/staging). Kranz identified a critical gap: toggling off private resources without defining firewall access leaves PostgreSQL Flexible Server inaccessible even in "public mode."

**Fix applied (commit 55a6ab4):**
- When `usePrivateEndpoints=false` (public mode), Bicep now creates PostgreSQL firewall rules:
  - `AllowAzureServices` (`0.0.0.0` to `0.0.0.0`) — enables Container Apps, Functions, other Azure services to reach the server
  - `AllowAllDev` (`0.0.0.0` to `255.255.255.255`) — enables any public client (dev laptops, runners, etc.) for development convenience
- When `usePrivateEndpoints=true` (private mode), firewall rules are omitted — network isolation via VNet/delegated subnet is the boundary

**Outcome:** PR #24 re-reviewed and approved by Kranz. Merged (squash). User directive for public-default dev/staging and optional-private production is now complete.

**Pattern:** Networking-mode toggles in infrastructure must pair negative logic (remove private resources) with positive logic (enable public access). Partial toggles are non-functional.

## Completed Work

- **2026-05-29 Phase 1 Round 2:**
  - **Issue #2 (Subscription Lifecycle):** PR #10 — State machine, webhooks, fulfillment client, audit logging, 7 integration tests. Ready for review.
  - **Issue #3 (Metering Ingestion):** PR #9 — Usage ingestion API, idempotency, outbox worker, retry with exponential backoff, DLQ, SLA dashboard. Ready for review.
- **2026-05-31:** `packages/api`, `packages/portal`, and `packages/shared` are aligned on `0.1.0` semantic versions, and the repo now documents using `npm version` plus the root changelog for future bumps.

## 2026-05-31T19:45Z — Publisher Portal Awaiting API Routes

FIDO completed publisher portal pages (issue #43). Portal is now gating access and reading `/v1/auth/context` + `/v1/subscriptions`. Portal mutations for plan/tenant management are on mock adapter pending EECOM publisher-management API routes:
- `POST /api/v1/publisher/plans` — Create plan
- `PUT /api/v1/publisher/plans/{id}` — Update plan
- `POST /api/v1/publisher/tenants/{id}` — Configure tenant

No blocker; FIDO and EECOM can work in parallel. API routes will replace mock adapter when ready.
## Learnings

- **2026-05-31T21:35:32.766+00:00:** Tenant enforcement in `packages/api/` now flows from `src/middleware/tenant-context.ts` into database session settings via `src/db/execution-context.ts`, with shared RLS policy helpers in `src/db/rls.ts`, a Kysely migration in `src/db/migrations/20260531T213532_tenant_rls.ts`, and cross-tenant isolation coverage in `src/__tests__/tenant-rls.integration.test.ts`.
- **2026-06-01T00:04:54.260+00:00:** The tenant RLS migration is now executable via `packages/api/src/db/migrator.ts`, runs on API startup and `npm run migrate`, and the Docker-backed RLS integration suite must connect as a non-superuser app role because PostgreSQL superusers bypass RLS policies.

## Cross-Team Updates — 2026-05-31T21:35:32.766Z

**From Scribe Consolidation (Squad Inbox → Decisions)**

- **RETRO blocking dependency:** RETRO's tenant isolation security test suite (PR #62, 28/33 tests passing) awaits RLS enforcement in production. EECOM's PR #64 merge unblocks unskipping of 5 RLS-dependent tests.
- **GNC release automation:** Semantic-release baseline (`v0.1.0`) is now established. GNC PR #61 unblocked for merge; subsequent releases will automate version bumps across `packages/api`, `packages/portal`, and root CHANGELOG.md from conventional commits.
- **Semantic versioning decision recorded:** Manual `npm version` for workspace bumps + Keep a Changelog pattern adopted for the team.
- **2026-05-31T21:35:32.766+00:00:** RBAC hardening is centralized in `packages/api/src/middleware/rbac.ts` via `authorizeRoute`, and audit logging is split between `packages/api/src/services/audit-service.ts`, `packages/api/src/repositories/audit-log-repository.ts`, and the append-only `packages/api/src/db/migrations/20260531T213532_audit_logs.ts` migration plus shared tenant RLS helpers in `packages/api/src/db/rls.ts`.
- **2026-06-01T00:04:54.260+00:00:** PR #65 follow-up aligns RBAC exactly to the design doc role model (`Admin`, `Owner`, `Member`, `Viewer`), runs API migrations through `packages/api/src/db/migrator.ts` during startup/`npm run migrate`, and verifies audit append-only plus tenant RLS against a real PostgreSQL role instead of in-memory fixtures.

## 2026-06-01 PR Review Cycle — Phase 1.5 Backend Integration

### Session Summary
Team reworked Phase 1.5 tenant-isolation PRs for publication-path compliance and backend route integration. Two revisions submitted:
- PR #62 (security suite): 1 rejection → approved → merged
- PR #59 (publisher admin): 2 rejections pending (v2 blocked on @fastsaas/shared types)

### PR #62 — Tenant Isolation Security Test Suite (Issue #44)
- **v1 Rejection:** Non-RLS RBAC tests still skipped; branch not merge-clean
- **v1 Fix:** Enforce Admin/Owner checks post-tenant-confirmation; unskip Member/Viewer lifecycle tests
- **Outcome:** ✓ APPROVED → MERGED
  - Passes: typecheck, build, `npm run test -- --run src/__tests__/security`
  - Coverage: tenant isolation, JWT tampering, scope enforcement, Admin/Owner-only lifecycle boundaries

### PR #59 — Publisher Admin API Routes (Issue #43)
- **v1 Rejection:** Missing backend routes; portal wired to mocks only
- **v2 Submission:** Live Kysely-backed /v1/publisher/* routes (dashboard, plans, subscriptions, tenants) with Admin/Owner RBAC
- **v2 Rejection:** `npm run typecheck --workspace=@fastsaas/api` fails with 29 errors
  - Missing exports from @fastsaas/shared:
    - PublisherDashboardData, PublisherPlan, PublisherPlanStatus, PublisherTenantDetail, PublisherTenant, etc.
  - Real Kysely queries + RLS context propagation ✓
  - RBAC matrix correct ✓
  - Conventional commit ✓
  - Router registration ✓
- **Next:** Export missing Publisher types; revalidate typecheck

### PR #64 — Tenant RLS Enforcement & Migrations (Issue #45)
- **v2 Rejection:** Fresh-DB migration still fails (assumes pre-existing subscription tables)
- **v2 Outcome:** Reassigned to FIDO for merge-conflict + fresh-DB fixes
- **EECOM Decision:** Run Kysely migrations at startup; fail if DATABASE_URL set but migration cannot apply
  - Ensures RLS is not a manual post-deploy step
  - Docker-backed PostgreSQL integration test uses real app role (non-superuser) to verify `app.current_tenant` blocks cross-tenant reads

### Decisions Recorded
- EECOM PR #62 fix: enforce Admin/Owner checks post-tenant-confirmation
- EECOM PR #64 fix: run migrations at startup; fail on unmet prerequisites
- Publisher type exports blocking PR #59 v2 approval
- **2026-06-01T00:43:05.936+00:00:** Publisher portal backend now lives under `packages/api/src/routes/v1/publisher.ts` with Kysely-backed `publisher_plans`, default catalog overlays for `starter/growth/scale`, and publisher tenant management persisted through subscription metadata plus audit log entries so the portal can drop its mock-backed plan/tenant mutations.
- **2026-06-01T12:15:53.994+00:00:** Publisher subscription reads must stay inside request-scoped tenant RLS by loading data through `SubscriptionRepository.listByTenant(actor.tenantId)`; publisher-managed tenant records are stored under the publisher tenant and identify the managed customer via `beneficiaryTenantId`/`metadata.managedTenantId` in `packages/api/src/services/publisher-service.ts`.

## Learnings

- **2026-06-01T14:29:34.125+00:00:** OpenAPI route discovery for `packages/api/` is driven entirely by per-handler `@swagger`/`@openapi` JSDoc blocks in the files listed by `src/openapi.ts`; unannotated routes like `subscriptions.ts`, `publisher.ts`, and `webhooks/marketplace.ts` do not appear under `/docs` even when the handlers are mounted.
- **2026-06-01T20:50:04.569+00:00:** Marketplace change webhooks should deserialize both the existing simplified shape and Partner Center's native `subscriptionId`/`id` fields, then validate the referenced operation via Fulfillment Operations before persisting plan, quantity, or tenant ownership changes.
- **2026-06-01T21:20:13.494+00:00:** The shared Marketplace webhook contract in `packages/shared/src/index.ts` and `packages/shared/dist/index.d.ts` must carry `ChangePlan`/`ChangeQuantity`/`Transfer` plus `operationId`, `planId`, `quantity`, and `beneficiaryTenantId`; `packages/api/src/routes/webhooks/marketplace.ts` should derive idempotency keys from `operationId` before `requestId` so Marketplace retries stay stable.
- **2026-06-01T20:50:04.569+00:00:** External Marketplace customer RBAC now falls back from empty JWT app roles to tenant membership records, and any tenant-scoped repository writes that target a beneficiary tenant must override the RLS execution context to that tenant before inserting ownership or membership data.
- **2026-06-01T21:20:13.494+00:00:** Tenant member invites now enforce a role-assignment ceiling in `packages/api/src/routes/v1/members.ts` and `packages/api/src/services/tenant-member-service.ts`: Owners may invite any tenant role, but Admins are capped to inviting `Admin` or `Member`, with regression coverage in `packages/api/src/__tests__/security/privilege-escalation.test.ts`.
- **2026-06-01T21:41:30.419+00:00:** Marketplace purchase token redaction is centralized in `packages/api/src/lib/marketplace-token-redaction.ts`; `packages/api/src/services/audit-service.ts` sanitizes audit metadata/resource IDs on write and read, while `packages/api/src/repositories/subscription-repository.ts` and `packages/api/src/services/subscription-service.ts` sanitize subscription metadata and audit details before persistence and again during hydration for defense in depth.
- **2026-06-01T21:44:57.192+00:00:** `packages/api/src/config.ts` must fail closed for `MARKETPLACE_AUTH_TOKEN` and `MARKETPLACE_WEBHOOK_SECRET` in any non-`development`/`test` environment, while `packages/api/src/__tests__/server.startup.test.ts` verifies the process exits during startup with a clear missing-secrets error in production mode.
- **2026-06-01T21:44:57.192+00:00:** Metering writes are now gated by RBAC `metering:write` in `packages/api/src/middleware/rbac.ts` and `packages/api/src/routes/v1/metering.ts`; `packages/api/src/metering/service.ts` must resolve the tenant-owned subscription before enqueueing and store the marketplace subscription ID for `packages/api/src/metering/worker.ts` submissions.
- **2026-06-01T22:33:58.673+00:00:** Client-facing API errors are now sanitized in `packages/api/src/middleware/error-handler.ts` to return only `code` and `message`; upstream Marketplace fulfillment bodies stay server-side in `packages/api/src/services/subscription-service.ts` logs (warn for upstream failures, error for unexpected exceptions), with regression coverage in `packages/api/src/__tests__/error-sanitization.test.ts` plus updated auth/RBAC integration assertions.


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
- **2026-06-05T17:44:07.201+00:00:** Marketplace webhook handling now accepts Microsoft `Subscribe` and `Renew` actions in `packages/api/src/routes/webhooks/marketplace.ts` and treats them as acknowledged no-ops in `packages/api/src/services/subscription-service.ts`; missing local subscriptions for any valid webhook action are recorded as processed with info/warn logs and a 200 response to stop Microsoft retry storms while the portal-driven token resolution flow remains the source of subscription creation.
- **2026-06-05T17:27:58.196+00:00:** `SubscriptionService.processMarketplaceWebhook()` looks up subscriptions strictly by `marketplaceSubscriptionId` (`packages/api/src/services/subscription-service.ts`) and fails fast if no row exists, but FastSaaS only creates that row during `POST /v1/subscriptions` in `SubscriptionService.subscribe()`. The webhook route currently rejects documented Microsoft `Subscribe`/`Renew` actions because `packages/api/src/routes/webhooks/marketplace.ts` only allows `Suspend`, `Unsubscribe`, `Reinstate`, `ChangePlan`, `ChangeQuantity`, and `Transfer`, so initial purchase callbacks can arrive before local persistence and currently either 400 or 404 instead of being reconciled.
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
- **2026-06-02T16:16:43Z:** Single-publisher-per-deployment is now the canonical marketplace auth model: `packages/api/src/services/marketplace-oauth-service.ts` exchanges `MARKETPLACE_CLIENT_ID` + `MARKETPLACE_CLIENT_SECRET` + `MARKETPLACE_TENANT_ID` for cached Azure AD tokens, while `packages/api/src/lib/product-ingestion-client.ts`, `packages/api/src/services/product-catalog-service.ts`, and `packages/api/src/services/job-polling-service.ts` prefer the shared env-backed token provider over tenant-scoped Partner Center credentials.
- **2026-06-02T16:16:43Z:** Publisher Product Ingestion flows should work without calling `/v1/publisher/partner-center/connect`; that route and `packages/api/src/services/partner-center-auth.ts` remain as legacy compatibility for earlier multi-publisher assumptions, and the legacy status is documented in `packages/api/src/routes/v1/publisher.ts`.
- **2026-06-02T16:37:21.468+00:00:** Authorization models are now separated in `packages/api/src/middleware/tenant-context.ts`: publisher routes pass `{ authorizationModel: 'publisher' }` and authorize strictly from JWT app roles, while customer routes pass `{ authorizationModel: 'customer' }` and resolve RBAC from `tenant_members` when `TenantMemberService` is available.
- **2026-06-02T16:37:21.468+00:00:** Security fixtures in `packages/api/src/__tests__/security/test-harness.ts` now seed tenant-membership records independently from JWT role claims, and regression coverage lives in `packages/api/src/__tests__/publisher.integration.test.ts`, `packages/api/src/__tests__/rbac.integration.test.ts`, and `packages/api/src/__tests__/security/rbac-boundaries.test.ts` to prevent publisher app roles from granting customer access.
- **2026-06-02T16:54:45.149+00:00:** Submission status monitoring now lives in `packages/api/src/services/submission-monitoring-service.ts`, where `/v1/publisher/products/:productId/submissions` fetches draft/preview/live Product Ingestion resource trees with the shared `MarketplaceOAuthService`, falls back to cached `marketplace_resources`/`marketplace_submissions` snapshots when an environment tree is absent, and normalizes resource-level validation issues plus submission history for the publisher API.
- **2026-06-03T01:14:46.759+00:00:** `PostgresUsageEventRepository.claimDueBatch` in `packages/api/src/metering/postgres-repository.ts` uses `UPDATE ... FROM candidate ... RETURNING`, so the returned `id` must be qualified as `usage_events.id` to avoid PostgreSQL 42702 ambiguity when the worker joins the target table with the candidate CTE.
- **2026-06-03T01:25:53.371+00:00:** Metering today is dimension-agnostic: `packages/shared/src/index.ts` and `packages/api/src/metering/service.ts` accept any string `dimensionId`, while `packages/api/src/metering/postgres-repository.ts` gives FastSaaS a durable tenant-RLS outbox with 30-day dedupe, leasing, retries, dead letters, and dashboard summaries but no built-in hourly rollup or overage calculation.
- **2026-06-03T01:25:53.371+00:00:** Dogfooding Microsoft Marketplace metering should hook centralized backend boundaries like `packages/api/src/lib/marketplace-fulfillment.ts`, `packages/api/src/lib/product-ingestion-client.ts`, `packages/api/src/services/audit-service.ts`, and subscription reconciliation for tenant/seat-hours, then aggregate by subscription + dimension + UTC hour before enqueueing Marketplace events.
- **2026-06-03T01:25:53.371+00:00:** Current Marketplace metering gaps are in outbound compliance, not outbox durability: `packages/api/src/metering/client.ts` still sends a direct bearer secret without real OAuth or `x-ms-requestid`/`x-ms-correlationid`, so any self-metering rollout should first make the Azure client compliant before instrumenting more emit points.
- **2026-06-03T14:39:04.834+00:00:** Issue #103 asset visibility backend now lives in `packages/api/src/services/asset-visibility-service.ts`, where live Product Ingestion `resource-tree` reads are cached in-memory with TTL and exposed through read-only publisher endpoints in `packages/api/src/routes/v1/publisher.ts`.
- **2026-06-03T14:39:04.834+00:00:** Shared marketplace visibility contracts live in `packages/shared/src/index.ts`; Product Ingestion schema/type coverage for `listing-asset`, `listing-trailer`, `preview-audience`, `private-audiences`, and `price-and-availability-offer` lives in `packages/api/src/lib/product-ingestion-types.ts`; regression coverage is in `packages/api/src/__tests__/asset-visibility-service.test.ts`.
- **2026-06-03T14:39:04.834+00:00:** Issue #103 asset visibility implementation — Implemented `AssetVisibilityService` with Product Ingestion resource-tree querying, TTL in-memory caching, and type definitions. Routes: `GET /v1/publisher/products/:productId/assets`, `GET /v1/publisher/products/:productId/audiences`, `GET /v1/publisher/products/:productId/plans/:planId/pricing`. All types exported from @fastsaas/shared. Typecheck + tests pass. No persistence or schema changes in first pass per architecture plan. Service boundary preserved for future database-backed cache.
- **2026-06-03T19:44:18.235+00:00:** Portal subscription enforcement now happens server-side in `packages/portal/app/(portal)/layout.tsx`, which reuses the existing App Router auth layout and redirects customer routes to `/no-subscription` before render while exempting publisher routes.
- **2026-06-03T19:44:18.235+00:00:** Mock customer subscription access is mirrored into the lightweight cookie helper at `packages/portal/lib/subscription-gate-cookie.ts` from `packages/portal/lib/mock-api.ts`, because the main mock portal state remains in browser localStorage and is unavailable to server components.
- **2026-06-04T17:51:02.777+00:00:** Marketplace Fulfillment now reuses `packages/api/src/services/marketplace-oauth-service.ts` instead of duplicating auth logic: `packages/api/src/server.ts` wires a dedicated fulfillment-scoped token provider (`20e940b3-4c77-4b0b-9a53-9e16a1b010a7/.default`) into `packages/api/src/lib/marketplace-fulfillment.ts`, which exchanges `MARKETPLACE_CLIENT_ID` + `MARKETPLACE_CLIENT_SECRET` + `MARKETPLACE_TENANT_ID` for cached Azure AD access tokens and applies them to every outbound resolve/activate/update/operation call.
- **2026-06-06T16:13:25Z:** Plan Catalog Marketplace Linking — Added GET /v1/publisher/marketplace-plans endpoint exposing MarketplacePlanSummary shared type for frontend plan management. Backend plan resolution now integrates marketplace_plan_id + seat_limit schema. No breaking changes to existing subscription lifecycle or fulfillment paths.

## 2026-06-07

- Spin-down checkpoint: Plan Architecture v2 implementation complete
  - M1 (plan_feature_gates migration) ✓
  - M4 (PlanFeatureGateService + portal UI) ✓
  - M3 (pricing from marketplace_plans) ✓
  - M5 (activation warning) ✓
  - M2 (remove price_monthly) ✓
  - Test stubs written by RETRO (26 tests)
- Decisions archived in `.squad/decisions/decisions.md` for team reference
- Ready for next phase (metering, RBAC, Product Ingestion)