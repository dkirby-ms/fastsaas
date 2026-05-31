# Webhook and metering validation runbook

**Last updated:** 2026-05-31T21:35:32.766+00:00
**Owners:** GNC (operations), EECOM (backend escalation)

## Purpose

Validate webhook authentication, duplicate protection, replay protection, metering retry behavior, and dead-letter recovery before promoting changes beyond staging.

## Code paths validated

- `packages/api/src/middleware/marketplace-webhook-auth.ts`
- `packages/api/src/routes/webhooks/marketplace.ts`
- `packages/api/src/services/subscription-service.ts`
- `packages/api/src/metering/worker.ts`
- `packages/api/src/metering/repository.ts`
- `packages/api/src/metering/client.ts`

## Preconditions

- Staging API is healthy.
- Operators know the staging API URL.
- `MARKETPLACE_WEBHOOK_SECRET` for staging is available.
- A staging subscription exists for the webhook subscription ID used in drills.
- If metering drills need live 429/5xx validation, temporarily point `MARKETPLACE_METERING_ENDPOINT` at a drill stub before starting the exercise.

## Auth and retry facts to preserve

- Webhook signatures use HMAC-SHA256 over `timestamp.rawBody`.
- Accepted timestamp headers: `x-ms-marketplace-timestamp`, `x-ms-signature-timestamp`, `x-marketplace-timestamp`.
- Accepted signature headers: `x-ms-marketplace-signature`, `x-marketplace-signature`.
- Replay protection uses `MARKETPLACE_WEBHOOK_TIMESTAMP_TOLERANCE_MS`, default `300000` ms (5 minutes).
- Duplicate webhook detection keys off the marketplace event/request identifier when present and otherwise falls back to action + subscription + timestamp.
- Metering retries only on `429`, `500`, `502`, `503`, and `504`.
- `retry-after` is honored when Marketplace sends it; otherwise the worker uses exponential backoff with jitter.
- Exhausted events move to `usage_event_dead_letters` and the corresponding `usage_events.status` becomes `dead_letter`.

## Drill commands

### Deterministic simulation

Run the local drill harness before or after the staging exercise:

```bash
npm run drill:runbook:simulate
```

### Staging webhook probes

```bash
export STAGING_API_BASE_URL="https://<staging-api>"
export MARKETPLACE_WEBHOOK_SECRET="<staging-secret>"
export WEBHOOK_MARKETPLACE_SUBSCRIPTION_ID="<staging-marketplace-subscription-id>"
npm run drill:runbook:staging
```

Optional staging-only overrides:

- `WEBHOOK_DEAD_ENDPOINT_URL` — explicit unreachable or wrong URL for dead-endpoint drill.
- `WEBHOOK_TIMEOUT_URL` — a deliberately slow URL used to force a client timeout.
- `WEBHOOK_TIMEOUT_MS` — client timeout in milliseconds, default `1500`.
- `WEBHOOK_ACTION` — defaults to `Suspend`.

## Scenario matrix

| Scenario | Expected outcome | Primary evidence |
| --- | --- | --- |
| Dead webhook endpoint | Non-2xx probe result, no state transition | CLI drill output, Container Apps ingress checks |
| Webhook timeout | Client timeout observed, endpoint health checked separately | CLI drill output, `az containerapp logs show` |
| Duplicate delivery | First call accepted, second call handled as duplicate | HTTP `202` then `200`, `marketplace_webhook_events` row preserved |
| Replay attack | Request rejected with 401 and replay-window details | HTTP `401`, auth error body |
| Invalid HMAC | Request rejected with 401 | HTTP `401`, auth error body |
| Metering API timeout | Event scheduled for retry, later succeeds or dead-letters | worker logs, `usage_events` status |
| Metering 429 | Retry scheduled using `retry-after` or exponential backoff | worker logs, `usage_events.next_attempt_at` |
| Metering 5xx | Retry scheduled until max retries, then dead-lettered | worker logs, `usage_event_dead_letters` |
| Batch failure | Healthy events still submit while failing events retry or dead-letter | batch summary, table inspection |

