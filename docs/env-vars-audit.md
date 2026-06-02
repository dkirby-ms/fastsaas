# FastSaaS environment variables and secrets audit

Generated: 2026-06-01T14:35:46.727+00:00

## Scope

Audited surfaces:

- `packages/api/src/config.ts`
- `packages/portal/auth.ts`
- `packages/portal/.env.example`
- `packages/api/.env.example`
- `infrastructure/env/staging-api.env`
- `infrastructure/env/staging-portal.env`
- `infrastructure/bicep/main.bicep`
- `.github/workflows/deploy-app-staging.yml`
- `.github/workflows/deploy-infra-staging.yml`
- `packages/portal/Dockerfile`
- `packages/api/Dockerfile`
- `docker-compose.yml`
- root `.env`
- additional code/script consumers in `packages/portal/lib/*`, `packages/api/src/db/*`, `packages/api/src/lib/logger.ts`, `scripts/drills/webhook-metering-runbook.ts`, and `scripts/squad-places/common.mjs`

## 1. Summary table

### 1.1 Application and deployment env vars

| Name | Surfaces | Secret? | Current source of truth | Notes |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | API config; `staging-api.env`; `staging-portal.env`; both Dockerfiles | Config | Docker defaults + env files | Shared runtime mode flag. |
| `API_PORT` | API config; `staging-api.env`; Bicep API env; API Dockerfile | Config | Split between Bicep, staging env file, Docker default | API reads this; generic `PORT` is separate and mostly redundant for API. |
| `API_VERSION` | API config only | Config | `packages/api/src/config.ts` default | No template or deployment surface. |
| `DATABASE_URL` | API config; API migration commands; `docker-compose.yml`; Bicep secret env | Secret | Bicep for staging; compose for local | API has no `.env.example` documenting it. |
| `ENTRA_TENANT_ID` | API config; portal auth; portal `.env.example`; `staging-api.env`; `staging-portal.env`; Bicep API env; deploy workflow placeholders | Config | Split across portal example, staging env files, and Bicep | Same logical value appears in many places. |
| `ENTRA_CLIENT_ID` | API config; portal auth; portal `.env.example`; `staging-api.env`; `staging-portal.env`; Bicep API env; deploy workflow placeholders | Config | Split across portal example, staging env files, and Bicep | Overlaps with GitHub secret `AZURE_CLIENT_ID`. |
| `ENTRA_ISSUER` | API config only | Config | `packages/api/src/config.ts` default/override | No env template. |
| `ENTRA_AUDIENCE` | API config only | Config | `packages/api/src/config.ts` default/override | No env template. |
| `ENTRA_JWKS_URI` | API config only | Config | `packages/api/src/config.ts` default/override | No env template. |
| `JWT_REQUIRED_SCOPE` | API config only | Config | `packages/api/src/config.ts` default | No env template. |
| `AUTH_BYPASS_ENABLED` | API config only | Config | `packages/api/src/config.ts` default | Dev/test only; forbidden in production by code. |
| `AUTH_DEV_USER_ID` | API config only | Config | `packages/api/src/config.ts` default | Dev only. |
| `AUTH_DEV_TENANT_ID` | API config only | Config | `packages/api/src/config.ts` default | Dev only. |
| `MARKETPLACE_BASE_URL` | API config only | Config | `packages/api/src/config.ts` default | Not surfaced in staging env files. |
| `MARKETPLACE_API_VERSION` | API config only | Config | `packages/api/src/config.ts` default | Not surfaced in staging env files. |
| `MARKETPLACE_CLIENT_SECRET` | API config only; metering client; `staging-api.env` (`secretref:`); `deploy-app-staging.yml` secret | Secret | Staging env file via Container App secret; provisioned by deploy workflow | Wired for staging via secret ref. |
| `MARKETPLACE_WEBHOOK_SECRET` | API config; drill script; `staging-api.env` (`secretref:`); `deploy-app-staging.yml` secret | Secret | Staging env file via Container App secret; provisioned by deploy workflow | Wired for staging via secret ref. |
| `MARKETPLACE_WEBHOOK_TIMESTAMP_TOLERANCE_MS` | API config only | Config | `packages/api/src/config.ts` default | Not documented elsewhere. |
| `METERING_READ_SCOPE` | API config only | Config | `packages/api/src/config.ts` default | No env template. |
| `METERING_WRITE_SCOPE` | API config only | Config | `packages/api/src/config.ts` default | No env template. |
| `METERING_BATCH_SIZE` | API config only | Config | `packages/api/src/config.ts` default | No env template. |
| `METERING_WORKER_INTERVAL_MS` | API config only | Config | `packages/api/src/config.ts` default | No env template. |
| `METERING_CLAIM_LEASE_MS` | API config only | Config | `packages/api/src/config.ts` default | No env template. |
| `METERING_RETRY_BASE_DELAY_MS` | API config only | Config | `packages/api/src/config.ts` default | No env template. |
| `METERING_RETRY_MAX_DELAY_MS` | API config only | Config | `packages/api/src/config.ts` default | No env template. |
| `METERING_RETRY_JITTER_RATIO` | API config only | Config | `packages/api/src/config.ts` default | No env template. |
| `METERING_MAX_RETRIES` | API config only | Config | `packages/api/src/config.ts` default | No env template. |
| `METERING_SUBMISSION_SLA_MS` | API config only | Config | `packages/api/src/config.ts` default | No env template. |
| `MARKETPLACE_METERING_ENDPOINT` | API config; drill script | Config | Code/runtime override only | No deployment source found. |
| `LOG_LEVEL` | API logger only | Config | Runtime only | No example or deploy surface. |
| `SECURITY_RLS_ENABLED` | API security tests only | Config | Test runtime only | Not an application runtime var. |
| `NEXTAUTH_SECRET` | Portal auth; portal `.env.example`; `staging-portal.env` (`secretref:`); root `.env`; portal Docker build placeholder | Secret | Portal example for local; staging env file for deployment | Staging secret ref is not provisioned anywhere in repo automation. |
| `NEXTAUTH_URL` | Portal `.env.example`; `staging-portal.env`; root `.env` | Config | Portal example for local; staging env file for deployment | Needed by Auth.js runtime. |
| `ENTRA_CLIENT_SECRET` | Portal auth; portal `.env.example`; `staging-portal.env` (`secretref:`); portal Docker build placeholder | Secret | Portal example for local; staging env file for deployment | Staging secret ref is not provisioned anywhere in repo automation. |
| `ENTRA_API_CLIENT_ID` | Portal auth; portal `.env.example`; `staging-portal.env`; portal Docker build placeholder | Config | Portal example + staging env file | Staging maps this from GitHub secret `AZURE_CLIENT_ID`. |
| `ENTRA_API_SCOPE` | Portal auth; portal `.env.example` | Config | Portal example or code default derived from `ENTRA_API_CLIENT_ID` | No staging override file. |
| `NEXT_PUBLIC_API_BASE_URL` | Portal API client code; portal `.env.example`; portal Dockerfile build/runtime env; root `.env` | Config | Docker build arg + portal example | Staging env file sets `API_BASE_URL`, not this variable. |
| `NEXT_PUBLIC_PUBLISHER_API_BASE_URL` | Portal publisher code; portal `.env.example` | Config | Portal example | No staging surface. |
| `NEXT_PUBLIC_ENABLE_PUBLISHER_ADMIN_API` | Portal publisher code; portal `.env.example` | Config | Portal example | No staging surface. |
| `NEXT_PUBLIC_USE_MOCK_API` | Portal code; portal `.env.example`; root `.env` | Config | Portal example/root local env | No staging surface. |
| `API_BASE_URL` | `staging-portal.env`; deploy workflow placeholder; portal Dockerfile arg/env; placeholder server | Config | Deploy workflow output + Docker build arg | Real portal app code does not read this directly. |
| `APP_NAME` | `staging-portal.env`; portal Dockerfile; `docker-compose.yml` | Config | Docker/compose | Only placeholder server consumes it. |
| `PORT` | `staging-portal.env`; both Dockerfiles; `docker-compose.yml`; placeholder server | Config | Docker/compose | Portal runtime uses it; API app mainly uses `API_PORT` instead. |
| `HEALTH_PATH` | `staging-portal.env`; portal Dockerfile; `docker-compose.yml`; placeholder server | Config | Docker/compose | Mostly health-check plumbing. |
| `HOSTNAME` | Portal Dockerfile only | Config | Dockerfile | Runner-only. |
| `REDIS_URL` | `docker-compose.yml`; Bicep secret env for API | Secret | Bicep for staging; compose for local | No current API code consumer found. |
| `POSTGRES_DB` | `docker-compose.yml` | Config | Compose only | Local database container only. |
| `POSTGRES_USER` | `docker-compose.yml` | Config | Compose only | Local database container only. |
| `POSTGRES_PASSWORD` | `docker-compose.yml` | Secret | Compose only | Local database container only. |
| `SERVICE_NAME` | `docker-compose.yml` build args | Config | Compose only | No consumer found in current Dockerfiles. |
| `SERVICE_PORT` | `docker-compose.yml` build args | Config | Compose only | No consumer found in current Dockerfiles. |

