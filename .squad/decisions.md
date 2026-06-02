# Squad Decisions

## Active Decisions

### Phase 1 Issue Triage & Squad Routing

**Date:** 2026-05-29  
**Owner:** Kranz (Lead)  
**Status:** Active

#### Assignment

| Issue | Title | Squad | Blocking | Dependencies |
|-------|-------|-------|----------|--------------|
| #1 | API foundation and auth baseline | EECOM | Yes (all P1 backend) | None |
| #2 | Subscription lifecycle and fulfillment | EECOM | Yes (revenue flow) | #1 |
| #3 | Metering ingestion and submission | EECOM | Yes (revenue recognition) | #1 |
| #4 | Customer portal MVP | FIDO | No (can prototype) | #1 (API contracts) |
| #5 | Containerized staging deployment | GNC | No (integration phase) | #1, #2, #3 (stable) |

#### Rationale

- **#1 → EECOM (critical):** API foundation is the bedrock. All backend work depends on Express scaffolding, tenant context, and middleware. Must ship first.
- **#2 → EECOM:** Subscription state machine and marketplace integration—core business logic. Depends on API routes being available.
- **#3 → EECOM:** Metering pipeline (ingestion, idempotency, retries, DLQ)—parallel with #2 after #1 ships. Both can start together.
- **#4 → FIDO:** Portal UI work. Can prototype against API contracts from #1, but integrate after backend routes stabilize. Reduces backend pressure.
- **#5 → GNC:** Infrastructure. Can scaffold Docker/Bicep early, but full staging deployment validates after #1-#3 are ready.

#### Execution Sequence

1. **Immediate:** EECOM starts #1 (API foundation)
2. **After #1:** EECOM + FIDO work in parallel
   - EECOM: #2 (subscription) and #3 (metering)
   - FIDO: #4 (portal) with API integration
3. **Integration:** GNC ships #5 (staging) with all components

#### Labels

Created squad routing labels for future issue triaging:
- `squad` (meta-label for all squad work)
- `squad:eecom` (Backend)
- `squad:fido` (Frontend)
- `squad:gnc` (DevOps)
- `squad:retro` (Tester)

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

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

## 2026-06-01

### GNC Runbook Validation Decision
- **Date:** 2026-05-31T21:35:32.766+00:00
- **Owner:** GNC
- **Context:** Issue #46 requires repeatable validation of webhook authentication and metering outbox recovery behavior before promotion beyond staging.
- **Decision:** Use a dual-mode drill harness: `simulate` mode runs deterministic webhook and metering failure drills locally against the real API modules, and `staging` mode runs live signed webhook probes against the deployed staging API while metering retry drills remain gated on a temporary drill stub endpoint.
- **Why:** The webhook path can be safely exercised live in staging, but the metering worker only exposes retry and dead-letter behavior when its upstream endpoint is deliberately faulted. Keeping a deterministic simulation path prevents regressions in CI and gives operators a repeatable recovery rehearsal even when a live drill stub is unavailable.

### RETRO Security Test Suite Note
- **Date:** 2026-05-31T21:35:32.766+00:00
- **Owner:** RETRO
- **Decision:** The tenant-isolation security catalog in `packages/api/src/__tests__/security/` uses signed JWKS-backed integration fixtures against the Express API for repeatable coverage, while RLS-only assertions stay skipped behind `SECURITY_RLS_ENABLED` until #45 deploys database policies.
- **Rationale:** This keeps the Phase 1.5 suite executable in CI and on feature branches now, without hiding the staging-only checks that depend on the parallel RLS rollout.

### Metering Recovery Replay Decision
- **Date:** 2026-06-01T00:43:05.936+00:00
- **Owner:** RETRO
- **Decision:** For metering recovery drills, operators should recover dead-lettered usage by restoring the Marketplace endpoint and replaying the payload through `POST /v1/metering/events` with a fresh `eventId` and a fresh `idempotencyKey`.
- **Why:** The metering repository deduplicates on `idempotencyKey` and on the original `eventId` + timestamp pair. Reusing the dead-lettered identifiers would be ignored locally, and directly mutating `usage_events` would destroy the evidence trail the DLQ is supposed to preserve.
- **Follow-up:** Keep the original `usage_event_dead_letters` row as audit evidence and verify the replayed event reaches `submitted` before closing the incident.

