# FIDO Decision — Fulfillment Spec Compliance

- **Date:** 2026-06-04T18:21:05.078+00:00
- **Owner:** FIDO
- **Scope:** `packages/api/src/lib/marketplace-fulfillment.ts`

## Decision
Marketplace SaaS Fulfillment v2 calls must use Microsoft’s required protocol details exactly: resolve goes through `POST /api/saas/subscriptions/resolve`, the marketplace token is sent in `x-ms-marketplace-token`, and all fulfillment requests use `x-ms-requestid` / `x-ms-correlationid` headers.

## Why
These values are protocol requirements, not local conventions. Keeping the client and tests aligned with the published Microsoft contract prevents silent auth failures on resolve and keeps future fulfillment changes from regressing back to the rejected header names.

## Implementation Notes
- `resolveSubscription()` no longer appends `token` to the query string and now adds `x-ms-marketplace-token` only for resolve.
- The shared fulfillment request helper emits `x-ms-requestid` and `x-ms-correlationid` for every method.
- `packages/api/src/__tests__/marketplace-fulfillment.test.ts` covers the resolve POST flow and the spec header names across other fulfillment operations.
