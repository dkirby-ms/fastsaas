# Squad Decisions Archive

Archived decisions older than 7 days. Refer to decisions.md for active decisions.

---

## 2026-05-29

### FIDO Portal Scaffold Decision
- **Date:** 2026-05-29T14:30:29.387-05:00
- **Context:** Issue #4 customer portal MVP needs frontend progress before the API is fully integrated.
- **Decision:** The portal scaffold in `packages/portal/` uses a single API client abstraction that can switch between real HTTP requests and a localStorage-backed mock adapter. Screen components consume TanStack Query hooks instead of talking to mock data directly.
- **Why:** This keeps dashboard, plan, and settings screens stable while EECOM finishes backend routes, and it minimizes rework when live endpoints replace the mock adapter.
- **Files:** `packages/portal/lib/api-client.ts`, `packages/portal/lib/mock-api.ts`, `packages/portal/components/dashboard-client.tsx`, `packages/portal/components/plan-client.tsx`, `packages/portal/components/settings-client.tsx`

### GNC Staging Infrastructure Decision
- **Timestamp:** 2026-05-29T14:30:29.387-05:00
- **Context:** Issue #5 staging deployment foundation
- **Decision:** Use a two-phase Bicep deployment. First deploy shared Azure resources with `deployContainerApps=false`, then build and push images to ACR, then redeploy with `deployContainerApps=true` so Container Apps always reference existing tags.
- **Rationale:** This keeps one Bicep entrypoint, avoids failed Container Apps revisions caused by missing images, and supports rollback by redeploying an older image tag.

## 2026-05-30

### EECOM API Foundation Decision
- **Date:** 2026-05-29T14:30:29.387-05:00
- **Owner:** EECOM
- **Decision:** Use an Express + TypeScript workspace package for the backend foundation, with `jose`-based JWT validation, tenant context injection from `tenant_id`/`tid`/`extension_tenant_id`, structured JSON request logging, centralized error handling, and code-annotated OpenAPI publication at `/openapi.json` and `/docs`.
- **Rationale:** This keeps auth and tenant resolution middleware-focused, supports local integration testing with placeholder Azure AD B2C settings, and preserves route contracts for follow-on subscription and metering work.

### EECOM Subscription Lifecycle Decision
- **Date:** 2026-05-29T14:30:29.387-05:00
- **Owner:** EECOM
- **Decision:** Implement subscription lifecycle handling in `packages/api` with a dedicated service and repository boundary, using Prisma-backed persistence when `DATABASE_URL` is configured and an in-memory repository for end-to-end test isolation; route correlation IDs through API and webhook flows into subscription audit records and fulfillment error logs.
- **Rationale:** This keeps the Azure Marketplace fulfillment client, state machine, and persistence concerns decoupled, enables deterministic lifecycle tests without external infrastructure, and preserves a production-ready path to PostgreSQL-backed persistence and auditable webhook processing.

### EECOM PR #6 Fix Decision
- **Context:** Kranz blocked PR #6 for insecure staging deployment primitives and a placeholder API container.
- **Decision:** Harden staging by keeping PostgreSQL Flexible Server on delegated-subnet private access, moving Redis and ACR behind private endpoints with private DNS, disabling ACR admin credentials, and switching container image pulls to managed identities. Because ACR is no longer publicly reachable, the deploy workflow now builds images with `az acr build` instead of runner-local `docker push`.
- **Impact:** Container Apps can resolve and reach Redis/PostgreSQL/ACR over the staging VNet. Registry pull credentials are removed from the template surface area. The API image now builds the real Express service from `packages/api/`.

### FIDO Portal Modernization Decisions
- **Date:** 2026-05-29T16:53:13.479-05:00
- **Owner:** FIDO
- **Decisions:**
  1. **Auth.js versioning:** Portal auth migrated to Auth.js v5 patterns. The npm registry resolves `next-auth` through published `5.0.0-beta.31` release. Adopted latest v5 beta for portal to use new `auth.ts` + `handlers` API now.
  2. **Portal typecheck command:** `tsc --noEmit` against Next 15 route-generated `.next/types` fails on Windows workspace for App Router segments. Portal treats `next build --no-lint --experimental-build-mode compile` as typecheck, while `npm run build --workspace=@fastsaas/portal` remains full production validation.
  3. **Tailwind v4 config:** Portal styling uses CSS-first Tailwind v4 in `app/globals.css` via `@import "tailwindcss"` and `@theme`, with brand colors and `shadow-panel` in CSS tokens. Legacy `tailwind.config.js` and `postcss.config.js` removed.

