# Decision: multi-tenant Marketplace architecture reset

**Date:** 2026-06-01T19:54:58.843+00:00  
**Author:** Kranz

## Decision

FastSaaS must treat Azure Marketplace commercial tenancy, portal authentication, and authorization as three separate concerns:

1. **Authentication:** portal and API must accept Microsoft Entra users from external customer tenants via a multi-tenant authority (`organizations` preferred for workforce-only sign-in; `common` only if personal Microsoft accounts are explicitly supported).
2. **Tenant binding:** customer workspace access must be granted from an internal tenant-membership record created from Marketplace resolve/activation data, with `beneficiaryTenantId` stored as the commercial anchor. JWT `tid` is an input to lookup, not the authoritative FastSaaS tenant key by itself.
3. **Authorization:** customer roles must be application-managed per FastSaaS tenant/workspace. Publisher roles may remain separate and home-tenant-controlled, but must not be reused as the customer RBAC model.
4. **Publisher commerce:** current publisher plan/tenant CRUD is not Product Ingestion. Real offer management must live behind a dedicated Partner Center / Product Ingestion module with its own credentials, resource model, and submission workflow.

## Why

The current codebase still assumes a fixed Entra tenant for portal auth, derives API tenant context directly from token claims, and lets subscription creation persist `tenantId` from the caller token even when Marketplace resolve returns a different `beneficiaryTenantId`. That architecture will fail for real cross-tenant Azure Marketplace customers and does not provide a safe basis for Product Ingestion work.

## Required follow-up

- Make portal and API authorities multi-tenant.
- Introduce an internal tenant-membership model and first-user bootstrap flow from Marketplace activation.
- Validate Marketplace resolve `beneficiaryTenantId` against the authenticated organization before access is granted.
- Add explicit publisher identity/config separate from customer subscription tenancy.
- Build Product Ingestion support as a dedicated integration, not by extending `publisher_plans` metadata.
