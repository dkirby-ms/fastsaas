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


## Recent Sessions Summary
- **2026-05-29 to 2026-06-06:** Portal MVP, publisher portal RBAC, product visibility, dark mode, server actions migration. See history-archive.md for detailed session logs.

## 2026-06-07 — Feature Entitlements Portal Integration

### Issues Completed
1. **#150: Feature Gate Components + Context** — Designed `FeatureGateProvider` context for portal. Implemented `useFeatures()` hook for client components. Created `FeatureGate` wrapper with conditional rendering. Integrated with server-side `getEnabledFeatures()` fetching `/portal/features` with 60s revalidate TTL. Pattern: layout fetches features, passes to `PortalShell`, children access via context.

2. **#152: Demo Feature UIs (4 features)**
   - **Dark Mode** — toggle in settings, persists to localStorage, shows upgrade prompt if gated
   - **Advanced Analytics** — multi-chart dashboard (revenue, usage by dimension), "Pro plan required" if gated
   - **Export CSV** — download button for billing + usage, role-gated (Owner+) + plan-gated (Pro)
   - **Custom Webhooks** — endpoint manager (add/edit/delete), admin-only, plan-gated (Pro)
   - All include conditional rendering, upgrade prompts, mock state for local dev

### Mock Removal
- Removed hardcoded mock feature gates from portal codebase
- Portal now always uses real API (`/portal/features`)
- Testability via mock cookie extending subscription gate (optional features field)

### Pattern
- Server component in layout fetches features
- Passes to PortalShell via props/context
- Child pages use `useFeatures()` to conditionally render
- Upgrade prompts show when feature gated
- 60s revalidate TTL on feature fetch (plan changes reflect within 60s)

### Status
4 demo features live with full conditional rendering, real API integration, no mocks.
