# EECOM — History

## Project Context
- **Project:** FastSaaS — Next-gen Microsoft Commercial Marketplace SaaS accelerator
- **Stack:** Node.js 22, TypeScript, PostgreSQL + Prisma, REST APIs
- **Key concerns:** Azure Marketplace integration, subscription lifecycle, multi-tenancy, metering
- **User:** dkirby-ms

## Active Assignments (Phase 1)

**2026-05-29 — Kranz Triage Decision**

Assigned to EECOM:
- **#1 [BLOCKING]:** API foundation and auth baseline
  - Owner: EECOM
  - Dependencies: None (priority for all backend work)
  - Sequence: Immediate start
  
- **#2 [BLOCKING]:** Subscription lifecycle and fulfillment
  - Owner: EECOM
  - Dependencies: #1 (API routes)
  - Sequence: After #1 ships
  
- **#3 [BLOCKING]:** Metering ingestion and submission
  - Owner: EECOM
  - Dependencies: #1 (API routes)
  - Sequence: Parallel with #2 after #1 ships

**Execution Plan:** Start #1 immediately. After #1 stabilizes, run #2 and #3 in parallel. Coordinate API contracts with FIDO (#4 portal) and GNC (#5 deployment).

## Learnings

- Staging deployment lives in `.github/workflows/deploy-staging.yml`; use step `env` plus shell-side validation for `workflow_dispatch` inputs before writing values into `GITHUB_ENV`.
- Staging infra is defined in `infrastructure/bicep/main.bicep` with reusable modules under `infrastructure/bicep/modules/`; container pulls should use managed identities, while PostgreSQL/Redis/ACR stay on private networking.
- The real backend service is the Express API in `packages/api/`, backed by shared workspace types in `packages/shared/`; the API container should build the TypeScript app and start `packages/api/dist/server.js` instead of generating a placeholder server.
