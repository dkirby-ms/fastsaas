# Kranz — History

## Project Context
- **Project:** FastSaaS — Next-gen Microsoft Commercial Marketplace SaaS accelerator
- **Stack:** Node.js 22, TypeScript, Next.js + React + Tailwind, PostgreSQL + Prisma, Turborepo monorepo
- **Deployment:** Azure Container Apps (default), App Service migration path
- **User:** dkirby-ms
- **Design doc:** `docs/design-document.md`

## Learnings

### PR #6 Review — REJECTED (2026-05-29T15:58:55.150-05:00)

- Rejected the staging deployment PR because the deploy workflow interpolates `workflow_dispatch` inputs directly into bash, creating a command-injection path on a runner that already holds Azure credentials and staging secrets.
- Rejected the Bicep baseline because PostgreSQL and Redis are left on public network access, PostgreSQL also enables the broad `AllowAzureServicesAndResourcesWithinAzureIps` firewall rule, and ACR keeps the admin user enabled instead of using a tighter pull model.
- Rejected the containerization path because `packages/api/Dockerfile` ships a generated placeholder server rather than the real Express API, so the health checks validate scaffolding instead of the FastSaaS application.
- Review takeaway: infra validation placeholders are acceptable only when they do not masquerade as deployable service containers for an issue that claims staging readiness.

### PR #10 Review — REJECT (2026-05-29T15:58:55.150-05:00)

- Rejected subscription lifecycle PR #10 because the marketplace webhook endpoint accepts unsigned requests; the implementation never validates an HMAC signature, timestamp, or replay window despite the design requirement.
- Confirmed webhook processing is not idempotent: a duplicate Suspend notification succeeds once and then returns 409 on replay, so normal Marketplace retries can corrupt processing outcomes instead of being safely ignored.
- Confirmed the fulfillment client is not Azure SaaS Fulfillment API v2 compliant: activate is sent without the required plan/quantity payload, unsubscribe uses the wrong HTTP contract, and the promised update/reinstate client surface is incomplete.
- Positive signal: service/repository separation is clean, transition auditing carries correlation/request IDs, and targeted API tests passed — but coverage misses the security, retry, and spec-compliance cases that matter most here.

### PR #7 Review (2026-05-29T15:04:53.303-05:00)

- Rejected PR #7 because the auth baseline verifies JWTs with an HMAC shared secret instead of Entra/JWKS validation, which breaks alignment with the design doc and creates a forgeable default-secret path.
- Noted a recurring review pattern: integration tests can look healthy while still missing the real production trust model; auth tests must exercise issuer/signing-key behavior, not only local HS256 fixtures.
- Logging baseline is structurally sound, but request identifiers should be bounded and validated before being echoed into logs and API responses.
- Multi-tenant middleware shape is reasonable, but tenant-claim enforcement needs an explicit negative integration test to lock in the isolation contract.

### PR #7 Re-review — APPROVED (2026-05-29T15:54:56.445-05:00)

- GNC's fix (commit `2a2f634`) fully resolves all blocking concerns from initial review.
- Auth now uses `createRemoteJWKSet` + `jwtVerify` with RS256 — proper Entra ID JWKS trust model.
- No hardcoded secrets; dev bypass gated with `AUTH_BYPASS_ENABLED` env var and fails-fast if set in production.
- Integration tests exercise real RS256 signing via a local JWKS server — covers missing token, wrong scope, missing tenant claims, and happy path.
- `x-request-id` bounded to 128 chars with strict alphanumeric+punctuation regex; invalid values replaced with UUID.
- Strict Lockout worked as intended: GNC (not original author EECOM) delivered the fix cleanly.
- Quality: clean architecture, proper TypeScript types, no `any` casts, consistent error hierarchy, design doc alignment confirmed.

### PR #8 Review — REJECT (2026-05-29T15:58:55.150-05:00)

- Rejected the customer portal MVP because `packages/portal/lib/auth.ts` ships a demo `CredentialsProvider` with a committed `NEXTAUTH_SECRET` fallback, which is both out of alignment with the approved Entra/JWKS auth model and unsafe if the env var is omitted.
- Rejected the integration path because `packages/portal/lib/api-client.ts` never attaches a bearer token, so the portal cannot successfully call the PR #7-protected API once mock mode is disabled.
- Noted the UI scaffold itself is solid: App Router structure is clean, Tailwind usage is consistent, the portal builds successfully, and no `any` abuse showed up in the portal TypeScript surface.
- Follow-up guidance for FIDO: wire the portal to the approved Entra session/token flow first, then keep the mock layer as a dev-only seam rather than the primary happy path.

### PR #8 Re-review — APPROVED (2026-05-29T16:10:05.654-05:00)

- GNC's fix (commit `352fc6c`) fully resolves both blocking issues from initial review.
- Auth now uses `AzureADProvider` exclusively; no CredentialsProvider remains. All secrets sourced via `requireEnv()` which throws at startup if env vars are missing — no hardcoded fallback values.
- Bearer token propagation implemented: `getAccessToken()` retrieves Entra access token from NextAuth JWT session; API client sets `Authorization: Bearer <token>` on every outbound request.
- Refresh-token rotation handled with proper error surfacing (`RefreshAccessTokenError`) propagated to UI.
- Architecture aligns with `docs/design-document.md` (Entra-based identity, token-forwarding to API). No new blocking issues found.

