# Copilot Instructions

## Project overview
FastSaaS is a SaaS accelerator for Microsoft Commercial Marketplace. It provides a marketplace-integrated backend, customer portal, and Azure infrastructure for deploying a multi-tenant SaaS offering.

## Tech stack
- Node.js 22 with npm 10.9.2
- TypeScript strict mode across the monorepo
- Turborepo with npm workspaces
- `@fastsaas/api`: Express, Prisma, PostgreSQL, Vitest
- `@fastsaas/portal`: Next.js, React, Tailwind CSS
- Azure Bicep in `infrastructure/` for deployment and environment provisioning

## Monorepo structure
- `packages/api/` — API service, Prisma schema, backend tests
- `packages/portal/` — Next.js customer portal
- `infrastructure/` — Azure Bicep templates and deployment assets

## Root commands
- `npm run build`
- `npm run test`
- `npm run typecheck`

## Workspace commands
- API build: `npm run build --workspace=@fastsaas/api`
- API test: `npm run test --workspace=@fastsaas/api`
- API typecheck: `npm run typecheck --workspace=@fastsaas/api`
- Portal build: `npm run build --workspace=@fastsaas/portal`
- Portal typecheck: `npm run typecheck --workspace=@fastsaas/portal`

## Coding conventions
- Keep TypeScript compatible with strict mode.
- Use Prisma for database access and schema generation in `packages/api`.
- Use Vitest for tests where test scripts exist.
- Prefer focused, surgical changes and avoid unrelated refactors.
- Preserve workspace boundaries in the monorepo.

## Pull request conventions
- Reference the related issue number in the PR description.
- Keep commits small and focused.
- Summarize validation performed in the PR.

## Validation expectations
Always run `npm run typecheck` before committing. When relevant, also run the smallest affected build or test command for the workspace you changed.
