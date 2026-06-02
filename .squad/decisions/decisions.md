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

## 2026-06-01

### EECOM Beneficiary Tenant Binding Decision
- **Date:** 2026-06-01T20:04:56.560+00:00
- **Owner:** EECOM
- **Context:** Azure Marketplace SaaS resolve can return a `beneficiaryTenantId` that differs from the landing-page caller's Entra tenant (`tid`). Using the caller tenant as the FastSaaS subscription owner breaks cross-tenant purchase scenarios and can mis-bind lifecycle ownership.
- **Decision:** `packages/api/src/services/subscription-service.ts` now treats `beneficiaryTenantId` from Marketplace resolve as the canonical FastSaaS `tenantId`, with a defensive fallback to the caller tenant only when Marketplace does not return a beneficiary. `planId` and `seats` are also sourced only from Marketplace resolve, not from caller input.
- **Rationale:** Marketplace resolve is the source of truth for both subscription ownership and purchased SKU/quantity. Logging mismatches between caller tenant and beneficiary tenant preserves visibility into expected multi-tenant flows without corrupting tenant binding.
- **Implications:** API subscription-create callers only provide `marketplaceToken` plus optional metadata, and test fixtures must explicitly control mocked resolve responses when they need deterministic tenant ownership or plan/seat values.

### EECOM Customer RBAC
- **Date:** 2026-06-01T20:50:04.569+00:00
- **Issue:** #76
- **Decision:** Implement customer RBAC for Marketplace tenants with a database-backed `tenant_members` table and keep publisher App Roles as the primary authorization source whenever JWT `roles` are present.
- **Rationale:** External customer tenants do not carry the publisher Entra app-role assignments, so tenant membership must become the fallback role source for `/v1/*` authorization and member-management APIs. Bootstrapping the first subscription caller as `Owner` ensures new beneficiary tenants can administer their workspace without manual publisher intervention.
- **Implementation notes:** Added tenant-member repository/service layers, member-management routes under `/v1/members`, owner bootstrap in subscription creation, Prisma schema + migration artifacts for `TenantMember`, and Kysely migration/RLS coverage for the new `tenant_members` table.

### EECOM Idempotency Fix
- **Date:** 2026-06-01T21:20:13.494+00:00
- **Owner:** EECOM
- **Context:** Marketplace change-operation webhooks (`ChangePlan`, `ChangeQuantity`, `Transfer`) can retry with a new request ID while preserving the Marketplace operation ID.
- **Decision:** Webhook idempotency keys in `packages/api/src/routes/webhooks/marketplace.ts` must prefer `operationId` over `requestId`, while the shared webhook contract in `packages/shared/` continues to expose the operation fields needed by the API consumer.
- **Why:** `operationId` is the stable Marketplace identifier for a single change operation. Using it first prevents retries from being treated as new deliveries and avoids repeating local state changes or Marketplace completion PATCH calls.

### EECOM PR #64 Fix
- **Date:** 2026-06-01T21:26:00.000+00:00
- **Owner:** EECOM
- **Decision:** Run pending Kysely migrations before the API starts accepting traffic, and fail startup when `DATABASE_URL` is configured but migrations cannot be applied.
- **Rationale:** PR #64's original RLS migration existed in source control but had no executable path, so production could start without tenant policies being applied. Wiring the migrator into startup plus `npm run migrate` makes RLS enforcement an actual runtime guarantee instead of a manual follow-up step.
- **Test strategy:** Use a Docker-backed PostgreSQL integration test with a dedicated non-superuser app role. PostgreSQL superusers bypass RLS, so using the real application role is required to prove `app.current_tenant` blocks cross-tenant reads; the suite is runnable via `npm run test:rls`.

### EECOM RBAC Invite Ceiling
- **Date:** 2026-06-01T21:20:13.494+00:00
- **Review:** PR #83 feedback on branch `squad/76-customer-rbac`
- **Decision:** Enforce invite-time role ceilings for tenant member management so only Owners can assign the `Owner` role, while Admins are limited to inviting `Admin` or `Member` users.
- **Rationale:** The `/v1/members/invite` path previously trusted the requested role after a coarse Admin/Owner route check, which let a tenant Admin create a controlled Owner account and bypass the intended owner-only promotion model already enforced on `PATCH /v1/members/:id/role`.
- **Implementation notes:** The ceiling is enforced before persistence in the members route/service path, and the regression case is covered in `packages/api/src/__tests__/security/privilege-escalation.test.ts` using tenant-membership-backed Admin access rather than publisher JWT app roles.

