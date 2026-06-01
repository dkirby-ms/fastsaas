# Webhook and metering validation runbook

**Last updated:** 2026-06-01T00:43:05.936+00:00
**Owners:** GNC (operations), EECOM (backend escalation)

## Purpose

Validate the real operator recovery path for Marketplace webhooks and the real metering outbox retry / dead-letter flow before promoting changes beyond staging.

## Code paths validated

- `packages/api/src/middleware/marketplace-webhook-auth.ts`
- `packages/api/src/routes/webhooks/marketplace.ts`
- `packages/api/src/services/subscription-service.ts`
- `packages/api/src/metering/worker.ts`
- `packages/api/src/metering/repository.ts`
- `packages/api/src/metering/client.ts`

## Preconditions

- Staging API is healthy and operators know the Container App name / resource group.
- `MARKETPLACE_WEBHOOK_SECRET` for staging is available.
- A staging subscription exists for the webhook subscription ID used in drills.
- Operators can see the currently registered Marketplace webhook URL in the Commercial Marketplace technical configuration.
- Operators have staging log access and read-only SQL access.
- For metering drills, a controlled stub endpoint is available and can return Marketplace-like `429` / `5xx` responses.
- For live metering injection through the API, a bearer token with `metering:write` and `metering:read` for the staging tenant is available.

## Auth and retry facts to preserve

- Webhook signatures use HMAC-SHA256 over `timestamp.rawBody`.
- Accepted timestamp headers: `x-ms-marketplace-timestamp`, `x-ms-signature-timestamp`, `x-marketplace-timestamp`.
- Accepted signature headers: `x-ms-marketplace-signature`, `x-marketplace-signature`.
- Replay protection uses `MARKETPLACE_WEBHOOK_TIMESTAMP_TOLERANCE_MS`, default `300000` ms (5 minutes).
- Duplicate webhook detection keys off the marketplace event / request identifier when present and otherwise falls back to action + subscription + timestamp.
- Metering retries only on `429`, `500`, `502`, `503`, and `504`.
- `retry-after` is honored when Marketplace sends it; otherwise the worker uses exponential backoff with jitter.
- Exhausted events move to `usage_event_dead_letters` and the corresponding `usage_events.status` becomes `dead_letter`.

## Drill commands

### Deterministic local drill

Run the deterministic harness first. It exercises the real webhook middleware plus the real HTTP metering client / outbox worker against a controlled local stub.

```bash
npm run drill:runbook:simulate
```

The local drill now covers:

- duplicate webhook delivery
- replay-window rejection
- invalid HMAC rejection
- client timeout handling
- metering `429` recovery that waits for `Retry-After` before retrying
- metering transient `5xx` recovery that uses worker backoff and returns to `submitted`
- dead Marketplace endpoint routing to DLQ plus replay recovery with fresh identifiers

### Staging webhook drill

```bash
export STAGING_API_BASE_URL="https://<staging-api>"
export MARKETPLACE_WEBHOOK_SECRET="<staging-secret>"
export WEBHOOK_MARKETPLACE_SUBSCRIPTION_ID="<staging-marketplace-subscription-id>"
export WEBHOOK_REGISTERED_ENDPOINT_URL="https://<currently-registered-marketplace-webhook>"
npm run drill:runbook:staging
```

Optional staging-only overrides:

- `WEBHOOK_EXPECTED_ENDPOINT_URL` — defaults to `$STAGING_API_BASE_URL/api/webhooks/marketplace`
- `WEBHOOK_TIMEOUT_URL` — deliberately slow URL used to force a client timeout
- `WEBHOOK_TIMEOUT_MS` — client timeout in milliseconds, default `1500`
- `WEBHOOK_ACTION` — defaults to `Suspend`

## Scenario matrix

