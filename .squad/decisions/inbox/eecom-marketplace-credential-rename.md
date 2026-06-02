# EECOM Marketplace Credential Rename Decision

- **Date:** 2026-06-02T14:18:30.747+00:00
- **Owner:** EECOM
- **Context:** Issue #78 needs Marketplace environment variables to clearly represent long-lived OAuth client credentials instead of ephemeral bearer tokens or generic API keys.
- **Decision:** Rename the API and deployment inputs to `MARKETPLACE_CLIENT_SECRET` and `MARKETPLACE_METERING_CLIENT_SECRET`, and align internal config/client option names to `clientSecret` / `marketplaceClientSecret` while leaving a Phase 2 TODO where token exchange will later replace the current direct Bearer-header usage.
- **Why:** Clear credential naming reduces operator confusion during secret provisioning, keeps validation errors and helper scripts aligned with the actual secret semantics, and documents that the current fulfillment/metering clients still need a follow-up OAuth token-exchange implementation.
- **Files:** `packages/api/src/config.ts`, `packages/api/src/server.ts`, `packages/api/src/lib/marketplace-fulfillment.ts`, `packages/api/src/metering/client.ts`, `packages/api/src/metering/runtime.ts`, `infrastructure/env/staging-api.env`, `.github/workflows/deploy-app-staging.yml`, `scripts/set-secrets.sh`, `scripts/set-secrets.ps1`
