# Kranz — History Archive (2026-05-29 to 2026-05-30)

## Project Context
- **Project:** FastSaaS — Next-gen Microsoft Commercial Marketplace SaaS accelerator
- **Stack:** Node.js 22, TypeScript, Next.js + React + Tailwind, PostgreSQL + Prisma, Turborepo monorepo
- **Deployment:** Azure Container Apps (default), App Service migration path
- **User:** dkirby-ms
- **Design doc:** `docs/design-document.md`

## 2026-05-29 Review Summary

### Initial PR Reviews (2026-05-29)

**PR #6 (REJECTED then APPROVED after fixes):** Staging deployment hardening
- Rejected: Command injection in deploy workflow, public database/Redis/ACR, placeholder API container
- Fixes: Env var validation, VNet private access, managed identity pulls, real Express API
- Approved after commit 17f677 resolved ACR public access for GitHub runner connectivity

**PR #7 (REJECTED then APPROVED after fixes):** Auth baseline
- Rejected: HMAC secrets instead of Entra/JWKS; request IDs not bounded
- Fixes: RS256 + createRemoteJWKSet + jwtVerify; request ID validated to 128 chars
- Approved after commit 2a2f634

**PR #8 (REJECTED then APPROVED after fixes):** Portal MVP
- Rejected: CredentialsProvider with committed secrets; API client lacks bearer token
- Fixes: AzureADProvider only; bearer token propagation with getAccessToken()
- Approved after commit 352fc6c

**PR #9 (REJECTED then APPROVED after fixes):** Metering runtime
- Rejected: InMemoryUsageEventRepository (not durable); missing planId; no atomic claiming; no tests for real behavior
- Fixes: PostgreSQL persistence; planId included in Marketplace requests; atomic claiming with FOR UPDATE SKIP LOCKED; durability/concurrency tests
- Approved after all 4 blockers resolved

**PR #10 (REJECTED then APPROVED after fixes):** Subscription lifecycle
- Rejected: No webhook HMAC validation; not idempotent; Fulfillment API v2 compliance gaps
- Fixes: HMAC-SHA256 with timing-safe comparison; duplicate returns 200 (not 409); activate/unsubscribe/update/reinstate v2-compliant
- Approved after commit 63b0216

### Phase 1 Issue Triage
- **#1 [P1-01] API foundation** → EECOM (critical blocking issue)
- **#2 [P1-02] Subscription lifecycle** → EECOM (depends on #1)
- **#3 [P1-03] Metering ingestion** → EECOM (depends on #1, parallel with #2)
- **#4 [P1-04] Customer portal** → FIDO (depends on #1 contracts, can prototype early)
- **#5 [P1-05] Staging deployment** → GNC (depends on #1-#3 stability)
- Created squad routing labels: `squad`, `squad:eecom`, `squad:fido`, `squad:gnc`, `squad:retro`

## 2026-05-30 Review Summary

### PR #14 (APPROVED): Staging Bicep deployment fix
- Confirmed `existing` ACR/Redis declarations resolve by stable names
- Approved compile-time-deterministic role-assignment naming using `guid()`
- Verified Redis key lookup uses `redisResource.listKeys()` method (valid dependency model)
- Confirmed Container App env array refactor precomputes entries before assignment

### PR #24 (REJECTED then APPROVED after fixes):** Optional private endpoints toggle
- Rejected: Public mode removed private networking without firewall rules (Container Apps blocked)
- Fixes: Added PostgreSQL firewall rules (`AllowAzureServices`, `AllowAllDev`)
- Approved after commit 55a6ab4 applied missing firewall configuration

**Infrastructure Toggle Pattern:** Networking-mode toggles must implement both negative logic (remove isolation resources) and positive logic (enable access). This pattern guides future public/private infrastructure decisions.

### Team Commentary Skill (2026-05-30T17:20:36.580+00:00)
- Defined `.squad/skills/team-commentary/SKILL.md` for lightweight cross-agent sharing
- Route interesting findings to Squad Places `team-commentary` place (not decisions.md)
- Pattern: short structured posts with category, title, why-it-matters, context, action, tags
- Escalation rule: promote useful commentary to `.squad/decisions/inbox/` if it becomes a team rule

## 2026-05-31 Early Session (01:24 - 11:25)

### PR #28 (REJECTED then APPROVED): Staging bootstrap fix
- Initial rejection: `deployRedis=false` changed shared template default for all environments
- Pattern feedback: temporary workarounds must stay scoped; shared defaults must not drift
- GNC applied fix: restored `deployRedis: true` in shared template, staging-only override for `deployRedis: false`
- Approved revised PR (squash merge)
- Follow-up: Plan Azure Managed Redis migration before re-enabling cache

### PR #29 (APPROVED): Azure Managed Redis migration
- All five criteria satisfied: correct resource type/API/SKU, workaround fully removed
- Private DNS zone correctly renamed; private endpoint groupId updated
- Database child resource properly configured; REDIS_URL wired to listKeys().primaryKey
- Validations passed (az bicep build, npm typecheck)
- Ready for merge

## Archive Notes
- All review patterns, infrastructure toggle decisions, and team skill definitions preserved for reference
- Active leadership on PR approvals/rejections, pattern guidance, and follow-up actions
- Ready for 2026-05-31 phase consolidation


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
- **2026-06-04T19:11:33.391+00:00:** Re-reviewed PR #142 after FIDO's revisions. Verified that the `resolve` endpoint now correctly uses POST with the `x-ms-marketplace-token` header and that request headers correctly use `x-ms-requestid` and `x-ms-correlationid`. Tests pass and typecheck succeeds. Approved PR #142.

## 2026-06-07

- Spin-down checkpoint: Plan Architecture v2 design complete
  - Architecture proposal approved and implemented by team ✓
  - Mock data root cause analysis archived ✓
  - RBAC hybrid design recommendation documented ✓
  - User directives on plan-role separation captured ✓
- All key decisions consolidated in team decisions ledger
- Ready for Product Ingestion design and RBAC implementation phases

### PR #153 Review — Plan-gated feature entitlements (2026-06-07T16:20:00Z)
- **Status:** APPROVED (comment posted — GitHub self-approval restriction)
- **Implementation quality:** High. 191 tests pass, both workspaces typecheck clean, portal builds.
- **Architecture alignment:** All 5 non-negotiables met — live query, no JWT state, orthogonal to RBAC, no minimum_role in registry, server-side portal fetch.
- **Non-blocking notes issued (follow-on issues recommended):**
  1. `requireFeature` not yet wired to production routes — demo features are presentational with no backend data, so no route to gate today; apply when real API routes are added.
  2. Mock path ignores subscription gate cookie for features — hardcoded `MOCK_CUSTOMER_FEATURES`; devs can't demo locked state in local dev.
  3. `cache: 'no-store'` instead of spec's `next: { revalidate: 60 }` — safe but less efficient for production.

## Learnings
- **2026-06-07T16:20:00Z:** When reviewing feature entitlement PRs, verify (a) middleware is not only implemented but actually wired to at least one production route, OR confirm the feature is intentionally demo-only with no backend data. Client-only gating on presentational demos is acceptable; client-only gating on routes with real data is a security gap.
- **2026-06-07T16:20:00Z:** Mock mode feature fetch should read from the subscription gate cookie (not hardcode a feature list) so local dev can exercise both locked and unlocked states without infrastructure. This is a recurring pattern — when adding a new server-side data dependency to the portal layout, the mock path must also support it.