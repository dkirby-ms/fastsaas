# RETRO security test suite note

- Date: 2026-05-31T21:35:32.766+00:00
- Decision: The tenant-isolation security catalog in `packages/api/src/__tests__/security/` uses signed JWKS-backed integration fixtures against the Express API for repeatable coverage, while RLS-only assertions stay skipped behind `SECURITY_RLS_ENABLED` until #45 deploys database policies.
- Rationale: This keeps the Phase 1.5 suite executable in CI and on feature branches now, without hiding the staging-only checks that depend on the parallel RLS rollout.
