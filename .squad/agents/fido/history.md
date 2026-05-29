# FIDO — History

## Project Context
- **Project:** FastSaaS — Next-gen Microsoft Commercial Marketplace SaaS accelerator
- **Stack:** Node.js 22, TypeScript, Next.js + React + Tailwind, PostgreSQL + Prisma, Turborepo monorepo
- **Frontend:** Next.js customer portal + admin portal
- **User:** dkirby-ms

## Active Assignments (Phase 1)

**2026-05-29 — Kranz Triage Decision**

Assigned to FIDO:
- **#4 [NO BLOCK]:** Customer portal MVP
  - Owner: FIDO
  - Dependencies: #1 API contracts (can prototype in parallel)
  - Sequence: Can start prototyping after #1 API contracts defined, full integration after EECOM backend stabilizes
  - Note: Reduces backend pressure; can work against contracts while EECOM finalizes routes

**Coordination:** Align portal navigation and auth flows with EECOM's API foundation. Staging deployment (#5 GNC) will integrate portal with backend once backend is ready.

## Learnings

- **2026-05-29:** Marketplace webhooks in `packages/api` now require a route-level raw-body parser plus HMAC-SHA256 validation using `timestamp.rawBody`, a 5-minute replay window, and idempotency keys so duplicate Azure lifecycle events return success without reapplying transitions.
