# FIDO Decision — Marketplace Offer Link

- **Date:** 2026-06-04T13:20:25.015+00:00
- **Owner:** FIDO
- **Scope:** `packages/portal/`

## Decision
The `/no-subscription` page must read its Azure Marketplace CTA destination from `NEXT_PUBLIC_MARKETPLACE_OFFER_URL` and fall back to the current preview offer URL when no deployment-specific override is set.

## Why
Marketplace offer URLs vary by deployment and environment, so hardcoding the generic marketplace home page sends unsubscribed customers to the wrong destination and makes environment-specific offers harder to manage.

## Implementation Notes
- `packages/portal/app/no-subscription/page.tsx` resolves the CTA href from `process.env.NEXT_PUBLIC_MARKETPLACE_OFFER_URL`.
- `packages/portal/.env.example` documents the current preview offer URL as the default override value.