### 1.2 Workflow and deployment-only secrets/vars

| Name | Surfaces | Secret? | Current source of truth | Notes |
| --- | --- | --- | --- | --- |
| `STAGING_POSTGRES_ADMIN_PASSWORD` | `deploy-infra-staging.yml`; `deploy-app-staging.yml` | Secret | GitHub Actions secret | Passed into Bicep as `postgresAdminPassword`; not an app env var. |
| `AZURE_CLIENT_ID` | both deploy workflows; `staging-api.env` placeholder; `staging-portal.env` placeholder | Secret/Config | GitHub Actions secret | Overloaded: Azure login credential and application client ID source. |
| `AZURE_TENANT_ID` | both deploy workflows; `staging-api.env` placeholder; `staging-portal.env` placeholder | Config | GitHub Actions secret | Used for Azure login and app auth placeholders. |
| `AZURE_SUBSCRIPTION_ID` | both deploy workflows | Secret/Config | GitHub Actions secret | Workflow-only. |
| `PORTAL_CLIENT_ID` | `deploy-app-staging.yml`; `staging-portal.env` placeholder | Config | GitHub Actions secret | Portal-specific app registration/client ID. |
| `PORTAL_ENTRA_CLIENT_SECRET` | `deploy-app-staging.yml` | Secret | GitHub Actions secret | Provisioned as Container App secret `portal-entra-client-secret`. |
| `PORTAL_NEXTAUTH_SECRET` | `deploy-app-staging.yml` | Secret | GitHub Actions secret | Provisioned as Container App secret `portal-nextauth-secret`. |

