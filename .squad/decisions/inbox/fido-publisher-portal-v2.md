# FIDO Publisher Portal V2 Decision

- **Date:** 2026-06-01T00:04:54.260+00:00
- **Owner:** FIDO
- **Context:** Issue #43 needs publisher portal workflows that do not depend on tenant-scoped subscription routes.
- **Decision:** Keep publisher workflows behind a dedicated frontend adapter that targets explicit publisher-admin endpoints (`/v1/publisher/*`) when enabled, and otherwise falls back to the portal mock adapter with the integration points rendered in the UI.
- **Why:** This prevents the publisher portal from calling tenant-scoped customer subscription APIs, preserves RBAC-aware 403 handling, and lets the UI ship without rework once EECOM exposes the admin routes.
- **Files:** `packages/portal/lib/api-client.ts`, `packages/portal/lib/publisher-admin-api.ts`, `packages/portal/components/publisher-integration-banner.tsx`, `packages/portal/app/(portal)/publisher/layout.tsx`