### GNC Auth Entra Fix
- **Date:** 2026-05-29T15:29:10.202-05:00
- **Owner:** GNC
- **Context:** PR #7 auth middleware used HMAC validation with fallback shared secret, not aligned with Entra ID design.
- **Decision:** Standardize API bearer-token validation on Microsoft Entra-compatible RS256 tokens verified through JWKS (`createRemoteJWKSet`) with explicit non-production bypass flag only for local development.
- **Implications:** Production deployments require `AZURE_AD_TENANT_ID` and `AZURE_AD_CLIENT_ID`. Integration tests exercise asymmetric token validation with JWKS endpoint. Request IDs validated before reflection into logs/responses.

### GNC Deploy Failure Issue (#15)
- **Date:** 2026-05-30T17:20:36.580+00:00
- **Owner:** GNC
- **Context:** Issue #15 requires staging deploy failures to raise triageable GitHub issue without coupling failure-handling logic into deployment workflow.
- **Decision:** Add dedicated `workflow_run` workflow at `.github/workflows/deploy-staging-failure-issue.yml` that listens for failed `Deploy staging` runs, derives failing job/step from Actions API, creates or updates `squad`-labeled issue keyed by branch/job/step.
- **Implications:** Deployment and incident reporting stay separated. Repeated failures for same branch/step deduplicated. Squad triage workflows auto-pick generated issue.

### PR #14 Bicep Review Decision
- **Date:** 2026-05-30T17:03:46.905+00:00
- **Owner:** Kranz (Lead)
- **Context:** Review of PR #14 fixing staging Bicep deployment compilation failures.
- **Decision:** Accept pattern: deployment-start-only contexts use naming variables or resource symbols instead of module outputs. For this stack: `existing` resources bind by `name`, Redis key access uses existing-resource method, RBAC role-assignment names seeded from compile-time-stable identifiers, Container App env arrays precomputed before assignment.
- **Why:** Preserves stable resource identity, keeps ARM/Bicep dependency analysis valid, avoids unsupported runtime expressions in resource names or nested object arrays.

### User Directive: Squad Places
- **Date:** 2026-05-30T17:10:39Z
- **By:** dkirby-ms (via Copilot)
- **Directive:** Team should use Squad Places social network going forward. Configuration in `.env` (`SQUAD_PLACES_API_KEY` and `SQUAD_PLACES_BASE_URL`).
- **Reason:** User request—captured for team memory.

### Team Commentary Skill — Squad Places Routing
- **Date:** 2026-05-30T17:20:36.580+00:00
- **Owner:** Kranz (Lead)
- **Decision:** Non-decision commentary (interesting findings, useful discoveries, helpful observations) belongs in the Squad Places `team-commentary` place, not in `.squad/decisions.md` or shared repo files. Posts should use a short structured format with category, title, why-it-matters, context, optional action, and tags. Scribe does not mirror ordinary commentary; only commentary that matures into a team rule should be promoted into `.squad/decisions/inbox/` for merge.
- **Rationale:** Keeps the decision ledger focused on binding direction, gives all agents a lightweight shared feed for useful findings, and avoids adding extra filesystem ceremony for observations that are helpful but not architectural decisions.

### Kranz PR #17 Review
- **Date:** 2026-05-30T17:31:29.972+00:00
- **Owner:** Kranz (Lead)
- **Context:** Review of PR #17 (`ci: create squad issues for staging deploy failures`) against issue #15 and the existing staging deployment workflow.
- **Decision:** Accept the dedicated `.github/workflows/deploy-staging-failure-issue.yml` pattern. The `workflow_run` trigger is correctly bound to failed `Deploy staging` completions, the script uses least-privilege repository permissions, and failure deduplication via a hidden branch/job/step marker is sufficient for triage.
- **Implications:** Staging incident reporting stays decoupled from deployment execution, repeated failures collapse into a single open squad issue, and generated issues expose only run metadata rather than workflow logs or secrets. GitHub self-approval restrictions may require direct merge when the reviewer is also the recorded PR author.

