# EECOM RBAC invite ceiling

- **Date:** 2026-06-01T21:20:13.494+00:00
- **Review:** PR #83 feedback on branch `squad/76-customer-rbac`
- **Decision:** Enforce invite-time role ceilings for tenant member management so only Owners can assign the `Owner` role, while Admins are limited to inviting `Admin` or `Member` users.
- **Rationale:** The `/v1/members/invite` path previously trusted the requested role after a coarse Admin/Owner route check, which let a tenant Admin create a controlled Owner account and bypass the intended owner-only promotion model already enforced on `PATCH /v1/members/:id/role`.
- **Implementation notes:** The ceiling is enforced before persistence in the members route/service path, and the regression case is covered in `packages/api/src/__tests__/security/privilege-escalation.test.ts` using tenant-membership-backed Admin access rather than publisher JWT app roles.
