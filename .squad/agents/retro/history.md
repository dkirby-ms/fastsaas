# RETRO — History

## Project Context
- **Project:** FastSaaS — Next-gen Microsoft Commercial Marketplace SaaS accelerator
- **Stack:** Node.js 22, TypeScript, Turborepo monorepo
- **Testing:** Comprehensive — unit, integration, E2E
- **User:** dkirby-ms

## Learnings

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
