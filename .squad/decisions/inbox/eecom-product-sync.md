# EECOM Product Sync Decision

- **Date:** 2026-06-02T12:03:22.730+00:00
- **Owner:** EECOM
- **Context:** Issue #99 adds read-only Partner Center product import and sync using the Product Ingestion API.
- **Decision:** Treat Partner Center as the source of truth and keep the local product catalog as a read-only cache. Each import/sync upserts the parent product row, then fully replaces cached plan, submission, and raw resource snapshot rows for that tenant-scoped product.
- **Why:** The Product Ingestion resource tree is already a complete snapshot. Replacing child rows keeps sync logic deterministic, avoids stale nested resources, and pairs cleanly with tenant RLS by storing `publisher_tenant_id` on every catalog table.
- **Files:** `packages/api/src/services/product-catalog-service.ts`, `packages/api/src/repositories/product-catalog-repository.ts`, `packages/api/src/db/migrations/20260602T120322_marketplace_catalog.ts`
