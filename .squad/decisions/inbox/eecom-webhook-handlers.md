# EECOM Decision Inbox — Marketplace Webhook Operations

- **Date:** 2026-06-01T20:50:04.569+00:00
- **Owner:** EECOM
- **Context:** Azure Marketplace `ChangePlan`, `ChangeQuantity`, and `Transfer` notifications require partner-side acknowledgement, and the live webhook schema uses Partner Center operation identifiers (`id`) and SaaS subscription identifiers (`subscriptionId`) that may differ from FastSaaS's earlier simplified webhook fixture shape.
- **Decision:** `packages/api` should accept either webhook shape, resolve the referenced Marketplace operation via the Fulfillment Operations API before mutating local state, persist plan/quantity/tenant ownership changes with subscription audit entries, and then PATCH the operation status back to Marketplace as `Success`.
- **Rationale:** Validating the operation before mutation prevents spoofed or mismatched change events from rebinding tenant ownership or SKU data, while acknowledging the operation only after local persistence keeps Marketplace and FastSaaS aligned on the authoritative outcome.
- **Implications:** Future Marketplace webhook work should treat `operationId` as mandatory for change-style actions, keep local update handlers idempotent, and preserve `beneficiaryTenantId` as the canonical FastSaaS tenant owner during transfer flows.
