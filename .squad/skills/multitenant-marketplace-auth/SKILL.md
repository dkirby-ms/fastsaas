---
name: "multitenant-marketplace-auth"
description: "Design auth and tenant binding for Azure Marketplace SaaS across external Entra tenants"
domain: "architecture"
confidence: "high"
source: "observed"
---

## Context
Use this when reviewing or building a Microsoft commercial marketplace SaaS app where customers authenticate from their own Entra tenants but subscriptions are created and governed through Azure Marketplace / Partner Center APIs.

## Patterns
- Treat **authentication**, **commercial subscription identity**, and **workspace authorization** as separate layers.
- Accept customer sign-in through a multi-tenant Entra authority (`organizations` unless personal Microsoft accounts are required).
- Store Marketplace `beneficiaryTenantId` and `purchaserTenantId`, but bind portal/API access through an internal tenant membership record rather than trusting JWT `tid` alone.
- On resolve/activate, bootstrap the first workspace owner from the authenticated user and persist the mapping `{fastsaasTenantId, beneficiaryTenantId, purchaserTenantId, homeTenantId}`.
- Use internal customer roles for workspace RBAC; keep publisher/admin access on a separate role model and, if needed, a separate app registration.
- Treat Product Ingestion / Partner Center offer management as a separate integration boundary with its own credentials and job/status workflow.

## Examples
- Fixed-tenant blockers: `packages/portal/auth.ts`, `packages/api/src/middleware/auth.ts`, `packages/api/src/middleware/tenant-context.ts`
- Marketplace resolve + subscription persistence: `packages/api/src/lib/marketplace-fulfillment.ts`, `packages/api/src/services/subscription-service.ts`
- Current publisher overlay (not Product Ingestion): `packages/api/src/services/publisher-service.ts`

## Anti-Patterns
- Hardcoding the portal issuer to one tenant while expecting external Marketplace customers to sign in.
- Using JWT `tid` as the FastSaaS tenant primary key without reconciling Marketplace `beneficiaryTenantId`.
- Letting portal callers override plan or quantity values that should come from Marketplace resolve/change events.
- Reusing publisher app roles as the end-customer RBAC system.
- Modeling Partner Center offer management as local plan metadata only.
