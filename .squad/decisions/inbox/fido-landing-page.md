# FIDO Marketplace Landing Page Decision

- **Date:** 2026-06-01T20:50:04.569+00:00
- **Owner:** FIDO
- **Context:** Issue #79 needs a post-purchase Marketplace landing flow that survives Microsoft Entra redirects and browser refreshes without creating duplicate subscription records.
- **Decision:** Preserve the Marketplace return path through the sign-in flow with a callback URL, and once the purchase is resolved, replace the URL with `/landing?token=...&subscriptionId=...` so the portal can resume onboarding via `GET /v1/subscriptions/{id}` before activation.
- **Why:** This keeps the marketplace token intact across OAuth, avoids duplicate `POST /v1/subscriptions` calls after refresh or conflict recovery, and lets the frontend gracefully recover when the backend reports an existing pending subscription.
- **Files:** `packages/portal/app/landing/page.tsx`, `packages/portal/app/sign-in/page.tsx`, `packages/portal/components/auth-form.tsx`, `packages/portal/components/landing-client.tsx`, `packages/portal/lib/auth-redirect.ts`, `packages/portal/lib/api-client.ts`