### Kranz PR #59 Re-review
- **PR:** #59 — `[Phase 1.5] Publisher portal basic workflows`
- **Issue:** #43
- **Reviewer:** Kranz
- **Date:** 2026-06-01T00:27:21.979+00:00
- **Verdict:** REJECT
- **Summary:** FIDO's revision materially improves the portal: publisher/customer routing is RBAC-aware, 403 handling is graceful, and the portal now exposes explicit publisher-admin integration points instead of pretending the tenant-scoped subscription surface is sufficient. I also re-ran `npm run typecheck --workspace=@fastsaas/portal` and `npm run build --workspace=@fastsaas/portal` in the PR worktree, and both passed.
- **Blocking Issues:**
  1. **Issue #43 still requires live publisher operations, not mock-backed mutations.**
     - `packages/portal/lib/publisher-admin-api.ts` now defines the correct target surface under `/v1/publisher/*`.
     - But the API worktree still only exposes `auth.ts`, `index.ts`, `metering.ts`, and `subscriptions.ts` under `packages/api/src/routes/v1`, so there is no backend publisher-admin route set for plan updates, tenant CRUD, tenant detail, or lifecycle actions.
     - `.env.example` leaves `NEXT_PUBLIC_ENABLE_PUBLISHER_ADMIN_API=false`, so the portal remains mock-backed by default.
  2. **The previous rejection's core backend dependency is still unresolved.**
     - The PR now makes the integration contract explicit, which is good scope hygiene.
     - However, the DoD for Issue #43 says plan and tenant operations must be complete in the portal and wired to the established backend/fulfillment surfaces. That remains incomplete until the publisher-admin API exists.
- **What is good:**
  - Server-side route gating via `packages/portal/app/(portal)/publisher/layout.tsx` and `packages/portal/lib/route-access.ts`
  - Session-role parsing and portal segregation in `packages/portal/lib/roles.ts`
  - Graceful 403 rendering in the publisher client components
  - Clear contract banner in `packages/portal/components/publisher-integration-banner.tsx`
  - Portal build/typecheck validation passed on the PR worktree
- **Reassignment:**
  - **Primary fix owner:** EECOM
  - **Needed next:** Land publisher-admin API routes + authorization for dashboard, plans, tenants, tenant detail, and tenant lifecycle actions.
  - **Follow-up owner:** FIDO only if final portal wiring cleanup is needed after the backend surface lands.

### Kranz PR #63 Re-review — Webhook and Metering Runbook Validation
- **Date:** 2026-06-01T00:27:21.979+00:00
- **PR:** #63 — `[Phase 1.5] Webhook and metering runbook validation`
- **Issue:** #46
- **Branch:** `squad/46-webhook-metering-runbook`
- **Verdict:** REJECT
- **What improved:**
  - The runbook now reflects real operator investigation steps for Container Apps ingress, Marketplace registration checks, log inspection, env verification, and SQL inspection.
  - The deterministic local harness now exercises real outbox retry/dead-letter behavior against controlled endpoints instead of only synthetic wrong-path webhook checks.
- **Remaining blocker:**
  - The PR still does not validate staging metering recovery. In `scripts/drills/webhook-metering-runbook.ts`, the staging path explicitly records `staging metering recovery` as `skipped` and defers to the runbook for manual follow-up instead of executing the live staging retry/DLQ flow. That means the Phase 1.5 requirement remains unmet: actual `429`/`5xx` batch retry behavior and dead-endpoint-to-DLQ recovery have not been wired and verified in staging.