### 1.3 Tooling and audit-adjacent env vars

| Name | Surfaces | Secret? | Current source of truth | Notes |
| --- | --- | --- | --- | --- |
| `SQUAD_PLACES_BASE_URL` | root `.env`; `scripts/squad-places/common.mjs` | Config | Local root `.env` | Tooling only, not app runtime. |
| `SQUAD_PLACES_API_KEY` | root `.env`; `scripts/squad-places/common.mjs` | Secret | Local root `.env` | Tooling only. |
| `SQUAD_PLACES_SQUAD_ID` | `scripts/squad-places/common.mjs` | Config | Runtime/fallback only | Optional; falls back to `SQUAD_PLACES_ID`. |
| `SQUAD_PLACES_ID` | `scripts/squad-places/common.mjs` | Config | Runtime/fallback only | Optional legacy alias. |
| `STAGING_API_BASE_URL` | drill script | Config | Runtime only | Needed for live webhook drill mode. |
| `WEBHOOK_MARKETPLACE_SUBSCRIPTION_ID` | drill script | Config | Runtime only | Drill-only. |
| `WEBHOOK_ACTION` | drill script | Config | Runtime only | Drill-only. |
| `WEBHOOK_TIMEOUT_MS` | drill script | Config | Runtime only | Drill-only. |
| `WEBHOOK_EXPECTED_ENDPOINT_URL` | drill script | Config | Runtime only | Drill-only. |
| `WEBHOOK_REGISTERED_ENDPOINT_URL` | drill script | Config | Runtime only | Drill-only. |
| `WEBHOOK_TIMEOUT_URL` | drill script | Config | Runtime only | Drill-only. |
| `AZURE_AD_TENANT_ID` | root `.env` only | Config | Local root `.env` | Legacy name; current app code uses `ENTRA_TENANT_ID`. |
| `AZURE_AD_CLIENT_ID` | root `.env` only | Config | Local root `.env` | Legacy name; current app code uses `ENTRA_CLIENT_ID`. |
| `AZURE_AD_CLIENT_SECRET` | root `.env` only | Secret | Local root `.env` | Legacy name; current app code uses `ENTRA_CLIENT_SECRET`. |
| `AZURE_AD_API_CLIENT_ID` | root `.env` only | Config | Local root `.env` | Legacy name; current app code uses `ENTRA_API_CLIENT_ID`. |
| `AZURE_AD_API_SCOPE` | root `.env` only | Config | Local root `.env` | Legacy name; current app code uses `ENTRA_API_SCOPE`. |

