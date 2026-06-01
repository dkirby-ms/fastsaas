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
