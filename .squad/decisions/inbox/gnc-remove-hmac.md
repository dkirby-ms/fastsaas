# GNC Decision: remove dead marketplace webhook HMAC auth

- **Date:** 2026-06-03T20:21:01.497+00:00
- **Owner:** GNC
- **Context:** Microsoft Partner Center does not provide a webhook secret field, so the Marketplace webhook HMAC path in `packages/api/src/middleware/marketplace-webhook-auth.ts` cannot be configured in production and had become dead code after JWT Bearer validation was added.
- **Decision:** Simplify marketplace webhook auth to two modes only: `jwt` (default, validate Microsoft Entra Bearer tokens via JWKS) and `none` (local development bypass). Remove HMAC signature validation, `callback` / `hmac` modes, `MARKETPLACE_WEBHOOK_SECRET`, and `MARKETPLACE_WEBHOOK_TIMESTAMP_TOLERANCE_MS` from the API config surface.
- **Why:** This matches the documented Partner Center webhook contract, removes an unreachable auth branch, and eliminates misleading configuration that suggested a shared-secret option existed.
- **Files:** `packages/api/src/middleware/marketplace-webhook-auth.ts`, `packages/api/src/config.ts`, `packages/api/.env.example`, `packages/api/src/__tests__/marketplace-webhook-auth.integration.test.ts`, `packages/api/src/config.test.ts`
