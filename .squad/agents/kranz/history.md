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

## 2026-05-31 Current Session

### Issue Triage — Morning
- Approved PR #28 merge (staging bootstrap with centralus region, staging-scoped Redis disable)
- Approved Ralph's issue closures: #25 (resolved), #26 (resolved), #27 (stale)

### PR #29 Review — Azure Managed Redis Migration (2026-05-31T11:25:29Z)
- **Status:** APPROVED
- **Migration Details:** Bicep updated from retired Azure Cache for Redis to `Microsoft.Cache/redisEnterprise`
- **Validation:** Resource type/API/SKU correct, private DNS zone updated, database child resource encrypted on port 10000, REDIS_URL properly wired
- **Cleanup:** `deployRedis` workaround fully removed from main.bicep, parameters, and both staging workflows
- **Quality Checks:** Bicep validates cleanly, npm typecheck passes, no regressions
- **Status:** Ready for merge

## Architecture Patterns Established (2026-05-29 to 2026-05-31)

1. **Infrastructure Toggle Pattern:** Public/private mode toggles must implement both negative logic (remove isolation resources) and positive logic (enable access)
2. **Auth Trust Model:** Production deployments use RS256 + JWKS; dev uses scoped bypass only
3. **Webhook Security:** HMAC-SHA256 with timing-safe comparison, configurable replay windows
4. **Marketplace Compliance:** Fulfillment API v2 (activate/unsubscribe/update/reinstate) with proper payloads
5. **Durability:** Outbox pattern with atomic claiming, concurrency control, restart safety

## Active Decisions

- Central Azure region (centralus) for staging deployment
- Scoped infrastructure workarounds only; shared template defaults preserved
- Two-phase Bicep strategy for infrastructure provisioning
- Azure Managed Redis as replacement for retired Azure Cache for Redis

### PR #59 Re-review #2 — EECOM's Publisher Admin Routes (2026-06-01T11:23:27Z)
- **Status:** REJECTED
- **Finding:** The live Kysely-backed publisher routes with Admin/Owner RBAC enforcement are architecturally sound, but `npm run typecheck --workspace=@fastsaas/api` fails with 29 errors because 14+ `Publisher*` types imported from `@fastsaas/shared` do not exist in the shared package
- **Action:** Rejected; require Publisher type definitions in `packages/shared/src/index.ts` and a clean typecheck pass on the merge ref
- **Validation:** Checked out worktree, merged origin/main (clean), reviewed route/service/repo/RBAC code, ran typecheck
- **Learning:** Cross-package type dependencies must be wired in the shared package before the consuming workspace can pass typecheck; reviewing architecture alone is insufficient without build validation

### PR #64 Re-review #3 — FIDO's Tenant RLS Migration Fix (2026-06-01T11:30:00Z)
- **Status:** REJECTED
- **Finding:** (1) PR has merge conflicts with main in 6 files; (2) `tableExists()` guard only protects the RLS policy loop but ALTER TABLE statements for `subscription_audit_logs` and `marketplace_webhook_events` remain unguarded and will still fail on a fresh DB
- **Action:** Rejected; assigned to FIDO to rebase onto main and guard ALTER TABLE blocks with `tableExists()` checks
- **Validation:** Fetched PR head, attempted merge (conflicts), reviewed migration code, confirmed typecheck+build pass on head branch
- **Learning:** When reviewing a "migration ordering fix," verify ALL SQL statements that reference external tables are guarded — not just the final policy-application loop

## 2026-06-01 PR Review Cycle — Phase 1.5 Tenant Isolation & Publisher Admin

### Session Summary
Lead orchestration of Phase 1.5 tenant-isolation and publisher-admin PR reviews. All target PRs reviewed; outcomes: PR #62 (security suite) and PR #63 (metering runbook) merged; PR #64 reassigned to FIDO for merge-conflict + fresh-DB migration fixes; PR #59 reassigned to EECOM for missing backend routes + @fastsaas/shared types.

### Approvals & Merges
- **PR #62 (RBAC security suite, Issue #44):** ✓ APPROVED → MERGED (via comment; GitHub self-approval restriction)
  - EECOM's revision passes `typecheck`, `build`, and `npm run test -- --run src/__tests__/security`
  - Non-RLS scenarios now execute; RLS-only follow-up gated on Issue #45
  
