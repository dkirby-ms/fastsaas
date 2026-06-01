# FIDO Portal Redirect and Path Encoding Guardrails

- **Date:** 2026-06-01T21:20:13.494+00:00
- **Owner:** FIDO
- **Context:** PR #81 review found that the portal accepted protocol-relative callback URLs in the auth redirect helper and interpolated landing-page `subscriptionId` values directly into customer API paths.
- **Decision:** Treat portal callback URLs as safe only when they resolve to normalized app-relative paths, and path-encode customer `subscriptionId` values before calling `/v1/subscriptions/{id}` or `/activate` routes.
- **Why:** Rejecting `//...` and other non-local URLs closes the open-redirect path through sign-in, while path encoding ensures landing query parameters cannot inject extra path segments into customer API requests.
- **Files:** `packages/portal/lib/auth-redirect.ts`, `packages/portal/lib/api-client.ts`, `packages/portal/app/sign-in/page.tsx`, `packages/portal/app/landing/page.tsx`, `packages/portal/components/landing-client.tsx`
