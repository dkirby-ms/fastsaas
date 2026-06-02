# Submission monitoring decision

- **Date:** 2026-06-02T16:54:45.149+00:00
- **Owner:** EECOM
- **Context:** Issue #102 reframed submission work from authoring into operational monitoring, but the existing catalog cache only persists the latest synced product resources and submission rows.
- **Decision:** The backend now computes submission monitoring responses on demand by fetching draft, preview, and live Product Ingestion resource trees through the shared Marketplace OAuth token provider, then merges those remote snapshots with cached `marketplace_resources` and `marketplace_submissions` rows as a fallback for environments that do not currently return a tree.
- **Why:** This keeps Partner Center as the source of truth for current environment state while still honoring the local cache for history continuity and degraded-read scenarios, without introducing new persistence tables before the portal UI contract is proven.
- **Implications:** Portal and SDK consumers should treat `/v1/publisher/products/:productId/submissions` as the authoritative monitoring view, and future persistence work should extend this merge strategy rather than duplicating per-environment snapshots in separate tables by default.