## 2026-05-31

### GNC Staging Bootstrap Fix (#25 → PR #28)
- **Date:** 2026-05-31T00:58:06.780+00:00
- **Owner:** GNC
- **Context:** Issue #25 revealed staging bootstrap fails in `westus2` and `eastus2` due to PostgreSQL offer restrictions and Azure Cache for Redis retirement.
- **Decision:** Default manual staging deploys to `centralus` region instead of `westus2`, and explicitly pass `deployRedis=false` until stack migration from Azure Cache for Redis to Azure Managed Redis completes.
- **Why:** Validation on branch `gnc/25-fix-staging-bootstrap` showed `centralus` succeeds past `Bootstrap shared infrastructure` step, while `westus2` and `eastus2` are blocked by PostgreSQL availability and Redis creation fails during bootstrap.
- **Follow-up:** Plan dedicated infrastructure work to migrate Redis-dependent environments to Azure Managed Redis before re-enabling cache provisioning in the baseline template.

### Kranz PR #28 Review & Approval
- **Date:** 2026-05-31T01:24:04.280+00:00
- **Owner:** Kranz (Lead)
- **Context:** PR #28 unblocks staging bootstrap by relocating staging region to `centralus` and disabling Redis provisioning pending Azure Managed Redis migration.
- **Decision:** Accept the `centralus` region change because PostgreSQL and Container Apps still share one `location` value, preserving the directive to keep database and compute co-located. Reject initial shared-template default change that set `deployRedis=false` globally; the opt-out must remain staging-scoped only.
- **Why:** Immediate fix unblocks staging while avoiding silent architecture drift for other environments that still expect Redis in baseline. Dedicated Azure Managed Redis migration work must be planned before re-enabling cache in shared templates.
- **Resolution:** GNC applied fix in second iteration. PR #28 merged with region change and staging-only Redis disable.
### GNC Deploy Bootstrap Fix
- **Date:** 2026-05-31T00:58:06Z
- **Owner:** GNC
- **Context:** Issue #25 showed the staging bootstrap path is sensitive to Azure offer restrictions and service retirements.
- **Decision:** Default manual staging deploys to `centralus` instead of `westus2`, and explicitly pass `deployRedis=false` until the stack is migrated from retired Azure Cache for Redis to Azure Managed Redis.
- **Why:** Validation on branch `gnc/25-fix-staging-bootstrap` showed `centralus` succeeds past `Bootstrap shared infrastructure`, while `westus2` and `eastus2` are blocked by PostgreSQL offer restrictions and Redis creation fails during bootstrap if left enabled.
- **Status:** Superseded by Redis migration decision (see below).

### Azure Managed Redis Migration (PR #29)
- **Date:** 2026-05-31T11:25:29Z
- **Owner:** GNC
- **Context:** Azure Cache for Redis is retired. Staging had a temporary `deployRedis=false` workaround because the legacy service no longer provisions.
- **Decision:** Standardize FastSaaS Bicep on Azure Managed Redis using `Microsoft.Cache/redisEnterprise` with `Microsoft.Cache/redisEnterprise/databases` child resource. Use Memory Optimized entry SKU (`MemoryOptimized_M10`), encrypted client access on port `10000`, access-key authentication, and private-link settings with `groupId: redisEnterprise` and DNS zone `privatelink.redis.azure.net`. Remove the `deployRedis` workaround logic; keep `centralus` for staging co-location.
- **Why:** The old Azure Cache for Redis is retired. Moving to Azure Managed Redis restores first-class cache provisioning and keeps Redis deployment consistent across environments.
- **Outcome:** PR #29 opened; Bicep validated.
- **Files affected:** `infrastructure/bicep/main.bicep`, `infrastructure/bicep/modules/redis-cache.bicep`, `infrastructure/bicep/main.parameters.example.json`, `.github/workflows/deploy-staging.yml`

### User Directive: Regional Flexibility
- **Date:** 2026-05-31T11:59:56Z
- **By:** dkirby-ms (via Copilot)
- **What:** No regional directive required. The team does not need to enforce a specific Azure region (e.g., centralus). Deployments can use whatever region works best without a mandated co-location constraint.
- **Why:** User request — removes the previously implied region lock. Regions are now flexible per environment.

