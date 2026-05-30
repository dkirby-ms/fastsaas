# Decisions Log

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

### Public Endpoints (Default) — User Directive
- **Date:** 2026-05-30T20:41:00.000+00:00
- **Context:** User request via dkirby-ms (via Copilot) — Azure infrastructure must support public endpoints as the default with private endpoints as an option.
- **Decision:** Dev/staging defaults to public endpoints. Private endpoints and Private Link remain available as an option for production systems.
- **Why:** Ease of development. Users can start deployments quickly without private infrastructure complexity, and production can opt-in to private endpoints.

### EECOM API Foundation
- **Date:** 2026-05-29T14:30:29.387-05:00
- **Owner:** EECOM
- **Decision:** Use an Express + TypeScript workspace package for the backend foundation, with `jose`-based JWT validation, tenant context injection from `tenant_id`/`tid`/`extension_tenant_id`, structured JSON request logging, centralized error handling, and code-annotated OpenAPI publication at `/openapi.json` and `/docs`.
- **Rationale:** This keeps auth and tenant resolution middleware-focused, supports local integration testing with placeholder Azure AD B2C settings, and preserves route contracts for follow-on subscription and metering work.

### EECOM PR #6 Fix (Staging Hardening)
- **Date:** 2026-05-29T15:00:00.000+00:00
- **Owner:** EECOM
- **Context:** Kranz blocked PR #6 for insecure staging deployment primitives and a placeholder API container.
- **Decision:** Harden staging by keeping PostgreSQL Flexible Server on delegated-subnet private access, moving Redis and ACR behind private endpoints with private DNS, disabling ACR admin credentials, and switching container image pulls to managed identities. Because ACR is no longer publicly reachable, the deploy workflow now builds images with `az acr build` instead of runner-local `docker push`.
- **Impact:** Container Apps can resolve and reach Redis/PostgreSQL/ACR over the staging VNet. Registry pull credentials are removed from the template surface area. The API image now builds the real Express service from `packages/api/`.

### EECOM Subscription Lifecycle
- **Date:** 2026-05-29T14:30:29.387-05:00
- **Owner:** EECOM
- **Decision:** Implement subscription lifecycle handling in `packages/api` with a dedicated service and repository boundary, using Prisma-backed persistence when `DATABASE_URL` is configured and an in-memory repository for end-to-end test isolation; route correlation IDs through API and webhook flows into subscription audit records and fulfillment error logs.
- **Rationale:** This keeps the Azure Marketplace fulfillment client, state machine, and persistence concerns decoupled, enables deterministic lifecycle tests without external infrastructure, and preserves a production-ready path to PostgreSQL-backed persistence and auditable webhook processing.

### FIDO Portal Modernization
- **Date:** 2026-05-29T16:53:13.479-05:00
- **Requested by:** Dale Kirby
- **Decisions:**
  1. **Auth.js v5 beta:** Portal auth uses Auth.js v5 patterns via the published `5.0.0-beta.31` release line rather than a stable `5.0.0` tag, allowing the portal to use the new `auth.ts` + `handlers` API now.
  2. **Portal typecheck command:** `tsc --noEmit` against Next 15 route-generated files fails on Windows for App Router segment paths. Portal now treats `next build --no-lint --experimental-build-mode compile` as its typecheck command.
  3. **Tailwind v4 config:** Portal styling uses CSS-first Tailwind v4 configuration in `app/globals.css` via `@import "tailwindcss"` and `@theme`, with brand colors and `shadow-panel` moved into CSS theme tokens. Legacy `tailwind.config.js` and `postcss.config.js` removed.

### GNC Auth Entra Fix
- **Date:** 2026-05-29T15:29:10.202-05:00
- **Owner:** GNC
- **Context:** PR #7 auth middleware used HMAC validation with a fallback shared secret, which does not match the Entra ID design.
- **Decision:** Standardize API bearer-token validation on Microsoft Entra-compatible RS256 tokens verified through JWKS (`createRemoteJWKSet`) and allow local development only through an explicit non-production bypass flag.
- **Implications:** Production deployments must provide `AZURE_AD_TENANT_ID` and `AZURE_AD_CLIENT_ID`; integration tests should exercise asymmetric token validation with a JWKS endpoint; request IDs must be validated before being reflected into logs or responses.

