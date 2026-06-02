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

- **2026-05-29T14:30:29.387-05:00:** Customer portal MVP lives in `packages/portal/` as a Next.js App Router app with Tailwind, NextAuth credentials scaffolding, TanStack Query data fetching, and a mock-capable API client for backend-parallel development.
- **2026-05-29T14:30:29.387-05:00:** Reusable portal contract types now live in `packages/shared/src/index.ts`, and the portal shell/navigation pattern is centered around `packages/portal/components/portal-shell.tsx` plus page clients in `packages/portal/components/*-client.tsx`.
- **2026-05-29T14:30:29.387-05:00:** Portal validation is workspace-scoped: `npm run typecheck --workspace=@fastsaas/portal` and `npm run build --workspace=@fastsaas/portal`.

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

- **2026-05-29T19:30:29Z:** Portal MVP complete. Mock adapter enables stable feature development without backend pressure. EECOM API foundation ready for integration.
- **2026-05-29T16:53:13.479-05:00:** Portal modernization moved auth to `packages/portal/auth.ts` with Auth.js v5-style exports (`auth`, `handlers`, `signIn`, `signOut`) and Microsoft Entra ID refresh-token rotation preserved.
- **2026-05-29T16:53:13.479-05:00:** Portal validation now succeeds on Next 15/React 19 with `npm run typecheck --workspace=@fastsaas/portal` using Next compile mode and `npm run build --workspace=@fastsaas/portal` for full production verification.
- **2026-06-01T13:26:36.306+00:00:** Replaced the portal placeholder container with a multi-stage Next.js standalone Docker build, added a startup-safe `/api/health` route, and configured `next.config.mjs` for monorepo-safe standalone tracing so Docker serves the real portal app.

## Cross-Team Updates

- **2026-05-29:** EECOM has completed Issue #2 (Subscription Lifecycle, PR #10) and Issue #3 (Metering Ingestion, PR #9). Both PRs are ready for review. FIDO should review API contracts for portal integration.

## 2026-06-01 Phase 1.5 — Publisher Portal & Merge Conflict Resolution

### Session Summary
FIDO reassigned to resolve PR #64 merge conflicts and fresh-DB migration failures. Portal work on Issue #43 awaits EECOM backend routes + type exports.

### Reassignment: PR #64 Tenant RLS Enforcement (Issue #45)
- **Blocker 1: Merge Conflicts (6 files)**
  - packages/api/src/db/execution-context.ts
  - packages/api/src/db/migrate.ts
  - packages/api/src/db/migrator.ts
  - packages/api/src/db/rls.ts
  - packages/api/src/routes/v1/subscriptions.ts
  - packages/api/src/server.ts
  - Action: Rebase/merge onto origin/main

- **Blocker 2: Fresh-DB Migration Failures**
  - Issue: Unguarded ALTER TABLE statements assume pre-existing subscription_audit_logs + marketplace_webhook_events
  - PostgreSQL error: `relation "subscription_audit_logs" does not exist` on fresh DB
  - Fix: Wrap ALTER TABLE blocks in `tableExists()` guards OR create tables in migration (similar to `METERING_SCHEMA_STATEMENTS`)

- **Validation Requirement:** Confirm `npm run migrate` succeeds end-to-end against empty PostgreSQL database

### Related: PR #59 Publisher Portal (Issue #43)
- **Status:** On hold pending EECOM backend routes
- **Current State:** Portal routing, RBAC, and 403 handling complete and validated
  - Server-side route gating in `packages/portal/app/(portal)/publisher/layout.tsx` ✓
  - Session-role parsing in `packages/portal/lib/roles.ts` ✓
  - Graceful 403 rendering ✓
  - Portal build/typecheck pass ✓
- **Awaits:** EECOM PR #59 v2 revision with @fastsaas/shared type exports

### Decisions
- Kranz: Merge conflicts and fresh-DB migration guards are FIDO-scoped engineering fixes; no architectural changes
## Learnings

- **2026-05-31T19:45:42.525+00:00:** Publisher workflows now live under `packages/portal/app/(portal)/publisher/` with role-aware navigation in `packages/portal/components/sidebar-nav.tsx` and shared guards in `packages/portal/lib/route-access.ts`.
- **2026-05-31T19:45:42.525+00:00:** Portal auth now derives roles from JWT claims in `packages/portal/auth.ts`, so UI RBAC and API error handling can rely on `session.roles` without extra client-side decoding.
- **2026-05-31T19:45:42.525+00:00:** Publisher data flows through `packages/portal/lib/api-client.ts`, using `/v1/auth/context` and `/v1/subscriptions` for live read models while `packages/portal/lib/mock-api.ts` keeps plan and tenant mutations unblocked until dedicated publisher routes exist.

## 2026-05-31T19:45Z — Publisher Portal #43 Complete

FIDO delivered publisher portal basic workflows (issue #43):
- Pages: `/publisher`, `/publisher/plans`, `/publisher/tenants`, `/publisher/tenants/[id]`
- RBAC role-based gating with 403 handling
- Read-only API integration via `/v1/auth/context` and `/v1/subscriptions`
- Typecheck and build validated; PR #59 merged
- Next: Await EECOM publisher-management API routes for mutations

## Learnings

- **2026-06-01T00:04:54.260+00:00:** Publisher portal workflows should never reuse tenant-scoped `/v1/subscriptions` routes for admin experiences; the frontend now targets explicit `/v1/publisher/*` contracts and falls back to the mock adapter until those routes are enabled.
- **2026-06-01T00:04:54.260+00:00:** Publisher screens surface their current integration mode in `packages/portal/components/publisher-integration-banner.tsx`, so operators can tell whether they are on live admin APIs or the mock adapter while preserving the same React Query workflow wiring.
- **2026-06-01T20:50:04.569+00:00:** Marketplace onboarding should persist the resolved FastSaaS `subscriptionId` in the `/landing` callback URL so the portal can resume confirmation after OAuth or refresh without re-posting the marketplace token.
- **2026-06-01T21:20:13.494+00:00:** Callback URLs for portal sign-in and landing flows must stay app-local; `packages/portal/lib/auth-redirect.ts` now rejects protocol-relative and absolute URLs and only returns normalized single-origin paths.
- **2026-06-01T21:20:13.494+00:00:** Customer subscription lookups and activation in `packages/portal/lib/api-client.ts` must path-encode `subscriptionId` before building `/v1/subscriptions/{id}` routes, so landing-page query params cannot alter request paths.
- **2026-06-01T22:33:58.673+00:00:** Portal URL construction is now centralized in `packages/portal/lib/api-paths.ts`; customer action/subscription routes and publisher plan/tenant routes must use these helpers so every dynamic path segment is `encodeURIComponent`-encoded before fetch or mock dispatch.
- **2026-06-01T22:33:58.673+00:00:** When portal paths are encoded before calling `mockRequest`, `packages/portal/lib/mock-api.ts` must `decodeURIComponent` path segments during lookup so mock mode preserves live-route behavior for IDs containing reserved URL characters.
- **2026-06-02T12:29:48.526+00:00:** Marketplace job polling priority must sort `polled_at` with `NULLS FIRST`; keep in-memory repository ordering aligned so newly submitted jobs are never starved behind already-polled work.
