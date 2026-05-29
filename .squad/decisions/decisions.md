# Decisions Log

## 2026-05-29

### FIDO Portal Scaffold Decision
- **Date:** 2026-05-29T14:30:29.387-05:00
- **Context:** Issue #4 customer portal MVP needs frontend progress before the API is fully integrated.
- **Decision:** The portal scaffold in `packages/portal/` uses a single API client abstraction that can switch between real HTTP requests and a localStorage-backed mock adapter. Screen components consume TanStack Query hooks instead of talking to mock data directly.
- **Why:** This keeps dashboard, plan, and settings screens stable while EECOM finishes backend routes, and it minimizes rework when live endpoints replace the mock adapter.
- **Files:** `packages/portal/lib/api-client.ts`, `packages/portal/lib/mock-api.ts`, `packages/portal/components/dashboard-client.tsx`, `packages/portal/components/plan-client.tsx`, `packages/portal/components/settings-client.tsx`

### GNC Staging Infrastructure Decision
- **Timestamp:** 2026-05-29T14:30:29.387-05:00
- **Context:** Issue #5 staging deployment foundation
- **Decision:** Use a two-phase Bicep deployment. First deploy shared Azure resources with `deployContainerApps=false`, then build and push images to ACR, then redeploy with `deployContainerApps=true` so Container Apps always reference existing tags.
- **Rationale:** This keeps one Bicep entrypoint, avoids failed Container Apps revisions caused by missing images, and supports rollback by redeploying an older image tag.
