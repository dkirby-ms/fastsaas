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
- **2026-06-03T14:39:04.834+00:00:** Publisher listing-visibility UI uses a dedicated product area under `packages/portal/app/(portal)/publisher/products/`, with shared read-only components in `packages/portal/components/publisher/` and a product-detail layout that owns the Assets/Audiences/Pricing tab navigation.
- **2026-06-03T14:39:04.834+00:00:** New publisher listing routes should use `packages/portal/lib/api-paths.ts` + `packages/portal/lib/api-client.ts` helpers for encoded `/v1/publisher/products/*` paths, while `packages/portal/lib/mock-api.ts` mirrors the same contracts for mock-mode development.
- **2026-06-03T14:39:04.834+00:00:** Issue #103 frontend implementation — Built product pages at `/publisher/products` and `/publisher/products/[productId]` with navigation tabs (Assets/Audiences/Pricing). Components: AssetGallery, VideoPlayer, AudienceList, PricingTable. API integration via existing client pattern; mock adapter for offline dev. "Synced from Partner Center" read-only badge on all pages. Typecheck + build pass. Portal structure supports future asset mutations in separate endpoint scope.
- **2026-06-03T15:28:19.397+00:00:** Issue #84 dark mode uses Tailwind v4 class-based theming with `@custom-variant dark`, an anti-FOUC script in `packages/portal/app/layout.tsx`, and a shared `ThemeProvider`/`ThemeToggle` pair in `packages/portal/components/` that persists `fastsaas-theme` in localStorage while honoring system preference.
- **2026-06-03T15:28:19.397+00:00:** Both customer and publisher views now rely on dark-aware shell and content styles in `packages/portal/components/portal-shell.tsx`, `sidebar-nav.tsx`, and the publisher/customer client components, so new portal UI should add `dark:` variants alongside the existing light-mode Tailwind classes.
- **2026-06-03T18:41:46.175+00:00:** Customer portal dashboard and plan empty states now derive from real subscription presence in `packages/portal/lib/mock-api.ts`; `packages/portal/components/dashboard-client.tsx` and `plan-client.tsx` must treat `DashboardData.subscription`, `DashboardData.usage`, and `PlansResponse.currentPlanId` as nullable when a signed-in customer has no subscription.
- **2026-06-04T13:20:25.015+00:00:** The `/no-subscription` CTA in `packages/portal/app/no-subscription/page.tsx` should resolve its Azure Marketplace destination from `NEXT_PUBLIC_MARKETPLACE_OFFER_URL`, with the current preview offer URL mirrored in `packages/portal/.env.example` as the deployment override point.
- **2026-06-04T18:21:05.078+00:00:** Microsoft SaaS Fulfillment v2 resolve calls in `packages/api/src/lib/marketplace-fulfillment.ts` must use `POST /api/saas/subscriptions/resolve` with the marketplace token in the `x-ms-marketplace-token` header, not a `token` query parameter.
- **2026-06-04T18:21:05.078+00:00:** All Marketplace fulfillment client calls should send `x-ms-requestid` and `x-ms-correlationid`; the fulfillment client tests in `packages/api/src/__tests__/marketplace-fulfillment.test.ts` now assert those exact spec header names across resolve, activate, update, reinstate, and operation calls.
- **2026-06-06T16:13:25Z:** Plan Catalog & UI Modernization — Rewrote publisher-plans-client.tsx with full CRUD operations and two-tab layout (Publisher Plans + Marketplace Plans). Frontend now consumes GET /v1/publisher/marketplace-plans from backend. Removed Products page from portal navigation. Plan management UI fully functional with marketplace linking support.

## 2026-06-06T16:51:37Z — Publisher Portal Server Actions (Issue: env-var client bug)

### Task
Convert all publisher portal API calls from client-side React Query + `portalApi.*` to Next.js Server Actions, fixing a root-cause architectural bug where `USE_MOCK_API`/`API_BASE_URL` (server-only, no `NEXT_PUBLIC_`) were always `undefined` in the browser, causing the portal to always serve mock data.

### Outcome
- BUILD PASS / TYPECHECK PASS
- Server actions in `app/(portal)/publisher/actions.ts` now handle all publisher data fetching + mutations server-side
- Canonical mock/live gate in `lib/server-config.ts` with strict `USE_MOCK_API=false`+missing `API_BASE_URL` → error (no silent fallback)
- All publisher client components updated to call server actions via React Query
- Decision written to `.squad/decisions/inbox/fido-server-actions.md`

## Learnings

- **2026-06-06T16:51:37Z:** Publisher portal must use Server Actions for API calls — env vars `USE_MOCK_API` and `API_BASE_URL` are server-only (no `NEXT_PUBLIC_`), so they evaluate to `undefined` in the browser. The fix is architectural: all publisher data flows go through `app/(portal)/publisher/actions.ts` with `'use server'`.
- **2026-06-06T16:51:37Z:** `mock-api.ts` uses `window.localStorage` and `next-auth/react`'s `getSession()` — both client-only. Server actions cannot call it. Create static default mock data inline in the server actions file for publisher routes.
- **2026-06-06T16:51:37Z:** Use discriminated union `ActionResult<T>` (`{ ok: true; data } | { ok: false; status, code, message }`) when returning from server actions to client components. This avoids Error class identity loss from Next.js serialization. Client components reconstruct `ApiError` via `unwrapResult()` to preserve existing `isApiErrorStatus` / `getErrorMessage` patterns.
- **2026-06-06T16:51:37Z:** Canonical server-side config lives in `packages/portal/lib/server-config.ts`. `publisher-admin-api.ts` re-exports `getPublisherIntegrationMode` from there. The `PublisherIntegrationBanner` (server component) imports from `server-config` directly.
- **2026-06-06T16:51:37Z:** `USE_MOCK_API !== 'false'` → mock; `USE_MOCK_API === 'false'` + `API_BASE_URL` set → live; `USE_MOCK_API === 'false'` + no `API_BASE_URL` → throw (loud config error). `PUBLISHER_API_BASE_URL` overrides `API_BASE_URL` for publisher routes.

## 2026-06-07

- Spin-down checkpoint: Plan Architecture v2 portal work complete
  - Feature gates UI for plan management ✓
  - Product import UI for marketplace plans tab ✓
  - priceMonthly reference cleanup ✓
  - Server Actions fix for mock data issue (IMPLEMENTED) ✓
  - Portal Portal v2 and publisher routes working ✓
- Decisions documented (mock data root cause, server actions decision, RBAC design)
- All publisher portal components updated to use server actions
- Ready for Product Ingestion work and marketplace catalog integration