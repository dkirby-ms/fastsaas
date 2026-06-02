# EECOM Job Polling Decision

- **Date:** 2026-06-02T12:03:22.730+00:00
- **Owner:** EECOM
- **Context:** Issue #100 needs durable Product Ingestion configure-job polling with exponential backoff, but the required `marketplace_jobs` schema does not include dedicated poll-attempt columns.
- **Decision:** Persist polling state inside `marketplace_jobs.result.poll` (`attemptCount`, `nextPollAt`, and transient poll error metadata) while keeping public route responses focused on job status, completion detail, and flattened resource-level errors.
- **Why:** This keeps the migration aligned with the requested table shape, preserves backoff state across worker restarts, and avoids adding extra schema columns that are only needed for internal worker bookkeeping.
- **Files:** `packages/api/src/db/migrations/20260602T120322_marketplace_jobs.ts`, `packages/api/src/repositories/marketplace-job-repository.ts`, `packages/api/src/services/job-polling-service.ts`, `packages/api/src/jobs/configure-job-poller.ts`
