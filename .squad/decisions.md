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
