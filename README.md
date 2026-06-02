# FastSaaS — Azure Marketplace SaaS Template

FastSaaS is an experimental SaaS accelerator for Microsoft Commercial Marketplace. It provides an integrated backend API, customer portal, and Azure infrastructure for deploying a multi-tenant SaaS offering with marketplace subscription lifecycle management, metering-based billing, and secure customer isolation.

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

### Versioning

FastSaaS uses semantic versioning (`MAJOR.MINOR.PATCH`) for the workspace packages in `packages/api`, `packages/portal`, and `packages/shared`.

```bash
# Bump the API package version
npm version patch --workspace=@fastsaas/api
npm version minor --workspace=@fastsaas/api
npm version major --workspace=@fastsaas/api

# Bump the portal package version
npm version patch --workspace=@fastsaas/portal
npm version minor --workspace=@fastsaas/portal
npm version major --workspace=@fastsaas/portal
```

Use patch for backward-compatible fixes, minor for backward-compatible features, and major for breaking changes. Use the same `npm version <patch|minor|major> --workspace=@fastsaas/shared` pattern when shared-package changes need a version bump. Record notable changes in the root `CHANGELOG.md` using the Keep a Changelog format whenever you bump a package version.

## Deployment

For comprehensive deployment instructions, including infrastructure setup, GitHub Actions workflows, environment configuration, and troubleshooting, see [**Deployment Guide**](./docs/DEPLOYMENT.md).

## Contributing

### Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/dkirby-ms/fastsaas.git
   cd fastsaas
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start local services:**
   ```bash
   docker-compose up
   ```

### Development Workflow

- **Branch naming:** Use descriptive names like `feature/add-tenant-isolation` or `fix/websocket-reconnection`
- **Commit messages:** Follow [Conventional Commits](https://www.conventionalcommits.org/) format (e.g., `feat:`, `fix:`, `docs:`, `chore:`)
- **Pull requests:** Reference related issues in the PR description and summarize validation performed

### Code Quality

- **TypeScript:** All code must be valid TypeScript with `strict: true` mode
- **Testing:** Write tests for new features and bug fixes using the existing test framework
- **Linting:** Run `npm run typecheck` before committing
- **Formatting:** Maintain consistency with existing code style

### Workspace Structure

The project uses Turborepo with npm workspaces. When making changes:

- **API changes:** `packages/api/` — Run `npm run typecheck --workspace=@fastsaas/api` before committing
- **Portal changes:** `packages/portal/` — Run `npm run typecheck --workspace=@fastsaas/portal` before committing
- **Shared changes:** `packages/shared/` — Update version and test across all consumers
- **Infrastructure changes:** `infrastructure/` — Test Bicep templates locally before submitting PR

### Release Process

FastSaaS uses semantic versioning and automated release management:

1. **Version bumps:** Use `npm version <patch|minor|major> --workspace=<PACKAGE>`
2. **Changelog:** Update `CHANGELOG.md` with user-facing changes using Keep a Changelog format
3. **Release:** Merge to `main` — semantic-release automatically publishes new versions

### Reporting Issues

When opening an issue, please include:
- Clear description of the problem or feature request
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Environment details (OS, Node version, etc.)

### Code Review Guidelines

- All PRs require review before merging
- Infrastructure changes are reviewed by GNC (DevOps lead)
- API changes are reviewed by EECOM (backend engineer)
- Portal changes are reviewed by FIDO (frontend engineer)
- Tests are reviewed by RETRO (QA engineer)
