# EECOM Token Redaction Decision

- **Date:** 2026-06-01T21:41:30.419+00:00
- **Owner:** EECOM
- **Context:** Marketplace purchase tokens were being persisted in subscription audit details, request audit resource records, and subscription metadata that later surfaced through subscription read APIs.
- **Decision:** Centralize redaction in `packages/api/src/lib/marketplace-token-redaction.ts`, sanitize subscription metadata and audit details before repository writes, redact create-subscription audit resource IDs, and re-sanitize audit/subscription reads for defense in depth against historical data.
- **Why:** Marketplace purchase tokens are short-lived secrets and should never be persisted or echoed back through API responses. A shared sanitizer keeps future marketplace-related paths aligned and reduces the chance of a partial fix.
- **Files:** `packages/api/src/lib/marketplace-token-redaction.ts`, `packages/api/src/services/audit-service.ts`, `packages/api/src/services/subscription-service.ts`, `packages/api/src/repositories/subscription-repository.ts`, `packages/api/src/routes/v1/subscriptions.ts`
