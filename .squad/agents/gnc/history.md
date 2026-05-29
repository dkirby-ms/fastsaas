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

- **2026-05-29T15:29:10.202-05:00 — Entra ID auth hardening:** Replaced HMAC bearer-token validation with Entra-compatible RS256/JWKS validation using `createRemoteJWKSet`, tenant context now prefers `tid`/`oid`, and dev-only bypass is gated by `AUTH_BYPASS_ENABLED` instead of a fallback secret.
- **2026-05-29T15:29:10.202-05:00 — Validation pattern:** Integration coverage can use a local JWKS endpoint plus `jose`-signed RS256 test tokens to exercise real asymmetric verification paths, including missing-tenant-claim failures.
- **2026-05-29T15:29:10.202-05:00 — Config approach:** API auth now depends on `AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_ID`, optional issuer/audience/JWKS overrides, and sanitized `x-request-id` reflection to keep log/response metadata safe.
