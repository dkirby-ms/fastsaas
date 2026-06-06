# GNC — History (Summarized 2026-05-31)

## Project Context
- **Project:** FastSaaS — Next-gen Microsoft Commercial Marketplace SaaS accelerator
- **Stack:** Node.js 22, TypeScript, Turborepo monorepo
- **Infra:** Azure Container Apps, Bicep/Terraform, Docker, GitHub Actions
- **User:** dkirby-ms

## Phase 1 Assignment
- **Issue #5:** Containerized staging deployment
  - Completed Docker, Dockerfiles, Bicep infrastructure-as-code, GitHub Actions workflows, deployment runbook
  - Two-phase deployment strategy (shared resources first, then app deployment)
  - Ready for cross-team staging integration

## Delivery Summary (2026-05-29 to 2026-05-31)

**Infrastructure & Deployment:**
- Complete Bicep modules with two-phase strategy (`deployContainerApps` flag)
- GitHub Actions fail-issue workflow (`.github/workflows/deploy-staging-failure-issue.yml`)
- Bicep patterns: `existing` resources, container-app env arrays, naming, private endpoints
- Deployment automation: infrastructure bootstrap, ACR builds, Container Apps release
- Comprehensive deployment README with troubleshooting, secrets, architecture decisions

**Environment & Auth:**
- Staging region: `centralus` (PostgreSQL/Azure Cache offer restrictions in other regions)
- Portal auth mirrors Entra contract (NextAuth Azure AD, Bearer token forwarding)
- API auth: RS256/JWKS validation, tenant context from tid/oid, dev-only bypass via AUTH_BYPASS_ENABLED
- Request ID sanitization for safe logging

**Recent Infrastructure Fixes:**
- **Issue #25 (Resolved):** PostgreSQL/Redis provisioning failures in westus2/eastus2 → moved to centralus, disabled Redis provisioning pending migration
- **PR #28 (Merged):** Staging-scoped Redis disable, preserved deployRedis=true baseline for other environments
- **PR #29 (In Review):** Migrated from retired Azure Cache for Redis to Azure Managed Redis using Microsoft.Cache/redisEnterprise with MemoryOptimized_M10 SKU, port 10000 encryption, private-link support

**Standardization:**
- Placeholder services use repository-backed Dockerfiles (not BuildKit-only heredocs or inline shell generation)
- Dockerfile portability for Azure Container Registry compatibility

## Current Status (2026-05-31T15:24Z)

**Completed Background Tasks:**
1. **copilot-setup-steps.yml** — Cloud agent configuration created and pushed to main
2. **Issue #37 Repo Hygiene** — GitHub templates (YAML bug/feature), MIT License, enhanced .gitignore (commit 5da8f72)

**Awaiting Review:**
- PR #29 (Azure Managed Redis migration)

**Next Phase:**
- Await EECOM API/subscription/metering stabilization
- Full Azure Managed Redis rollout across environments

## Current Status (2026-05-31T16:05Z)

**Completed:**
- **Issue #38 Resolved** — Staging deploy health check failure fixed (commit e731019)
  - Root cause: API container startup probe failed due to missing AZURE_AD_TENANT_ID and AZURE_AD_CLIENT_ID
  - Solution: Moved env vars from post-deploy az containerapp update to Bicep template parameters
  - Result: Container now has required credentials available during initial startup

## Key Learnings
- Infrastructure toggles (private ↔ public endpoints) require bidirectional logic: remove private + enable public access
- Bicep: use `name` not `id` for `existing` resources; precompute container-app env arrays in variables
- Staging deployment automation split into separate infra/app workflows for independent operations
- Azure Container Registry requires portable Dockerfile syntax (no BuildKit heredocs)
- Entra-compatible RS256/JWKS validation with sanitized request-ID reflection
- **Container startup timing:** Environment variables required during startup (e.g., auth credentials) must be set via Bicep deployment, not via post-deploy az containerapp update. The startup probe runs before post-deploy configuration steps.

## 2026-05-31T18:54 — CROSS-AGENT NOTIFICATION: API Docker Image Update

**From:** EECOM  
**Impact:** Container image change affects staging deployment

EECOM fixed Prisma OpenSSL compatibility by switching API container base from `node:22-alpine` to `node:22-slim` (commit 29855d3). Staging deploy pipeline will now pull images built from Debian-slim base instead of Alpine.