## Staging recovery playbooks

### 1. Dead webhook endpoint

1. Confirm the staging API revision is healthy:
   ```bash
   curl --fail --show-error --silent "$STAGING_API_BASE_URL/health"
   ```
2. Check ingress and latest revision status:
   ```bash
   az containerapp revision list --resource-group rg-fastsaas-staging --name staging-api --output table
   ```
3. Review recent logs for auth or routing failures:
   ```bash
   az containerapp logs show --resource-group rg-fastsaas-staging --name staging-api --tail 200
   ```
4. If the endpoint URL changed, update the upstream webhook registration before replaying traffic.
5. Re-run `npm run drill:runbook:staging` and confirm duplicate/replay scenarios still behave as expected.

### 2. Webhook timeout

1. Confirm `/health` stays green while the client timeout occurs.
2. Inspect Container App logs for long-running dependency calls or revision restarts.
3. If startup or revision churn is involved, restart the unhealthy revision and wait for readiness before retrying.
4. If timeouts correlate with downstream fulfillment latency, escalate to EECOM and pause further replay until latency stabilizes.
5. Repeat the timeout probe and a normal signed webhook to confirm recovery.

### 3. Duplicate delivery

1. Verify the first delivery was accepted and the duplicate returned `200` without a second state transition.
2. Inspect the stored webhook idempotency record when database access is available:
   ```sql
   SELECT idempotency_key, status, processed_at
   FROM marketplace_webhook_events
   ORDER BY processed_at DESC
   LIMIT 10;
   ```
3. If duplicates are reprocessing state, halt replay activity and escalate to EECOM immediately.
4. Do not delete webhook history rows during incident response; preserve evidence for replay analysis.

### 4. Replay attack or invalid HMAC

1. Confirm the response is `401` and not a downstream application error.
2. Verify the configured secret and timestamp tolerance on the active Container App revision.
3. If legitimate traffic is being rejected, rotate the webhook secret in Azure, update the upstream sender, and redeploy/restart the API revision.
4. Re-run the valid signed drill and confirm that only stale or tampered payloads fail.

### 5. Metering API timeout

1. Review API worker logs for `Scheduled usage event retry` or `Metering worker run failed` messages.
2. Inspect current queue depth:
   ```sql
   SELECT status, count(*)
   FROM usage_events
   GROUP BY status;
   ```
3. Confirm `next_attempt_at` is moving forward for affected events.
4. If the Marketplace endpoint is unavailable, keep the worker running and monitor retry growth.
5. If events age toward the SLA threshold, prepare a temporary endpoint override or manual replay plan before the retry budget is exhausted.

### 6. Metering 429 rate limiting

1. Confirm the response included `retry-after` when available.
2. Check whether retries are being delayed instead of hammering the upstream service.
3. If 429s persist, reduce batch pressure by lowering `METERING_BATCH_SIZE` and redeploying staging.
4. Continue monitoring `retry_scheduled` and `dead_letter` counts until the queue drains.

### 7. Metering 5xx or batch failures

1. Validate that only failing events are retried or dead-lettered and that healthy events still submit.
2. Inspect dead letters:
   ```sql
   SELECT event_id, tenant_id, http_status, retry_count, failed_at
   FROM usage_event_dead_letters
   ORDER BY failed_at DESC
   LIMIT 20;
   ```
3. Correct the upstream endpoint or credentials.
4. Replay dead-lettered usage after the fix by re-enqueuing payloads from `usage_event_dead_letters.payload` into `usage_events` with fresh `next_attempt_at` values.
5. Re-run the deterministic drill harness and one live staging probe before closing the incident.

## Escalation guidance

- **GNC owns:** Container Apps health, environment variables, endpoint overrides, deployment rollback, and drill execution.
- **EECOM owns:** webhook business-state correctness, fulfillment side effects, and metering domain logic.
- Escalate immediately if duplicate webhook deliveries change subscription state, if valid signed webhooks fail within the replay window, or if metering dead letters keep growing after endpoint recovery.
