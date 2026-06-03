---
name: "container-apps-staging"
description: "Deploy Azure Container Apps in staging with startup-complete env and secret configuration."
domain: "deployment"
confidence: "high"
source: "earned"
---

## Context
Use this pattern when FastSaaS staging needs a repeatable Azure Container Apps deployment that works on both fresh deploys and image updates.

## Patterns
1. Bootstrap shared infrastructure with Bicep using `deployContainerApps=false`.
2. Build or reuse the target images in ACR.
3. Resolve the managed environment default domain before the app deployment so app URLs can be rendered deterministically.
4. Render the checked-in staging env files into Bicep parameters before creating the Container Apps:
   - pass plain env vars as arrays,
   - pass `secretref:` metadata separately from secret values,
   - pass secret values through `@secure()` object parameters.
5. Create or update the Container Apps once with secrets and env vars already present, then verify `/health`.

## Examples
- Workflow: `.github/workflows/deploy-app-staging.yml`
- Env sources: `infrastructure/env/staging-api.env`, `infrastructure/env/staging-portal.env`
- Bicep entrypoint: `infrastructure/bicep/main.bicep`
- Container App module: `infrastructure/bicep/modules/container-app.bicep`

## Anti-Patterns
- Creating a Container App first and then calling `az containerapp secret set` or `az containerapp update --set-env-vars` for startup-critical configuration.
- Passing secret values through non-secure Bicep parameters that can leak into deployment history.
- Leaving `USE_MOCK_API` implicit for staging; the portal defaults to mock mode unless it is explicitly `false`.