**Deploy Pipeline Impact:**
- ACR builds using `az acr build` will resolve `node:22-slim` from Docker Hub
- Staged image tags remain version-consistent
- No workflow changes required; full compatibility with `deploy-app-staging.yml`

**For Validation:**
- Manual staging deploy should pull the updated API image without errors
- Health checks should initialize properly with Debian-compatible Prisma engines

## 2026-05-31 — Health Check Fix

**Issue:** #41

**Completed:**
- Hardened API startup so missing or late database configuration no longer prevents the process from binding its HTTP port.
- Kept the `/health` endpoint database-free so Container App probes can succeed during degraded startup.
- Extended deploy workflow health verification to poll both staging endpoints long enough for post-deploy Container App revisions to finish warming.

**Learnings:**
- Container App `az containerapp update --set-env-vars` rollout timing can exceed a short curl retry budget even when the service eventually becomes healthy.
- Operational health probes must not depend on optional database initialization if they gate deployment success.

## Learnings
### 2026-05-31T20:19:20.148+00:00
- Semantic-release now lives at the repo root with `release.config.js`, using a single repository version stream for the private npm workspaces in `packages/api`, `packages/portal`, and `packages/shared`.
- GitHub automation for release management is split across `.github/workflows/release.yml` (publish from `main`) and `.github/workflows/commitlint.yml` (lint PR commit history against conventional commits).
- Root-level release metadata is captured in `CHANGELOG.md`, `package.json`, and `package-lock.json`, which are the assets committed back by `@semantic-release/git` during release preparation.

## Cross-Team Updates — 2026-05-31T21:35:32.766Z

**From Scribe Consolidation (Squad Inbox → Decisions)**

- **PR #61 unblocked:** Semantic-release version baseline (`v0.1.0`) established on merge-base commit. Kranz approval recorded. Ready for merge post-review.
- **EECOM tenant RLS:** PR #64 merged in (Issue #45), enabling RLS policies across tenant-scoped tables. RETRO's security tests (PR #62) can now unskip 5 RLS-dependent test cases.
- **Monorepo versioning locked in:** Semantic Versioning decision recorded — manual `npm version` for workspace bumps + Keep a Changelog (root) for team release notes.
### 2026-05-31T21:35:32.766+00:00
- Marketplace webhook authentication is enforced before JSON parsing, using the raw request body plus the timestamp header to compute an HMAC-SHA256 digest, and the replay window defaults to five minutes via `MARKETPLACE_WEBHOOK_TIMESTAMP_TOLERANCE_MS`.
- Metering retries only for `429` and `5xx` responses, honors `retry-after` when present, and moves exhausted events into `usage_event_dead_letters`, so operator drills must validate both retry scheduling and dead-letter recovery.
- A practical runbook pattern for this repo is dual-mode validation: deterministic local drills for auth/retry logic and live staging probes for signed webhook ingress behavior.

## 2026-06-01 — Infrastructure & Release Automation Standby

### Session Summary
GNC monitoring Phase 1.5 approvals and coordinating release automation unblock. No direct GNC work this session; infrastructure baseline stable. PR #61 (semantic-release) approved and merged; v0.1.0 tag established on merge-base commit.

### Release Automation (Indirect)
- **PR #61 Status:** ✓ APPROVED → MERGED (2026-05-31T20:43:26.273+00:00)
  - Baseline tag v0.1.0 created on merge-base commit d450a34
  - semantic-release now recognizes 0.1.0 as starting version
  - Future releases will calculate from 0.1.0 using conventional commits
- **Pattern for Future Releases:**
  1. Finalize release.config.js and set package.json versions
  2. Create baseline tag on last commit before release config changes
  3. Merge release config changes after tag is pushed

### Infrastructure Observations
- **Staging Bootstrap:** PR #28 merged; centralus default + staging-only deployRedis=false (temporary workaround)
- **Azure Managed Redis Migration:** PR #29 in flight; standardizes on Microsoft.Cache/redisEnterprise (Azure Cache for Redis retired)
- **Deployment Documentation:** PR #30 complete — comprehensive deployment README with architecture, prerequisites, env variable management, secrets reference, troubleshooting

