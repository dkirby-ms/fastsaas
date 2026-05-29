# Container Apps staging bootstrap

## When to use
Use this pattern when the team needs a deployable Azure staging environment before application code is ready.

## Pattern
1. Bootstrap shared infrastructure with Bicep using a `deployContainerApps=false` switch.
2. Read ACR outputs from the bootstrap deployment.
3. Build and push placeholder or real images into ACR.
4. Redeploy the same Bicep entrypoint with `deployContainerApps=true` and the chosen image tag.
5. Verify `/health` on each public Container App endpoint.

## Files
- `infrastructure/bicep/main.bicep`
- `infrastructure/bicep/modules/container-app-environment.bicep`
- `infrastructure/bicep/modules/container-app.bicep`
- `.github/workflows/deploy-staging.yml`
- `docs/deployment-guide.md`

## Notes
- Keep health probes aligned across Dockerfiles, Container Apps probes, and runbook checks.
- Use workflow dispatch with `skipBuild=true` for image-tag rollback.
