# EECOM Auth Separation Decision

- **Date:** 2026-06-02T16:37:21.468+00:00
- **Owner:** EECOM
- **Issue:** #77

## Context
Publisher administration and customer workspace access use different authority sources. Publisher admins are granted Entra App Roles in the publisher tenant, while customer users are authorized through `tenant_members` records. The shared middleware path previously preferred JWT roles whenever they were present, which let publisher-style app-role claims bleed into customer RBAC decisions.

## Decision
Route middleware must declare its authorization model when injecting request context:
- `authorizationModel: 'publisher'` => authorize from JWT `roles` only
- `authorizationModel: 'customer'` => authorize from `tenant_members` when `TenantMemberService` is available

Publisher routes in `packages/api/src/routes/v1/publisher.ts` now use the publisher model. Customer routes (`auth`, `subscriptions`, `members`, `metering`, and `audit-logs`) use the customer model.

## Rationale
This keeps the single-publisher-per-deployment admin surface aligned with Entra App Roles while preserving customer tenant RBAC as an internal database concern. It also gives route-level intent that future middleware and tests can assert directly, preventing regressions where JWT app roles accidentally satisfy customer authorization checks.

## Key Files
- `packages/api/src/middleware/tenant-context.ts`
- `packages/api/src/routes/v1/publisher.ts`
- `packages/api/src/routes/v1/subscriptions.ts`
- `packages/api/src/routes/v1/members.ts`
- `packages/api/src/routes/v1/metering.ts`
- `packages/api/src/routes/v1/audit-logs.ts`
- `packages/api/src/routes/v1/auth.ts`
