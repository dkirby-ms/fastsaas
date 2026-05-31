# FastSaaS — Azure Marketplace SaaS Template

FastSaaS is a production-ready SaaS accelerator for Microsoft Commercial Marketplace. It provides an integrated backend API, customer portal, and Azure infrastructure for deploying a multi-tenant SaaS offering with marketplace subscription lifecycle management, metering-based billing, and secure customer isolation.

## Architecture

**Monorepo Structure:**
- `packages/api/` — Node.js + Express REST API with Prisma ORM, PostgreSQL, and Redis integration
- `packages/portal/` — Next.js customer portal with React and Tailwind CSS
- `packages/shared/` — Shared TypeScript types and utilities
- `infrastructure/` — Azure Bicep templates and deployment configuration
- `.github/workflows/` — GitHub Actions CI/CD pipeline

**Azure Deployment:**
- **Container Apps** — Hosts both API and portal services
- **PostgreSQL Flexible Server** — Multi-tenant database (region: centralus)
- **Azure Managed Redis** — Distributed cache for session/state management
- **Azure Container Registry** — Private image repository
- **Log Analytics Workspace** — Application insights and monitoring

**Deployment Regions:**
- Default region: `centralus` (PostgreSQL Flexible Server availability)
- Azure Managed Redis with private-link support
- Public endpoint access by default in staging/dev (optional private endpoints in production)

## Prerequisites

### Local Development
- Node.js 22.x and npm 10.9.2
- Docker and Docker Compose (for local backend services)
- Git

### Azure Deployment
- Azure subscription with permissions to:
  - Create resource groups
  - Deploy Container Apps environments
  - Provision PostgreSQL Flexible Server and Azure Managed Redis
  - Create/push to Azure Container Registry
- **Azure CLI** (`az` command)
- **GitHub CLI** (`gh` command)

### GitHub Repository Secrets

Set these secrets in your GitHub repository settings under **Settings → Secrets and variables → Actions**:

```
AZURE_SUBSCRIPTION_ID       # Azure subscription ID (from `az account show --query id`)
AZURE_TENANT_ID             # Azure AD tenant ID (from `az account show --query tenantId`)
AZURE_CLIENT_ID             # Federated identity client ID for OpenID Connect login
STAGING_POSTGRES_ADMIN_PASSWORD  # PostgreSQL admin password (securely generated)
```

**Additional Application Secrets** (if using Entra ID authentication):
- `NEXTAUTH_SECRET` — Session encryption secret for Next.js portal (base64-encoded)
- Any additional app-specific secrets referenced in `infrastructure/env/staging-*.env`

## Local Development

### Start Local Services

```bash
# Start PostgreSQL, Redis, API, and portal with Docker Compose
docker-compose up

# Services available at:
# - API: http://localhost:3000
# - Portal: http://localhost:3001
# - PostgreSQL: localhost:5432
# - Redis: localhost:6379
```

### Build and Test

```bash
# Root workspace commands
npm run build       # Build all packages
npm run typecheck   # TypeScript validation across monorepo
npm run test        # Run tests

# API-specific
npm run build --workspace=@fastsaas/api
npm run test --workspace=@fastsaas/api
npm run typecheck --workspace=@fastsaas/api

# Portal-specific
npm run build --workspace=@fastsaas/portal
npm run typecheck --workspace=@fastsaas/portal
```

### Development Servers

```bash
# Terminal 1: API development server (watches for changes)
npm run dev --workspace=@fastsaas/api

# Terminal 2: Portal development server (Next.js hot reload)
npm run dev --workspace=@fastsaas/portal

# Terminal 3 (optional): Local services
docker-compose up postgres redis
```

## Deployment

### Deployment Workflows

FastSaaS uses two separate GitHub Actions workflows for staging deployment:

#### 1. Infrastructure Deployment (`.github/workflows/deploy-infra-staging.yml`)

Bootstraps Azure resources using Bicep. Run this **once** before deploying the application.