### 1.4 Container App secret references (not env var names)

| Secret name | Referenced by | Source | Notes |
| --- | --- | --- | --- |
| `database-url` | API `DATABASE_URL` | Bicep `secretEnvVars` | Provisioned by `infrastructure/bicep/main.bicep`. |
| `redis-url` | API `REDIS_URL` | Bicep `secretEnvVars` | Provisioned by `infrastructure/bicep/main.bicep`. |
| `portal-entra-client-secret` | Portal `ENTRA_CLIENT_SECRET` | `infrastructure/env/staging-portal.env` via `secretref:` | Provisioned by `deploy-app-staging.yml` from GitHub Actions secrets. |
| `portal-nextauth-secret` | Portal `NEXTAUTH_SECRET` | `infrastructure/env/staging-portal.env` via `secretref:` | Provisioned by `deploy-app-staging.yml` from GitHub Actions secrets. |

## 2. By surface

### `packages/api/src/config.ts`

API runtime expects or supports:

- Core runtime: `NODE_ENV`, `API_PORT`, `API_VERSION`, `DATABASE_URL`
- Auth: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_ISSUER`, `ENTRA_AUDIENCE`, `ENTRA_JWKS_URI`, `JWT_REQUIRED_SCOPE`, `AUTH_BYPASS_ENABLED`, `AUTH_DEV_USER_ID`, `AUTH_DEV_TENANT_ID`
- Marketplace: `MARKETPLACE_BASE_URL`, `MARKETPLACE_API_VERSION`, `MARKETPLACE_CLIENT_SECRET`, `MARKETPLACE_WEBHOOK_SECRET`, `MARKETPLACE_WEBHOOK_TIMESTAMP_TOLERANCE_MS`
- Metering: `METERING_READ_SCOPE`, `METERING_WRITE_SCOPE`, `METERING_BATCH_SIZE`, `METERING_WORKER_INTERVAL_MS`, `METERING_CLAIM_LEASE_MS`, `METERING_RETRY_BASE_DELAY_MS`, `METERING_RETRY_MAX_DELAY_MS`, `METERING_RETRY_JITTER_RATIO`, `METERING_MAX_RETRIES`, `METERING_SUBMISSION_SLA_MS`, `MARKETPLACE_METERING_ENDPOINT`

Important behavior:

- If `AUTH_BYPASS_ENABLED` is not `true`, both `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` are required.
- Several production-sensitive values still have local fallback defaults (`MARKETPLACE_CLIENT_SECRET`, `MARKETPLACE_WEBHOOK_SECRET`).
- `DATABASE_URL` is optional for startup, so the API can run in degraded mode.

### `packages/portal/auth.ts`

Portal auth requires:

- `ENTRA_TENANT_ID`
- `ENTRA_CLIENT_ID`
- `ENTRA_CLIENT_SECRET`
- `ENTRA_API_CLIENT_ID`
- `NEXTAUTH_SECRET`
- optional `ENTRA_API_SCOPE` (otherwise derived from `ENTRA_API_CLIENT_ID`)

### `packages/portal/.env.example`

Documents local portal values for:

- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `ENTRA_TENANT_ID`
- `ENTRA_CLIENT_ID`
- `ENTRA_CLIENT_SECRET`
- `ENTRA_API_CLIENT_ID`
- `ENTRA_API_SCOPE`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_PUBLISHER_API_BASE_URL`
- `NEXT_PUBLIC_ENABLE_PUBLISHER_ADMIN_API`
- `NEXT_PUBLIC_USE_MOCK_API`

### `packages/api/.env.example`

Documents local API values for:

