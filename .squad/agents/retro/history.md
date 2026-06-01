# RETRO — History

## Project Context
- **Project:** FastSaaS — Next-gen Microsoft Commercial Marketplace SaaS accelerator
- **Stack:** Node.js 22, TypeScript, Turborepo monorepo
- **Testing:** Comprehensive — unit, integration, E2E
- **User:** dkirby-ms

## Learnings
- 2026-06-01T00:43:05.936+00:00 — Metering recovery drills are most trustworthy when they drive the real outbox worker in simulate mode, then verify `retry_scheduled`, `submitted`, and `dead_letter` transitions before documenting the live operator replay steps.

### 2026-05-31T21:35:32.766Z
- Tenant isolation security test suite (PR #62) has 28/33 tests green but 5 tests remain skipped pending RLS enforcement in production.
- EECOM's tenant RLS rollout (PR #64) establishes the precondition for unskipping these tests: request-scoped execution context propagated to PostgreSQL session settings via `src/db/execution-context.ts` and RLS helpers in `src/db/rls.ts`.

## Cross-Team Updates — 2026-05-31T21:35:32.766Z

**From Scribe Consolidation (Squad Inbox → Decisions)**

- **EECOM tenant enforcement ready:** PR #64 (Issue #45) delivers request-scoped execution context + RLS policies. Once merged, RETRO can unskip 5 security tests.
- **GNC release automation unblocked:** Semantic-release version baseline established. PR #61 ready for merge; monorepo versioning automation will follow conventional commits.
- **Metering runbook next:** GNC PR #63 (webhook/metering runbook validation) awaits GNC review and merges after EECOM's tenant isolation is active.
- 2026-05-31T21:35:32.766+00:00 — Added API security integration fixtures in `packages/api/src/__tests__/security/test-harness.ts` that mint JWKS-backed tokens, seed in-memory subscriptions/metering data, and exercise Express routes directly.
- 2026-05-31T21:35:32.766+00:00 — Tenant-isolation coverage now lives in `packages/api/src/__tests__/security/tenant-isolation.test.ts`, `jwt-tampering.test.ts`, `privilege-escalation.test.ts`, and `rbac-boundaries.test.ts`, with repeatability documented in `packages/api/src/__tests__/security/CATALOG.md`.
- 2026-05-31T21:35:32.766+00:00 — RLS-dependent scenarios are intentionally gated behind `SECURITY_RLS_ENABLED` and skipped until #45 deploys database policies, while scope-enforcement and JWT-tampering checks run in CI today.

## 2026-06-01 Metering & Security Test Finalization

### Session Summary
RETRO finalized Phase 1.5 metering recovery and security test suite. PR #62 merged; PR #63 approved and merged with full metering drill coverage.

### PR #62 — Tenant Isolation Security Suite (Issue #44) ✓ MERGED
- Decision: Tenant-isolation security catalog uses JWKS-backed integration fixtures + Express routes
- RLS-only assertions gated behind SECURITY_RLS_ENABLED (skipped pending Issue #45)
- Coverage: Repeatable in CI and on feature branches without RLS deployment
- Outcome: All RBAC and scope-enforcement scenarios execute; 5 RLS-gated tests skip cleanly

### PR #63 — Webhook/Metering Runbook Validation (Issue #46) ✓ MERGED
- **v1 Rejection:** Staging metering recovery explicitly skipped (not wired to live outbox worker)
- **v2 Submission:** Real metering recovery with three drill scenarios:
  1. **429 Retry Timing:** Runbook Section 3A — injected throttled event, verified `retry_scheduled` with Retry-After timing, confirmed recovery to `submitted`
  2. **5xx Backoff Recovery:** Section 3A — transient 503 with worker-backoff verification; event returns to `submitted` without DLQ
  3. **Dead-Endpoint-to-DLQ Replay:** Section 3B — retry exhaustion to `usage_event_dead_letters`, preserved audit trail, replayed with fresh eventId/idempotencyKey, confirmed replayed event reaches `submitted` while original DLQ row persists
- **Drill Harness:** Simulate mode against controlled stub with real middleware/worker code; staging mode for live validation
- **Validation:** All three scenarios covered; no placeholders; conventional commits ✓

### Metering Recovery Decision
- **Owner:** RETRO
- **Pattern:** Recover dead-lettered usage by:
  1. Restore Marketplace endpoint
  2. Replay payload via POST /v1/metering/events with fresh eventId + idempotencyKey
- **Rationale:** Metering deduplicates on idempotencyKey + (eventId + timestamp). Reusing dead-lettered identifiers would be ignored; direct mutation destroys DLQ evidence trail.
- **Follow-up:** Keep original usage_event_dead_letters row as audit evidence; verify replayed event reaches `submitted`

### Cascading Blockers
- PR #64 (RLS enforcement) reassigned to FIDO — 5 RETRO security tests remain skipped until RLS policies are active
- Once PR #64 merges, RETRO can unskip: `npm run test:rls --workspace=@fastsaas/api`
