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
