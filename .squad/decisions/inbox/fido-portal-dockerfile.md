# FIDO Portal Dockerfile Decision

- **Date:** 2026-06-01T13:26:36.306+00:00
- **Owner:** FIDO
- **Context:** `packages/portal/Dockerfile` still launched the placeholder server instead of the real Next.js portal, so containerized deployments never built or served the actual app.
- **Decision:** Build the portal with Next.js standalone output in a multi-stage Dockerfile, keep the health probe on the app surface, and map the existing `API_BASE_URL` environment variable into `NEXT_PUBLIC_API_BASE_URL` during image build/runtime so the compiled portal can target the API without abandoning the current deployment contract.
- **Why:** The portal lives inside a monorepo and imports `@fastsaas/shared`, so Docker needs standalone tracing rooted at the repo plus workspace-aware dependency installation. Keeping a lightweight health route in the app lets Container Apps probe the real service without depending on auth-protected routes.
- **Files:** `packages/portal/Dockerfile`, `packages/portal/next.config.mjs`, `packages/portal/app/api/health/route.ts`
