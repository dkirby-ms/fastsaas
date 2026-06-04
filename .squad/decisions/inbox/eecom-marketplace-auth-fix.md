# EECOM Marketplace Fulfillment Auth Fix

- **Date:** 2026-06-04T17:51:02.777+00:00
- **Owner:** EECOM
- **Context:** SaaS Fulfillment activation and related operations were failing because `packages/api/src/lib/marketplace-fulfillment.ts` sent `MARKETPLACE_CLIENT_SECRET` directly as a bearer token instead of exchanging it for an Azure AD access token.
- **Decision:** Reuse `MarketplaceOAuthService` as the shared client-credentials token provider, but instantiate a dedicated fulfillment-scoped provider in `packages/api/src/server.ts` with scope `20e940b3-4c77-4b0b-9a53-9e16a1b010a7/.default` while leaving Product Ingestion on its existing Graph scope. `MarketplaceFulfillmentHttpClient` now depends on a token provider contract and applies the acquired bearer token to every outbound Fulfillment API request.
- **Rationale:** This preserves the existing token-cache and Azure AD error-handling pattern, avoids a second auth stack, and keeps Product Ingestion and Fulfillment aligned on one OAuth implementation while still honoring their different resource scopes.
- **Files:** `packages/api/src/lib/marketplace-fulfillment.ts`, `packages/api/src/server.ts`, `packages/api/src/services/marketplace-oauth-service.ts`
