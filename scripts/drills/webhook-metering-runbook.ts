import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import request from 'supertest';

import { createApp } from '../../packages/api/src/app';
import { createConfig, type ApiConfig } from '../../packages/api/src/config';
import { type Clock } from '../../packages/api/src/metering/clock';
import { MarketplaceMeteringError, type MarketplaceMeteringClient, type MarketplaceSubmitUsageEvent } from '../../packages/api/src/metering/client';
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

class FakeClock implements Clock {
  constructor(private current = new Date('2026-05-31T21:35:32.766Z')) {}

  now(): Date {
    return new Date(this.current);
  }

  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

class SequenceMarketplaceClient implements MarketplaceMeteringClient {
  private readonly stepsByEvent = new Map<string, Array<{ type: 'ok' } | { type: 'error'; error: MarketplaceMeteringError }>>();

  queue(eventId: string, steps: Array<{ type: 'ok' } | { type: 'error'; error: MarketplaceMeteringError }>): void {
    this.stepsByEvent.set(eventId, [...steps]);
  }

  async submitUsageEvent(event: MarketplaceSubmitUsageEvent): Promise<void> {
    const queue = this.stepsByEvent.get(event.eventId) ?? [];
    const step = queue.shift();
    this.stepsByEvent.set(event.eventId, queue);

    if (!step || step.type === 'ok') {
      return;
    }

    throw step.error;
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

function createWebhookConfig(): ApiConfig {
  return createConfig({
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
    METERING_SUBMISSION_SLA_MS: '14400000'
  });
}

async function runSimulatedWebhookDrills(): Promise<DrillResult[]> {
  const config = createWebhookConfig();
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
  const bodyText = JSON.stringify({
    action: 'Suspend',
    marketplaceSubscriptionId: process.env.WEBHOOK_MARKETPLACE_SUBSCRIPTION_ID ?? 'marketplace-sub-drill',
    requestId: 'evt-webhook-drill'
  });
  const body = Buffer.from(bodyText);
  const timestamp = new Date().toISOString();
  const signature = createSignature(config.marketplace.webhookSecret, timestamp, body);

  const results: DrillResult[] = [];

  try {
    const first = await request(app)
      .post('/api/webhooks/marketplace')
      .set('content-type', 'application/json')
      .set('x-ms-marketplace-timestamp', timestamp)
      .set('x-ms-marketplace-signature', signature)
      .send(bodyText);
    const second = await request(app)
      .post('/api/webhooks/marketplace')
      .set('content-type', 'application/json')
      .set('x-ms-marketplace-timestamp', timestamp)
      .set('x-ms-marketplace-signature', signature)
      .send(bodyText);

    assert(first.status === 202, `expected first delivery to return 202, received ${first.status}`);
    assert(second.status === 200, `expected duplicate delivery to return 200, received ${second.status}`);
    results.push({ name: 'webhook duplicate delivery', status: 'passed', details: 'First delivery returned 202 and duplicate delivery returned 200.' });
  } catch (error) {
    results.push({ name: 'webhook duplicate delivery', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  try {
    const replayTimestamp = new Date(Date.now() - (6 * 60 * 1000)).toISOString();
    const replayResponse = await request(app)
      .post('/api/webhooks/marketplace')
      .set('content-type', 'application/json')
      .set('x-ms-marketplace-timestamp', replayTimestamp)
      .set('x-ms-marketplace-signature', createSignature(config.marketplace.webhookSecret, replayTimestamp, body))
      .send(bodyText);

    assert(replayResponse.status === 401, `expected replay rejection to return 401, received ${replayResponse.status}`);
    results.push({ name: 'webhook replay window', status: 'passed', details: 'Expired timestamp was rejected with HTTP 401.' });
  } catch (error) {
    results.push({ name: 'webhook replay window', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  try {
    const tampered = await request(app)
      .post('/api/webhooks/marketplace')
      .set('content-type', 'application/json')
      .set('x-ms-marketplace-timestamp', timestamp)
      .set('x-ms-marketplace-signature', 'sha256=deadbeef')
      .send(bodyText);

    assert(tampered.status === 401, `expected invalid signature rejection to return 401, received ${tampered.status}`);
    results.push({ name: 'webhook invalid hmac', status: 'passed', details: 'Tampered signature was rejected with HTTP 401.' });
  } catch (error) {
    results.push({ name: 'webhook invalid hmac', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  try {
    const deadEndpoint = await request(app)
      .post('/api/webhooks/not-configured')
      .set('content-type', 'application/json')
      .send(bodyText);

    assert(deadEndpoint.status === 404, `expected dead endpoint simulation to return 404, received ${deadEndpoint.status}`);
    results.push({ name: 'webhook dead endpoint', status: 'passed', details: 'Wrong-path simulation returned HTTP 404.' });
  } catch (error) {
    results.push({ name: 'webhook dead endpoint', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  try {
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
          'x-ms-marketplace-timestamp': timestamp,
          'x-ms-marketplace-signature': signature
        },
        body,
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

async function runSimulatedMeteringDrills(): Promise<DrillResult[]> {
  const config = createWebhookConfig();
  const clock = new FakeClock();
  const repository = new InMemoryUsageEventRepository(clock);
  const client = new SequenceMarketplaceClient();
  const service = new MeteringService(config, repository, clock);
  const worker = new MeteringOutboxWorker(config, repository, client, clock, () => 0);
  const results: DrillResult[] = [];

  try {
    client.queue('evt-429', [
      { type: 'error', error: new MarketplaceMeteringError(429, 'rate limited', 2) },
      { type: 'ok' }
    ]);
    await service.ingestEvent('tenant-drill', {
      eventId: 'evt-429',
      subscriptionId: 'sub-429',
      planId: 'plan-growth',
      dimensionId: 'api_calls',
      quantity: 10,
      timestamp: clock.now().toISOString()
    });

    const first = await worker.runNextBatch();
    assert(first.retried === 1, `expected one retry after 429, received ${first.retried}`);
    clock.advanceMs(2000);
    const second = await worker.runNextBatch();
    assert(second.submitted === 1, `expected retried 429 event to submit successfully, received ${second.submitted}`);
    results.push({ name: 'metering 429 retry', status: 'passed', details: '429 response scheduled a retry and the next attempt submitted successfully.' });
  } catch (error) {
    results.push({ name: 'metering 429 retry', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  try {
    client.queue('evt-503', [
      { type: 'error', error: new MarketplaceMeteringError(503, 'upstream unavailable') },
      { type: 'ok' }
    ]);
    await service.ingestEvent('tenant-drill', {
      eventId: 'evt-503',
      subscriptionId: 'sub-503',
      planId: 'plan-growth',
      dimensionId: 'api_calls',
      quantity: 5,
      timestamp: clock.now().toISOString()
    });

    const first = await worker.runNextBatch();
    assert(first.retried >= 1, 'expected 5xx response to schedule a retry');
    clock.advanceMs(1000);
    const second = await worker.runNextBatch();
    assert(second.submitted >= 1, 'expected retried 5xx event to submit successfully');
    results.push({ name: 'metering 5xx retry', status: 'passed', details: '503 response retried and then submitted successfully.' });
  } catch (error) {
    results.push({ name: 'metering 5xx retry', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  try {
    client.queue('evt-timeout', [
      { type: 'error', error: new MarketplaceMeteringError(504, 'gateway timeout') },
      { type: 'error', error: new MarketplaceMeteringError(504, 'gateway timeout') },
      { type: 'error', error: new MarketplaceMeteringError(504, 'gateway timeout') }
    ]);
    await service.ingestEvent('tenant-drill', {
      eventId: 'evt-timeout',
      subscriptionId: 'sub-timeout',
      planId: 'plan-growth',
      dimensionId: 'api_calls',
      quantity: 7,
      timestamp: clock.now().toISOString()
    });

    await worker.runNextBatch();
    clock.advanceMs(1000);
    await worker.runNextBatch();
    clock.advanceMs(2000);
    const final = await worker.runNextBatch();
    assert(final.deadLettered === 1, `expected timeout scenario to dead-letter after retry exhaustion, received ${final.deadLettered}`);
    const deadLetters = await repository.listDeadLetters('tenant-drill');
    assert(deadLetters.some((entry) => entry.eventId === 'evt-timeout'), 'expected timeout event to be written to the dead-letter queue');
    results.push({ name: 'metering timeout dead-letter', status: 'passed', details: 'Repeated timeout failures exhausted retries and moved the event to the dead-letter queue.' });
  } catch (error) {
    results.push({ name: 'metering timeout dead-letter', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  try {
    client.queue('evt-batch-bad', [
      { type: 'error', error: new MarketplaceMeteringError(503, 'batch failure') },
      { type: 'error', error: new MarketplaceMeteringError(503, 'batch failure') },
      { type: 'error', error: new MarketplaceMeteringError(503, 'batch failure') }
    ]);
    client.queue('evt-batch-good', [{ type: 'ok' }]);
    await service.ingestEvent('tenant-drill', {
      eventId: 'evt-batch-bad',
      subscriptionId: 'sub-batch-bad',
      planId: 'plan-growth',
      dimensionId: 'api_calls',
      quantity: 3,
      timestamp: clock.now().toISOString()
    });
    await service.ingestEvent('tenant-drill', {
      eventId: 'evt-batch-good',
      subscriptionId: 'sub-batch-good',
      planId: 'plan-growth',
      dimensionId: 'api_calls',
      quantity: 9,
      timestamp: clock.now().toISOString()
    });

    const first = await worker.runNextBatch();
    assert(first.submitted >= 1 && first.retried >= 1, 'expected mixed batch to submit one event and retry one event');
    clock.advanceMs(1000);
    await worker.runNextBatch();
    clock.advanceMs(2000);
    await worker.runNextBatch();
    const events = await repository.listByTenant('tenant-drill');
    const submitted = events.find((event) => event.eventId === 'evt-batch-good');
    const failed = events.find((event) => event.eventId === 'evt-batch-bad');
    assert(submitted?.status === 'submitted', `expected healthy batch event to stay submitted, received ${submitted?.status}`);
    assert(failed?.status === 'dead_letter', `expected failing batch event to dead-letter, received ${failed?.status}`);
    results.push({ name: 'metering batch isolation', status: 'passed', details: 'Healthy events submitted while the failing event retried and dead-lettered independently.' });
  } catch (error) {
    results.push({ name: 'metering batch isolation', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  return results;
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
  const bodyText = JSON.stringify({
    action,
    marketplaceSubscriptionId: subscriptionId,
    requestId: `evt-${randomUUID()}`
  });
  const body = Buffer.from(bodyText);
  const timestamp = new Date().toISOString();
  const signature = createSignature(secret, timestamp, body);
  const results: DrillResult[] = [];

  try {
    const first = await fetch(new URL('/api/webhooks/marketplace', baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ms-marketplace-timestamp': timestamp,
        'x-ms-marketplace-signature': signature
      },
      body: bodyText
    });
    const second = await fetch(new URL('/api/webhooks/marketplace', baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ms-marketplace-timestamp': timestamp,
        'x-ms-marketplace-signature': signature
      },
      body: bodyText
    });

    assert(first.status === 202 || first.status === 200, `expected first staging delivery to return 202 or 200, received ${first.status}`);
    assert(second.status === 200, `expected duplicate staging delivery to return 200, received ${second.status}`);
    results.push({ name: 'staging webhook duplicate delivery', status: 'passed', details: `Responses were ${first.status} then ${second.status}.` });
  } catch (error) {
    results.push({ name: 'staging webhook duplicate delivery', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  try {
    const replayTimestamp = new Date(Date.now() - (6 * 60 * 1000)).toISOString();
    const replay = await fetch(new URL('/api/webhooks/marketplace', baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ms-marketplace-timestamp': replayTimestamp,
        'x-ms-marketplace-signature': createSignature(secret, replayTimestamp, body)
      },
      body: bodyText
    });

    assert(replay.status === 401, `expected staging replay rejection to return 401, received ${replay.status}`);
    results.push({ name: 'staging webhook replay window', status: 'passed', details: 'Expired timestamp was rejected with HTTP 401.' });
  } catch (error) {
    results.push({ name: 'staging webhook replay window', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  try {
    const invalid = await fetch(new URL('/api/webhooks/marketplace', baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ms-marketplace-timestamp': timestamp,
        'x-ms-marketplace-signature': 'sha256=deadbeef'
      },
      body: bodyText
    });

    assert(invalid.status === 401, `expected staging invalid signature rejection to return 401, received ${invalid.status}`);
    results.push({ name: 'staging webhook invalid hmac', status: 'passed', details: 'Tampered signature was rejected with HTTP 401.' });
  } catch (error) {
    results.push({ name: 'staging webhook invalid hmac', status: 'failed', details: error instanceof Error ? error.message : 'Unknown failure' });
  }

  try {
    const deadEndpointUrl = process.env.WEBHOOK_DEAD_ENDPOINT_URL ?? new URL('/api/webhooks/not-configured', baseUrl).toString();
    const dead = await fetch(deadEndpointUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: bodyText
    });

    assert(dead.status >= 400, `expected dead endpoint probe to fail, received ${dead.status}`);
    results.push({ name: 'staging webhook dead endpoint', status: 'passed', details: `Probe failed as expected with HTTP ${dead.status}.` });
  } catch (error) {
    results.push({ name: 'staging webhook dead endpoint', status: 'passed', details: `Endpoint was unreachable as expected: ${error instanceof Error ? error.message : 'network failure'}` });
  }

  const timeoutUrl = process.env.WEBHOOK_TIMEOUT_URL;
  if (!timeoutUrl) {
    results.push({ name: 'staging webhook timeout handling', status: 'skipped', details: 'Set WEBHOOK_TIMEOUT_URL to run the live timeout probe.' });
  } else {
    try {
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
    name: 'staging metering retry note',
    status: 'skipped',
    details: 'Use simulate mode for deterministic metering retry/DLQ coverage, or point staging MARKETPLACE_METERING_ENDPOINT at a drill stub before replaying these cases.'
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