### PR #9 Review — REJECTED (2026-05-29T15:58:55.150-05:00)

- Rejected PR #9 because the metering runtime is still wired to `InMemoryUsageEventRepository`, so queued usage events, idempotency state, retries, and DLQ records are not durable across restarts or multiple API instances.
- The Azure Marketplace submission contract is not implemented correctly: the client posts the internal event shape directly and does not persist the `planId` required to build a valid Metering API request.
- The worker lacks atomic claiming/in-flight protection for due events, so overlapping ticks can double-submit revenue events; the async interval also has no exception guard.
- Existing tests pass, but they only validate an in-memory harness and do not prove durable outbox behavior, restart safety, concurrency control, or real Marketplace payload mapping.

### Phase 1 Triage (2026-05-29)

**Issue Routing:**
- **#1 [P1-01] API foundation** → EECOM (critical blocking issue)
- **#2 [P1-02] Subscription lifecycle** → EECOM (depends on #1)
- **#3 [P1-03] Metering ingestion** → EECOM (depends on #1, parallel with #2)
- **#4 [P1-04] Customer portal** → FIDO (depends on #1 contracts, can prototype early)
- **#5 [P1-05] Staging deployment** → GNC (depends on #1-#3 stability)

**Dependency Order:**
1. Start #1 (API foundation) first — all other backend work blocks on this
2. Parallel: #2 (subscription), #3 (metering), #4 (portal prototype)
3. Follow-up: #5 (staging deployment) integrates the stack

**Labels Created:**
- `squad`, `squad:eecom`, `squad:fido`, `squad:gnc`, `squad:retro` for team routing

## 2026-05-29 16:10 — PR #9 Re-Review
- **Verdict:** APPROVED
- All 4 blocking issues resolved (postgres repo in prod, correct marketplace payload, atomic claim with FOR UPDATE SKIP LOCKED, durability/concurrency tests)
- No new blocking issues

## 2026-05-29 16:10 — PR #10 Re-Review
- **Verdict:** APPROVED
- All 3 blocking issues from initial review resolved by FIDO (commit `63b0216`):
  1. Webhook security: HMAC-SHA256 validation with timing-safe comparison, configurable replay window, multiple header name variants supported.
  2. Idempotency: Duplicates return HTTP 200 with existing subscription (not 409). Idempotency key from event ID or composite.
  3. Fulfillment API v2 compliance: activate sends planId+quantity, unsubscribe uses DELETE, update uses PATCH, reinstate implemented. Tests verify methods and payloads.
- No new blocking issues found.

## 2026-05-29 16:10 — PR #6 Re-Review
- **Verdict:** REJECT (1 new blocking issue)
- Original 3 issues all resolved:
  1. Shell injection fixed — imageTag passed via env var with regex validation.
  2. Public infra fixed — Postgres/Redis/ACR all have publicNetworkAccess=Disabled, VNet integration, private endpoints.
  3. Placeholder Dockerfile fixed — API Dockerfile is real multi-stage build; portal placeholder is acceptable (labeled, will be replaced).
- **New issue:** ACR has `publicNetworkAccess: 'Disabled'` but workflow uses `az acr build` from public GitHub-hosted runner. ACR Tasks need data-plane connectivity — build step will fail.
- Recommended fix: set ACR `publicNetworkAccess: 'Enabled'` (private endpoint still secures Container Apps pull).


## 2026-05-29 16:10 — PR #6 Second Re-Review
- **Verdict:** APPROVED
- Commit  17f677 sets ACR publicNetworkAccess: 'Enabled', resolving the GitHub-hosted runner connectivity blocker.
- No other new issues found. All original blockers remain fixed.
- PR is ready to merge.

## 2026-05-30T17:20:36.580+00:00 — Team Commentary Skill

- Defined `.squad/skills/team-commentary/SKILL.md` for lightweight cross-agent sharing of non-decision findings.
- Key design choice: route interesting/useful/helpful observations to the Squad Places `team-commentary` place instead of `.squad/decisions.md` or other shared repo files.
- Pattern: keep posts short and structured with category, title, why-it-matters, context, optional action, and tags.
- Escalation rule: if commentary becomes a durable team rule, promote it to `.squad/decisions/inbox/`; otherwise it stays in Squad Places and outside Scribe's normal merge flow.

### PR #14 Review — APPROVED (2026-05-30T17:03:46.905+00:00)

- Approved the staging Bicep fix because the `existing` ACR/Redis declarations now resolve by the same stable names passed into their modules, eliminating the invalid `id` pattern without changing resource identity.
- Accepted the ACR pull role-assignment naming change: seeding `guid()` from resource-group scope, registry name, identity name, and role definition keeps the assignment name compile-time deterministic while still mapping one assignment per identity and scope.
- Confirmed the Redis key lookup now uses the existing-resource method (`redisResource.listKeys()`), which keeps the dependency model valid and avoids deployment-start restrictions tied to module outputs.
- Confirmed the Container App env array refactor is clean: precomputing plain and secret-backed env entries into `containerEnv` preserves the rendered shape while avoiding unsupported inline `for` expressions inside `concat()`.

