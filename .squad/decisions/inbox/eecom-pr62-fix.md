# EECOM PR #62 fix decision

- **Date:** 2026-06-01
- **Context:** Kranz rejected PR #62 because non-RLS RBAC tests were still skipped and the branch was not merge-clean.
- **Decision:** Enforce Admin/Owner checks for subscription lifecycle routes (`activate`, `suspend`, `unsubscribe`) in the route layer only after confirming the subscription belongs to the caller's tenant.
- **Rationale:** This keeps the non-RLS RBAC suite meaningful now, while preserving tenant-isolation behavior so cross-tenant lifecycle probes still return `404` instead of leaking whether a victim subscription exists.
- **Result:** The skipped Member/Viewer lifecycle tests are now active, the lifecycle role matrix is covered in the security suite, and `packages/api` passes `npm run typecheck`, `npm run test`, and `npm run build` on the rebased branch.