| Scenario | How it is executed | Expected outcome | Primary evidence |
| --- | --- | --- | --- |
| Marketplace-registered webhook endpoint | Compare the registered URL with the live ingress URL, then send the signed probe to the registered URL | Registered URL matches live ingress and accepts the signed probe | CLI drill output, Container App ingress, Marketplace technical configuration |
| Duplicate delivery | Send the same signed payload twice | First call accepted, second call handled as duplicate | HTTP `202` then `200`, `marketplace_webhook_events` row preserved |
| Replay attack | Send a valid signature with an expired timestamp | Request rejected with `401` and replay-window details | HTTP `401`, auth error body |
| Invalid HMAC | Send the same payload with a bad signature | Request rejected with `401` | HTTP `401`, auth error body |
| Metering 429 recovery | Point `MARKETPLACE_METERING_ENDPOINT` at a stub that returns `429` with `Retry-After: 2`, then `200` | Event moves to `retry_scheduled`, waits for the retry window, then returns to `submitted` | worker logs, `usage_events.next_attempt_at`, metering dashboard / SQL inspection |
| Metering transient 5xx recovery | Point `MARKETPLACE_METERING_ENDPOINT` at a stub that returns `503`, then `200` | Event uses worker backoff, retries on the next batch, and returns to `submitted` | worker logs, `usage_events.next_attempt_at`, metering dashboard / SQL inspection |
| Dead Marketplace endpoint / DLQ replay | Point `MARKETPLACE_METERING_ENDPOINT` at a refused / dead stub URL, then restore it to `200` | Original event moves to `dead_letter`, DLQ row is preserved, replayed event with fresh identifiers reaches `submitted` | worker logs, `usage_events`, `usage_event_dead_letters`, metering dashboard |

## Investigating webhook failures in staging

### 1. Confirm the live ingress URL and revision health

```bash
az containerapp show \
  --resource-group rg-fastsaas-staging \
  --name staging-api \
  --query properties.configuration.ingress.fqdn \
  --output tsv

az containerapp revision list \
  --resource-group rg-fastsaas-staging \
  --name staging-api \
  --output table

curl --fail --show-error --silent "$STAGING_API_BASE_URL/health"
```

The expected Marketplace webhook URL is:

```bash
printf 'https://%s/api/webhooks/marketplace\n' "$(az containerapp show \
  --resource-group rg-fastsaas-staging \
  --name staging-api \
  --query properties.configuration.ingress.fqdn \
  --output tsv)"
```

### 2. Inspect recent webhook and worker logs

```bash
az containerapp logs show \
  --resource-group rg-fastsaas-staging \
  --name staging-api \
  --tail 200
```

Look specifically for:

- webhook `401` auth failures
- repeated `404` / ingress failures on the registered endpoint
- `Scheduled usage event retry`
- `Moved usage event to dead letter queue`
- `Completed metering outbox batch`

### 3. Check the active env values that affect validation

```bash
az containerapp show \
  --resource-group rg-fastsaas-staging \
  --name staging-api \
  --query "properties.template.containers[0].env[?name=='MARKETPLACE_WEBHOOK_TIMESTAMP_TOLERANCE_MS' || name=='MARKETPLACE_METERING_ENDPOINT' || name=='METERING_BATCH_SIZE'].{name:name,value:value,secretRef:secretRef}" \
  --output table
```

## Actual operator recovery playbooks

### 1. Marketplace-registered webhook endpoint is stale or dead

1. Get the live ingress FQDN from Container Apps:
   ```bash
   az containerapp show \
     --resource-group rg-fastsaas-staging \
     --name staging-api \
     --query properties.configuration.ingress.fqdn \
     --output tsv
   ```
2. Build the only valid webhook URL for the current revision:
   ```bash
   printf 'https://%s/api/webhooks/marketplace\n' "$(az containerapp show \
     --resource-group rg-fastsaas-staging \
     --name staging-api \
     --query properties.configuration.ingress.fqdn \
     --output tsv)"
   ```
3. Compare that URL with the value currently registered in **Commercial Marketplace → Offer → Technical configuration → Webhook endpoint URL**.
4. If the registered value is stale, update it there first. Do not treat a synthetic wrong-path `404` as recovery evidence.
5. If the live ingress itself is unhealthy, recover the Container App revision before changing Marketplace registration:
   ```bash
   az containerapp revision list \
     --resource-group rg-fastsaas-staging \
     --name staging-api \
     --output table
   ```
6. Re-run `npm run drill:runbook:staging`. The drill is only complete when the Marketplace-registered URL and the live ingress URL match and the signed probe succeeds.

### 2. Valid signed webhooks are timing out or returning `401`

