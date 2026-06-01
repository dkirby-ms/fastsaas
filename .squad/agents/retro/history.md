# RETRO — History

## Project Context
- **Project:** FastSaaS — Next-gen Microsoft Commercial Marketplace SaaS accelerator
- **Stack:** Node.js 22, TypeScript, Turborepo monorepo
- **Testing:** Comprehensive — unit, integration, E2E
- **User:** dkirby-ms

## Learnings

_No learnings recorded yet._

## 2026-05-31T19:45Z — Publisher Portal RBAC Review Ready

FIDO completed publisher portal pages with session-based role gating. Pages are protected by customer/publisher role checks. RETRO may review RBAC implementation in `packages/portal/app/(portal)/publisher/*` and `packages/portal/src/components/publisher-nav.tsx` as part of issue #44 (tenant isolation security test suite). PR #59 available for review.
- 2026-05-31T21:35:32.766+00:00 — Added API security integration fixtures in `packages/api/src/__tests__/security/test-harness.ts` that mint JWKS-backed tokens, seed in-memory subscriptions/metering data, and exercise Express routes directly.
- 2026-05-31T21:35:32.766+00:00 — Tenant-isolation coverage now lives in `packages/api/src/__tests__/security/tenant-isolation.test.ts`, `jwt-tampering.test.ts`, `privilege-escalation.test.ts`, and `rbac-boundaries.test.ts`, with repeatability documented in `packages/api/src/__tests__/security/CATALOG.md`.
- 2026-05-31T21:35:32.766+00:00 — RLS-dependent scenarios are intentionally gated behind `SECURITY_RLS_ENABLED` and skipped until #45 deploys database policies, while scope-enforcement and JWT-tampering checks run in CI today.
