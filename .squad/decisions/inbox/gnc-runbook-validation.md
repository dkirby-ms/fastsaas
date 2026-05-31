# GNC runbook validation decision inbox

- **Date:** 2026-05-31T21:35:32.766+00:00
- **Owner:** GNC
- **Context:** Issue #46 requires repeatable validation of webhook authentication and metering outbox recovery behavior before promotion beyond staging.
- **Decision:** Use a dual-mode drill harness: `simulate` mode runs deterministic webhook and metering failure drills locally against the real API modules, and `staging` mode runs live signed webhook probes against the deployed staging API while metering retry drills remain gated on a temporary drill stub endpoint.
- **Why:** The webhook path can be safely exercised live in staging, but the metering worker only exposes retry and dead-letter behavior when its upstream endpoint is deliberately faulted. Keeping a deterministic simulation path prevents regressions in CI and gives operators a repeatable recovery rehearsal even when a live drill stub is unavailable.
