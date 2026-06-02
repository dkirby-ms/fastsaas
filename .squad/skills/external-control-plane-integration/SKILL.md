---
name: "external-control-plane-integration"
description: "Layer external control-plane APIs as token provider + client + read cache + async job tracker"
domain: "architecture"
confidence: "medium"
source: "observed"
---

## Context
Use this when integrating an external control-plane API like Microsoft Product Ingestion, where the upstream system is authoritative, writes are asynchronous, and the API surface should stay stable even if upstream resource names are awkward.

## Patterns
- Separate **credential validation**, **access-token acquisition**, **HTTP transport**, **read caching**, and **write orchestration** into distinct layers.
- Depend on an access-token provider contract; never treat a client secret itself as a bearer token.
- Treat the upstream system as the source of truth and the local database as a tenant-scoped cache plus job-history store.
- Keep public route names aligned to product language (`offers`) even when the upstream resource model uses a different term (`product`).
- Model long-running upstream writes as submit → poll/cancel → inspect-failures, not as synchronous CRUD.

## Examples
- Token/provider boundary: `packages/api/src/services/partner-center-auth.ts`
- HTTP client boundary: `packages/api/src/lib/product-ingestion-client.ts`
- Read-side snapshot cache: `packages/api/src/services/product-catalog-service.ts`
- Async job tracker: `packages/api/src/services/job-polling-service.ts`
- Public publisher route surface: `packages/api/src/routes/v1/publisher.ts`

## Anti-Patterns
- Sending `MARKETPLACE_CLIENT_SECRET` directly as the Authorization bearer token.
- Folding external offer management into local plan metadata tables.
- Creating a second parallel integration stack when a client, cache, and job tracker already exist.
- Exposing only transport-level job errors instead of flattened resource-level validation failures.
