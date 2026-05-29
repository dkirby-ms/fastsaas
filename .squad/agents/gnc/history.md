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

### 2026-05-29T14:30:29.387-05:00
- Used a two-phase staging deployment flow: bootstrap shared Azure resources with infrastructure/bicep/main.bicep, publish images to ACR, then redeploy Container Apps with the selected image tag.
- Added reusable Azure modules under infrastructure/bicep/modules/ for ACR, Container Apps environment, Container Apps, PostgreSQL Flexible Server, and Redis.
- Standardized /health probes across packages/api/Dockerfile, packages/portal/Dockerfile, docker-compose.yml, .github/workflows/deploy-staging.yml, and docs/deployment-guide.md so local and Azure verification use the same checks.
_No learnings recorded yet._

