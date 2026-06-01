# FIDO Multi-Tenant Entra Auth

- **Date:** 2026-06-01T20:04:56.560+00:00
- **Owner:** FIDO
- **Context:** The customer portal must allow sign-in from any Microsoft Entra organizational tenant instead of being pinned to the publisher tenant.
- **Decision:** Use the `organizations` authority for the portal's Microsoft Entra issuer and refresh-token endpoint, while making `ENTRA_TENANT_ID` optional so publisher-specific tenant operations can still opt into a concrete tenant later.
- **Why:** `organizations` admits work or school accounts from any tenant but excludes personal Microsoft accounts, which matches the portal requirement. Keeping `ENTRA_TENANT_ID` optional preserves a path for future publisher-scoped behavior without reintroducing single-tenant sign-in.
- **Files:** `packages/portal/auth.ts`
