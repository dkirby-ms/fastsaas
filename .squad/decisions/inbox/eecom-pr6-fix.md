# EECOM PR #6 Fix Decision Note

## Context
Kranz blocked PR #6 for insecure staging deployment primitives and a placeholder API container.

## Decision
Harden staging by keeping PostgreSQL Flexible Server on delegated-subnet private access, moving Redis and ACR behind private endpoints with private DNS, disabling ACR admin credentials, and switching container image pulls to managed identities. Because ACR is no longer publicly reachable, the deploy workflow now builds images with `az acr build` instead of runner-local `docker push`.

## Impact
- Container Apps can resolve and reach Redis/PostgreSQL/ACR over the staging VNet.
- Registry pull credentials are removed from the template surface area.
- The API image now builds the real Express service from `packages/api/`.