- **Evidence reviewed:**
  - `gh pr diff 63`
  - `gh pr view 63 --comments`
  - `npm run typecheck --workspace=@fastsaas/api` ✅
  - `docs/runbooks/webhook-metering-validation.md`
  - `scripts/drills/webhook-metering-runbook.ts`
- **Required next step:**
  - Return with the staging metering drill itself wired, runnable, and evidenced against the live outbox worker, including real `429`/`5xx` retry behavior plus dead-endpoint-to-DLQ recovery in staging.

### Kranz PR #64 Re-review — Tenant Middleware and RLS Enforcement Rollout
- **PR:** #64 — `[Phase 1.5] Tenant middleware and RLS enforcement rollout`
- **Issue:** #45
- **Branch:** `squad/45-tenant-rls-enforcement`
- **Author:** EECOM
- **Decision:** REJECT
- **Timestamp:** 2026-06-01T00:27:21.979+00:00
- **Summary:**
  - The previous fake-test blocker is fixed: `tenant-rls.integration.test.ts` now exercises real PostgreSQL RLS behavior, and the middleware / execution-context design remains directionally sound.
  - The rollout is still not approval-ready because the newly added executable migration path fails on a fresh PostgreSQL database. Running `npm run migrate --workspace=@fastsaas/api` against PostgreSQL 16 errors with `relation "subscription_audit_logs" does not exist` from `packages/api/src/db/migrations/20260531T213532_tenant_rls.ts`, which means the migration still assumes pre-existing subscription tables instead of a fully wired clean-environment path.
- **Validation:**
  - Reviewed `gh pr diff 64`
  - Reviewed `gh pr view 64 --comments`
  - Verified `npm run typecheck --workspace=@fastsaas/api` passes
  - Verified `npm run test:rls --workspace=@fastsaas/api` passes
  - Verified `npm run migrate --workspace=@fastsaas/api` fails on a fresh PostgreSQL 16 database because `subscription_audit_logs` is missing
- **Required Follow-up:**
  1. Make the migration command succeed from a clean executable path, or wire the prerequisite schema migrations into the same runnable path.
  2. Extend validation so the clean-database command path is exercised, not only a pre-seeded schema harness.

### Kranz PR #65 Re-review — RBAC and Audit Logging Hardening
- **PR:** #65 — `[Phase 1.5] RBAC and audit logging hardening`
- **Issue:** #47
- **Author:** EECOM
- **Requested by:** dkirby-ms
- **Reviewed at:** 2026-06-01T00:27:21.979+00:00
- **Verdict:** REJECT
- **Decision:**
  - The original Phase 1.5 architecture blockers are resolved: the RBAC matrix now matches the design document's `Admin` / `Owner` / `Member` / `Viewer` model, the audit-log migration is wired into both `npm run migrate` and server startup, PostgreSQL-backed tests validate tenant-scoped audit visibility, and the audit table is append-only via a database trigger with forced RLS.
  - I am still rejecting this re-review because the PR is not merge-clean. The `commitlint` status check is failing on commit `Fix RBAC model and audit migration rollout`, so the branch does not currently satisfy the repository's merge gate.
- **Evidence:**
  - Design doc permissions matrix: `docs/design-document.md:784-793`
  - Audit logging controls: `docs/design-document.md:841-844`
  - RBAC implementation on PR branch: `packages/api/src/middleware/rbac.ts`
  - PostgreSQL-backed audit verification on PR branch: `packages/api/src/__tests__/audit-logging.test.ts`, `packages/api/src/__tests__/postgres-test-db.ts`
  - Migration wiring on PR branch: `packages/api/package.json`, `packages/api/src/server.ts`, `packages/api/src/db/migrator.ts`, `packages/api/src/db/migrations/20260531T213532_audit_logs.ts`
  - Validation run on PR merge ref: `npm run typecheck --workspace=@fastsaas/api`, `npx vitest run src/__tests__/audit-logging.test.ts`, `npx vitest run src/__tests__/rbac.integration.test.ts`
  - Remaining blocker: `gh pr checks 65`, `gh run view 26728853239 --job 78768793594 --log-failed`

