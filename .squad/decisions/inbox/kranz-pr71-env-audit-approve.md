# Decision: PR #71 env-var audit fixes — APPROVED

**Date:** 2026-06-01T16:06:28.277+00:00  
**Author:** Kranz  
**PR:** #71 (commits e6dcf42 + b2fff60)

## Decision

APPROVE. All 9 audit items addressed correctly. Both typechecks pass. No blocking issues.

## Rationale

### NEXT_PUBLIC_* removal
All portal routes are server-rendered (`ƒ Dynamic`). No `'use client'` components consume these vars. Removing the `NEXT_PUBLIC_` prefix is correct — it prevents env var values from being embedded in the browser bundle. Portal typecheck passes clean.

### Naming convention
Two-level convention established:
- **GitHub secrets:** `AZURE_OIDC_CLIENT_ID`, `AZURE_OIDC_TENANT_ID` (OIDC login); `ENTRA_TENANT_ID`, `API_ENTRA_CLIENT_ID`, `PORTAL_ENTRA_CLIENT_ID` (app auth)
- **Runtime app vars:** `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` (same names in both packages, context-specific values injected via staging env templates)

### Secret provisioning
Previously, `PORTAL_ENTRA_CLIENT_SECRET`, `PORTAL_NEXTAUTH_SECRET`, `MARKETPLACE_AUTH_TOKEN`, `MARKETPLACE_WEBHOOK_SECRET` were referenced via `secretref:` in env files but never provisioned anywhere in CI. New workflow steps close this gap.

### Bicep simplification
`azureTenantId`/`azureClientId` params removed from Bicep. These created a duplicate auth env injection pathway alongside the staging env file pipeline. Removing them makes the workflow authoritative.

## Minor note (non-blocking)
`set-secrets.ps1` uses `Get-Random` (not cryptographically secure) to generate `PORTAL_NEXTAUTH_SECRET`. The bash version uses `openssl rand -base64 32` (correct). PS1 is developer tooling only — low risk. Can be improved in a follow-up.

## Outstanding gap (pre-existing, not introduced)
`MARKETPLACE_METERING_API_KEY` is documented in `packages/api/.env.example` but not in `staging-api.env` or the deploy workflow. Not broken by these commits; defer to a metering-focused issue.
