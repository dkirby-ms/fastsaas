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
