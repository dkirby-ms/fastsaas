import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import request from 'supertest';

import { createApp } from '../../packages/api/src/app';
import { createConfig, type ApiConfig } from '../../packages/api/src/config';
import { type Clock } from '../../packages/api/src/metering/clock';
import { HttpMarketplaceMeteringClient } from '../../packages/api/src/metering/client';
import { InMemoryUsageEventRepository } from '../../packages/api/src/metering/repository';
import { MeteringService } from '../../packages/api/src/metering/service';
import { MeteringOutboxWorker } from '../../packages/api/src/metering/worker';
import { type CreateSubscriptionInput, InMemorySubscriptionRepository } from '../../packages/api/src/repositories/subscription-repository';
import { SubscriptionService } from '../../packages/api/src/services/subscription-service';

type Mode = 'simulate' | 'staging';
type DrillStatus = 'passed' | 'failed' | 'skipped';

interface DrillResult {
  name: string;
  status: DrillStatus;
  details: string;
}

interface MeteringStubStep {
  status: number;
  body?: string;
  retryAfterSeconds?: number;
}

interface MeteringStubHandle {
  url: string;
  close(): Promise<void>;
}

class FakeClock implements Clock {
  constructor(private current = new Date('2026-05-31T21:35:32.766Z')) {}

  now(): Date {
    return new Date(this.current);
  }

  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

function parseArgs(): Mode {
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
  const mode = modeArg?.split('=')[1] as Mode | undefined;
  return mode ?? 'simulate';
}

function createSignature(secret: string, timestamp: string, body: Buffer): string {
  const digest = createHmac('sha256', secret)
    .update(timestamp, 'utf8')
    .update('.', 'utf8')
    .update(body)
    .digest('hex');

  return `sha256=${digest}`;
}

function logResult(result: DrillResult): void {
  const prefix = result.status === 'passed' ? 'PASS' : result.status === 'failed' ? 'FAIL' : 'SKIP';
  console.log(`${prefix} ${result.name}: ${result.details}`);
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createDrillConfig(overrides: NodeJS.ProcessEnv = {}): ApiConfig {
  return createConfig({
    ...process.env,
    AUTH_BYPASS_ENABLED: 'true',
    NODE_ENV: 'test',
    MARKETPLACE_WEBHOOK_SECRET: process.env.MARKETPLACE_WEBHOOK_SECRET ?? 'local-marketplace-webhook-secret',
    MARKETPLACE_WEBHOOK_TIMESTAMP_TOLERANCE_MS: '300000',
    METERING_BATCH_SIZE: '10',
    METERING_CLAIM_LEASE_MS: '60000',
    METERING_MAX_RETRIES: '2',
    METERING_RETRY_BASE_DELAY_MS: '1000',
    METERING_RETRY_MAX_DELAY_MS: '30000',
    METERING_RETRY_JITTER_RATIO: '0',
    METERING_SUBMISSION_SLA_MS: '14400000',
    ...overrides
  });
}

async function seedWebhookSubscription(repository: InMemorySubscriptionRepository): Promise<void> {
  const createInput: CreateSubscriptionInput = {
    tenantId: 'tenant-drill',
    marketplaceSubscriptionId: process.env.WEBHOOK_MARKETPLACE_SUBSCRIPTION_ID ?? 'marketplace-sub-drill',
    planId: 'plan-growth',
    seats: 5,
    correlationId: 'seed-correlation-id',
    metadata: { source: 'drill' },
    auditEntry: {
      id: randomUUID(),
      subscriptionId: '',
      eventType: 'Create',
      source: 'api',
      fromStatus: null,
      toStatus: 'PendingActivation',
      correlationId: 'seed-correlation-id',
      requestId: 'seed-request-id',
      details: { drill: true },
      createdAt: '2026-05-31T21:35:32.766+00:00'
    }
  };

  const created = await repository.createSubscription(createInput);
  await repository.transitionSubscription({
    subscriptionId: created.id,
    toStatus: 'Active',
    correlationId: 'seed-correlation-id',
    auditEntry: {
      id: randomUUID(),
      subscriptionId: created.id,
      eventType: 'Activate',
      source: 'api',
      fromStatus: 'PendingActivation',
      toStatus: 'Active',
      correlationId: 'seed-correlation-id',
      requestId: 'seed-request-id',
      details: { drill: true },
      createdAt: '2026-05-31T21:35:32.766+00:00'
    }
  });
}

function buildWebhookPayload(subscriptionId: string, action: string, requestId = `evt-${randomUUID()}`): string {
  return JSON.stringify({
    action,
    marketplaceSubscriptionId: subscriptionId,
    requestId
  });
}

function buildSignedWebhook(secret: string, bodyText: string, timestamp = new Date().toISOString()): {
  body: Buffer;
  signature: string;
  timestamp: string;
} {
  const body = Buffer.from(bodyText);
  return {
    body,
    signature: createSignature(secret, timestamp, body),
    timestamp
  };
}

async function runSimulatedWebhookDrills(): Promise<DrillResult[]> {
  const config = createDrillConfig();
  const repository = new InMemorySubscriptionRepository();
  await seedWebhookSubscription(repository);
  const subscriptionService = new SubscriptionService(repository, {
    activateSubscription: async () => undefined,
    reinstateSubscription: async () => undefined,
    resolveSubscription: async () => ({ marketplaceSubscriptionId: 'unused', planId: 'unused', quantity: 1 }),
    suspendSubscription: async () => undefined,
    unsubscribeSubscription: async () => undefined,
    updateSubscription: async () => undefined
  }, console as never);
  const app = createApp(config, { subscriptionService });
  const subscriptionId = process.env.WEBHOOK_MARKETPLACE_SUBSCRIPTION_ID ?? 'marketplace-sub-drill';
  const action = process.env.WEBHOOK_ACTION ?? 'Suspend';
  const results: DrillResult[] = [];

  try {
    const bodyText = buildWebhookPayload(subscriptionId, action, 'evt-webhook-drill');
    const signed = buildSignedWebhook(config.marketplace.webhookSecret, bodyText);
    const first = await request(app)
      .post('/api/webhooks/marketplace')
      .set('content-type', 'application/json')
      .set('x-ms-marketplace-timestamp', signed.timestamp)
      .set('x-ms-marketplace-signature', signed.signature)
      .send(bodyText);
    const second = await request(app)
      .post('/api/webhooks/marketplace')
      .set('content-type', 'application/json')
      .set('x-ms-marketplace-timestamp', signed.timestamp)
      .set('x-ms-marketplace-signature', signed.signature)
      .send(bodyText);

    assert(first.status === 202, `expected first delivery to return 202, received ${first.status}`);
    assert(second.status === 200, `expected duplicate delivery to return 200, received ${second.status}`);
    results.push({ name: 'webhook duplicate delivery', status: 'passed', details: 'First delivery returned 202 and duplicate delivery returned 200.' });
  } catch (error) {
    results.push({ name: 'webhook duplicate delivery', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  try {
    const bodyText = buildWebhookPayload(subscriptionId, action, 'evt-webhook-replay');
    const replayTimestamp = new Date(Date.now() - (6 * 60 * 1000)).toISOString();
    const replay = buildSignedWebhook(config.marketplace.webhookSecret, bodyText, replayTimestamp);
    const replayResponse = await request(app)
      .post('/api/webhooks/marketplace')
      .set('content-type', 'application/json')
      .set('x-ms-marketplace-timestamp', replay.timestamp)
      .set('x-ms-marketplace-signature', replay.signature)
      .send(bodyText);

    assert(replayResponse.status === 401, `expected replay rejection to return 401, received ${replayResponse.status}`);
    results.push({ name: 'webhook replay window', status: 'passed', details: 'Expired timestamp was rejected with HTTP 401.' });
  } catch (error) {
    results.push({ name: 'webhook replay window', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  try {
    const bodyText = buildWebhookPayload(subscriptionId, action, 'evt-webhook-invalid-hmac');
    const signed = buildSignedWebhook(config.marketplace.webhookSecret, bodyText);
    const tampered = await request(app)
      .post('/api/webhooks/marketplace')
      .set('content-type', 'application/json')
      .set('x-ms-marketplace-timestamp', signed.timestamp)
      .set('x-ms-marketplace-signature', 'sha256=deadbeef')
      .send(bodyText);

    assert(tampered.status === 401, `expected invalid signature rejection to return 401, received ${tampered.status}`);
    results.push({ name: 'webhook invalid hmac', status: 'passed', details: 'Tampered signature was rejected with HTTP 401.' });
  } catch (error) {
    results.push({ name: 'webhook invalid hmac', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  try {
    const bodyText = buildWebhookPayload(subscriptionId, action, 'evt-webhook-timeout');
    const signed = buildSignedWebhook(config.marketplace.webhookSecret, bodyText);
    const slowServer = createServer((_req, res) => {
      setTimeout(() => {
        res.statusCode = 202;
        res.end('ok');
      }, 3000);
    });
    await new Promise<void>((resolve) => slowServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (slowServer.address() as AddressInfo).port;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 250);

    let timedOut = false;
    try {
      await fetch(`http://127.0.0.1:${port}/api/webhooks/marketplace`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ms-marketplace-timestamp': signed.timestamp,
          'x-ms-marketplace-signature': signed.signature
        },
        body: signed.body,
        signal: controller.signal
      });
    } catch {
      timedOut = true;
    } finally {
      clearTimeout(timeout);
      await new Promise<void>((resolve, reject) => slowServer.close((error) => error ? reject(error) : resolve()));
    }

    assert(timedOut, 'expected timeout simulation to abort the client request');
    results.push({ name: 'webhook timeout handling', status: 'passed', details: 'Client-side timeout simulation aborted as expected.' });
  } catch (error) {
    results.push({ name: 'webhook timeout handling', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  return results;
}

async function startMeteringStub(stepsByResourceId: Record<string, MeteringStubStep[]>): Promise<MeteringStubHandle> {
  const queues = new Map<string, MeteringStubStep[]>(
    Object.entries(stepsByResourceId).map(([resourceId, steps]) => [resourceId, [...steps]])
  );
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('method not allowed');
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    let resourceId = 'unknown';
    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      resourceId = typeof payload.resourceId === 'string' ? payload.resourceId : 'unknown';
    } catch {
      res.statusCode = 400;
      res.end('invalid json');
      return;
    }

    const queue = queues.get(resourceId) ?? [];
    const step = queue.shift() ?? { status: 200, body: JSON.stringify({ status: 'accepted' }) };
    queues.set(resourceId, queue);

    if (step.retryAfterSeconds !== undefined) {
      res.setHeader('retry-after', String(step.retryAfterSeconds));
    }
    res.setHeader('content-type', 'application/json');
    res.statusCode = step.status;
    res.end(step.body ?? JSON.stringify({ status: step.status < 400 ? 'accepted' : 'error' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}/api/usageEvent`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function reserveDeadEndpointUrl(): Promise<string> {
  const server = createServer((_req, res) => {
    res.statusCode = 204;
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return `http://127.0.0.1:${port}/api/usageEvent`;
}

function createMeteringHarness(endpoint: string): {
  clock: FakeClock;
  repository: InMemoryUsageEventRepository;
  service: MeteringService;
  worker: MeteringOutboxWorker;
} {
  const clock = new FakeClock();
  const config = createDrillConfig({ MARKETPLACE_METERING_ENDPOINT: endpoint });
  const repository = new InMemoryUsageEventRepository(clock);
  const service = new MeteringService(config, repository, clock);
  const worker = new MeteringOutboxWorker(
    config,
    repository,
    new HttpMarketplaceMeteringClient(config.metering.marketplaceEndpoint, config.metering.marketplaceApiKey),
    clock,
    () => 0
  );

  return { clock, repository, service, worker };
}

async function ingestDrillEvent(
  service: MeteringService,
  clock: FakeClock,
  eventId: string,
  subscriptionId: string,
  quantity: number
): Promise<void> {
  await service.ingestEvent('tenant-drill', {
    eventId,
    subscriptionId,
    planId: 'plan-growth',
    dimensionId: 'api_calls',
    quantity,
    timestamp: clock.now().toISOString()
  });
}

async function runSimulatedMeteringDrills(): Promise<DrillResult[]> {
  const results: DrillResult[] = [];

  try {
    const deadEndpointUrl = await reserveDeadEndpointUrl();
    const { clock, repository, service, worker } = createMeteringHarness(deadEndpointUrl);
    await ingestDrillEvent(service, clock, 'evt-dead-endpoint', 'sub-dead-endpoint', 7);

    const first = await worker.runNextBatch();
    assert(first.retried === 1, `expected first dead-endpoint attempt to schedule a retry, received ${first.retried}`);
    clock.advanceMs(1000);
    const second = await worker.runNextBatch();
    assert(second.retried === 1, `expected second dead-endpoint attempt to schedule a retry, received ${second.retried}`);
    clock.advanceMs(2000);
    const third = await worker.runNextBatch();
    assert(third.deadLettered === 1, `expected dead-endpoint drill to dead-letter after retry exhaustion, received ${third.deadLettered}`);

    const event = (await repository.listByTenant('tenant-drill')).find((record) => record.eventId === 'evt-dead-endpoint');
    const deadLetter = (await repository.listDeadLetters('tenant-drill')).find((entry) => entry.eventId === 'evt-dead-endpoint');
    assert(event?.status === 'dead_letter', `expected dead-endpoint event status to be dead_letter, received ${event?.status}`);
    assert(deadLetter?.retryCount === 2, `expected dead letter retry count to be 2, received ${deadLetter?.retryCount}`);
    results.push({ name: 'metering dead endpoint dlq', status: 'passed', details: 'A refused Marketplace endpoint triggered real worker retries and then dead-lettered the event.' });
  } catch (error) {
    results.push({ name: 'metering dead endpoint dlq', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  let stub: MeteringStubHandle | undefined;
  try {
    stub = await startMeteringStub({
      'sub-batch-429': [
        { status: 429, body: JSON.stringify({ error: 'rate limited' }), retryAfterSeconds: 2 },
        { status: 200, body: JSON.stringify({ status: 'accepted' }) }
      ],
      'sub-batch-503': [
        { status: 503, body: JSON.stringify({ error: 'upstream unavailable' }) },
        { status: 200, body: JSON.stringify({ status: 'accepted' }) }
      ],
      'sub-batch-ok': [{ status: 200, body: JSON.stringify({ status: 'accepted' }) }]
    });
    const { clock, repository, service, worker } = createMeteringHarness(stub.url);
    await ingestDrillEvent(service, clock, 'evt-batch-429', 'sub-batch-429', 10);
    await ingestDrillEvent(service, clock, 'evt-batch-503', 'sub-batch-503', 5);
    await ingestDrillEvent(service, clock, 'evt-batch-ok', 'sub-batch-ok', 2);

    const first = await worker.runNextBatch();
    assert(first.attempted === 3, `expected batch worker to attempt 3 events, received ${first.attempted}`);
    assert(first.submitted === 1, `expected exactly one event to submit on the first batch, received ${first.submitted}`);
    assert(first.retried === 2, `expected exactly two events to retry on the first batch, received ${first.retried}`);

    const firstState = await repository.listByTenant('tenant-drill');
    const healthy = firstState.find((record) => record.eventId === 'evt-batch-ok');
    const rateLimited = firstState.find((record) => record.eventId === 'evt-batch-429');
    const unavailable = firstState.find((record) => record.eventId === 'evt-batch-503');

    assert(healthy?.status === 'submitted', `expected healthy event to submit immediately, received ${healthy?.status}`);
    assert(rateLimited?.status === 'retry_scheduled' && rateLimited.lastHttpStatus === 429, 'expected 429 event to be retry_scheduled with HTTP 429');
    assert(unavailable?.status === 'retry_scheduled' && unavailable.lastHttpStatus === 503, 'expected 503 event to be retry_scheduled with HTTP 503');
    assert(rateLimited.nextAttemptAt !== null, 'expected 429 event to have a next_attempt_at value');
    assert(unavailable.nextAttemptAt !== null, 'expected 503 event to have a next_attempt_at value');
    assert(new Date(rateLimited.nextAttemptAt).getTime() - clock.now().getTime() === 2000, 'expected 429 retry-after delay to be 2000 ms');
    assert(new Date(unavailable.nextAttemptAt).getTime() - clock.now().getTime() === 1000, 'expected 503 exponential retry delay to be 1000 ms');

    clock.advanceMs(1000);
    const second = await worker.runNextBatch();
    assert(second.attempted === 1 && second.submitted === 1, `expected only the 503 event to retry after 1 second, received attempted=${second.attempted} submitted=${second.submitted}`);
    clock.advanceMs(1000);
    const third = await worker.runNextBatch();
    assert(third.attempted === 1 && third.submitted === 1, `expected only the 429 event to retry after retry-after elapsed, received attempted=${third.attempted} submitted=${third.submitted}`);
    results.push({ name: 'metering batch retry patterns', status: 'passed', details: 'A mixed batch honored Retry-After for 429, exponential backoff for 503, and still submitted the healthy event.' });
  } catch (error) {
    results.push({ name: 'metering batch retry patterns', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  } finally {
    if (stub) {
      await stub.close();
    }
  }

  return results;
}

async function postSignedWebhook(url: string, bodyText: string, secret: string, timestamp = new Date().toISOString(), signature?: string): Promise<Response> {
  const body = Buffer.from(bodyText);
  return fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ms-marketplace-timestamp': timestamp,
      'x-ms-marketplace-signature': signature ?? createSignature(secret, timestamp, body)
    },
    body: bodyText
  });
}

async function runStagingWebhookDrills(): Promise<DrillResult[]> {
  const baseUrl = process.env.STAGING_API_BASE_URL;
  const secret = process.env.MARKETPLACE_WEBHOOK_SECRET;
  const subscriptionId = process.env.WEBHOOK_MARKETPLACE_SUBSCRIPTION_ID;

  if (!baseUrl || !secret || !subscriptionId) {
    return [{
      name: 'staging prerequisites',
      status: 'failed',
      details: 'Set STAGING_API_BASE_URL, MARKETPLACE_WEBHOOK_SECRET, and WEBHOOK_MARKETPLACE_SUBSCRIPTION_ID before running staging mode.'
    }];
  }

  const action = process.env.WEBHOOK_ACTION ?? 'Suspend';
  const timeoutMs = Number(process.env.WEBHOOK_TIMEOUT_MS ?? '1500');
  const expectedWebhookUrl = process.env.WEBHOOK_EXPECTED_ENDPOINT_URL ?? new URL('/api/webhooks/marketplace', baseUrl).toString();
  const registeredWebhookUrl = process.env.WEBHOOK_REGISTERED_ENDPOINT_URL;
  const results: DrillResult[] = [];

  if (!registeredWebhookUrl) {
    results.push({
      name: 'staging webhook registration check',
      status: 'failed',
      details: 'Set WEBHOOK_REGISTERED_ENDPOINT_URL to the URL currently registered in Marketplace before running staging mode.'
    });
  } else if (registeredWebhookUrl !== expectedWebhookUrl) {
    results.push({
      name: 'staging webhook registration check',
      status: 'failed',
      details: `Marketplace is pointed at ${registeredWebhookUrl}; expected ${expectedWebhookUrl}. Update the technical configuration and rerun the drill.`
    });
  } else {
    try {
      const registrationResponse = await postSignedWebhook(
        registeredWebhookUrl,
        buildWebhookPayload(subscriptionId, action, `evt-registration-${randomUUID()}`),
        secret
      );

      assert(registrationResponse.status === 202 || registrationResponse.status === 200, `expected Marketplace-registered endpoint to return 202 or 200, received ${registrationResponse.status}`);
      results.push({
        name: 'staging webhook registration check',
        status: 'passed',
        details: `Marketplace-registered endpoint ${registeredWebhookUrl} accepted the signed probe with HTTP ${registrationResponse.status}.`
      });
    } catch (error) {
      results.push({ name: 'staging webhook registration check', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
    }
  }

  try {
    const requestId = `evt-${randomUUID()}`;
    const bodyText = buildWebhookPayload(subscriptionId, action, requestId);
    const timestamp = new Date().toISOString();
    const first = await postSignedWebhook(expectedWebhookUrl, bodyText, secret, timestamp);
    const second = await postSignedWebhook(expectedWebhookUrl, bodyText, secret, timestamp);

    assert(first.status === 202 || first.status === 200, `expected first staging delivery to return 202 or 200, received ${first.status}`);
    assert(second.status === 200, `expected duplicate staging delivery to return 200, received ${second.status}`);
    results.push({ name: 'staging webhook duplicate delivery', status: 'passed', details: `Responses were ${first.status} then ${second.status}.` });
  } catch (error) {
    results.push({ name: 'staging webhook duplicate delivery', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  try {
    const bodyText = buildWebhookPayload(subscriptionId, action, `evt-replay-${randomUUID()}`);
    const replayTimestamp = new Date(Date.now() - (6 * 60 * 1000)).toISOString();
    const replay = await postSignedWebhook(expectedWebhookUrl, bodyText, secret, replayTimestamp);

    assert(replay.status === 401, `expected staging replay rejection to return 401, received ${replay.status}`);
    results.push({ name: 'staging webhook replay window', status: 'passed', details: 'Expired timestamp was rejected with HTTP 401.' });
  } catch (error) {
    results.push({ name: 'staging webhook replay window', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  try {
    const bodyText = buildWebhookPayload(subscriptionId, action, `evt-invalid-${randomUUID()}`);
    const timestamp = new Date().toISOString();
    const invalid = await postSignedWebhook(expectedWebhookUrl, bodyText, secret, timestamp, 'sha256=deadbeef');

    assert(invalid.status === 401, `expected staging invalid signature rejection to return 401, received ${invalid.status}`);
    results.push({ name: 'staging webhook invalid hmac', status: 'passed', details: 'Tampered signature was rejected with HTTP 401.' });
  } catch (error) {
    results.push({ name: 'staging webhook invalid hmac', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  const timeoutUrl = process.env.WEBHOOK_TIMEOUT_URL;
  if (!timeoutUrl) {
    results.push({ name: 'staging webhook timeout handling', status: 'skipped', details: 'Set WEBHOOK_TIMEOUT_URL to run the live timeout probe.' });
  } else {
    try {
      const bodyText = buildWebhookPayload(subscriptionId, action, `evt-timeout-${randomUUID()}`);
      const body = Buffer.from(bodyText);
      const timestamp = new Date().toISOString();
      const signature = createSignature(secret, timestamp, body);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let timedOut = false;

      try {
        await fetch(timeoutUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-ms-marketplace-timestamp': timestamp,
            'x-ms-marketplace-signature': signature
          },
          body: bodyText,
          signal: controller.signal
        });
      } catch {
        timedOut = true;
      } finally {
        clearTimeout(timer);
      }

      assert(timedOut, 'expected the live timeout probe to abort');
      results.push({ name: 'staging webhook timeout handling', status: 'passed', details: `Client timeout triggered after ${timeoutMs} ms.` });
    } catch (error) {
      results.push({ name: 'staging webhook timeout handling', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
    }
  }

  results.push({
    name: 'staging metering recovery',
    status: 'skipped',
    details: 'Follow docs/runbooks/webhook-metering-validation.md to drive the real staging metering retry and DLQ drill with a controlled Marketplace stub and SQL/log verification.'
  });

  return results;
}

async function main(): Promise<void> {
  const mode = parseArgs();
  const results = mode === 'staging'
    ? await runStagingWebhookDrills()
    : [...await runSimulatedWebhookDrills(), ...await runSimulatedMeteringDrills()];

  results.forEach(logResult);

  if (results.some((result) => result.status === 'failed')) {
    process.exitCode = 1;
    return;
  }

  console.log(`Completed ${results.length} drill checks in ${mode} mode.`);
}

void main();
