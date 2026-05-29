# Deployment guide

This runbook covers the staging deployment path introduced for issue #5. The current containers are placeholder images with `/health` endpoints so infrastructure, CI/CD, and health probes can be validated before the API and portal code lands.

## Prerequisites
- Azure CLI with access to the target subscription
- Docker with local image build support
- GitHub Actions environment secrets for `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, and `STAGING_POSTGRES_ADMIN_PASSWORD`
- A staging resource group name and Azure region

## GitHub Actions deployment
1. Push the branch with the infrastructure changes.
2. Trigger `Deploy staging` from the Actions tab or run:
   ```bash
   gh workflow run deploy-staging.yml \
     -f resourceGroup=rg-fastsaas-staging \
     -f location=eastus \
     -f environmentName=staging
   ```
3. The workflow bootstraps ACR, PostgreSQL, Redis, and the Container Apps environment.
4. The workflow builds and pushes `fastsaas-api:<sha>` and `fastsaas-portal:<sha>`.
5. The workflow redeploys the Bicep template with the new image tags and verifies `https://<app>/health` for both services.

## Manual deployment
1. Create or confirm the resource group:
   ```bash
   az group create --name rg-fastsaas-staging --location eastus
   ```
2. Bootstrap the shared staging infrastructure without deploying the apps:
   ```bash
   az deployment group create \
     --resource-group rg-fastsaas-staging \
     --name staging-bootstrap \
     --template-file infrastructure/bicep/main.bicep \
     --parameters @infrastructure/bicep/main.parameters.example.json \
     --parameters location=eastus environmentName=staging deployContainerApps=false postgresAdminPassword="$POSTGRES_ADMIN_PASSWORD"
   ```
3. Read the ACR outputs and sign in:
   ```bash
   ACR_NAME=$(az deployment group show --resource-group rg-fastsaas-staging --name staging-bootstrap --query properties.outputs.acrName.value -o tsv)
   ACR_LOGIN_SERVER=$(az deployment group show --resource-group rg-fastsaas-staging --name staging-bootstrap --query properties.outputs.acrLoginServer.value -o tsv)
   az acr login --name "$ACR_NAME"
   ```
4. Build and push the placeholder images:
   ```bash
   IMAGE_TAG=$(git rev-parse HEAD)
   docker build --file packages/api/Dockerfile --target runtime --build-arg SERVICE_NAME=api --build-arg SERVICE_PORT=3000 --tag "$ACR_LOGIN_SERVER/fastsaas-api:$IMAGE_TAG" .
   docker push "$ACR_LOGIN_SERVER/fastsaas-api:$IMAGE_TAG"
   docker build --file packages/portal/Dockerfile --target runtime --build-arg SERVICE_NAME=portal --build-arg SERVICE_PORT=3001 --tag "$ACR_LOGIN_SERVER/fastsaas-portal:$IMAGE_TAG" .
   docker push "$ACR_LOGIN_SERVER/fastsaas-portal:$IMAGE_TAG"
   ```
5. Deploy the container apps with the chosen tag:
   ```bash
   az deployment group create \
     --resource-group rg-fastsaas-staging \
     --name staging-release \
     --template-file infrastructure/bicep/main.bicep \
     --parameters @infrastructure/bicep/main.parameters.example.json \
     --parameters location=eastus environmentName=staging deployContainerApps=true apiImageTag="$IMAGE_TAG" portalImageTag="$IMAGE_TAG" postgresAdminPassword="$POSTGRES_ADMIN_PASSWORD"
   ```

## Verification
- Read deployment outputs:
  ```bash
  az deployment group show --resource-group rg-fastsaas-staging --name staging-release --query properties.outputs
  ```
- Verify the API health endpoint:
  ```bash
  curl --fail --show-error --silent "$(az deployment group show --resource-group rg-fastsaas-staging --name staging-release --query properties.outputs.apiUrl.value -o tsv)/health"
  ```
- Verify the portal health endpoint:
  ```bash
  curl --fail --show-error --silent "$(az deployment group show --resource-group rg-fastsaas-staging --name staging-release --query properties.outputs.portalUrl.value -o tsv)/health"
  ```
- Confirm the local development stack renders the placeholders:
  ```bash
  docker compose up --build -d
  docker compose ps
  ```

## Rollback
1. Identify the last known good image tag in ACR or from a previous workflow run.
2. Re-run the workflow with `skipBuild=true` and `imageTag=<known-good-tag>`:
   ```bash
   gh workflow run deploy-staging.yml \
     -f resourceGroup=rg-fastsaas-staging \
     -f location=eastus \
     -f environmentName=staging \
     -f imageTag=<known-good-tag> \
     -f skipBuild=true
   ```
3. For a manual rollback, redeploy the Bicep template with the previous `apiImageTag` and `portalImageTag` values.
4. Repeat the health verification commands after rollback.

## Environment checklist
- Container Apps environment exists and exposes two external apps: `staging-api` and `staging-portal`
- ACR contains matching API and portal tags for the deployment
- PostgreSQL Flexible Server reports the `fastsaas` database
- Azure Cache for Redis resolves and accepts TLS connections
- `/health` returns HTTP 200 for both container apps
