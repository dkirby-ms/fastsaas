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
