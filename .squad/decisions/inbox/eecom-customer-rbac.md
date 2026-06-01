# EECOM Customer RBAC

- **Date:** 2026-06-01T20:50:04.569+00:00
- **Issue:** #76
- **Decision:** Implement customer RBAC for Marketplace tenants with a database-backed `tenant_members` table and keep publisher App Roles as the primary authorization source whenever JWT `roles` are present.
- **Rationale:** External customer tenants do not carry the publisher Entra app-role assignments, so tenant membership must become the fallback role source for `/v1/*` authorization and member-management APIs. Bootstrapping the first subscription caller as `Owner` ensures new beneficiary tenants can administer their workspace without manual publisher intervention.
- **Implementation notes:** Added tenant-member repository/service layers, member-management routes under `/v1/members`, owner bootstrap in subscription creation, Prisma schema + migration artifacts for `TenantMember`, and Kysely migration/RLS coverage for the new `tenant_members` table.