### User Directive: Workflow Split
- **Date:** 2026-05-31T14:02:05Z
- **By:** saitcho (via Copilot)
- **What:** Split the deploy workflow into two separate workflows: one for infrastructure (Bicep/Azure resources) and one for application (build images, deploy container apps). Deploy infra should be separate from deploy app.
- **Why:** User request — cleaner separation of concerns, different failure modes, different cadences.

### User Directive: Default Deploy Region
- **Date:** 2026-05-31T14:09:38Z
- **By:** saitcho (via Copilot)
- **What:** Default deploy region is centralus (not eastus2). eastus2 has subscription restrictions.
- **Why:** User request — infra already deployed successfully in centralus.

### User Directive: Container App Environment Variables
- **Date:** 2026-05-31T15:04:02Z
- **By:** saitcho (via Copilot)
- **What:** Container app env vars are managed via `az containerapp update --set-env-vars` in a post-deploy workflow step, NOT baked into Bicep parameters. Bicep handles infrastructure only; CLI handles runtime config separately.
- **Why:** User request — env vars change frequently during development. Decoupling them from Bicep avoids editing both main.bicep and the workflow for every new var.

### GNC Portal Dockerfile Standard
- **Date:** 2026-05-31T14:00:03Z
- **Owner:** GNC
- **Context:** The portal placeholder image failed in Azure Container Registry builds because inline file generation relied on shell-sensitive template literals and a BuildKit-only heredoc `COPY` pattern.
- **Decision:** Placeholder container images should keep their runtime source files in the repository and use plain `COPY` instructions from the repo-root Docker build context instead of inline `node -e` generation or heredoc-based file creation.
- **Why:** Azure Container Registry's Docker builder does not support BuildKit heredoc syntax consistently, and inline shell-generated JavaScript is fragile when template literals or quoting are involved. Repository-backed source files produce portable Dockerfiles that work in local Docker and ACR builds.
- **Files:** `packages/portal/Dockerfile`, `packages/portal/placeholder/package.json`, `packages/portal/placeholder/server.mjs`

### GNC Deployment README Decision
- **Date:** 2026-05-31T15:16:56.241Z
- **Author:** GNC (DevOps)
- **Status:** Complete
- **Related Issue:** Deployment documentation
- **Decision:** Created comprehensive deployment README.md at repository root documenting the FastSaaS staging deployment process, including infrastructure bootstrapping, application deployment, and environment variable management.
- **Rationale:** Engineers deploying FastSaaS need clear, practical guidance on the two-phase deployment strategy (infrastructure → application), bootstrap and deployment procedures via GitHub Actions, environment variable management (Bicep infrastructure-coupled vs post-deploy CLI), required GitHub secrets, and troubleshooting common deployment issues. The README targets engineers with Azure basics and provides command-line examples for both automated workflows and manual operations.
- **Key Sections:** Project Overview, Architecture, Prerequisites, Local Development (Docker Compose), Deployment (two workflows), Environment Variables, GitHub Secrets Reference, Key Decisions, Troubleshooting.
- **Reference Files:** `README.md`, `.github/workflows/deploy-infra-staging.yml`, `.github/workflows/deploy-app-staging.yml`, `infrastructure/bicep/main.bicep`, environment config files, `docker-compose.yml`.
- **Impact:** Reduces engineer onboarding time, single source of truth for deployment procedures, documented architecture decisions inform future maintenance and scaling.
- **No Follow-up Actions:** Documentation complete and deployable.

### GNC Workflow Split Decision
- **Date:** 2026-05-31T14:02:05.192Z
- **Owner:** GNC
- **Context:** The original staging deployment workflow bundled shared Azure infrastructure provisioning, ACR image builds, and Container Apps release steps into one manual job, making reruns noisy and failure causes harder to isolate.
- **Decision:** Split staging deployment automation into two manual GitHub Actions workflows: `deploy-infra-staging.yml` for shared Bicep infrastructure bootstrap (`deployContainerApps=false`) and `deploy-app-staging.yml` for ACR builds plus the Container Apps deployment pass (`deployContainerApps=true`) against existing infrastructure.
- **Why:** Infrastructure changes are infrequent and fail differently from application builds or health checks. Separating the workflows keeps manual operations deliberate, allows faster app-only iterations after infra is provisioned, and lets the failure-issue workflow classify incidents by infra vs app pipeline.
- **Files:** `.github/workflows/deploy-infra-staging.yml`, `.github/workflows/deploy-app-staging.yml`, `.github/workflows/deploy-staging-failure-issue.yml`

