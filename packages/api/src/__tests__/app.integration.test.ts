import { createSecretKey } from 'node:crypto';

import SwaggerParser from '@apidevtools/swagger-parser';
import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app';
import { createConfig } from '../config';
import { MarketplaceMeteringError, type MarketplaceMeteringClient, type MarketplaceSubmitUsageEvent } from '../metering/client';
import type { Clock } from '../metering/clock';
import { InMemoryUsageEventRepository } from '../metering/repository';
import { MeteringOutboxWorker } from '../metering/worker';

class FakeClock implements Clock {
  private current: Date;

  constructor(seed = '2026-05-29T14:30:29.387Z') {
    this.current = new Date(seed);
  }

  now(): Date {
    return new Date(this.current);
  }

  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

class ScriptedMarketplaceClient implements MarketplaceMeteringClient {
  private readonly script: Array<'success' | MarketplaceMeteringError>;
  readonly submittedEvents: MarketplaceSubmitUsageEvent[] = [];

  constructor(script: Array<'success' | MarketplaceMeteringError>) {
    this.script = [...script];
  }

  async submitUsageEvent(event: MarketplaceSubmitUsageEvent): Promise<void> {
    const step = this.script.shift() ?? 'success';
    if (step === 'success') {
      this.submittedEvents.push(event);
      return;
    }

    throw step;
  }

