# GNC — History

## Project Context
- **Project:** FastSaaS — Next-gen Microsoft Commercial Marketplace SaaS accelerator
- **Stack:** Node.js 22, TypeScript, Turborepo monorepo
- **Infra:** Azure Container Apps, Bicep/Terraform, Docker, GitHub Actions
- **User:** dkirby-ms

## Phase 1 Status (Completed)
- **Issue #5:** Containerized staging deployment — COMPLETED
  - Infrastructure, Bicep templates, GitHub Actions workflows, deployment runbook all delivered
  - Two-phase deployment strategy operational
  - Ready for cross-team staging integration
- Older learnings and delivery details archived in `history-archive.md`

## Current Focus (2026-06-01 onwards)

### 2026-06-01 — Infrastructure & Release Automation Standby

**Release Automation Milestone:**
- **PR #61 Status:** ✓ APPROVED → MERGED (2026-05-31T20:43:26.273+00:00)
  - Baseline tag v0.1.0 created on merge-base commit d450a34
  - semantic-release now recognizes 0.1.0 as starting version
  - Future releases will calculate from 0.1.0 using conventional commits

**Infrastructure Baseline Stable:**
- Staging Bootstrap: PR #28 merged; centralus default + staging-only deployRedis=false
- Azure Managed Redis Migration: PR #29 in flight; standardizes on Microsoft.Cache/redisEnterprise
- Deployment Documentation: PR #30 complete

**Cross-Team Coordination:**
- Webhook/metering runbook ready for validation in live staging
- App layer now driving Phase 1.5 schedule

## Learnings & Patterns (2026-06-01 to 2026-06-05)

### 2026-06-01T14:35:46.727+00:00
- API runtime contract currently only exists implicitly in `packages/api/src/config.ts`; no `.env.example` present
- Portal staging configuration split between build-time `NEXT_PUBLIC_*` and runtime updates in `deploy-app-staging.yml`
- Infrastructure secret provisioning gaps: Marketplace auth tokens, webhook secrets not in checked-in env files

### 2026-06-01T20:22:40.911+00:00
- Multi-tenant Entra access tokens should use `common` JWKS endpoint; issuer validation must accept any `https://login.microsoftonline.com/{tenant}/v2.0` issuer when authority is `common` or `organizations`

### 2026-06-02T01:08:36.792+00:00
- Partner Center credentials resolve through Azure Key Vault with managed identity in `packages/api/src/services/partner-center-auth.ts`

### 2026-06-02T12:29:48.526+00:00
- Product imports with marketplace external IDs must resolve durable product ID via `GET /rp/product-ingestion/product?externalId=...`

### 2026-06-02T13:32:38.823+00:00
- Staging API secret provisioning in `.github/workflows/deploy-app-staging.yml` must stay mirrored with `infrastructure/env/staging-api.env`

### 2026-06-03T00:35:55.147+00:00
- `deploy-app-staging.yml` must render environment files before Bicep deployment

### 2026-06-03T15:45:53.746+00:00
- `.github/workflows/deploy-app-staging.yml` resolves `PORTAL_URL` from GitHub Actions variable `PORTAL_PUBLIC_URL`

### 2026-06-03T18:21:29.489+00:00
- Staging secrets must be provisioned with `az containerapp secret set` before updating Container Apps

### 2026-06-03T20:11:42.315+00:00
- `packages/api/src/middleware/marketplace-webhook-auth.ts` requires valid HMAC or Microsoft Entra Bearer token for webhook ingress

### 2026-06-03T20:21:01.497+00:00
- **Microsoft Partner Center Webhook Security:** No webhook secret configuration; use only `MARKETPLACE_WEBHOOK_AUTH_MODE=jwt` (default) or `none`

### 2026-06-04T13:20:25.015+00:00
- **GitHub Actions Supply-Chain Hardening:** Pin every `uses:` entry to full 40-character commit SHA with inline tag comment

### 2026-06-05T13:30:57.766+00:00
- `infrastructure/env/staging-api.env` carries non-secret Marketplace app registration identifiers as `{{PLACEHOLDER}}` values

### 2026-06-05T16:50:06.603+00:00
- Staging API webhook auth depends on deployment wiring for `MARKETPLACE_CLIENT_ID` and `MARKETPLACE_TENANT_ID`

## Recent Changes (2026-06-06)

- **Legacy Partner Center Cleanup:** Removed partner_center_* tables and all related code. No impact to marketplace fulfillment or product ingestion flows.
- **Staging Deploy Dockerfiles:** Corrected to ensure API builds real Express service
- **Infrastructure Model:** Now aligns with single-publisher-per-deployment model exclusively
