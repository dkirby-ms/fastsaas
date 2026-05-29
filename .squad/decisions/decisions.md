# EECOM Metering Ingestion Decision

- **Date:** 2026-05-29T14:30:29.387-05:00
- **Owner:** EECOM
- **Issue:** #3 [P1-03] Metering ingestion and submission baseline

## Decision

Implement the metering baseline as a PostgreSQL-style usage event outbox with a separate usage-event dead-letter table. The API exposes `POST /api/metering/events` for ingestion and `GET /api/metering/dashboard` for tenant-facing SLA indicators, while the worker retries 429 and 5xx responses with exponential backoff before moving exhausted events to DLQ.

## Why

This keeps ingestion durable and idempotent before Marketplace submission, gives operations a clear replay boundary, and exposes a simple SLA signal without changing frontend code in this branch.