### GNC Bicep Registry Fix
- **Date:** 2026-05-30T17:36:37.289+00:00
- **Owner:** GNC
- **Context:** Issue #19 reported a staging bootstrap deployment failure because `infrastructure/bicep/main.bicep` truncated `registryName` with `substring(..., 0, 50)`, which fails validation when the generated name is shorter than 50 characters.
- **Decision:** Standardize environment-derived Azure resource names on safe truncation with `take()` in `infrastructure/bicep/main.bicep`, and hoist conditional identity/module references behind variables that use the null-forgiving operator only where the enclosing `deployContainerApps` condition guarantees those resources exist. Prefer resource-symbol instance methods like `workspace.listKeys()` in `infrastructure/bicep/modules/container-app-environment.bicep`.
- **Why:** This preserves Azure naming limits without introducing ARM validation failures for short inputs, keeps the Bicep template warning-free, and improves dependency analysis for shared infrastructure modules.
- **Files:** `infrastructure/bicep/main.bicep`, `infrastructure/bicep/modules/container-app-environment.bicep`

### GNC Deploy Failure Issue
- **Date:** 2026-05-30T17:20:36.580+00:00
- **Owner:** GNC
- **Context:** Issue #15 requires staging deploy failures to raise a triageable GitHub issue without coupling failure-handling logic into the deployment workflow itself.
- **Decision:** Add a dedicated `workflow_run` workflow at `.github/workflows/deploy-staging-failure-issue.yml` that listens for failed `Deploy staging` runs, derives the failing job and step from the Actions API, and creates or updates a `squad`-labeled issue keyed by branch/job/step.
- **Implications:** Deployment and incident reporting stay separated, repeated failures for the same branch and failing step stay deduplicated, and squad triage workflows can pick up the generated issue automatically.

### GNC Region Change
- **Date:** 2026-05-30T20:34:31.344+00:00
- **Owner:** GNC
- **Context:** Staging deployments defaulted to `eastus` in `.github/workflows/deploy-staging.yml`, and PostgreSQL Flexible Server provisioning fails there with `LocationIsOfferRestricted`.
- **Decision:** Change the default staging deployment region to `westus2` in both the workflow dispatch input and fallback env expression, and keep `infrastructure/bicep/main.parameters.example.json` aligned to the same default.
- **Why:** This preserves one-click staging deploy behavior while avoiding a known regional restriction on PostgreSQL Flexible Server.
- **Files:** `.github/workflows/deploy-staging.yml`, `infrastructure/bicep/main.parameters.example.json`

### Team Commentary Skill — Squad Places
- **Date:** 2026-05-30T17:20:36.580+00:00
- **By:** Kranz (Lead)
- **What:** Non-decision commentary (interesting findings, useful discoveries, helpful observations) belongs in the Squad Places `team-commentary` place, not in `.squad/decisions.md` or shared repo files.
- **Format:** Posts should use a short structured format with category, title, why-it-matters, context, optional action, and tags.
- **Scribe note:** Scribe does not mirror ordinary commentary; only commentary that matures into a team rule should be promoted into `.squad/decisions/inbox/` for merge.
- **Why:** Keeps the decision ledger focused on binding direction, gives all agents a lightweight shared feed for useful findings, and avoids adding extra filesystem ceremony for observations that are helpful but not architectural decisions.

### PR #24 Review — Public Endpoints Implementation
- **Date:** 2026-05-30T21:21:50.014+00:00
- **Owner:** Kranz (Lead)
- **Context:** Review of PR #24 (`feat(infra): make private endpoints optional, default to public`). Initial review identified missing PostgreSQL firewall configuration for public mode.
- **Decision:** Public endpoints mode requires explicit firewall rules. For Azure Database for PostgreSQL Flexible Server in public mode (no delegated subnet/private DNS), create firewall rules: `AllowAzureServices` (`0.0.0.0` to `0.0.0.0`) for Azure-hosted callers and `AllowAllDev` (`0.0.0.0` to `255.255.255.255`) for dev/staging convenience. Private mode (with VNet integration) preserves network isolation and does not use firewall rules.
- **Implementation:** EECOM added rules in commit 55a6ab4; PR #24 approved and merged (squash).
- **Why:** Toggling off private resources without defining public access creates a non-functional deployment. Explicit firewall strategy keeps public/private modes both operationally correct.
- **Files affected:** `infrastructure/bicep/main.bicep` (PostgreSQL firewall rules)
