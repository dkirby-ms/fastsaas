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
