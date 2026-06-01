# EECOM PR #64 fix

## Decision
Run pending Kysely migrations before the API starts accepting traffic, and fail startup when `DATABASE_URL` is configured but migrations cannot be applied.

## Rationale
PR #64's original RLS migration existed in source control but had no executable path, so production could start without tenant policies being applied. Wiring the migrator into startup plus `npm run migrate` makes RLS enforcement an actual runtime guarantee instead of a manual follow-up step.

## Test strategy
Use a Docker-backed PostgreSQL integration test with a dedicated non-superuser app role. PostgreSQL superusers bypass RLS, so using the real application role is required to prove `app.current_tenant` blocks cross-tenant reads; the suite is runnable via `npm run test:rls`.
