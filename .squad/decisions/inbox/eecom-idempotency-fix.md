# EECOM Idempotency Fix

- **Date:** 2026-06-01T21:20:13.494+00:00
- **Owner:** EECOM
- **Context:** Marketplace change-operation webhooks (`ChangePlan`, `ChangeQuantity`, `Transfer`) can retry with a new request ID while preserving the Marketplace operation ID.
- **Decision:** Webhook idempotency keys in `packages/api/src/routes/webhooks/marketplace.ts` must prefer `operationId` over `requestId`, while the shared webhook contract in `packages/shared/` continues to expose the operation fields needed by the API consumer.
- **Why:** `operationId` is the stable Marketplace identifier for a single change operation. Using it first prevents retries from being treated as new deliveries and avoids repeating local state changes or Marketplace completion PATCH calls.
