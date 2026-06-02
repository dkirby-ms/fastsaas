# EECOM — History

## Project Context
- **Project:** FastSaaS — Next-gen Microsoft Commercial Marketplace SaaS accelerator
- **Stack:** Node.js 22, TypeScript, PostgreSQL + Prisma, REST APIs
- **Key concerns:** Azure Marketplace integration, subscription lifecycle, multi-tenancy, metering
- **User:** dkirby-ms

## Current Work (Phase 1.5)
**Partner Center Integration (#97)** — Implementing Fulfillment Operations API for subscription resolve/acknowledge/update operations.

## Recent Learnings (2026-06-01)

- Marketplace change webhooks must validate operations via Fulfillment Operations API before persisting plan/quantity/tenant ownership changes
- External customer RBAC now falls back from JWT app roles to tenant membership records
- Tenant member invites enforce role-assignment ceilings: Owners→any role; Admins→Admin or Member only
- Marketplace purchase token redaction is centralized in `packages/api/src/lib/marketplace-token-redaction.ts`
- Metering writes gated by RBAC `metering:write`; marketplace subscription ID stored for worker submissions
- Client API errors sanitized to `{code, message}`; upstream Marketplace bodies logged server-side only

## Completed Phase 1.5 PRs
- **PR #62:** Tenant isolation security suite — APPROVED & MERGED (28/33 tests; 5 RLS-only tests awaiting #45)
- **PR #64:** Tenant RLS enforcement & migrations — Migrations run at API startup; fail if DATABASE_URL set but migration cannot apply
- **PR #59 v2:** Publisher admin routes (Kysely-backed /v1/publisher/*) — Blocked on @fastsaas/shared type exports

## Cross-Team Blockers
- **PR #59 blocking:** Missing Publisher type exports (PublisherDashboardData, PublisherPlan, PublisherPlanStatus, PublisherTenantDetail, etc.) from @fastsaas/shared

## Key Patterns Established
- RLS enforcement via `packages/api/src/db/execution-context.ts` and `packages/api/src/db/rls.ts`
- RBAC centralized in `packages/api/src/middleware/rbac.ts` with `authorizeRoute` middleware
- Audit logging split between service layer and append-only migration
- Marketplace token redaction applied at write and read (defense in depth)
- API startup validates required secrets; fails closed in non-dev/test environments

## Previous Phase 1 Completions
- **PR #7:** API foundation (Express + JWT + tenant middleware + OpenAPI) — COMPLETE
- **PR #10:** Subscription lifecycle (state machine, webhooks, fulfillment client) — COMPLETE
- **PR #9:** Metering ingestion (outbox, retry, DLQ, SLA dashboard) — COMPLETE
- **PR #24:** PostgreSQL firewall rules for public-mode deployments — COMPLETE (Kranz approved)
- **PR #61 v0.1.0 tag fix:** Semantic-release baseline established — COMPLETE

**See history-archive.md for detailed session records.**