### EECOM Token Redaction
- **Date:** 2026-06-01T21:41:30.419+00:00
- **Owner:** EECOM
- **Context:** Marketplace purchase tokens were being persisted in subscription audit details, request audit resource records, and subscription metadata that later surfaced through subscription read APIs.
- **Decision:** Centralize redaction in `packages/api/src/lib/marketplace-token-redaction.ts`, sanitize subscription metadata and audit details before repository writes, redact create-subscription audit resource IDs, and re-sanitize audit/subscription reads for defense in depth against historical data.
- **Why:** Marketplace purchase tokens are short-lived secrets and should never be persisted or echoed back through API responses. A shared sanitizer keeps future marketplace-related paths aligned and reduces the chance of a partial fix.
- **Files:** `packages/api/src/lib/marketplace-token-redaction.ts`, `packages/api/src/services/audit-service.ts`, `packages/api/src/services/subscription-service.ts`, `packages/api/src/repositories/subscription-repository.ts`, `packages/api/src/routes/v1/subscriptions.ts`

### EECOM Marketplace Webhook Operations
- **Date:** 2026-06-01T20:50:04.569+00:00
- **Owner:** EECOM
- **Context:** Azure Marketplace `ChangePlan`, `ChangeQuantity`, and `Transfer` notifications require partner-side acknowledgement, and the live webhook schema uses Partner Center operation identifiers (`id`) and SaaS subscription identifiers (`subscriptionId`) that may differ from FastSaaS's earlier simplified webhook fixture shape.
- **Decision:** `packages/api` should accept either webhook shape, resolve the referenced Marketplace operation via the Fulfillment Operations API before mutating local state, persist plan/quantity/tenant ownership changes with subscription audit entries, and then PATCH the operation status back to Marketplace as `Success`.
- **Rationale:** Validating the operation before mutation prevents spoofed or mismatched change events from rebinding tenant ownership or SKU data, while acknowledging the operation only after local persistence keeps Marketplace and FastSaaS aligned on the authoritative outcome.
- **Implications:** Future Marketplace webhook work should treat `operationId` as mandatory for change-style actions, keep local update handlers idempotent, and preserve `beneficiaryTenantId` as the canonical FastSaaS tenant owner during transfer flows.

### FIDO Marketplace Landing Page
- **Date:** 2026-06-01T20:50:04.569+00:00
- **Owner:** FIDO
- **Context:** Issue #79 needs a post-purchase Marketplace landing flow that survives Microsoft Entra redirects and browser refreshes without creating duplicate subscription records.
- **Decision:** Preserve the Marketplace return path through the sign-in flow with a callback URL, and once the purchase is resolved, replace the URL with `/landing?token=...&subscriptionId=...` so the portal can resume onboarding via `GET /v1/subscriptions/{id}` before activation.
- **Why:** This keeps the marketplace token intact across OAuth, avoids duplicate `POST /v1/subscriptions` calls after refresh or conflict recovery, and lets the frontend gracefully recover when the backend reports an existing pending subscription.
- **Files:** `packages/portal/app/landing/page.tsx`, `packages/portal/app/sign-in/page.tsx`, `packages/portal/components/auth-form.tsx`, `packages/portal/components/landing-client.tsx`, `packages/portal/lib/auth-redirect.ts`, `packages/portal/lib/api-client.ts`

### FIDO Multi-Tenant Entra Auth
- **Date:** 2026-06-01T20:04:56.560+00:00
- **Owner:** FIDO
- **Context:** The customer portal must allow sign-in from any Microsoft Entra organizational tenant instead of being pinned to the publisher tenant.
- **Decision:** Use the `organizations` authority for the portal's Microsoft Entra issuer and refresh-token endpoint, while making `ENTRA_TENANT_ID` optional so publisher-specific tenant operations can still opt into a concrete tenant later.
- **Why:** `organizations` admits work or school accounts from any tenant but excludes personal Microsoft accounts, which matches the portal requirement. Keeping `ENTRA_TENANT_ID` optional preserves a path for future publisher-scoped behavior without reintroducing single-tenant sign-in.
- **Files:** `packages/portal/auth.ts`

### FIDO Portal Redirect and Path Encoding Guardrails
- **Date:** 2026-06-01T21:20:13.494+00:00
- **Owner:** FIDO
- **Context:** PR #81 review found that the portal accepted protocol-relative callback URLs in the auth redirect helper and interpolated landing-page `subscriptionId` values directly into customer API paths.
- **Decision:** Treat portal callback URLs as safe only when they resolve to normalized app-relative paths, and path-encode customer `subscriptionId` values before calling `/v1/subscriptions/{id}` or `/activate` routes.
- **Why:** Rejecting `//...` and other non-local URLs closes the open-redirect path through sign-in, while path encoding ensures landing query parameters cannot inject extra path segments into customer API requests.
- **Files:** `packages/portal/lib/auth-redirect.ts`, `packages/portal/lib/api-client.ts`, `packages/portal/app/sign-in/page.tsx`, `packages/portal/app/landing/page.tsx`, `packages/portal/components/landing-client.tsx`

