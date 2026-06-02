# EECOM Marketplace OAuth Simplification

- **Date:** 2026-06-02T16:16:43Z
- **Owner:** EECOM
- **Status:** Proposed

## Context
FastSaaS is now explicitly single-publisher-per-deployment. Each deployment has one Partner Center app registration owned by the deploying publisher, and marketplace subscribers are the partner's customers rather than separate publishers.

## Decision
Use the shared deployment environment variables `MARKETPLACE_CLIENT_ID`, `MARKETPLACE_CLIENT_SECRET`, and `MARKETPLACE_TENANT_ID` as the primary Product Ingestion auth path. `packages/api/src/services/marketplace-oauth-service.ts` performs the Azure AD client-credentials exchange with cached bearer tokens, and Product Ingestion callers should use that service instead of requiring tenant-scoped Partner Center credentials.

## Implications
- Product import, sync, and configure-job polling work without `/v1/publisher/partner-center/connect`.
- Tenant-scoped Partner Center credential storage remains legacy compatibility only until a later cleanup removes the unused repository and migration surface.
- Fulfillment and metering flows stay unchanged, continuing to use their existing marketplace secret behavior.
