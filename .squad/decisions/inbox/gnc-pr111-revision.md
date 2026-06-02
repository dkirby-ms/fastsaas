### 2026-06-02T12:29:48.526+00:00: PR #111 durable-ID import contract
**By:** GNC
**Context:** Kranz rejected PR #111 because product import was sending the marketplace external ID directly to the Product Ingestion `resource-tree` endpoint.
**Decision:** Treat external-ID imports as a required two-step Product Ingestion flow: first resolve the durable product ID with `GET /rp/product-ingestion/product?externalId=...`, then fetch the snapshot with `GET /rp/product-ingestion/resource-tree/<durableId>`.
**Why:** Microsoft’s Product Ingestion API contract is durable-ID based for `resource-tree`, so skipping the lookup creates an integration bug that unit tests can accidentally hide unless they assert both calls.
**Files:** `packages/api/src/lib/product-ingestion-client.ts`, `packages/api/src/services/product-catalog-service.ts`, `packages/api/src/services/product-catalog-service.test.ts`, `packages/api/src/__tests__/product-ingestion-client.test.ts`
