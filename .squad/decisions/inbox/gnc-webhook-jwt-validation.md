# GNC Webhook JWT Validation

- **Date:** 2026-06-03T20:11:42.315+00:00
- **Owner:** GNC
- **Context:** `callback` marketplace webhook auth was allowing requests with no HMAC headers and no Bearer token, which left the fulfillment callback path unauthenticated.
- **Decision:** In `packages/api/src/middleware/marketplace-webhook-auth.ts`, `callback` mode must require either the existing HMAC header validation path or a Microsoft Entra Bearer token whose issuer matches the configured marketplace tenant, whose audience matches `marketplace.expectedAudience` (defaulting to `marketplace.clientId`), and whose signature and expiry are validated through JWKS. Requests with neither HMAC headers nor a Bearer token now return `401` unless `webhookAuthMode` is `none`.
- **Why:** This closes the unauthenticated callback gap while preserving Microsoft’s documented fulfillment lifecycle authentication flow. Keeping the JWKS URI configurable through `MARKETPLACE_JWKS_URI` also makes the behavior testable without weakening the production default.
- **Files:** `packages/api/src/middleware/marketplace-webhook-auth.ts`, `packages/api/src/config.ts`, `packages/api/src/__tests__/marketplace-webhook-auth.integration.test.ts`, `packages/api/src/config.test.ts`