- Core: `NODE_ENV`, `API_PORT`, `API_VERSION`, `DATABASE_URL`
- Auth: `AUTH_BYPASS_ENABLED`, `AUTH_DEV_USER_ID`, `AUTH_DEV_TENANT_ID`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_ISSUER`, `ENTRA_AUDIENCE`, `ENTRA_JWKS_URI`, `JWT_REQUIRED_SCOPE`
- Marketplace: `MARKETPLACE_BASE_URL`, `MARKETPLACE_API_VERSION`, `MARKETPLACE_CLIENT_SECRET`, `MARKETPLACE_WEBHOOK_SECRET`, `MARKETPLACE_WEBHOOK_TIMESTAMP_TOLERANCE_MS`, `MARKETPLACE_METERING_ENDPOINT`
- Metering: `METERING_READ_SCOPE`, `METERING_WRITE_SCOPE`, `METERING_BATCH_SIZE`, `METERING_WORKER_INTERVAL_MS`, `METERING_CLAIM_LEASE_MS`, `METERING_RETRY_BASE_DELAY_MS`, `METERING_RETRY_MAX_DELAY_MS`, `METERING_RETRY_JITTER_RATIO`, `METERING_MAX_RETRIES`, `METERING_SUBMISSION_SLA_MS`
- Logging: `LOG_LEVEL`

### `infrastructure/env/staging-api.env`

Defines only:

- `API_PORT=3000`
- `NODE_ENV=production`
- `ENTRA_TENANT_ID={{AZURE_TENANT_ID}}`
- `ENTRA_CLIENT_ID={{AZURE_CLIENT_ID}}`

Notes:

- `DATABASE_URL` and `REDIS_URL` are not here because Bicep injects them as Container App secrets.
- `MARKETPLACE_CLIENT_SECRET` and `MARKETPLACE_WEBHOOK_SECRET` are here as secret refs, provisioned by `deploy-app-staging.yml` from GitHub Actions secrets.

### `infrastructure/env/staging-portal.env`

Defines:

- `APP_NAME=portal`
- `PORT=3001`
- `HEALTH_PATH=/health`
- `NODE_ENV=production`
- `API_BASE_URL={{API_BASE_URL}}`
- `ENTRA_TENANT_ID={{AZURE_TENANT_ID}}`
- `ENTRA_CLIENT_ID={{PORTAL_CLIENT_ID}}`
- `ENTRA_CLIENT_SECRET=secretref:portal-entra-client-secret`
- `ENTRA_API_CLIENT_ID={{AZURE_CLIENT_ID}}`
- `NEXTAUTH_SECRET=secretref:portal-nextauth-secret`
- `NEXTAUTH_URL={{PORTAL_URL}}`

Notes:

- It does not define any `NEXT_PUBLIC_*` values even though the portal app reads them.
- Two values rely on secret refs provisioned by `deploy-app-staging.yml` from GitHub Actions secrets.

### `infrastructure/bicep/main.bicep`

Bicep defines API Container App env directly:

- Plain env: `API_PORT`, `NODE_ENV`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`
- Secret env: `DATABASE_URL` (secret name `database-url`), `REDIS_URL` (secret name `redis-url`)

Portal Container App env is currently empty in Bicep.

### `.github/workflows/deploy-app-staging.yml`

Consumes GitHub secrets:

- `STAGING_POSTGRES_ADMIN_PASSWORD`
- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `PORTAL_CLIENT_ID`
- `PORTAL_ENTRA_CLIENT_SECRET`
- `PORTAL_NEXTAUTH_SECRET`
- `MARKETPLACE_CLIENT_SECRET`
- `MARKETPLACE_WEBHOOK_SECRET`

Deployment behavior:

- Builds API and portal images with `az acr build`
- Deploys Bicep with `azureTenantId` and `azureClientId` parameters for the API Container App
- Reads `infrastructure/env/staging-api.env` and `infrastructure/env/staging-portal.env`
- Replaces `{{PLACEHOLDER}}` tokens from workflow env/secrets/outputs
- Provisions Container App secrets `marketplace-client-secret`, `marketplace-webhook-secret`, `portal-entra-client-secret`, and `portal-nextauth-secret`
- Calls `az containerapp update --set-env-vars ...`

Gap:

- The workflow creates Container App secrets for `marketplace-client-secret`, `marketplace-webhook-secret`, `portal-entra-client-secret`, and `portal-nextauth-secret` before using `secretref:` values.
- The workflow passes `API_BASE_URL` to the portal env file, but the portal app code expects `NEXT_PUBLIC_API_BASE_URL`.