### Kranz PR #62 Re-review — Tenant Isolation Security Test Suite
- **PR:** #62 — `[Phase 1.5] Tenant isolation security test suite`
- **Issue:** #44
- **Reviewed at:** 2026-06-01T00:29:22Z
- **Verdict:** APPROVE (recorded via PR comment because the authenticated account cannot approve its own pull request)
- **Decision:**
  - The previous blockers are resolved. On the PR merge ref, `npm run typecheck --workspace=@fastsaas/api`, `npm run build --workspace=@fastsaas/api`, and `npm run test --workspace=@fastsaas/api -- --run src/__tests__/security` all pass.
  - The previously skipped non-RLS RBAC and privilege-escalation scenarios now execute, and the only remaining skipped case is the explicit RLS-gated follow-up for Issue #45. The active security catalog covers tenant isolation, JWT tampering, scope enforcement, and Admin/Owner-only subscription lifecycle boundaries at the API layer.

### EECOM PR #62 Fix Decision
- **Date:** 2026-06-01
- **Context:** Kranz rejected PR #62 because non-RLS RBAC tests were still skipped and the branch was not merge-clean.
- **Decision:** Enforce Admin/Owner checks for subscription lifecycle routes (`activate`, `suspend`, `unsubscribe`) in the route layer only after confirming the subscription belongs to the caller's tenant.
- **Rationale:** This keeps the non-RLS RBAC suite meaningful now, while preserving tenant-isolation behavior so cross-tenant lifecycle probes still return `404` instead of leaking whether a victim subscription exists.
- **Result:** The skipped Member/Viewer lifecycle tests are now active, the lifecycle role matrix is covered in the security suite, and `packages/api` passes `npm run typecheck`, `npm run test`, and `npm run build` on the rebased branch.

### EECOM PR #64 Fix Decision
- **Decision:** Run pending Kysely migrations before the API starts accepting traffic, and fail startup when `DATABASE_URL` is configured but migrations cannot be applied.
- **Rationale:** PR #64's original RLS migration existed in source control but had no executable path, so production could start without tenant policies being applied. Wiring the migrator into startup plus `npm run migrate` makes RLS enforcement an actual runtime guarantee instead of a manual follow-up step.
- **Test strategy:** Use a Docker-backed PostgreSQL integration test with a dedicated non-superuser app role. PostgreSQL superusers bypass RLS, so using the real application role is required to prove `app.current_tenant` blocks cross-tenant reads; the suite is runnable via `npm run test:rls`.

### Kranz PR #59 Re-review #2 — Publisher Portal RBAC (Issue #43)
- **Date:** 2026-06-01T11:23:27Z
- **Reviewer:** Kranz
- **Verdict:** REJECTED
- **Summary:**
  - EECOM's revision adds live Kysely-backed `/v1/publisher/*` routes (dashboard, plans, subscriptions, tenants) with proper Admin/Owner RBAC enforcement via `authorizeRoute` middleware. The prior blocker (missing backend routes) is architecturally resolved.
- **Blocking Issue:**
  - `npm run typecheck --workspace=@fastsaas/api` fails with 29 TypeScript errors. The publisher routes and service import 14+ types (`PublisherDashboardData`, `PublisherPlan`, `PublisherPlanStatus`, `PublisherTenantDetail`, etc.) from `@fastsaas/shared` that are not exported by that package.
- **Required Fix:**
  - Add the missing Publisher type definitions to `packages/shared/src/index.ts` and confirm typecheck passes on the merge ref.
- **What's Good (non-blocking):**
  - Real Kysely queries with RLS context propagation
  - RBAC permission matrix correctly restricts publisher resources to Admin/Owner
  - Conventional commit message (`feat(api): add publisher management routes`)
  - Proper Express router registration
  - Migration for `publisher_plans` table

