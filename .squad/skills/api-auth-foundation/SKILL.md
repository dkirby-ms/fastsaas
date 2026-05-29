# API Auth Foundation

## When to use
Use this pattern when a new backend service needs a minimal but production-shaped Express foundation with JWT auth, tenant context, structured logging, centralized errors, and OpenAPI bootstrap.

## Pattern
1. Create the API workspace under `packages/api/` and shared contracts under `packages/shared/`.
2. Verify bearer tokens in middleware with `jose`, keeping issuer, audience, and signing configuration in env-backed config.
3. Derive tenant context from token claims (`tenant_id`, `tid`, `extension_tenant_id`) and attach it to the request before authorization checks.
4. Use structured JSON request logging plus a single global error handler that emits consistent API error envelopes.
5. Publish `/openapi.json` and `/docs` from route annotations, then validate protected routes and the spec with integration tests.

## FastSaaS reference
- API config: `packages/api/src/config.ts`
- Auth middleware: `packages/api/src/middleware/auth.ts`
- Tenant context: `packages/api/src/middleware/tenant-context.ts`
- Error handler: `packages/api/src/middleware/error-handler.ts`
- OpenAPI bootstrap: `packages/api/src/openapi.ts`
- Integration tests: `packages/api/src/__tests__/app.integration.test.ts`
