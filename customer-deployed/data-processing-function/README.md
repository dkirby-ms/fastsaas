# Demo data-processing Azure Function

## Overview
This sample Azure Function accepts customer data-processing batches, counts the records, and reports usage to the FastSaaS metering API. It demonstrates the ISV↔customer integration pattern where the customer deploys a lightweight function into their own Azure subscription while securely calling the ISV-hosted FastSaaS backend with a bearer token.

## Prerequisites
- An Azure subscription where the customer can deploy a Function App
- A deployed FastSaaS API endpoint reachable from the function (`FASTSAAS_API_URL`)
- An Entra app registration that can request tokens for the FastSaaS API with the `metering:write` scope
- Azure Functions Core Tools for local runs or publishing with `func azure functionapp publish`
- Node.js 22+

## Local development
1. From this folder, install dependencies: `npm install`
2. Copy `local.settings.template.json` to `local.settings.json`
3. Update `FASTSAAS_API_URL` in `local.settings.json`
4. Acquire a bearer token for the FastSaaS API with `metering:write`
5. Start the function locally: `npm start`
6. Send a request:
   ```bash
   curl -X POST http://localhost:7071/api/process-records      -H "Authorization: Bearer <token>"      -H "Content-Type: application/json"      -d '{
       "subscriptionId": "<subscription-id>",
       "planId": "premium-1",
       "records": [{"id": 1}, {"id": 2}, {"id": 3}]
     }'
   ```

## Deployment
You can deploy the resources in `infra/main.bicep` with your preferred Bicep workflow, or publish directly with Azure Functions Core Tools:

```bash
func azure functionapp publish <function-app-name>
```

After deployment, set `FASTSAAS_API_URL` in the Function App configuration and redeploy or restart the app if needed.

## Demo walkthrough
1. Enable the `data-processing` feature gate for the target plan by applying the API migration set.
2. Deploy the function into the customer Azure subscription using the included Bicep template or `func azure functionapp publish`.
3. Configure the portal environment to point to the deployed function endpoint for the demo flow.
4. Open the customer portal, confirm the subscription payload now includes the FastSaaS subscription `id`, and pass that ID when invoking the function.
5. Send a records batch to `POST /api/process-records` on the deployed function with a valid FastSaaS bearer token.
6. Observe the 200 response showing `recordsProcessed` and the pending metering event summary.
7. Verify the FastSaaS metering dashboard or `POST /v1/metering/events` outbox state to confirm the usage event was accepted.

## API contract reference
### Function request
`POST /api/process-records`

```json
{
  "subscriptionId": "string",
  "planId": "string",
  "records": [{ "any": "json object" }]
}
```

### Function responses
- `200 OK` — records counted and metering event accepted by FastSaaS
- `400 Bad Request` — request payload is malformed
- `401 Unauthorized` — bearer token missing
- `502 Bad Gateway` — FastSaaS metering API rejected the request or could not be reached

### Downstream FastSaaS metering call
`POST {FASTSAAS_API_URL}/v1/metering/events`

```json
{
  "eventId": "uuid",
  "subscriptionId": "string",
  "planId": "string",
  "dimensionId": "records_processed",
  "quantity": 3,
  "timestamp": "2026-06-09T12:00:00.000Z"
}
```
