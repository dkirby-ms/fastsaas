# GNC Health Check Degradation Decision

- **Date:** 2026-05-31
- **Owner:** GNC
- **Context:** Issue #41 tracked the staging `deploy-app` failure at the `Verify health checks` step after the Prisma → Kysely migration and API image changes.
- **Decision:** Keep the `/health` endpoint startup-safe by allowing the API process to boot in degraded mode when `DATABASE_URL` is missing during Container App revision rollout, and give the deploy workflow a longer bounded retry window while new revisions warm up.
- **Why:** Container App environment updates can create a new revision that is not immediately ready. Health verification should measure whether the process eventually binds and serves `/health`, not fail on transient rollout delay or optional database initialization.
