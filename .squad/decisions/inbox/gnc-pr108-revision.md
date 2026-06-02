# GNC Decision — PR #108 Revision

- **Date:** 2026-06-02T01:08:36.792+00:00
- **Owner:** GNC
- **Status:** Proposed

## Context

PR #108 was rejected because Partner Center credential resolution only supported environment variables and `/partner-center/connect` only proved Microsoft Graph access. Production validation needed to align with the repo's Azure Key Vault + managed identity direction and verify the downstream Product Ingestion API contract.

## Decision

Use Azure Key Vault as the production secret store for Partner Center credentials in `packages/api/src/services/partner-center-auth.ts`, resolving either full secret URIs or `keyvault:SECRET_NAME` references with `DefaultAzureCredential`/managed identity. Keep `env:` references only as a local/test fallback. Validate connections by calling `GET https://graph.microsoft.com/rp/product-ingestion/product?$maxpagesize=1&$version=2022-03-01-preview5`; treat Microsoft Graph `/organization` as optional metadata enrichment rather than the authoritative readiness check.

## Rationale

This preserves the existing database shape (`secretReference` only), keeps secrets out of Postgres responses, and matches the project's cloud-secret-management direction without requiring raw credential material in runtime environment variables. Product Ingestion validation closes the false-positive gap where Graph access could succeed while Partner Center permissions would still fail downstream.

## Affected Files

- `packages/api/src/services/partner-center-auth.ts`
- `packages/api/src/services/partner-center-service.ts`
- `packages/api/src/routes/v1/publisher.ts`
- `packages/api/src/server.ts`
- `packages/api/package.json`