### FIDO Portal Dockerfile
- **Date:** 2026-06-01T13:26:36.306+00:00
- **Owner:** FIDO
- **Context:** `packages/portal/Dockerfile` still launched the placeholder server instead of the real Next.js portal, so containerized deployments never built or served the actual app.
- **Decision:** Build the portal with Next.js standalone output in a multi-stage Dockerfile, keep the health probe on the app surface, and map the existing `API_BASE_URL` environment variable into `NEXT_PUBLIC_API_BASE_URL` during image build/runtime so the compiled portal can target the API without abandoning the current deployment contract.
- **Why:** The portal lives inside a monorepo and imports `@fastsaas/shared`, so Docker needs standalone tracing rooted at the repo plus workspace-aware dependency installation. Keeping a lightweight health route in the app lets Container Apps probe the real service without depending on auth-protected routes.
- **Files:** `packages/portal/Dockerfile`, `packages/portal/next.config.mjs`, `packages/portal/app/api/health/route.ts`

### FIDO Publisher Portal V2
- **Date:** 2026-06-01T00:04:54.260+00:00
- **Owner:** FIDO
- **Context:** Issue #43 needs publisher portal workflows that do not depend on tenant-scoped subscription routes.
- **Decision:** Keep publisher workflows behind a dedicated frontend adapter that targets explicit publisher-admin endpoints (`/v1/publisher/*`) when enabled, and otherwise falls back to the portal mock adapter with the integration points rendered in the UI.
- **Why:** This prevents the publisher portal from calling tenant-scoped customer subscription APIs, preserves RBAC-aware 403 handling, and lets the UI ship without rework once EECOM exposes the admin routes.
- **Files:** `packages/portal/lib/api-client.ts`, `packages/portal/lib/publisher-admin-api.ts`, `packages/portal/components/publisher-integration-banner.tsx`, `packages/portal/app/(portal)/publisher/layout.tsx`

### GNC Runbook Validation
- **Date:** 2026-05-31T21:35:32.766+00:00
- **Owner:** GNC
- **Context:** Issue #46 requires repeatable validation of webhook authentication and metering outbox recovery behavior before promotion beyond staging.
- **Decision:** Use a dual-mode drill harness: `simulate` mode runs deterministic webhook and metering failure drills locally against the real API modules, and `staging` mode runs live signed webhook probes against the deployed staging API while metering retry drills remain gated on a temporary drill stub endpoint.
- **Why:** The webhook path can be safely exercised live in staging, but the metering worker only exposes retry and dead-letter behavior when its upstream endpoint is deliberately faulted. Keeping a deterministic simulation path prevents regressions in CI and gives operators a repeatable recovery rehearsal even when a live drill stub is unavailable.

### Kranz Multi-Tenant Marketplace Architecture Reset
- **Date:** 2026-06-01T19:54:58.843+00:00
- **Author:** Kranz
- **Title:** Multi-tenant Marketplace architecture reset
- **Decision:** FastSaaS must treat Azure Marketplace commercial tenancy, portal authentication, and authorization as three separate concerns:
  1. **Authentication:** portal and API must accept Microsoft Entra users from external customer tenants via a multi-tenant authority (`organizations` preferred for workforce-only sign-in; `common` only if personal Microsoft accounts are explicitly supported).
  2. **Tenant binding:** customer workspace access must be granted from an internal tenant-membership record created from Marketplace resolve/activation data, with `beneficiaryTenantId` stored as the commercial anchor. JWT `tid` is an input to lookup, not the authoritative FastSaaS tenant key by itself.
  3. **Authorization:** customer roles must be application-managed per FastSaaS tenant/workspace. Publisher roles may remain separate and home-tenant-controlled, but must not be reused as the customer RBAC model.
  4. **Publisher commerce:** current publisher plan/tenant CRUD is not Product Ingestion. Real offer management must live behind a dedicated Partner Center / Product Ingestion module with its own credentials, resource model, and submission workflow.
- **Why:** The current codebase still assumes a fixed Entra tenant for portal auth, derives API tenant context directly from token claims, and lets subscription creation persist `tenantId` from the caller token even when Marketplace resolve returns a different `beneficiaryTenantId`. That architecture will fail for real cross-tenant Azure Marketplace customers and does not provide a safe basis for Product Ingestion work.
- **Required follow-up:**
  - Make portal and API authorities multi-tenant.
  - Introduce an internal tenant-membership model and first-user bootstrap flow from Marketplace activation.
  - Validate Marketplace resolve `beneficiaryTenantId` against the authenticated organization before access is granted.
  - Add explicit publisher identity/config separate from customer subscription tenancy.
  - Build Product Ingestion support as a dedicated integration, not by extending `publisher_plans` metadata.

