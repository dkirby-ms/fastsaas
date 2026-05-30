# GNC — History

## Project Context
- **Project:** FastSaaS — Next-gen Microsoft Commercial Marketplace SaaS accelerator
- **Stack:** Node.js 22, TypeScript, Turborepo monorepo
- **Infra:** Azure Container Apps, Bicep/Terraform, Docker, GitHub Actions
- **User:** dkirby-ms

## Active Assignments (Phase 1)

**2026-05-29 — Kranz Triage Decision**

Assigned to GNC:
- **#5 [NO BLOCK]:** Containerized staging deployment
  - Owner: GNC
  - Dependencies: #1, #2, #3 (stable backend)
  - Sequence: Can scaffold Docker/Bicep early, full deployment integration after backend components are ready
  - Note: No critical blocker; infrastructure can be prepared in parallel but full validation happens in integration phase

**Coordination:** Coordinate with EECOM on API/subscription/metering stability before deploying staging. Portal (#4 FIDO) will be integrated into staging environment.

## Learnings

_No learnings recorded yet._
## Orchestration — 2026-05-29T19:30:29Z

**#5 Containerized Staging Deployment — COMPLETE**
- Docker Compose, Dockerfiles, Bicep infrastructure-as-code modules
- GitHub Actions deploy workflow, deployment runbook
- Two-phase Bicep strategy: deploy shared resources first (`deployContainerApps=false`), build/push images to ACR, redeploy with `deployContainerApps=true`
- Ensures Container Apps always reference valid image tags; enables rollback by redeploying older tags

**Cross-team info:**
- EECOM API foundation (PR #7) ready for staging integration
- FIDO portal MVP (PR #8) ready for staging integration
- Both services containerized and staging infrastructure supports deployment of both
- Decision: Two-phase Bicep avoids failed Container Apps revisions and enables safe rollback

## Learnings

- **2026-05-29T19:30:29Z:** Staging infrastructure complete. Two-phase Bicep deployment strategy ensures Container Apps reliability and rollback safety. API (EECOM) and portal (FIDO) ready for staging integration.
- **2026-05-29T21:10:05Z:** Portal auth now mirrors the Entra-backed API contract: `packages/portal/lib/auth.ts` uses NextAuth Azure AD with a required `NEXTAUTH_SECRET`, `packages/portal/lib/api-client.ts` forwards the session access token as `Authorization: Bearer`, and portal env config must include both the portal app credentials and API audience (`AZURE_AD_API_CLIENT_ID` / optional `AZURE_AD_API_SCOPE`).
## Learnings

- **2026-05-29T15:29:10.202-05:00 — Entra ID auth hardening:** Replaced HMAC bearer-token validation with Entra-compatible RS256/JWKS validation using `createRemoteJWKSet`, tenant context now prefers `tid`/`oid`, and dev-only bypass is gated by `AUTH_BYPASS_ENABLED` instead of a fallback secret.
- **2026-05-29T15:29:10.202-05:00 — Validation pattern:** Integration coverage can use a local JWKS endpoint plus `jose`-signed RS256 test tokens to exercise real asymmetric verification paths, including missing-tenant-claim failures.
- **2026-05-29T15:29:10.202-05:00 — Config approach:** API auth now depends on `AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_ID`, optional issuer/audience/JWKS overrides, and sanitized `x-request-id` reflection to keep log/response metadata safe.
- **2026-05-29:** Metering durability must use a PostgreSQL-backed outbox with expiring claim leases; in-memory storage is only acceptable for non-production or injected test harnesses.
- **2026-05-29:** Azure Marketplace metering submissions must map internal events to `{ resourceId, quantity, dimension, effectiveStartTime, planId }`, and the event contract now requires `planId` at ingest time.

## Cross-Team Updates

- **2026-05-29:** EECOM has completed Issue #2 (Subscription Lifecycle, PR #10) and Issue #3 (Metering Ingestion, PR #9). Both PRs are ready for review. GNC should begin validating deployment integration requirements.

## Learnings

- **2026-05-30T17:03:46.905+00:00:** Bicep `existing` resources in `infrastructure/bicep/main.bicep` must use `name`, not `id`, and deployment-start expressions such as role assignment GUID seeds or Redis key lookups should reference naming variables or existing-resource methods instead of module outputs.
- **2026-05-30T17:03:46.905+00:00:** Container App `env` arrays in `infrastructure/bicep/modules/container-app.bicep` compile reliably when `concat()` with for-expressions is precomputed in a variable and then assigned inside the resource body.
- **2026-05-30T17:20:36.580+00:00:** Staging deployment failure intake now lives in `.github/workflows/deploy-staging-failure-issue.yml` as a separate `workflow_run` handler that inspects failed jobs/steps and opens or updates a `squad` issue instead of embedding issue creation in `deploy-staging.yml`.
- **2026-05-30T17:20:36.580+00:00:** Repeated GitHub Actions failure issues can be deduplicated by storing a hidden failure key in the issue body derived from workflow name, branch, job, and step, then updating the open issue when the same signature fails again.

## Current Status

**2026-05-30T17:20:36.580+00:00 — Issue #15 Complete (PR #17)**

Issue #15 (deploy-failure auto-issue workflow) is now complete. The `.github/workflows/deploy-staging-failure-issue.yml` workflow:
- Listens for failed `Deploy staging` run events
- Queries Actions API for failing job/step names
- Creates or updates a `squad`-labeled GitHub issue keyed by branch:job:step
- Keeps incident reporting decoupled from deployment pipeline
- Enables automatic triage integration for deployment failures

This completes Phase 1 staging deployment automation setup.