```bash
gh workflow run deploy-infra-staging.yml \
  --ref main \
  --field resourceGroup=rg-fastsaas-staging \
  --field location=centralus \
  --field environmentName=staging
```

**What it does:**
- Creates Azure resource group
- Deploys Bicep template with infrastructure resources (shared resources only, no Container Apps)
- Provisions PostgreSQL Flexible Server, Azure Managed Redis, Container Registry
- Outputs infrastructure endpoints (ACR URL, database FQDN, Redis host)

**Outputs:**
- ACR name, login server, and credentials
- Container Apps environment ID
- PostgreSQL server FQDN
- Redis host and port

#### 2. Application Deployment (`.github/workflows/deploy-app-staging.yml`)

Builds container images and deploys to Azure Container Apps. Run this **after** infrastructure deployment or to roll out new versions.

```bash
gh workflow run deploy-app-staging.yml \
  --ref main \
  --field resourceGroup=rg-fastsaas-staging \
  --field location=centralus \
  --field environmentName=staging \
  --field imageTag=latest \
  --field skipBuild=false
```

**Workflow:**
1. **Build** — Creates Docker images in Azure Container Registry for API and portal
2. **Deploy** — Deploys Bicep template with Container Apps + image references
3. **Configure** — Applies environment variables to Container Apps post-deployment
4. **Verify** — Runs health checks against API and portal endpoints

**Options:**
- `imageTag` — Optional custom image tag (defaults to commit SHA)
- `skipBuild` — Set to `true` to reuse existing image tags (for rollback/redeploy)

**Manual Redeploy (e.g., rollback to previous version):**

```bash
gh workflow run deploy-app-staging.yml \
  --ref main \
  --field imageTag=abc1234def \
  --field skipBuild=true
```

### Environment Variables

Environment variable management follows a two-tier approach:

#### Infrastructure-Coupled Secrets (Bicep-managed)

Secrets tightly bound to infrastructure (database connection, Redis access) are embedded in the Bicep template outputs and configured during infrastructure deployment:
- `DATABASE_URL` — PostgreSQL connection string (constructed from Bicep outputs)
- `REDIS_URL` — Redis connection string with auth (constructed from Bicep outputs)

#### Application-Level Environment Variables (Post-deploy CLI)

App-specific variables are loaded from env files and applied to Container Apps **after** deployment using `az containerapp update --set-env-vars`:

**API Environment** (`infrastructure/env/staging-api.env`):
```
API_PORT=3000
NODE_ENV=production
AZURE_AD_TENANT_ID={{AZURE_TENANT_ID}}
AZURE_AD_CLIENT_ID={{AZURE_CLIENT_ID}}
```

**Portal Environment** (`infrastructure/env/staging-portal.env`):
```
APP_NAME=portal
PORT=3001
HEALTH_PATH=/health
NODE_ENV=production
API_BASE_URL={{API_BASE_URL}}
```

#### Placeholder Substitution

The deployment workflow uses `{{PLACEHOLDER}}` syntax for dynamic values:
- `{{SECRET_NAME}}` — Resolved from GitHub repository secrets at deploy time
- `{{API_BASE_URL}}` — Resolved from Bicep deployment outputs

**Adding a New Environment Variable:**

1. **Add to `.env` file** (`infrastructure/env/staging-api.env` or `staging-portal.env`):
   ```
   NEW_VAR=value
   # Or with placeholder:
   NEW_SECRET={{MY_GITHUB_SECRET}}
   ```

2. **If using a placeholder:**
   - Create the secret in GitHub repository settings
   - Reference it in the workflow's `env:` block (for Docker builds) or as a GitHub secret

3. **Deployment automatically applies** via post-deploy CLI step

### Manual Operations

**View deployment status:**
```bash
az deployment group list --resource-group rg-fastsaas-staging --query "[*].[name, properties.provisioningState]" -o table
```

**Update Container App environment variables manually:**
```bash
az containerapp update \
  --resource-group rg-fastsaas-staging \
  --name staging-api \
  --set-env-vars KEY1=value1 KEY2=value2
```