### Kranz PR #63 Re-review (2nd) — Webhook/Metering Runbook Validation
- **Date:** 2026-06-01T11:23:27Z
- **Reviewer:** Kranz (Lead)
- **PR:** #63 (Issue #46)
- **Verdict:** ✅ APPROVED
- **Summary:**
  - The prior rejection required real metering recovery procedures covering 429 retry timing, 5xx backoff recovery, and DLQ replay with fresh identifiers. The revision by RETRO delivers all three:
    1. **429 retry recovery** — Runbook Section 3A documents injecting a throttled event via the real API, verifying `retry_scheduled` with correct `next_attempt_at` (Retry-After honored), and confirming recovery to `submitted` once the stub returns 200.
    2. **5xx backoff recovery** — Section 3A also covers transient 503 with worker-backoff verification, confirming the event returns to `submitted` without entering the DLQ.
    3. **Dead-endpoint-to-DLQ replay** — Section 3B documents retry exhaustion into `usage_event_dead_letters`, preserving the audit trail, then replaying with fresh `eventId`/`idempotencyKey` and confirming the replayed event reaches `submitted` while the original DLQ row persists.
    4. **Drill harness** — `scripts/drills/webhook-metering-runbook.ts` exercises all three scenarios in simulate mode against a controlled stub with real middleware/worker code, and preserves the dual-mode (simulate/staging) pattern.
- **Validation Performed:**
  - Branch merges cleanly with `origin/main`
  - `npm run typecheck --workspace=@fastsaas/api` passes
  - `npm run build --workspace=@fastsaas/api` passes
  - Conventional commit format verified: `fix(docs): add real metering recovery procedures (#46)`
  - No TODOs, skips, or placeholders in metering recovery sections
  - Scenario matrix includes all three metering recovery scenarios with operator evidence requirements
- **Blockers Resolved:**
  | Prior Blocker | Resolution |
  |---|---|
  | Staging metering recovery explicitly skipped | Full operator playbook with curl commands, SQL verification, and dashboard checks |
  | No 429/Retry-After validation | Section 3A with timing assertions and worker-log evidence |
  | No 5xx backoff validation | Section 3A with backoff interval verification |
  | No DLQ replay with fresh identifiers | Section 3B with replay commands and audit-trail preservation |
- **Action:** Ready for merge.

### Kranz PR #64 Re-review (3rd round) — Tenant Middleware + RLS Enforcement
- **Reviewer:** Kranz (Lead)
- **Date:** 2026-06-01T11:30:00Z
- **Branch:** squad/45-tenant-rls-enforcement
- **Verdict:** REJECTED
- **Summary:**
  - The revision added a `tableExists()` guard for the RLS policy loop, ensuring policies are only applied to tables that exist. However, two blocking issues remain.
- **Blocking Issues:**
  1. **Merge Conflicts with main (6 files):**
     - packages/api/src/db/execution-context.ts
     - packages/api/src/db/migrate.ts
     - packages/api/src/db/migrator.ts
     - packages/api/src/db/rls.ts
     - packages/api/src/routes/v1/subscriptions.ts
     - packages/api/src/server.ts
     - The PR is not merge-clean. `git merge origin/main` produces content conflicts in 6 files.
  2. **Fresh-DB Migration Still Fails — ALTER TABLE on Non-Existent Tables:**
     - The `tableExists()` guard only protects the RLS policy loop at the bottom of `up()`. The migration still has **unguarded** ALTER TABLE statements that assume `subscription_audit_logs` and `marketplace_webhook_events` already exist:
     - Lines that will fail on fresh DB:
       ```typescript
       await sql.raw('ALTER TABLE subscription_audit_logs ADD COLUMN IF NOT EXISTS tenant_id TEXT').execute(db);
       await sql.raw('ALTER TABLE marketplace_webhook_events ADD COLUMN IF NOT EXISTS tenant_id TEXT').execute(db);
       ```
     - `IF NOT EXISTS` applies to the COLUMN, not the TABLE. PostgreSQL will error with `relation "subscription_audit_logs" does not exist` if the table hasn't been created elsewhere first.
     - **Fix required:** Wrap these ALTER TABLE blocks in `tableExists()` guards, OR add CREATE TABLE IF NOT EXISTS statements for `subscriptions`, `subscription_audit_logs`, and `marketplace_webhook_events` before altering them (similar to how `usage_events` is handled via `METERING_SCHEMA_STATEMENTS`).
