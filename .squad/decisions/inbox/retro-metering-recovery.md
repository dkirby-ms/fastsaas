# Metering recovery replay decision

Date: 2026-06-01T00:43:05.936+00:00
Owner: RETRO

## Decision
For metering recovery drills, operators should recover dead-lettered usage by restoring the Marketplace endpoint and replaying the payload through `POST /v1/metering/events` with a fresh `eventId` and a fresh `idempotencyKey`.

## Why
The metering repository deduplicates on `idempotencyKey` and on the original `eventId` + timestamp pair. Reusing the dead-lettered identifiers would be ignored locally, and directly mutating `usage_events` would destroy the evidence trail the DLQ is supposed to preserve.

## Follow-up
Keep the original `usage_event_dead_letters` row as audit evidence and verify the replayed event reaches `submitted` before closing the incident.