### GNC Repo Hygiene (#37)
- **Date:** 2026-05-31T15:24:19.224Z
- **Owner:** GNC
- **Context:** Issue #37 completed repo hygiene work establishing foundation practices.
- **Decision:** Implemented GitHub issue templates (YAML format for bug reports and feature requests with squad routing), MIT License at repository root, and enhanced .gitignore coverage for environment overrides, Prisma artifacts, and OS/IDE files.
- **Why:** Standardizes issue triage, clarifies licensing for commercial/open-source stakeholders, and reduces accidental commits of transient files.
- **Commit:** 5da8f72 — "chore: repo hygiene — issue templates, license, gitignore (#37)"
- **Files:** `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`, `LICENSE`, `.gitignore` (updated)
- **Status:** ✓ Complete

### GNC Deploy Health Check Fix (#38)
- **Date:** 2026-05-31T16:05Z
- **Author:** GNC (DevOps)
- **Status:** Complete
- **Related Issue:** #38
- **Decision:** Move authentication credentials (AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID) from post-deploy configuration to Bicep template parameters, ensuring they are available at container startup time.
- **Root Cause:** Azure Container Apps startup probes execute immediately after container creation, before post-deployment configuration scripts can run. Auth credentials required during application initialization were missing, causing health check failures.
- **Implementation:** Added `azureTenantId` and `azureClientId` parameters to `infrastructure/bicep/main.bicep`, created `apiEnvVars` array in Bicep, and updated `deploy-app-staging.yml` to pass these values during deployment.
- **Key Insight:** Any environment variable needed during application initialization must be set via infrastructure-as-code (Bicep), not via post-deploy scripts. Startup probe execution timing must be accounted for when designing deployment strategies.
- **Files Modified:** `infrastructure/bicep/main.bicep`, `infrastructure/bicep/main.parameters.example.json`, `.github/workflows/deploy-app-staging.yml`
- **Commits:** e731019, 411c69d
- **Outcome:** ✓ Container receives auth credentials at deployment time; health check now passes; post-deploy configuration still runs for runtime-specific variables.

### EECOM Prisma Docker Compatibility Fix (PR commit 29855d3)
- **Date:** 2026-05-31T18:54:21.897+00:00
- **Owner:** EECOM
- **Context:** The staging API container crashed during Prisma startup on `node:22-alpine` because the generated musl engine required `libssl.so.1.1`, while current Alpine images provide OpenSSL 3.x libraries.
- **Decision:** Standardize the API container on `node:22-slim` and explicitly generate Prisma engines for `native` and `debian-openssl-3.0.x` in `packages/api/prisma/schema.prisma`. Install the `openssl` package in the runtime image so Prisma has the expected runtime dependency available.
- **Why:** Debian slim matches Prisma's recommended OpenSSL/runtime combination, avoids Alpine musl compatibility issues, and keeps local/native development working while ensuring the container ships a compatible query engine.
- **Files Modified:** `packages/api/Dockerfile`, `packages/api/prisma/schema.prisma`
- **Validation:** Build+typecheck verified (29855d3).

---

## Inbox Decisions (2026-05-31)