### Kranz PR #59 Re-review #2 — Publisher Portal RBAC
- **Date:** 2026-06-01T11:23:27Z
- **Reviewer:** Kranz
- **Issue:** #43
- **Verdict:** REJECTED
- **Summary:** EECOM's revision adds live Kysely-backed `/v1/publisher/*` routes (dashboard, plans, subscriptions, tenants) with proper Admin/Owner RBAC enforcement via `authorizeRoute` middleware. The prior blocker (missing backend routes) is architecturally resolved.
- **Blocking Issue:** `npm run typecheck --workspace=@fastsaas/api` fails with 29 TypeScript errors. The publisher routes and service import 14+ types (`PublisherDashboardData`, `PublisherPlan`, `PublisherPlanStatus`, `PublisherTenantDetail`, etc.) from `@fastsaas/shared` that are not exported by that package.
- **Required Fix:** Add the missing Publisher type definitions to `packages/shared/src/index.ts` and confirm typecheck passes on the merge ref.
- **What's Good (non-blocking):**
  - Real Kysely queries with RLS context propagation
  - RBAC permission matrix correctly restricts publisher resources to Admin/Owner
  - Conventional commit message (`feat(api): add publisher management routes`)
  - Proper Express router registration
  - Migration for `publisher_plans` table

### Kranz PR #71 env-var audit fixes
- **Date:** 2026-06-01T16:06:28.277+00:00
- **Author:** Kranz
- **PR:** #71 (commits e6dcf42 + b2fff60)
- **Decision:** APPROVE. All 9 audit items addressed correctly. Both typechecks pass. No blocking issues.
- **Rationale:**
  - **NEXT_PUBLIC_* removal:** All portal routes are server-rendered (`ƒ Dynamic`). No `'use client'` components consume these vars. Removing the `NEXT_PUBLIC_` prefix is correct — it prevents env var values from being embedded in the browser bundle. Portal typecheck passes clean.
  - **Naming convention:** Two-level convention established:
    - **GitHub secrets:** `AZURE_OIDC_CLIENT_ID`, `AZURE_OIDC_TENANT_ID` (OIDC login); `ENTRA_TENANT_ID`, `API_ENTRA_CLIENT_ID`, `PORTAL_ENTRA_CLIENT_ID` (app auth)
    - **Runtime app vars:** `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` (same names in both packages, context-specific values injected via staging env templates)
  - **Secret provisioning:** Previously, `PORTAL_ENTRA_CLIENT_SECRET`, `PORTAL_NEXTAUTH_SECRET`, `MARKETPLACE_AUTH_TOKEN`, `MARKETPLACE_WEBHOOK_SECRET` were referenced via `secretref:` in env files but never provisioned anywhere in CI. New workflow steps close this gap.
  - **Bicep simplification:** `azureTenantId`/`azureClientId` params removed from Bicep. These created a duplicate auth env injection pathway alongside the staging env file pipeline. Removing them makes the workflow authoritative.
- **Minor note (non-blocking):** `set-secrets.ps1` uses `Get-Random` (not cryptographically secure) to generate `PORTAL_NEXTAUTH_SECRET`. The bash version uses `openssl rand -base64 32` (correct). PS1 is developer tooling only — low risk. Can be improved in a follow-up.
- **Outstanding gap (pre-existing, not introduced):** `MARKETPLACE_METERING_API_KEY` is documented in `packages/api/.env.example` but not in `staging-api.env` or the deploy workflow. Not broken by these commits; defer to a metering-focused issue.

### RETRO Metering Recovery Replay
- **Date:** 2026-06-01T00:43:05.936+00:00
- **Owner:** RETRO
- **Decision:** For metering recovery drills, operators should recover dead-lettered usage by restoring the Marketplace endpoint and replaying the payload through `POST /v1/metering/events` with a fresh `eventId` and a fresh `idempotencyKey`.
- **Why:** The metering repository deduplicates on `idempotencyKey` and on the original `eventId` + timestamp pair. Reusing the dead-lettered identifiers would be ignored locally, and directly mutating `usage_events` would destroy the evidence trail the DLQ is supposed to preserve.
- **Follow-up:** Keep the original `usage_event_dead_letters` row as audit evidence and verify the replayed event reaches `submitted` before closing the incident.

### RETRO Security Test Suite
- **Date:** 2026-05-31T21:35:32.766+00:00
- **Owner:** RETRO
- **Decision:** The tenant-isolation security catalog in `packages/api/src/__tests__/security/` uses signed JWKS-backed integration fixtures against the Express API for repeatable coverage, while RLS-only assertions stay skipped behind `SECURITY_RLS_ENABLED` until #45 deploys database policies.
- **Rationale:** This keeps the Phase 1.5 suite executable in CI and on feature branches now, without hiding the staging-only checks that depend on the parallel RLS rollout.
