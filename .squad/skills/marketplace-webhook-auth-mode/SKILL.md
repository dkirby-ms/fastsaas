---
name: "marketplace-webhook-auth-mode"
description: "Accept unsigned Marketplace webhooks by default while preserving optional HMAC validation"
domain: "backend"
confidence: "high"
source: "observed"
---

## Context
Use this when an external control-plane webhook may or may not include signature headers depending on upstream configuration, but the application can validate the event through an authoritative callback API.

## Patterns
- Put webhook auth behind an explicit config mode such as `hmac`, `callback`, or `none`.
- In `callback` mode, allow unsigned requests through, but if signature headers are present require a complete, valid signed request.
- Keep strict `hmac` mode available for deployments that intentionally require Partner Center signing.
- Preserve downstream callback validation against the upstream system for actions that include operation IDs.
- Document header optionality in the route contract and cover unsigned, signed, and partially signed cases with integration tests.

## Examples
- Config parsing: `packages/api/src/config.ts`
- Middleware enforcement: `packages/api/src/middleware/marketplace-webhook-auth.ts`
- Webhook route contract: `packages/api/src/routes/webhooks/marketplace.ts`
- Regression tests: `packages/api/src/__tests__/marketplace-webhook-auth.integration.test.ts`

## Anti-Patterns
- Requiring signature/timestamp headers for every webhook when the upstream product does not guarantee them.
- Treating the absence of signature headers as an automatic 401 in mixed-mode integrations.
- Disabling all validation instead of combining optional HMAC with callback verification.