### PR #24 Review — REJECTED (2026-05-30T21:21:50.014+00:00)

- Rejected the optional-private-endpoints PR because the new `usePrivateEndpoints=false` path removes PostgreSQL private networking without adding any public firewall rules, so Azure Database for PostgreSQL Flexible Server will still block Container Apps by default.
- Confirmed the Bicep conditional gating itself is structurally sound: VNet, private DNS zones, private endpoints, and subnet-dependent parameters are all consistently guarded, and the single `location` parameter still keeps the database in the same region as the Container Apps.
- Operational note: GitHub would not allow a formal `--request-changes` review because the authenticated user is the PR author, so I recorded the rejection as a PR comment instead.

### PR #24 Re-Review — APPROVED (2026-05-30T21:21:50.014+00:00)

- After EECOM applied the PostgreSQL firewall fix (commit 55a6ab4), re-reviewed PR #24 for completeness
- The fix adds two firewall rules for public mode:
  - `AllowAzureServices` (`0.0.0.0` to `0.0.0.0`) — allows Azure-hosted callers (Container Apps, Functions, etc.)
  - `AllowAllDev` (`0.0.0.0` to `255.255.255.255`) — allows dev/staging wide-open access for convenience
- Private mode (VNet integration enabled) does not use firewall rules — network isolation remains the boundary
- This completes the bidirectional logic for public/private mode toggling: remove private resources + enable public access
- PR merged (squash)

### PR #28 Review — REJECTED (2026-05-31T01:24:04.280+00:00)

- Rejected PR #28 because the `centralus` move is sound and preserves database/container-app co-location, but `infrastructure/bicep/main.bicep` now defaults `deployRedis` to `false`, which changes the base template behavior for every environment rather than only staging.
- Temporary Redis disable is acceptable as a staging override while Azure Cache for Redis is retired, but the shared template default must stay aligned with the current architecture until a separate Azure Managed Redis migration lands.
- GitHub would not allow a formal `--request-changes` review because the authenticated user is the PR author, so I recorded the rejection as a PR comment.

**Pattern for infrastructure toggles:** Networking-mode toggles must implement both negative logic (remove isolation resources) and positive logic (enable access). Incomplete toggles leave the deployment in an inaccessible state. This pattern should be reused for future public/private infrastructure decisions.

### PR #28 Review — REJECTED then APPROVED (2026-05-31T01:24:04.280+00:00)

**Initial Review:**
- Rejected PR #28 because the `centralus` region change is sound and preserves database/container-app co-location, but `infrastructure/bicep/main.bicep` defaulted `deployRedis` to `false`, which changes baseline template behavior for every environment instead of just staging.
- Pattern feedback: infrastructure overrides for temporary issues must stay scoped; shared template defaults must not drift.

**Re-Review after GNC applied fix:**
- GNC restored `deployRedis: true` in shared template and added staging-only parameter override for `deployRedis: false`
- Approved the revised PR because architecture is preserved, region selection is optimal, and staging-scoped override is clean.
- **Result:** PR #28 merged (squash)

**Follow-up Actions:**
- Issues #25, #26, #27 processed by Ralph
- Plan Azure Managed Redis migration before re-enabling cache in shared environments

### Issue Triage — 2026-05-31

- Approved PR #28 merge by GNC
- Approved Ralph's issue closures: #25, #26 (resolved), #27 (stale)
- Confirmed deployment fix unblocks staging bootstrap with optimal region and preserved architecture

### PR #29 Review — APPROVED (2026-05-31T11:25:29Z)

- Approved the Azure Managed Redis migration PR cleanly — all five criteria satisfied
- Resource type and API version correct (Microsoft.Cache/redisEnterprise@2025-04-01); SKU properly specified (MemoryOptimized_M10 Memory Optimized tier)
- deployRedis workaround fully removed from main.bicep parameter set, example parameters, and both staging workflow deploys (bootstrap + release)
- Private DNS zone renamed correctly to privatelink.redis.azure.net; private endpoint groupId updated to redisEnterprise
- Database child resource properly configured with encrypted client protocol on port 10000; redisDatabaseResource.listKeys().primaryKey correctly wired to REDIS_URL
- Bicep validates cleanly (az bicep build), npm typecheck passes; no regressions to other resources
- Decision/skill docs captured reusable pattern for future deployments; GNC ready for merge

## Session Summary — 2026-05-31T11:25:29Z

**GNC Work:** Azure Managed Redis migration (PR #29) — status SUCCESS
- Completed migration from retired Azure Cache for Redis to `Microsoft.Cache/redisEnterprise`
- Removed `deployRedis` workaround fully
- All validations passed; ready for merge

**Kranz Role:** Scribe recording, PR #29 review pending
