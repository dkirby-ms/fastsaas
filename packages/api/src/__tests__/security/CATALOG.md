# Tenant Isolation Security Catalog

Last updated: 2026-05-31T21:35:32.766+00:00

This catalog documents the repeatable tenant-isolation and authorization scenarios covered by the Vitest security suite in this directory. Active tests run against the Express API with in-memory fixtures; scenarios that require the Phase 1.5 RLS rollout remain explicitly skipped until `SECURITY_RLS_ENABLED=true` and the database policies from #45 are available.

## Scenario Matrix

| File | Scenario | Severity | Expected result | Pass / fail criteria |
| --- | --- | --- | --- | --- |
| `tenant-isolation.test.ts` | Tenant A lists subscriptions after both tenants create fixtures | Critical | Response contains only Tenant A records | Pass when only caller-owned subscription ids are returned; fail on any foreign tenant row |
| `tenant-isolation.test.ts` | Tenant A fetches Tenant B subscription id directly | Critical | `404` without tenant leakage | Pass when API hides existence of the foreign record; fail on `200`, `403`, or leaked tenant metadata |
| `tenant-isolation.test.ts` | Tenant A attempts a lifecycle change on Tenant B subscription | Critical | `404` and owner record unchanged | Pass when mutation is rejected and the victim subscription stays in its original state |
| `tenant-isolation.test.ts` | Metering dashboard reads after both tenants ingest usage | High | Tenant-scoped counts only | Pass when each tenant sees only its own pending usage totals |
| `tenant-isolation.test.ts` | Direct database read/write probes with RLS enabled | Critical | Blocked by database policy | Pending/skip until #45 deploys RLS; fail once enabled if any foreign tenant row is readable or mutable |
| `privilege-escalation.test.ts` | Forged elevated role without `metering:write` scope posts usage | High | `403` | Pass when scope enforcement blocks the write even with `Admin` role claims |
| `privilege-escalation.test.ts` | Forged elevated role without `metering:read` scope reads dashboard | High | `403` | Pass when scope enforcement blocks the read even with `Owner` role claims |
| `privilege-escalation.test.ts` | Forged elevated role without baseline subscription scope lists subscriptions | High | `403` | Pass when `api:read` remains mandatory regardless of role claim tampering |
| `privilege-escalation.test.ts` | Member attempts tenant-management lifecycle action | High | Blocked by RBAC middleware | Pending/skip until advanced RBAC from Phase 1.5 is implemented |
| `privilege-escalation.test.ts` | Viewer attempts publisher-only action | High | Blocked by RBAC middleware | Pending/skip until publisher surface and RBAC controls are implemented |
| `jwt-tampering.test.ts` | Token claim forges a different tenant id | Critical | `403` | Pass when issuer/tenant mismatch is rejected |
| `jwt-tampering.test.ts` | Expired bearer token | High | `401` | Pass when expired tokens are rejected as invalid or expired |
| `jwt-tampering.test.ts` | Token omits tenant claims | Critical | `403` | Pass when tenant context is mandatory |
| `jwt-tampering.test.ts` | Token omits both subject and object id claims | High | `401` | Pass when subject identity is mandatory |
| `jwt-tampering.test.ts` | JWT payload altered without resigning | Critical | `401` | Pass when signature validation catches the tampering |
| `rbac-boundaries.test.ts` | Read matrix for `auth/context`, `subscriptions`, and `metering/dashboard` across Admin / Owner / Member / Viewer | High | Allowed with correct route scope | Pass when each role succeeds only when the route-specific scope is present |
| `rbac-boundaries.test.ts` | Matrix requests missing route-specific scopes | High | `403` with missing scope details | Pass when every denial reports the expected missing scope |
| `rbac-boundaries.test.ts` | Admin / Owner-only lifecycle matrix | High | Blocked for Member / Viewer | Pending/skip until RBAC middleware lands |
| `rbac-boundaries.test.ts` | Audit-log and billing export checks with database RLS enabled | High | Tenant-scoped results only | Pending/skip until #45 deploys the required tables and policies |

## Execution Notes

- Primary command: `npm run test --workspace=@fastsaas/api -- --run src/__tests__/security`
- Validation command for this issue: `cd packages/api && npm run typecheck && npm run build`
- RLS-dependent cases stay skipped until the staging environment exposes the Phase 1.5 database policies from #45.