### `.github/workflows/deploy-infra-staging.yml`

Consumes GitHub secrets:

- `STAGING_POSTGRES_ADMIN_PASSWORD`
- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

This workflow does not set app env vars directly; it only provisions Azure resources and reads outputs.

### `packages/portal/Dockerfile`

Build-time config:

- `ARG API_BASE_URL` (defaults to `http://api:3000`)
- `ARG APP_NAME`
- `ARG HEALTH_PATH`
- Exports `NEXT_PUBLIC_API_BASE_URL=${API_BASE_URL}` at build time
- Supplies fake build-only auth values for `NEXTAUTH_SECRET`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_API_CLIENT_ID`

Runtime config:

- `NODE_ENV`, `HOSTNAME`, `PORT`, `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`, `APP_NAME`, `HEALTH_PATH`

Important:

- Because `NEXT_PUBLIC_API_BASE_URL` is a public client variable, it is primarily a build-time concern in Next.js.
- The staging workflow does not pass a build arg for `API_BASE_URL`, so the image build defaults to `http://api:3000`.

### `packages/api/Dockerfile`

Defines runtime defaults:

- `NODE_ENV=production`
- `API_PORT=3000`
- `PORT=3000`

Only `API_PORT` is read by the API app itself.

### `docker-compose.yml`

Local containers use:

- Postgres: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- API container: `APP_NAME`, `PORT`, `DATABASE_URL`, `REDIS_URL`, `HEALTH_PATH`
- Portal container: `APP_NAME`, `PORT`, `API_BASE_URL`, `HEALTH_PATH`
- Build args: `SERVICE_NAME`, `SERVICE_PORT`

Notes:

- API container env in compose does not mirror API code exactly (`API_PORT` is absent, generic `PORT` is present).
- `SERVICE_NAME` and `SERVICE_PORT` are not consumed by the current Dockerfiles.

### Root `.env`

Local-only file (ignored by `.gitignore`) currently serves two unrelated roles:

- Squad Places tooling: `SQUAD_PLACES_*`
- Legacy/portal local auth values: `NEXTAUTH_*`, `NEXT_PUBLIC_*`, and old `AZURE_AD_*` names

Notes:

- The old `AZURE_AD_*` names no longer match current portal/auth code, which now expects `ENTRA_*` names.

### Additional consumers found outside the requested list

- `packages/portal/lib/api-client.ts` and `packages/portal/lib/publisher-admin-api.ts` consume `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_PUBLISHER_API_BASE_URL`, `NEXT_PUBLIC_ENABLE_PUBLISHER_ADMIN_API`, and `NEXT_PUBLIC_USE_MOCK_API`.
- `packages/api/src/db/migrate.ts` and `packages/api/src/db/run-migrations.ts` require `DATABASE_URL`.
- `packages/api/src/lib/logger.ts` reads `LOG_LEVEL`.
- `packages/api/src/__tests__/security/tenant-isolation.test.ts` uses `SECURITY_RLS_ENABLED`.
- `scripts/drills/webhook-metering-runbook.ts` uses `STAGING_API_BASE_URL`, `MARKETPLACE_WEBHOOK_SECRET`, and several `WEBHOOK_*` drill vars.
- `scripts/squad-places/common.mjs` loads `SQUAD_PLACES_BASE_URL`, `SQUAD_PLACES_API_KEY`, `SQUAD_PLACES_SQUAD_ID`, and `SQUAD_PLACES_ID` from root `.env`.

## 3. Inconsistencies found

1. **Legacy naming still exists in root `.env`.**
   - Local root `.env` uses `AZURE_AD_*` names.
   - Current portal and API code use `ENTRA_*` names.
   - This is an easy source of local misconfiguration.

2. **Portal staging config uses the wrong API base URL variable.**
   - The portal app code reads `NEXT_PUBLIC_API_BASE_URL`.
   - `infrastructure/env/staging-portal.env` and the deploy workflow set `API_BASE_URL` instead.
   - `API_BASE_URL` is only used by the placeholder server/Docker build path, not by the live portal code.

