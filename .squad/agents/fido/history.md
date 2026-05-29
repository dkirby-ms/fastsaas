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

## Orchestration — 2026-05-29T19:30:29Z

**#4 Customer Portal MVP — COMPLETE (PR #8)**
- Next.js App Router + Tailwind CSS, auth scaffold, dashboard/plan/settings pages
- Mock API client with TanStack Query supports parallel EECOM development
- Ready for live API integration when EECOM endpoints stabilize
- Staging deployment (GNC) will integrate portal into containerized environment

**Cross-team info:**
- EECOM API foundation (PR #7) includes JWT auth, tenant middleware, OpenAPI docs. Portal endpoints ready to integrate.
- GNC staging supports portal deployment with two-phase Bicep strategy for safe rollback
- Decision: Portal abstracted API client means zero rework to switch from mock to real endpoints

## Learnings

- **2026-05-29T14:30:29.387-05:00:** Customer portal MVP lives in `packages/portal/` as a Next.js App Router app with Tailwind, NextAuth credentials scaffolding, TanStack Query data fetching, and a mock-capable API client for backend-parallel development.
- **2026-05-29T14:30:29.387-05:00:** Reusable portal contract types now live in `packages/shared/src/index.ts`, and the portal shell/navigation pattern is centered around `packages/portal/components/portal-shell.tsx` plus page clients in `packages/portal/components/*-client.tsx`.
- **2026-05-29T14:30:29.387-05:00:** Portal validation is workspace-scoped: `npm run typecheck --workspace=@fastsaas/portal` and `npm run build --workspace=@fastsaas/portal`.
- **2026-05-29T19:30:29Z:** Portal MVP complete. Mock adapter enables stable feature development without backend pressure. EECOM API foundation ready for integration.
- **2026-05-29:** Marketplace webhooks in `packages/api` now require a route-level raw-body parser plus HMAC-SHA256 validation using `timestamp.rawBody`, a 5-minute replay window, and idempotency keys so duplicate Azure lifecycle events return success without reapplying transitions.