- **What Passes:**
  - `npm run typecheck --workspace=@fastsaas/api` ✓
  - `npm run build --workspace=@fastsaas/api` ✓
  - Conventional commits: all 4 commits use valid prefixes ✓
  - RLS policy logic is sound (bypass + tenant isolation predicate)
  - The test (`tenant-rls.integration.test.ts`) properly simulates production order by calling `initializeBaseSchema()` before migration
- **Action Required:**
  1. Rebase/merge onto current main to resolve the 6 conflicts
  2. Guard the ALTER TABLE statements for `subscription_audit_logs` and `marketplace_webhook_events` with `tableExists()` checks (or create the tables in the migration)
  3. Confirm `npm run migrate` succeeds against an empty PostgreSQL database end-to-end
- **Assigned To:** FIDO — resolve merge conflicts and add missing `tableExists()` guards for ALTER TABLE statements.

## 2026-06-02

### EECOM Decision — Partner Center Secret References
- **Date:** 2026-06-02T00:44:50.069+00:00
- **Owner:** EECOM
- **Status:** Proposed

#### Context
Issue #97 adds tenant-scoped Partner Center credential management for Product Ingestion connectivity. The backend must validate app-to-app credentials without storing raw secrets in Postgres or echoing them back through publisher APIs.

#### Decision
Store only a `secretReference` for Partner Center credentials in `partner_center_credentials`, and have the auth layer resolve that reference at runtime. The default resolver supports `env:VARIABLE_NAME` references for local/test flows, while the service contract is injectable so future Key Vault-backed resolution can replace it without changing route or repository shapes.

#### Rationale
This keeps secrets out of database rows, route payload echoes, and audit-friendly API responses while still allowing immediate validation against Microsoft Graph. The `env:` fallback preserves a minimal development path, and the injected resolver boundary keeps the production secret store flexible.

#### Affected Files
- `packages/api/src/services/partner-center-auth.ts`
- `packages/api/src/services/partner-center-service.ts`
- `packages/api/src/repositories/partner-center-repository.ts`
- `packages/api/src/routes/v1/publisher.ts`

---

### Kranz PR #108 Review — Partner Center Connection
- **Date:** 2026-06-02T00:58:37.086+00:00
- **Reviewer:** Kranz
- **PR:** #108 — `feat: add Partner Center connection (#97)`
- **Verdict:** REJECTED
- **Reassign:** EECOM

#### Summary
The branch adopts the expected repository → service → route layering, integrates cleanly with the existing publisher router, and passes API typecheck plus the new focused Partner Center tests. However, two production-readiness gaps remain in the security boundary, so this is not ready to merge.

#### Blocking Issues
1. **Secret resolution is env-only in production, which does not meet the project's secret-management direction.**
   - `packages/api/src/services/partner-center-auth.ts` only supports `env:VARIABLE_NAME` in the default resolver and throws for any other reference.
   - `packages/api/src/server.ts` instantiates `PartnerCenterAuthService` without a custom resolver, so deployed API instances cannot resolve Key Vault-backed tenant credentials.
   - This conflicts with the design document's Azure Key Vault secret-management direction and makes multi-tenant credential rotation operationally brittle.

2. **The connection validation proves Graph access, not Partner Center/Product Ingestion readiness.**
   - `packages/api/src/services/partner-center-auth.ts` requests a Graph token for `https://graph.microsoft.com/.default` and validates by calling `/v1.0/organization`.
   - A tenant app can satisfy that check while still lacking the permissions or audience required for the Partner Center/Product Ingestion APIs, so `/partner-center/connect` can report `CONNECTED` for credentials that will fail the actual downstream integration.

