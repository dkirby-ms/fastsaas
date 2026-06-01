# Multi-tenant auth migration notes

## 2026-06-01T20:22:40.911+00:00

### Subscribe request contract change

The `POST /v1/subscriptions` request body no longer accepts `planId` or `seats`.

- Send only `marketplaceToken` and optional `metadata`.
- FastSaaS now derives `planId` and seat quantity exclusively from the Marketplace resolve response.
- Any existing integrator still sending `planId` or `seats` should remove those fields from subscribe requests because they are no longer honored.

### Why this changed

Marketplace resolve is now the source of truth for subscription ownership and commercial terms. This keeps the stored subscription aligned with the Marketplace purchase, including cross-tenant beneficiary scenarios.
