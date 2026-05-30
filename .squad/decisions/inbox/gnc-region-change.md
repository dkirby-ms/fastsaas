# GNC Region Change

- **Date:** 2026-05-30T20:34:31.344+00:00
- **Owner:** GNC
- **Context:** Staging deployments defaulted to `eastus` in `.github/workflows/deploy-staging.yml`, and PostgreSQL Flexible Server provisioning now fails there with `LocationIsOfferRestricted`.
- **Decision:** Change the default staging deployment region to `westus2` in both the workflow dispatch input and fallback env expression, and keep `infrastructure/bicep/main.parameters.example.json` aligned to the same default.
- **Why:** This preserves one-click staging deploy behavior while avoiding a known regional restriction on PostgreSQL Flexible Server.
- **Files:** `.github/workflows/deploy-staging.yml`, `infrastructure/bicep/main.parameters.example.json`