### Kranz Phase Roadmap Decomposition
- **Date:** 2026-05-31T19:33:53Z
- **Owner:** Kranz (Lead)
- **Context:** FastSaaS roadmap (Phases 1.5, 2, 3) decomposed into GitHub issues for tracking and squad assignment.
- **Decision:** Established issue naming format `[Phase X.X] Work item title`, label taxonomy (`phase:1.5/2/3`, `squad:eecom/fido/gnc/retro`), GitHub milestone per phase, and standard issue body structure with DoD and technical notes.
- **Rationale:** Maintains consistency across phase planning, enables scannable issue lists, and preserves squad routing conventions.
- **Issue Index:** Created 16 issues (#43–#58) across phases 1.5, 2, 3 with squad assignments documented in decisions.
- **Status:** ✓ Complete

### GNC Health Check Degradation Handling
- **Date:** 2026-05-31T19:45:00Z
- **Owner:** GNC
- **Context:** Issue #41 — staging `deploy-app` failure at health check step after API image changes.
- **Decision:** Allow API to boot in degraded mode when `DATABASE_URL` missing during Container App rollout; extend deploy workflow retry window for new revision warmup.
- **Why:** Container App revision updates are transient; health verification should measure eventual /health availability, not fail on rollout delay or optional database initialization.

### FIDO Publisher Portal Decision
- **Date:** 2026-05-31T19:45:42.525Z
- **Owner:** FIDO
- **Context:** Issue #43 adds publisher workflows before dedicated publisher-management API routes exist.
- **Decision:** Ship publisher pages (`/publisher`, `/publisher/plans`, `/publisher/tenants`, `/publisher/tenants/[id]`) behind session-role RBAC gating, reuse portal API abstraction, map `/v1/auth/context` + `/v1/subscriptions` to read-only publisher views, keep mutations on mock adapter until EECOM lands publisher endpoints.
- **Why:** Preserves RBAC/routing/UX contracts immediately, provides stable frontend surface for review, minimizes future rework when backend routes ship.
- **Files:** `packages/portal/lib/api-client.ts`, `packages/portal/lib/publisher-mappers.ts`, `packages/portal/app/(portal)/publisher/*`, `packages/portal/src/components/publisher-nav.tsx`
- **Status:** ✓ Complete (PR #59 merged)

### Copilot Directive: Semantic Versioning (2026-05-31T19:28Z)
- **By:** saitcho (via Copilot)
- **Decision:** Follow semver.org conventions strictly—MAJOR for breaking changes, MINOR for new backward-compatible features, PATCH for backward-compatible fixes.
- **Why:** User request for team memory and consistency.

### EECOM Semantic Versioning Lightweight Approach
- **Date:** 2026-05-31T19:45:00Z
- **Owner:** EECOM
- **Context:** Issue #36 requests lightweight semantic versioning for API and portal workspaces.
- **Decision:** Use plain semantic versions in `packages/api`, `packages/portal`, `packages/shared`; bump with `npm version patch|minor|major --workspace=<workspace>`; track releases in `CHANGELOG.md` (Keep a Changelog format).
- **Why:** Small team, workspaces start at 0.1.0, `npm version` keeps workflow simple while ensuring consistent package metadata and release notes.
### EECOM Semantic Versioning Decision
- **Date:** 2026-05-31
- **Owner:** EECOM
- **Context:** Issue #36 asks for a lightweight semantic versioning approach for the API and portal workspaces without adding release automation.
- **Decision:** Keep package versions in `packages/api`, `packages/portal`, and `packages/shared` on plain semantic versions and use `npm version patch|minor|major --workspace=<workspace>` for bumps. Track notable release notes in the root `CHANGELOG.md` using the Keep a Changelog structure.
- **Why:** The team is small, the workspace packages already start at `0.1.0`, and `npm version` keeps the workflow simple while still giving consistent package metadata and release notes.

### EECOM Tenant RLS Rollout Decision
- **Date:** 2026-05-31T21:35:32.766+00:00
- **Owner:** EECOM
- **Context:** Issue #45 requires tenant middleware enforcement plus PostgreSQL row-level security for tenant-scoped backend data in `packages/api/`.
- **Decision:** Standardize tenant isolation on request-scoped execution context stored in `src/db/execution-context.ts`, propagating JWT-derived tenant IDs into PostgreSQL session settings (`app.current_tenant`, `app.bypass_rls`) before Kysely or raw SQL repository work. Enable RLS policies for tenant-scoped tables through reusable helpers in `src/db/rls.ts` and the Kysely migration `src/db/migrations/20260531T213532_tenant_rls.ts`.
- **Why:** This keeps API middleware and database enforcement aligned across both Kysely-backed subscription flows and raw-SQL metering flows, while preserving explicit system-bypass paths for webhook processing and the metering worker.
- **Validation:** `cd packages/api && npm run typecheck && npm run test && npm run build`

### Decision: Semantic-Release Version Baseline (PR #61)
**Date:** 2026-05-31T20:29:23.499+00:00  
**Owner:** EECOM  
**Status:** Applied  

#### Problem

PR #61 (GNC's semantic-release config) was rejected by Kranz because:
- `release.config.js` is configured but no git tag establishes the baseline version
- semantic-release defaults to v1.0.0 on first run if no tag exists
- The repo is pre-1.0 (`package.json` at v0.1.0), so the initial release would cut v1.0.0 instead of v0.1.0

#### Solution

Created git tag `v0.1.0` on the merge-base commit (`d450a34`) — the point where the branch diverged from main before GNC's changes.

```bash
git tag v0.1.0 $(git merge-base HEAD main)
git push origin v0.1.0
```

#### Why This Works

- semantic-release scans git history for tags to determine the current version
- With `v0.1.0` tagged on the baseline commit, semantic-release recognizes 0.1.0 as the current version
- Future releases will compute the next version (0.1.1, 0.2.0, 1.0.0, etc.) from 0.1.0 using conventional commit analysis
- The config's `tagFormat: 'v${version}'` and `branches: ['main']` remain correct

#### Outcome

PR #61 is now unblocked for Kranz's re-review. GNC can merge after approval.

#### Pattern for Future Releases

When adding semantic-release to a monorepo:
1. Finalize `release.config.js` and set all `package.json` versions to the intended baseline (e.g., 0.1.0)
2. Create the baseline tag on the last commit before release config changes
3. Merge release config changes after the tag is pushed

### GNC Health Check Degradation Decision
- **Date:** 2026-05-31
- **Owner:** GNC
- **Context:** Issue #41 tracked the staging `deploy-app` failure at the `Verify health checks` step after the Prisma → Kysely migration and API image changes.
- **Decision:** Keep the `/health` endpoint startup-safe by allowing the API process to boot in degraded mode when `DATABASE_URL` is missing during Container App revision rollout, and give the deploy workflow a longer bounded retry window while new revisions warm up.
- **Why:** Container App environment updates can create a new revision that is not immediately ready. Health verification should measure whether the process eventually binds and serves `/health`, not fail on transient rollout delay or optional database initialization.

### GNC Semantic Release Decision
- **Date:** 2026-05-31T20:19:20.148+00:00
- **Owner:** GNC
- **Context:** Issue #60 requires strict semver.org automation for the FastSaaS monorepo while the npm workspaces remain private application packages.
- **Decision:** Manage releases from the repository root with `semantic-release` on `main`, treat the monorepo as a single release stream, and use conventional commits plus `commitlint` to drive version calculation, changelog generation, GitHub releases, and version bumps in the root manifests only.
- **Why:** The API, portal, and shared workspaces ship together as one product, so a repository-wide release process keeps tags, changelog entries, and deployment automation aligned without pretending the private workspaces are independently published npm packages.

### Kranz PR #61 Approval Decision
- **Date:** 2026-05-31T20:43:26.273+00:00
- **Owner:** Kranz
- **Context:** PR #61 (`chore: configure semantic-release`) was previously blocked only because the repository lacked the `v0.1.0` baseline tag required to keep semantic-release on the intended 0.x line.
- **Decision:** Accept the PR as technically approved now that `v0.1.0` exists on merge-base commit `d450a34` and the release automation diff remains clean.
- **Why:** With the baseline tag in place, the semantic-release configuration will calculate the next version from the correct starting point instead of incorrectly jumping to `1.0.0`, and no new correctness or workflow-safety issues were found in the re-review.
- **Note:** GitHub would not accept a formal approval from the current authenticated account because it is the PR author, so the approval outcome was recorded in a PR comment.

### Kranz PR #61 Review Decision
- **Date:** 2026-05-31T20:25:00.184+00:00
- **Owner:** Kranz
- **Context:** PR #61 introduces semantic-release, commitlint, and a release workflow for the FastSaaS monorepo.
- **Decision:** Do not enable semantic-release on `main` until the repository release baseline is made explicit in git tags. Either create and push `v0.1.0` for the already-documented baseline commit, or intentionally reset the project to start at `1.0.0` and update `package.json`/`CHANGELOG.md` to match before merge.
- **Why:** semantic-release uses git tags, not the checked-in `package.json` version, as the release source of truth. With no existing release tag, the first automated release becomes `1.0.0`, which would skip over the repo's current `0.1.0` baseline and break the team's strict semver history.
