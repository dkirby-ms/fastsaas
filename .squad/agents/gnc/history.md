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

## Key Learnings
- Infrastructure toggles (private ↔ public endpoints) require bidirectional logic: remove private + enable public access
- Bicep: use `name` not `id` for `existing` resources; precompute container-app env arrays in variables
- Staging deployment automation split into separate infra/app workflows for independent operations
- Azure Container Registry requires portable Dockerfile syntax (no BuildKit heredocs)
- Entra-compatible RS256/JWKS validation with sanitized request-ID reflection
