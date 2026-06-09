import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';

const RECORDS_DIMENSION_ID = 'records_processed';

interface ProcessRecordsRequestBody {
  subscriptionId: string;
  planId: string;
  records: object[];
}

interface MeteringEventResponse {
  status?: 'success' | 'error';
  data?: {
    deduplicated?: boolean;
  };
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

function getBearerToken(request: HttpRequest): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseBody(body: unknown): ProcessRecordsRequestBody | null {
  if (!isRecord(body)) {
    return null;
  }

  const { subscriptionId, planId, records } = body;
  if (typeof subscriptionId !== 'string' || subscriptionId.trim().length === 0) {
    return null;
  }

  if (typeof planId !== 'string' || planId.trim().length === 0) {
    return null;
  }

  if (!Array.isArray(records) || records.some((record) => !isRecord(record))) {
    return null;
  }

  return {
    subscriptionId: subscriptionId.trim(),
    planId: planId.trim(),
    records
  };
}

function jsonResponse(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    jsonBody: body,
    headers: {
      'Content-Type': 'application/json'
    }
  };
}

export async function processRecords(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse(401, { error: 'Missing bearer token.' });
  }

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Request body must be valid JSON.' });
  }

  const payload = parseBody(requestBody);
  if (!payload) {
    return jsonResponse(400, {
      error: 'Request body must include subscriptionId, planId, and a records array of objects.'
    });
  }

  const fastsaasApiUrl = process.env.FASTSAAS_API_URL?.trim();
  if (!fastsaasApiUrl) {
    context.error('FASTSAAS_API_URL is not configured.');
    return jsonResponse(500, { error: 'FASTSAAS_API_URL is not configured.' });
  }

  const eventId = uuidv4();
  const quantity = payload.records.length;
  const meteringPayload = {
    eventId,
    subscriptionId: payload.subscriptionId,
    planId: payload.planId,
    dimensionId: RECORDS_DIMENSION_ID,
    quantity,
    timestamp: new Date().toISOString()
  };

  let meteringResponse: Response;
  try {
    meteringResponse = await fetch(`${fastsaasApiUrl.replace(/\/$/, '')}/v1/metering/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(meteringPayload)
    });
  } catch (error) {
    context.error('Failed to reach FastSaaS metering API.', error);
    return jsonResponse(502, {
      error: 'Unable to reach FastSaaS metering API.',
      details: error instanceof Error ? error.message : String(error)
    });
  }

  let meteringBody: MeteringEventResponse | string | null = null;
  const responseText = await meteringResponse.text();
  if (responseText) {
    try {
      meteringBody = JSON.parse(responseText) as MeteringEventResponse;
    } catch {
      meteringBody = responseText;
    }
  }

  if (meteringResponse.status !== 202) {
    return jsonResponse(502, {
      error: 'FastSaaS metering API rejected the event.',
      status: meteringResponse.status,
      details: meteringBody
    });
  }

  return jsonResponse(200, {
    recordsProcessed: quantity,
    meteringEvent: {
      eventId,
      dimensionId: RECORDS_DIMENSION_ID,
      quantity,
      status: 'pending',
      deduplicated: false
    }
  });
}

app.http('process-records', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'process-records',
  handler: processRecords
});