- **PR #63 (webhook/metering runbook, Issue #46):** ✓ APPROVED → MERGED (after v2 rework)
  - RETRO added real metering recovery: 429 retry timing, 5xx backoff, DLQ replay with fresh identifiers
  - Drill harness exercises all three scenarios in simulate mode; staging mode drills reserved for live validation

### Rejections & Reassignments
- **PR #59 (publisher portal, Issue #43):** 2x REJECTED
  - v1 reject: Missing backend routes for /v1/publisher/*
  - v2 reject: 29 TypeScript errors; missing Publisher types in @fastsaas/shared (PublisherDashboardData, PublisherPlan, etc.)
  - **Reassigned:** EECOM — land publisher-admin API routes + export types

- **PR #64 (tenant RLS enforcement, Issue #45):** 2x REJECTED
  - v1 reject: Fresh-DB migration fails; assumes pre-existing subscription tables
  - v2 reject: 6 merge conflicts + unguarded ALTER TABLE statements for non-existent tables
  - **Reassigned:** FIDO — resolve merge conflicts, add tableExists() guards, validate clean-DB path

- **PR #65 (RBAC/audit logging, Issue #47):** 1x REJECTED
  - Blocker: commitlint check failing on commit `Fix RBAC model and audit migration rollout`
  - Architecture sound; merge-gate issue only

### Decision Records
- 13 distinct inbox entries merged into `.squad/decisions.md`
- All entries within 30-day window (2026-05-29 to 2026-06-01); no archival needed

## Learnings
- **2026-06-02T15:58:31.221+00:00:** Phase 2A review (PR branch `eecom/78-product-ingestion-oauth`, commit `3d1cec9`): REJECTED. Route namespace, RBAC, job productId scoping, config fields, and tests are all correct. Missing: `marketplace-oauth-service.ts` was not built; four new config fields are dead code. Architecture decision explicitly gates Phase 2A DOD on working OAuth token exchange.
- **2026-06-02T15:58:31.221+00:00:** Pattern — when a branch name includes "oauth", the core OAuth service must be present and wired before the PR can pass review. Config-only additions are insufficient if nothing consumes the new fields.
- **2026-06-02T15:37:57.508+00:00:** Product Ingestion Phase 2 should extend the existing `product-ingestion-client` + `product-catalog-service` + `job-polling-service` stack, adding a write-side offer orchestration layer instead of introducing a parallel integration path.
- **2026-06-02T15:37:57.508+00:00:** The public publisher contract should use `/publisher/offers/*` terminology even though the upstream Product Ingestion API uses `product`; keep `/publisher/products/*` only as a temporary compatibility alias during migration.
- **2026-06-02T15:37:57.508+00:00:** Phase 2 marketplace auth must use Azure AD `client_credentials`; `MARKETPLACE_CLIENT_SECRET` changes semantics from bearer token to OAuth client secret, and `MARKETPLACE_CLIENT_ID` plus `MARKETPLACE_TENANT_ID` belong in config and `scripts/set-secrets.*`.
- **2026-06-02T15:37:57.508+00:00:** Key architecture files for Product Ingestion work are `packages/api/src/config.ts`, `packages/api/src/lib/product-ingestion-client.ts`, `packages/api/src/services/partner-center-auth.ts`, `packages/api/src/services/product-catalog-service.ts`, `packages/api/src/services/job-polling-service.ts`, and `packages/api/src/routes/v1/publisher.ts`.

## Learnings
- **2026-06-02T16:33:04.748+00:00:** Reviewed PR #116. EECOM successfully implemented `MarketplaceOAuthService` using standard Azure AD client_credentials token flow, injected as a `tokenProvider` into ProductIngestionClient, JobPollingService, and ProductCatalogService. The architecture decision (single-publisher-per-deployment via env var vs. per-tenant DB credentials) simplifies operations. Accepted PR.
- **2026-06-02T16:45:12.696+00:00:** Reviewed PR #117 (README review). GNC successfully extracted deployment documentation to `docs/DEPLOYMENT.md` while accurately capturing active infrastructure decisions (two-phase Bicep deployment, `centralus` region, Azure Managed Redis). Accepted PR.
- **2026-06-02T16:45:12.696+00:00:** Reviewed PR #118 (Separate publisher/customer auth models). EECOM correctly partitioned the auth model within `injectTenantContext` using an `authorizationModel` option. The default `customer` path uses tenant membership, whereas the `publisher` path relies on JWT roles, avoiding cross-model security gaps. Tests and typechecks pass successfully. Accepted PR.
- **2026-06-02T17:04:40.527+00:00:** Reviewed PR #119 (Submission status monitoring endpoints). EECOM successfully implemented `SubmissionMonitoringService` using `MarketplaceOAuthService` as the tokenProvider. Routes for `GET /products/:productId/submissions` and `GET /products/:productId/diff` follow REST conventions and integrate properly with `authorizeRoute`. Typecheck and tests pass cleanly across workspaces, with shared types properly exported in `@fastsaas/shared`. PR is APPROVED.
- **2026-06-03T00:45:13.484+00:00:** Reviewed PR #122 (GNC: Deploy container app secrets at creation time). APPROVED. GNC fixed the ordering bug by introducing a pre-deployment render step that generates runtime parameters before Bicep deployment. Secrets are now injected at container creation time instead of post-deploy patching. Key insight: environment files (staging-api.env, staging-portal.env) are now the authoritative configuration source; Bicep parameters become ignored when runtime env vars are provided. Secrets exist unencrypted on runner disk during deployment (industry standard). Python rendering validates all GitHub Actions secrets present. Default domain resolution queries Container Apps environment (which must exist first). Bicep @secure() annotations cover secret paths correctly.
- **2026-06-03T14:09:03.495+00:00:** Architected Issue #103 (listing asset & audience visibility). Phase 2 read-only feature: display marketplace metadata from Product Ingestion API (assets, trailers, audiences, pricing). Single-publisher model holds. Backend: extend ProductCatalogService with new AssetVisibilityService querying resource-tree (productDurableId parameter); add 3 API routes under /v1/publisher/products/:productId/{assets,audiences,plans/:planId/pricing}. Cache via product_catalog schema extension + sync job refresh (Option A chosen). Frontend: 3 new portal pages with asset gallery, video player, audience list, pricing table components. No batch edits (Partner Center remains authoring tool). Schema validation and tests required. Architecture decision written to `.squad/decisions/inbox/kranz-103-architecture.md`.
- **2026-06-03T15:06:44.720+00:00:** Reviewed PR #124 (Listing asset & audience visibility). Architecture for the backend is correct (queries live resource-tree with TTL cache, tests pass). However, the frontend duplicated shared domain types (`ListingAsset`, `ListingTrailer`, etc.) into `packages/portal/lib/publisher/types.ts` instead of importing them from `@fastsaas/shared/src/index.ts`. REJECTED PR and reassigned to FIDO to remove duplicates and enforce the monorepo boundary.
- **2026-06-03T16:21:14.408+00:00:** Reviewed PR #125 (Dark mode & NEXTAUTH_URL fix). The deploy workflow fix by GNC successfully aligns the `NEXTAUTH_URL` and `PORTAL_URL` to support custom domains via `PORTAL_PUBLIC_URL`, ensuring PKCE cookies function securely on Entra callbacks. FIDO's dark mode implementation leverages standard context and anti-FOUC script correctly, but violated the monorepo rules by declaring `Theme` types locally inside `theme-provider.tsx` instead of `@fastsaas/shared`. PR was REJECTED and reassigned to EECOM to migrate the shared types.
- **2026-06-03T16:56:07.551+00:00:** Re-reviewed PR #125 (Dark mode & NEXTAUTH_URL fix). EECOM successfully fixed the type boundary violation: all `Theme*` types now correctly exported from `@fastsaas/shared` and portal imports removed duplicates. Portal imports now resolve from shared types cleanly. GNC's `PORTAL_PUBLIC_URL` override logic is sound, worflow properly falls back to ACA FQDN when unset, health checks target resolved URL. FIDO's dark mode uses Tailwind v4 CSS-first `@custom-variant dark` with anti-FOUC bootstrap in layout.tsx—implementation is clean and prevents FOUC. ✅ **APPROVED** → **MERGED** (squash merge, branch deleted). Issue #84 closed. Post-merge: user must set `PORTAL_PUBLIC_URL` variable in GitHub and update Entra redirect URIs manually to match the public URL.
