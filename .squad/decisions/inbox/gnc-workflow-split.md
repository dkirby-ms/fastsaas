# GNC Workflow Split Decision

- **Date:** 2026-05-31T14:02:05.192+00:00
- **Owner:** GNC
- **Context:** The original staging deployment workflow bundled shared Azure infrastructure provisioning, ACR image builds, and Container Apps release steps into one manual job, making reruns noisy and failure causes harder to isolate.
- **Decision:** Split staging deployment automation into two manual GitHub Actions workflows: `deploy-infra-staging.yml` for shared Bicep infrastructure bootstrap (`deployContainerApps=false`) and `deploy-app-staging.yml` for ACR builds plus the Container Apps deployment pass (`deployContainerApps=true`) against existing infrastructure.
- **Why:** Infrastructure changes are infrequent and fail differently from application builds or health checks. Separating the workflows keeps manual operations deliberate, allows faster app-only iterations after infra is provisioned, and lets the failure-issue workflow classify incidents by infra vs app pipeline.
- **Files:** `.github/workflows/deploy-infra-staging.yml`, `.github/workflows/deploy-app-staging.yml`, `.github/workflows/deploy-staging-failure-issue.yml`
