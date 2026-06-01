# EECOM Decision Inbox — Beneficiary Tenant Binding

- **Date:** 2026-06-01T20:04:56.560+00:00
- **Owner:** EECOM
- **Context:** Azure Marketplace SaaS resolve can return a `beneficiaryTenantId` that differs from the landing-page caller's Entra tenant (`tid`). Using the caller tenant as the FastSaaS subscription owner breaks cross-tenant purchase scenarios and can mis-bind lifecycle ownership.
- **Decision:** `packages/api/src/services/subscription-service.ts` now treats `beneficiaryTenantId` from Marketplace resolve as the canonical FastSaaS `tenantId`, with a defensive fallback to the caller tenant only when Marketplace does not return a beneficiary. `planId` and `seats` are also sourced only from Marketplace resolve, not from caller input.
- **Rationale:** Marketplace resolve is the source of truth for both subscription ownership and purchased SKU/quantity. Logging mismatches between caller tenant and beneficiary tenant preserves visibility into expected multi-tenant flows without corrupting tenant binding.
- **Implications:** API subscription-create callers only provide `marketplaceToken` plus optional metadata, and test fixtures must explicitly control mocked resolve responses when they need deterministic tenant ownership or plan/seat values.