### Cross-Team Coordination
- Webhook/metering runbook (PR #63) ready for GNC validation and drill scheduling in live staging
- Tenant RLS enforcement (PR #64) reassigned to FIDO for merge-conflict resolution
- Infrastructure baseline stable; app layer now driving Phase 1.5 schedule

## Learnings
### 2026-06-01T14:35:46.727+00:00
- The API currently has no `packages/api/.env.example`, so its runtime contract only exists implicitly in `packages/api/src/config.ts` and migration commands.
- Portal staging configuration is split between build-time `NEXT_PUBLIC_*` behavior in `packages/portal/Dockerfile` and runtime `API_BASE_URL` updates in `deploy-app-staging.yml`, which do not line up with the live portal code paths.
- `infrastructure/env/staging-portal.env` references `portal-entra-client-secret` and `portal-nextauth-secret` via `secretref:`, but no secret provisioning step exists in the checked-in Bicep or workflows.
- API staging wiring covers Entra auth plus Bicep-managed `DATABASE_URL`/`REDIS_URL`, but no checked-in staging source was found for `MARKETPLACE_AUTH_TOKEN`, `MARKETPLACE_WEBHOOK_SECRET`, or `MARKETPLACE_METERING_API_KEY`.
### 2026-06-01T20:22:40.911+00:00
- Multi-tenant Entra access tokens for FastSaaS API validation should use the shared `common` JWKS discovery endpoint, while issuer validation must accept any `https://login.microsoftonline.com/{tenant}/v2.0` issuer when the configured authority is `common` or `organizations`.
### 2026-06-02T01:08:36.792+00:00
- Partner Center credentials now resolve through Azure Key Vault using managed identity in `packages/api/src/services/partner-center-auth.ts`, accepting full secret URIs or `keyvault:SECRET_NAME` when `AZURE_KEY_VAULT_URL` is configured; `env:` secret refs remain local/test-only via `packages/api/src/server.ts`.
- `/v1/publisher/partner-center/connect` now proves Product Ingestion access with `GET /rp/product-ingestion/product?$maxpagesize=1&$version=2022-03-01-preview5`; Microsoft Graph `/organization` lookup is best-effort metadata only.
- Future Partner Center operational touchpoints live in `packages/api/src/services/partner-center-auth.ts`, `packages/api/src/services/partner-center-service.ts`, `packages/api/src/routes/v1/publisher.ts`, and `packages/api/package.json` for Azure SDK dependencies.
### 2026-06-02T12:29:48.526+00:00
- Product imports that begin with a marketplace external ID must resolve the durable product ID through `GET /rp/product-ingestion/product?externalId=...` before calling `resource-tree/<durableId>`; tests should assert the two-step contract explicitly.
### 2026-06-02T13:32:38.823+00:00
- Staging API secret provisioning in `.github/workflows/deploy-app-staging.yml` must stay mirrored with `infrastructure/env/staging-api.env`; new runtime secrets require both `az containerapp secret set` entries and matching `secretref:` env mappings for Container Apps to resolve them.
### 2026-06-03T00:35:55.147+00:00
- `deploy-app-staging.yml` must render `infrastructure/env/staging-api.env` and `infrastructure/env/staging-portal.env` before the Bicep deployment so Container Apps are created with all startup env vars and secret refs already present.
- Runtime secret values for staging Container Apps should flow into `infrastructure/bicep/main.bicep` via secure object parameters plus non-secret secret-ref metadata, avoiding post-deploy `az containerapp secret set` / `az containerapp update` race windows while keeping deployment history masked.
- Portal staging must set `USE_MOCK_API=false` in `infrastructure/env/staging-portal.env`; `packages/portal/lib/api-client.ts` and `packages/portal/lib/publisher-admin-api.ts` otherwise fall back to mock mode when the flag is missing or not equal to `false`.
### 2026-06-03T15:45:53.746+00:00
- `.github/workflows/deploy-app-staging.yml` now resolves `PORTAL_URL` from the non-secret GitHub Actions variable `PORTAL_PUBLIC_URL` when present, and falls back to the Azure Container Apps default FQDN when it is unset.
- The staging deploy workflow trims a trailing slash from `PORTAL_PUBLIC_URL`, uses the resolved URL for portal health checks, and still verifies the ACA hostname separately when a custom domain override is active.
- Manual custom-domain staging still requires the Entra redirect URI to match `NEXTAUTH_URL`; the workflow comment documenting that requirement lives beside the `PORTAL_PUBLIC_URL` resolution logic.
### 2026-06-03T18:21:29.489+00:00
- `.github/workflows/deploy-app-staging.yml` must provision staging secrets with `az containerapp secret set` before updating either Container App, because the generated env var payloads in `infrastructure/env/.generated-staging-*.env.json` include `secretref:` values that depend on those secrets already existing.
- Staging app rollouts should use a single `az containerapp update` call per app that combines `--image` and `--set-env-vars`, eliminating the stale-config window and reducing deploy-time restarts from two revisions to one.
- Key paths for this sequencing pattern are `.github/workflows/deploy-app-staging.yml`, `infrastructure/env/staging-api.env`, and `infrastructure/env/staging-portal.env`.
### 2026-06-03T20:11:42.315+00:00
- `packages/api/src/middleware/marketplace-webhook-auth.ts` now requires callback-mode marketplace webhooks to present either valid HMAC headers or a Microsoft Entra Bearer token whose issuer, audience, signature, and expiry are verified against the configured marketplace tenant and audience.
- Marketplace webhook JWT verification defaults to the Microsoft `common` JWKS endpoint but is overrideable via `MARKETPLACE_JWKS_URI`, which keeps production aligned with Entra and enables deterministic local integration tests.
- `.github/workflows/ci-failure-issue.yml` listens for failed `CI` workflow runs on `main` and pull requests, deduplicates issues by workflow plus branch, captures failed job and step names with a log snippet, and routes portal-vs-API failures with `squad:fido` or `squad:eecom` labels when the logs make ownership clear.
### 2026-06-03T20:21:01.497+00:00
- Microsoft Partner Center does not expose a webhook secret configuration, so FastSaaS marketplace webhooks should use only `MARKETPLACE_WEBHOOK_AUTH_MODE=jwt` (default) or `none`; the HMAC header path and `MARKETPLACE_WEBHOOK_SECRET` / `MARKETPLACE_WEBHOOK_TIMESTAMP_TOLERANCE_MS` settings are dead code and should stay removed.
- `packages/api/src/routes/webhooks/marketplace.ts` now documents Microsoft Entra Bearer authentication for webhook ingress, while local/test coverage should focus on JWT validation and `none` mode rather than synthetic HMAC signatures.

### 2026-06-04T13:20:25.015+00:00
- Supply-chain hardening for GitHub Actions in this repo should pin every remote `uses:` entry in `.github/workflows/*.yml` to a full 40-character commit SHA and keep the human-readable major tag as an inline comment.
- The canonical action refs currently used by FastSaaS workflows are `actions/checkout` (`v5`), `actions/setup-node` (`v5`), `actions/github-script` (`v8`), and `azure/login` (`v3`).
- `.github/dependabot.yml` is the key path for keeping pinned GitHub Action SHAs fresh automatically, while `.github/workflows/ci.yml`, `release.yml`, `deploy-app-staging.yml`, and `deploy-infra-staging.yml` remain the highest-impact workflow files for CI/CD and Azure operations.

### 2026-06-05T13:30:57.766+00:00
- `infrastructure/env/staging-api.env` can carry non-secret Marketplace app registration identifiers as `{{PLACEHOLDER}}` values that the staging deploy workflow renders from GitHub Actions secrets into plain Container App env vars, while true secrets still stay on the `secretref:` + `az containerapp secret set` path.
- Staging webhook JWT auth now depends on the deployment wiring for `MARKETPLACE_CLIENT_ID` and `MARKETPLACE_TENANT_ID`; if either is omitted, the API falls back to local-dev defaults and rejects real Microsoft bearer tokens.
### 2026-06-05T16:50:06.603+00:00
- Staging API console logs for `staging-api` no longer show the prior `Marketplace webhook bearer token is invalid or expired` failure; recent marketplace webhook attempts are now reaching application logic and failing with `AppError: Subscription for marketplace webhook was not found` from `packages/api/src/services/subscription-service.ts` (source line 416; built stack shows `/app/packages/api/dist/services/subscription-service.js:293`) for marketplace subscription IDs including `6055bc70-4fde-45da-dbee-8d7f21430d60` and `d23b48e9-ce29-4628-da9f-d95ab7a1a07a`.
- The same log window also shows malformed marketplace webhook payloads failing earlier with `AppError: Webhook action must be Suspend, Unsubscribe, Reinstate, ChangePlan, ChangeQuantity, Transfer` from `packages/api/src/routes/webhooks/marketplace.ts:75` (built stack `/app/packages/api/dist/routes/webhooks/marketplace.js:92`), indicating some incoming callbacks use an unsupported `action` value.