**Check Container App logs:**
```bash
az containerapp logs show \
  --resource-group rg-fastsaas-staging \
  --name staging-api \
  --container staging-api
```

## GitHub Secrets Reference

| Secret | Usage | Example |
|--------|-------|---------|
| `AZURE_SUBSCRIPTION_ID` | Azure authentication | `00000000-0000-0000-0000-000000000000` |
| `AZURE_TENANT_ID` | Azure AD tenant | `00000000-0000-0000-0000-000000000000` |
| `AZURE_CLIENT_ID` | Federated identity client | `00000000-0000-0000-0000-000000000000` |
| `STAGING_POSTGRES_ADMIN_PASSWORD` | DB admin credentials | (securely generated, 12+ chars) |
| `NEXTAUTH_SECRET` | Portal session encryption | (base64-encoded 32+ byte key) |

## Key Architecture Decisions

**Region: centralus**
- PostgreSQL Flexible Server offer availability
- Co-located with Container Apps and Redis for latency optimization

**Azure Managed Redis (`Microsoft.Cache/redisEnterprise`)**
- MemoryOptimized_M10 SKU for staging
- Encrypted client protocol on port 10000
- Private-link compatible (DNS zone: `privatelink.redis.azure.net`)

**PostgreSQL Flexible Server**
- Public endpoint by default in staging (`usePrivateEndpoints=false`)
- Production deployments can opt-in to private endpoints
- Admin user: `fastsaasadmin`

**Two-Phase Bicep Deployment Strategy**
- Phase 1: Deploy shared infrastructure (`deployContainerApps=false`) → provision all resources except Container Apps
- Phase 2: Build images in ACR, then deploy Container Apps (`deployContainerApps=true`) with valid image references
- Benefits: Ensures Container Apps always reference valid image tags, enables safe rollback by redeploying with previous image tags

**Public Endpoints (Staging Default)**
- Container Apps, PostgreSQL, Redis use public endpoints in staging for simpler development
- Private endpoints can be enabled in production by setting `usePrivateEndpoints=true` in deployment parameters

## Troubleshooting

### Infrastructure Deployment Fails

```bash
# Check failed deployment details
az deployment group show \
  --resource-group rg-fastsaas-staging \
  --name staging-infra-<RUN_ID> \
  --query properties.error

# View operation logs
az deployment operation group list \
  --resource-group rg-fastsaas-staging \
  --name staging-infra-<RUN_ID> \
  --query "[?properties.provisioningState=='Failed']"
```

### Application Doesn't Start

Check Container App logs and recent revisions:
```bash
# View active revision
az containerapp revision list \
  --resource-group rg-fastsaas-staging \
  --container-app staging-api \
  --query "[0].[name, properties.runningState]"

# Stream logs
az containerapp logs show \
  --resource-group rg-fastsaas-staging \
  --name staging-api \
  --follow
```

### Database Connection Issues

Verify PostgreSQL is accessible:
```bash
PG_FQDN=$(az deployment group show \
  --resource-group rg-fastsaas-staging \
  --name staging-infra-<RUN_ID> \
  --query properties.outputs.postgresServerFqdn.value -o tsv)

# Test connection (requires psql)
psql -h $PG_FQDN -U fastsaasadmin -d fastsaas
```

### Environment Variables Not Applied

Verify variables were set in Container App:
```bash
az containerapp show \
  --resource-group rg-fastsaas-staging \
  --name staging-api \
  --query properties.template.containers[0].env
```

## References

- **Infrastructure:** `infrastructure/bicep/main.bicep` — Primary Bicep template
- **Deployment Parameters:** `infrastructure/bicep/main.parameters.example.json`
- **Infrastructure Workflow:** `.github/workflows/deploy-infra-staging.yml`
- **Application Workflow:** `.github/workflows/deploy-app-staging.yml`
- **API:** `packages/api/package.json` — Build scripts and dependencies
- **Portal:** `packages/portal/package.json` — Build scripts and dependencies
- **Local Services:** `docker-compose.yml` — Local development stack