1. Confirm `/health` stays green and the active revision is stable.
2. Inspect logs for raw auth failures versus downstream business logic failures.
3. Verify the active revision still has the correct webhook secret and replay-window tolerance.
4. If legitimate traffic is being rejected, rotate the webhook secret in Azure, update the upstream sender, then restart the API revision.
5. Re-run the duplicate, replay, and invalid-HMAC probes. Recovery is complete only when a fresh valid probe succeeds and stale / tampered probes still fail.

### 3. Metering retry / DLQ recovery using a controlled Marketplace stub

> Azure Marketplace reference: [Marketplace metering service APIs](https://learn.microsoft.com/partner-center/marketplace-offers/marketplace-metering-service-apis) and [Marketplace metering API FAQ](https://learn.microsoft.com/partner-center/marketplace-offers/marketplace-metering-service-apis-faq). Microsoft expects publishers to honor `Retry-After`, keep retrying transient failures, and submit usage within 24 hours of the usage hour.

Use a stub that accepts the same JSON body the API sends to Marketplace:

```json
{
  "resourceId": "sub-drill-429",
  "quantity": 10,
  "dimension": "api_calls",
  "effectiveStartTime": "2026-06-01T00:00:00.000Z",
  "planId": "plan-growth"
}
```

Required stub behaviors:

- `429` with `Retry-After: 2`
- `503` or `500` with a response body
- a dead / refused endpoint for DLQ verification
- `200` after the transient fault is removed

Point staging at the stub before enqueuing drill traffic:

```bash
az containerapp update \
  --resource-group rg-fastsaas-staging \
  --name staging-api \
  --set-env-vars MARKETPLACE_METERING_ENDPOINT="https://<metering-stub>/api/usageEvent"
```

Export a staging token that can write and read metering data:

```bash
export STAGING_API_BEARER_TOKEN="<token-with-metering-write-and-metering-read>"
```

#### A. Validate live `429` and `5xx` retry behavior

Inject one throttled event and one transient failure event through the real API path:

```bash
curl --fail --show-error --silent \
  -X POST "$STAGING_API_BASE_URL/v1/metering/events" \
  -H "Authorization: Bearer $STAGING_API_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "eventId":"drill-429",
    "subscriptionId":"sub-drill-429",
    "planId":"plan-growth",
    "dimensionId":"api_calls",
    "quantity":10,
    "timestamp":"2026-06-01T00:00:00.000Z",
    "idempotencyKey":"drill-429"
  }'

curl --fail --show-error --silent \
  -X POST "$STAGING_API_BASE_URL/v1/metering/events" \
  -H "Authorization: Bearer $STAGING_API_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "eventId":"drill-503",
    "subscriptionId":"sub-drill-503",
    "planId":"plan-growth",
    "dimensionId":"api_calls",
    "quantity":5,
    "timestamp":"2026-06-01T00:00:00.000Z",
    "idempotencyKey":"drill-503"
  }'
```

Verify the worker scheduled retries instead of dropping the events:

```bash
curl --fail --show-error --silent \
  -H "Authorization: Bearer $STAGING_API_BEARER_TOKEN" \
  "$STAGING_API_BASE_URL/v1/metering/dashboard" | jq '{pendingCount,retryScheduledCount,submittedCount,deadLetterCount}'
```

```sql
SELECT event_id,
       status,
       retry_count,
       next_attempt_at,
       last_http_status,
       last_error_message
FROM usage_events
WHERE event_id IN ('drill-429', 'drill-503')
ORDER BY event_id;
```

Expected evidence:

- `drill-429` is `retry_scheduled`, `last_http_status = 429`, and `next_attempt_at` is about two seconds ahead because the worker honored `Retry-After`.
- `drill-503` is `retry_scheduled`, `last_http_status = 503`, and `next_attempt_at` is one worker backoff interval ahead.
- dashboard `retryScheduledCount` increases and `deadLetterCount` does not.

Return the stub to `200 OK`, wait one worker interval plus the 429 retry window, then verify recovery:

```sql
SELECT event_id,
       status,
       retry_count,
       submitted_at,
       marketplace_request_id,
       last_http_status
FROM usage_events
WHERE event_id IN ('drill-429', 'drill-503')
ORDER BY event_id;
```

```bash
curl --fail --show-error --silent \
  -H "Authorization: Bearer $STAGING_API_BEARER_TOKEN" \
  "$STAGING_API_BASE_URL/v1/metering/dashboard" | jq '{retryScheduledCount,submittedCount,deadLetterCount}'
```

Recovery is complete only when both rows are `submitted`, both have `marketplace_request_id`, and dashboard `retryScheduledCount` returns to baseline.

#### B. Validate dead-endpoint-to-DLQ behavior and replay recovery

Re-point the stub to a dead endpoint or refused listener, then inject the event that should fall into the DLQ:

```bash
curl --fail --show-error --silent \
  -X POST "$STAGING_API_BASE_URL/v1/metering/events" \
  -H "Authorization: Bearer $STAGING_API_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "eventId":"drill-dead-endpoint",
    "subscriptionId":"sub-dead-endpoint",
    "planId":"plan-growth",
    "dimensionId":"api_calls",
    "quantity":7,
    "timestamp":"2026-06-01T00:00:00.000Z",
    "idempotencyKey":"drill-dead-endpoint"
  }'
```

Verify that retries exhaust and the original event is preserved in the DLQ:

```sql
SELECT event_id,
       status,
       retry_count,
       next_attempt_at,
       last_http_status,
       last_error_message
FROM usage_events
WHERE event_id = 'drill-dead-endpoint';

SELECT event_id,
       http_status,
       retry_count,
       failed_at
FROM usage_event_dead_letters
WHERE event_id = 'drill-dead-endpoint'
ORDER BY failed_at DESC;
```

```bash
curl --fail --show-error --silent \
  -H "Authorization: Bearer $STAGING_API_BEARER_TOKEN" \
  "$STAGING_API_BASE_URL/v1/metering/dashboard" | jq '{submittedCount,deadLetterCount}'
```

Expected evidence:

- `usage_events.status = 'dead_letter'`
- exactly one `usage_event_dead_letters` row exists for `drill-dead-endpoint`
- dashboard `deadLetterCount` increases by one

Restore the real Marketplace endpoint after the drill:

```bash
az containerapp update \
  --resource-group rg-fastsaas-staging \
  --name staging-api \
  --set-env-vars MARKETPLACE_METERING_ENDPOINT="https://<real-marketplace-endpoint>"
```

Recover the failed usage by replaying the payload through the public API with a fresh `eventId` and a fresh `idempotencyKey`. Do **not** update the original `usage_events` row directly.

```bash
curl --fail --show-error --silent \
  -X POST "$STAGING_API_BASE_URL/v1/metering/events" \
  -H "Authorization: Bearer $STAGING_API_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "eventId":"drill-dead-endpoint-replay",
    "subscriptionId":"sub-dead-endpoint",
    "planId":"plan-growth",
    "dimensionId":"api_calls",
    "quantity":7,
    "timestamp":"2026-06-01T00:00:00.000Z",
    "idempotencyKey":"drill-dead-endpoint-replay"
  }'
```

Confirm the replayed event succeeds while the original DLQ evidence remains:

```sql
SELECT event_id,
       status,
       retry_count,
       submitted_at,
       marketplace_request_id
FROM usage_events
WHERE event_id IN ('drill-dead-endpoint', 'drill-dead-endpoint-replay')
ORDER BY event_id;

SELECT event_id,
       http_status,
       retry_count,
       failed_at
FROM usage_event_dead_letters
WHERE event_id = 'drill-dead-endpoint'
ORDER BY failed_at DESC;
```

```bash
curl --fail --show-error --silent \
  -H "Authorization: Bearer $STAGING_API_BEARER_TOKEN" \
  "$STAGING_API_BASE_URL/v1/metering/dashboard" | jq '{submittedCount,deadLetterCount}'
```

Recovery is complete only when `drill-dead-endpoint` stays `dead_letter` as the audit trail, `drill-dead-endpoint-replay` reaches `submitted`, and `deadLetterCount` stops growing. If the replay still fails, preserve the DLQ row plus Marketplace headers such as `x-ms-requestid` / `Retry-After` and escalate instead of mutating database state.

## Escalation guidance

- **GNC owns:** Container Apps health, revision recovery, env var updates, offer technical-configuration updates, and drill execution.
- **EECOM owns:** webhook business-state correctness, fulfillment side effects, metering worker logic, and DLQ replay guidance.
- Escalate immediately if duplicate webhook deliveries change subscription state, if valid signed webhooks fail within the replay window, or if `usage_event_dead_letters` continues growing after the stub / endpoint fault is removed.