3. **Portal public env is treated like runtime config, but it is mostly build-time config.**
   - `packages/portal/Dockerfile` bakes `NEXT_PUBLIC_API_BASE_URL` from `ARG API_BASE_URL` during build.
   - `deploy-app-staging.yml` does not pass a build arg, so builds default to `http://api:3000`.
   - That strongly suggests the staging portal image can be built with the wrong public API URL.

4. **Marketplace and portal secret refs are now provisioned by the staging app workflow.**
   - `staging-api.env` uses `secretref:marketplace-client-secret` and `secretref:marketplace-webhook-secret`.
   - `staging-portal.env` uses `secretref:portal-entra-client-secret` and `secretref:portal-nextauth-secret`.
   - `deploy-app-staging.yml` creates these Container App secrets from GitHub Actions secrets before configuring the environments.

5. **API auth env has duplicate control planes.**
   - Bicep injects `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` into the API Container App.
   - The app deploy workflow also sets those same values again from `staging-api.env`.
   - Current source of truth is duplicated.

6. **`AZURE_CLIENT_ID` is overloaded.**
   - It is used for GitHub Actions Azure login.
   - It is also substituted into app auth settings (`ENTRA_CLIENT_ID` for API and `ENTRA_API_CLIENT_ID` for portal).
   - Those are different logical identities and should not share one ambiguous name.

7. **`REDIS_URL` is deployed but appears unused by current app code.**
   - Bicep and compose both provide it.
   - No runtime API consumer was found in the current codebase.

8. **Docker/compose contain stale generic vars.**
   - API Dockerfile sets both `API_PORT` and `PORT`, but API code reads `API_PORT`.
   - `docker-compose.yml` build args `SERVICE_NAME` and `SERVICE_PORT` have no current Dockerfile consumer.
   - `APP_NAME` is only used by the placeholder portal server.

## 4. Consolidation recommendations

1. **Create `packages/api/.env.example` and make it the canonical API contract.**
   - Include every API-supported var.
   - Mark each one as required, optional-with-default, secret, or test-only.

2. **Standardize identity/auth naming on `ENTRA_*` everywhere.**
   - Remove or rename local `AZURE_AD_*` aliases.
   - Keep one name per logical value across portal, API, env examples, and workflows.

3. **Separate deployment identity secrets from application identity config.**
   - Rename workflow login secret usage to something explicit like `AZURE_OIDC_CLIENT_ID` / `AZURE_OIDC_TENANT_ID`.
   - Reserve `ENTRA_CLIENT_ID` / `ENTRA_API_CLIENT_ID` / `PORTAL_CLIENT_ID` for application auth.

4. **Pick one source of truth for API staging env vars.**
   - Either keep API env in Bicep or keep it entirely in `infrastructure/env/staging-api.env` plus `az containerapp update`.
   - Do not set the same API auth vars in both places.

5. **Fix the portal config model before adding more vars.**
   - If the portal will keep using `NEXT_PUBLIC_*`, pass those values at image build time and document that clearly.
   - Otherwise move to a server-side runtime config pattern and retire `NEXT_PUBLIC_API_BASE_URL` for deploy-time values.
   - In either case, stop carrying both `API_BASE_URL` and `NEXT_PUBLIC_API_BASE_URL` unless both are intentionally used.

6. **Keep Container App secret provisioning aligned with `secretref:` usage.**
   - `deploy-app-staging.yml` now provisions `portal-entra-client-secret` and `portal-nextauth-secret` explicitly.
   - Apply the same pattern for any future portal or API `secretref:` values, or switch to another supported secret injection path that is actually wired up.

7. **Marketplace secrets are now wired for staging deployment.**
   - Staging wires `MARKETPLACE_CLIENT_SECRET` and `MARKETPLACE_WEBHOOK_SECRET` via Container App secrets.
   - If staging also needs `MARKETPLACE_METERING_ENDPOINT` override, consider adding it to `infrastructure/env/staging-api.env`.

8. **Delete or document unused vars.**
   - Revisit `REDIS_URL`, `SERVICE_NAME`, `SERVICE_PORT`, API `PORT`, and portal `APP_NAME`.
   - If they are intentionally reserved for future work, say so in docs; otherwise remove them.

9. **Keep one env inventory document and link all surfaces back to it.**
   - This file can be the starting point.
   - Best next step would be a small machine-readable manifest or shared schema that generates `.env.example` and staging env templates from one place.