  async refreshAccessToken(): Promise<void> {
    return Promise.resolve();
  }
}

function createHarness(script: Array<'success' | MarketplaceMeteringError> = []) {
  const clock = new FakeClock();
  const config = createConfig({
    API_PORT: '3001',
    JWT_AUDIENCE: 'api://fastsaas-tests',
    JWT_ISSUER: 'https://login.microsoftonline.com/fastsaas-test/v2.0/',
    JWT_REQUIRED_SCOPE: 'api:read',
    JWT_SECRET: 'integration-test-secret',
    METERING_READ_SCOPE: 'metering:read',
    METERING_WRITE_SCOPE: 'metering:write',
    METERING_BATCH_SIZE: '10',
    METERING_MAX_RETRIES: '2',
    METERING_RETRY_BASE_DELAY_MS: '1000',
    METERING_RETRY_MAX_DELAY_MS: '30000',
    METERING_RETRY_JITTER_RATIO: '0',
    METERING_SUBMISSION_SLA_MS: '14400000'
  });
  const repository = new InMemoryUsageEventRepository(clock);
  const marketplaceClient = new ScriptedMarketplaceClient(script);
  const app = createApp(config, {
    clock,
    repository,
    marketplaceClient,
    random: () => 0
  });
  const worker = new MeteringOutboxWorker(config, repository, marketplaceClient, clock, () => 0);
  const signingKey = createSecretKey(Buffer.from(config.auth.secret, 'utf8'));

  async function createToken(scope: string, tenantId = 'tenant-123') {
    return new SignJWT({
      scope,
      tenant_id: tenantId,
      roles: ['member']
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(config.auth.issuer)
      .setAudience(config.auth.audience)
      .setSubject('user-123')
      .setIssuedAt(clock.now())
      .setExpirationTime('10m')
      .sign(signingKey);
  }

  return {
    app,
    clock,
    config,
    repository,
    marketplaceClient,
    worker,
    createToken
  };
}

const usageEventPayload = {
  eventId: 'evt_001',
  subscriptionId: 'sub_001',
  planId: 'plan-growth',
  dimensionId: 'dim_api_requests',
  quantity: 42,
  timestamp: '2026-05-29T14:00:00.000Z'
};

describe('API foundation and metering baseline', () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });

  it('returns 401 when the bearer token is missing', async () => {
    const response = await request(harness.app).get('/v1/auth/context');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('returns 200 and tenant context for an authenticated request', async () => {
    const token = await harness.createToken('api:read');
    const response = await request(harness.app)
      .get('/v1/auth/context')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      tenantId: 'tenant-123',
      userId: 'user-123',
      scopes: ['api:read'],
      roles: ['member']
    });
  });

  it('ingests and persists a usage event through the API', async () => {
    const token = await harness.createToken('metering:write metering:read');
    const response = await request(harness.app)
      .post('/api/metering/events')
      .set('Authorization', `Bearer ${token}`)
      .send(usageEventPayload);

    expect(response.status).toBe(202);
    expect(response.body.data.deduplicated).toBe(false);

    const events = await harness.repository.listByTenant('tenant-123');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventId: usageEventPayload.eventId,
      subscriptionId: usageEventPayload.subscriptionId,
      planId: usageEventPayload.planId,
      status: 'pending',
      retryCount: 0
    });
  });

  it('deduplicates usage events by eventId and timestamp', async () => {
    const token = await harness.createToken('metering:write');
    const first = await request(harness.app)
      .post('/api/metering/events')
      .set('Authorization', `Bearer ${token}`)
      .send(usageEventPayload);
    const second = await request(harness.app)
      .post('/api/metering/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...usageEventPayload,
        idempotencyKey: 'custom-key-that-should-still-dedupe'
      });

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.body.data.deduplicated).toBe(true);
    expect(second.body.data.event.id).toBe(first.body.data.event.id);
    expect(await harness.repository.listByTenant('tenant-123')).toHaveLength(1);
  });

  it('retries a 429 and then reports the event as submitted within SLA', async () => {
    harness = createHarness([
      new MarketplaceMeteringError(429, 'rate limited', 30),
      'success'
    ]);
    const token = await harness.createToken('metering:write metering:read');

    await request(harness.app)
      .post('/api/metering/events')
      .set('Authorization', `Bearer ${token}`)
      .send(usageEventPayload);

    const firstRun = await harness.worker.runNextBatch();
    expect(firstRun).toEqual({ attempted: 1, submitted: 0, retried: 1, deadLettered: 0 });

    let events = await harness.repository.listByTenant('tenant-123');
    expect(events[0]).toMatchObject({
      status: 'retry_scheduled',
      retryCount: 1,
      lastHttpStatus: 429
    });
    expect(events[0].nextAttemptAt).toBe('2026-05-29T14:30:59.387Z');

    harness.clock.advanceMs(30000);
    const secondRun = await harness.worker.runNextBatch();
    expect(secondRun).toEqual({ attempted: 1, submitted: 1, retried: 0, deadLettered: 0 });

    events = await harness.repository.listByTenant('tenant-123');
    expect(events[0].status).toBe('submitted');

    const dashboard = await request(harness.app)
      .get('/api/metering/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.submittedWithinSlaPercent).toBe(100);
    expect(dashboard.body.data.submittedCount).toBe(1);
  });

  it('moves exhausted 5xx events into the dead-letter queue', async () => {
    harness = createHarness([
      new MarketplaceMeteringError(503, 'upstream unavailable'),
      new MarketplaceMeteringError(503, 'still unavailable'),
      new MarketplaceMeteringError(503, 'terminal outage')
    ]);
    const token = await harness.createToken('metering:write metering:read');

    await request(harness.app)
      .post('/api/metering/events')
      .set('Authorization', `Bearer ${token}`)
      .send(usageEventPayload);

    expect(await harness.worker.runNextBatch()).toEqual({ attempted: 1, submitted: 0, retried: 1, deadLettered: 0 });
    harness.clock.advanceMs(1000);
    expect(await harness.worker.runNextBatch()).toEqual({ attempted: 1, submitted: 0, retried: 1, deadLettered: 0 });
    harness.clock.advanceMs(2000);
    expect(await harness.worker.runNextBatch()).toEqual({ attempted: 1, submitted: 0, retried: 0, deadLettered: 1 });

    const events = await harness.repository.listByTenant('tenant-123');
    const deadLetters = await harness.repository.listDeadLetters('tenant-123');
    expect(events[0].status).toBe('dead_letter');
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0]).toMatchObject({
      eventId: usageEventPayload.eventId,
      httpStatus: 503,
      retryCount: 2
    });

    const dashboard = await request(harness.app)
      .get('/api/metering/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(dashboard.body.data.deadLetterCount).toBe(1);
  });

  it('publishes an OpenAPI spec for health, auth, and metering routes', async () => {
    const response = await request(harness.app).get('/openapi.json');
    const document = await SwaggerParser.validate(response.body);

    expect(response.status).toBe(200);
    expect(document.paths).toHaveProperty('/health');
    expect(document.paths).toHaveProperty('/v1/auth/context');
    expect(document.paths).toHaveProperty('/api/metering/events');
    expect(document.paths).toHaveProperty('/api/metering/dashboard');
  });
});