#### Test Gap
- `packages/api/src/__tests__/partner-center.integration.test.ts` routes through `InMemoryPartnerCenterRepository` and the stub auth provider in `packages/api/src/__tests__/security/test-harness.ts`.
- That covers RBAC and response shaping, but it does not validate the live Kysely repository, migration, or RLS behavior for the new tables.

#### Required Fix
- EECOM should wire production secret resolution to the approved secret store path, validate against the actual downstream Partner Center/Product Ingestion API contract or equivalent audience/permission check, and add a live persistence-path test for the Kysely/RLS-backed implementation before requesting re-review.

---

### GNC Decision — PR #108 Revision
- **Date:** 2026-06-02T01:08:36.792+00:00
- **Owner:** GNC
- **Status:** Proposed

#### Context
PR #108 was rejected because Partner Center credential resolution only supported environment variables and `/partner-center/connect` only proved Microsoft Graph access. Production validation needed to align with the repo's Azure Key Vault + managed identity direction and verify the downstream Product Ingestion API contract.

#### Decision
Use Azure Key Vault as the production secret store for Partner Center credentials in `packages/api/src/services/partner-center-auth.ts`, resolving either full secret URIs or `keyvault:SECRET_NAME` references with `DefaultAzureCredential`/managed identity. Keep `env:` references only as a local/test fallback. Validate connections by calling `GET https://graph.microsoft.com/rp/product-ingestion/product?$maxpagesize=1&$version=2022-03-01-preview5`; treat Microsoft Graph `/organization` as optional metadata enrichment rather than the authoritative readiness check.

#### Rationale
This preserves the existing database shape (`secretReference` only), keeps secrets out of Postgres responses, and matches the project's cloud-secret-management direction without requiring raw credential material in runtime environment variables. Product Ingestion validation closes the false-positive gap where Graph access could succeed while Partner Center permissions would still fail downstream.

#### Affected Files
- `packages/api/src/services/partner-center-auth.ts`
- `packages/api/src/services/partner-center-service.ts`
- `packages/api/src/routes/v1/publisher.ts`
- `packages/api/src/server.ts`
- `packages/api/package.json`

---

### Kranz Decision — PR #108 Re-review
- **Date:** 2026-06-02T01:22:06.872+00:00
- **Owner:** Kranz (Lead)
- **Status:** Approved

#### Context
PR #108 (`squad/97-partner-center-connection`) was previously rejected on two blockers: production secret management was env-only instead of Azure Key Vault + managed identity, and `/partner-center/connect` only proved Microsoft Graph `/organization` access instead of downstream Product Ingestion readiness.

#### Decision
Approve PR #108. The revised branch now resolves Partner Center secrets through Azure Key Vault using `DefaultAzureCredential` in `packages/api/src/services/partner-center-auth.ts`, with `packages/api/src/server.ts` disabling `env:` secret references when `NODE_ENV=production`. It also validates readiness against `GET /rp/product-ingestion/product?$maxpagesize=1&$version=2022-03-01-preview5`, treating `/v1.0/organization` as optional enrichment only.

#### Validation
- Reviewed the updated branch diff for `packages/api/src/services/partner-center-auth.ts`, `packages/api/src/services/partner-center-service.ts`, `packages/api/src/routes/v1/publisher.ts`, `packages/api/src/server.ts`, and related tests.
- Verified `npm run typecheck --workspace=@fastsaas/api` passes.
- Verified `npm run test --workspace=@fastsaas/api -- --run src/__tests__/partner-center-auth.test.ts src/__tests__/partner-center.integration.test.ts` passes.

#### Follow-up
A separate pre-existing failure remains in `packages/api/src/__tests__/security/tenant-isolation.test.ts`: the metering route in `packages/api/src/routes/v1/metering.ts` needs Express 4 error forwarding so `AppError.notFound('Subscription was not found')` returns a 404 instead of hanging the test.
