import { createHmac, createSecretKey } from 'node:crypto';
import { Writable } from 'node:stream';

import type { Subscription } from '@fastsaas/shared';
import SwaggerParser from '@apidevtools/swagger-parser';
import { SignJWT } from 'jose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../app';
import { createConfig } from '../config';
import type { FulfillmentResolveResult, MarketplaceFulfillmentClient } from '../lib/marketplace-fulfillment';
import { createLogger } from '../lib/logger';
import { InMemorySubscriptionRepository } from '../repositories/subscription-repository';

const config = createConfig({
  API_PORT: '3001',
  JWT_AUDIENCE: 'api://fastsaas-tests',
  JWT_ISSUER: 'https://login.microsoftonline.com/fastsaas-test/v2.0/',
  JWT_REQUIRED_SCOPE: 'api:read',
  JWT_SECRET: 'integration-test-secret',
  MARKETPLACE_WEBHOOK_SECRET: 'integration-webhook-secret'
});

const signingKey = createSecretKey(Buffer.from(config.auth.secret, 'utf8'));

type FulfillmentAction = 'resolve' | 'activate' | 'suspend' | 'unsubscribe' | 'update' | 'reinstate';

async function createToken(options?: { scope?: string; tenantId?: string }) {
  return new SignJWT({
    scope: options?.scope ?? config.auth.requiredScope,
    tenant_id: options?.tenantId ?? 'tenant-123',
    roles: ['member']
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(config.auth.issuer)
    .setAudience(config.auth.audience)
    .setSubject('user-123')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(signingKey);
}

function signWebhookPayload(payload: Record<string, unknown>, timestamp = new Date().toISOString()) {
  const rawBody = JSON.stringify(payload);
  const signature = createHmac('sha256', config.marketplace.webhookSecret)
    .update(timestamp, 'utf8')
    .update('.', 'utf8')
    .update(rawBody)
    .digest('base64');

  return {
    rawBody,
    signature,
    timestamp
  };
}

class MemoryLogStream extends Writable {
  readonly entries: Record<string, unknown>[] = [];

  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const content = chunk.toString().trim();
    if (content.length > 0) {
      this.entries.push(JSON.parse(content) as Record<string, unknown>);
    }

    callback();
  }
}

class FakeFulfillmentClient implements MarketplaceFulfillmentClient {
  readonly calls: Array<Record<string, unknown>> = [];

  constructor(
    private readonly resolved: FulfillmentResolveResult = {
      marketplaceSubscriptionId: 'marketplace-sub-123',
      planId: 'basic',
      quantity: 5,
      offerId: 'offer-basic',
      purchaserTenantId: 'tenant-123',
      beneficiaryTenantId: 'tenant-123',
      metadata: { landingPageToken: 'landing-token-123' }
    },
    private readonly failOn?: FulfillmentAction
  ) {}

  async resolveSubscription(): Promise<FulfillmentResolveResult> {
    this.calls.push({ action: 'resolve' });
    if (this.failOn === 'resolve') {
      throw new Error('resolve failed');
    }

    return this.resolved;
  }

  async activateSubscription(marketplaceSubscriptionId: string, planId: string, quantity: number): Promise<void> {
    this.calls.push({ action: 'activate', marketplaceSubscriptionId, planId, quantity });
    if (this.failOn === 'activate') {
      throw new Error('activate failed');
    }
  }

  async suspendSubscription(marketplaceSubscriptionId: string): Promise<void> {
    this.calls.push({ action: 'suspend', marketplaceSubscriptionId });
    if (this.failOn === 'suspend') {
      throw new Error('suspend failed');
    }
  }

  async unsubscribeSubscription(marketplaceSubscriptionId: string): Promise<void> {
    this.calls.push({ action: 'unsubscribe', marketplaceSubscriptionId });
    if (this.failOn === 'unsubscribe') {
      throw new Error('unsubscribe failed');
    }
  }

  async updateSubscription(marketplaceSubscriptionId: string, planId: string, quantity: number): Promise<void> {
    this.calls.push({ action: 'update', marketplaceSubscriptionId, planId, quantity });
    if (this.failOn === 'update') {
      throw new Error('update failed');
    }
  }

  async reinstateSubscription(marketplaceSubscriptionId: string): Promise<void> {
    this.calls.push({ action: 'reinstate', marketplaceSubscriptionId });
    if (this.failOn === 'reinstate') {
      throw new Error('reinstate failed');
    }
  }
}

function createHarness(options?: { failOn?: FulfillmentAction }) {
  const logStream = new MemoryLogStream();
  const logger = createLogger({ level: 'trace', destination: logStream });
  const subscriptionRepository = new InMemorySubscriptionRepository();
  const fulfillmentClient = new FakeFulfillmentClient(undefined, options?.failOn);
  const app = createApp(config, {
    logger,
    subscriptionRepository,
    fulfillmentClient
  });

  return {
    app,
    logStream,
    fulfillmentClient,
    subscriptionRepository
  };
}

async function subscribe(app: ReturnType<typeof createHarness>['app'], token: string, correlationId = 'corr-subscribe-1') {
  return request(app)
    .post('/v1/subscriptions')
    .set('Authorization', `Bearer ${token}`)
    .set('x-correlation-id', correlationId)
    .send({ marketplaceToken: 'marketplace-token-123' });
}

async function postSignedWebhook(
  app: ReturnType<typeof createHarness>['app'],
  payload: Record<string, unknown>,
  options?: { eventId?: string; timestamp?: string; signature?: string; correlationId?: string }
) {
  const signedPayload = signWebhookPayload(payload, options?.timestamp);

  return request(app)
    .post('/api/webhooks/marketplace')
    .set('Content-Type', 'application/json')
    .set('x-ms-marketplace-timestamp', signedPayload.timestamp)
    .set('x-ms-marketplace-signature', options?.signature ?? signedPayload.signature)
    .set('x-ms-marketplace-event-id', options?.eventId ?? 'event-1')
    .set('x-correlation-id', options?.correlationId ?? 'corr-webhook')
    .send(signedPayload.rawBody);
}

function latestAuditEvent(subscription: Subscription) {
  return subscription.auditLog[subscription.auditLog.length - 1];
}

describe('API foundation and subscription lifecycle', () => {
  it('returns 401 when the bearer token is missing', async () => {
    const { app } = createHarness();
    const response = await request(app).get('/v1/auth/context');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('returns 403 when the token lacks the required scope', async () => {
    const { app } = createHarness();
    const token = await createToken({ scope: 'api:write' });
    const response = await request(app)
      .get('/v1/auth/context')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('AUTH_FORBIDDEN');
    expect(response.body.error.details.missingScopes).toEqual([config.auth.requiredScope]);
  });

  it('returns 200 and tenant context for an authenticated request', async () => {
    const { app } = createHarness();
    const token = await createToken();
    const response = await request(app)
      .get('/v1/auth/context')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      tenantId: 'tenant-123',
      userId: 'user-123',
      scopes: [config.auth.requiredScope],
      roles: ['member']
    });
  });

  it('publishes an OpenAPI spec for the health and auth routes', async () => {
    const { app } = createHarness();
    const response = await request(app).get('/openapi.json');
    const document = await SwaggerParser.validate(response.body);

    expect(response.status).toBe(200);
    expect(document.paths).toHaveProperty('/health');
    expect(document.paths).toHaveProperty('/v1/auth/context');
  });

  it('supports subscribe, activate, suspend, and unsubscribe flows with audit history', async () => {
    const { app, fulfillmentClient } = createHarness();
    const token = await createToken();

    const subscribeResponse = await subscribe(app, token, 'corr-subscribe-1');
    expect(subscribeResponse.status).toBe(201);
    expect(subscribeResponse.body.data.status).toBe('PendingActivation');
    expect(subscribeResponse.body.meta.correlationId).toBe('corr-subscribe-1');
    expect(latestAuditEvent(subscribeResponse.body.data)).toMatchObject({
      eventType: 'Subscribe',
      toStatus: 'PendingActivation',
      correlationId: 'corr-subscribe-1'
    });

    const subscriptionId = subscribeResponse.body.data.id as string;

    const activateResponse = await request(app)
      .post(`/v1/subscriptions/${subscriptionId}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-correlation-id', 'corr-activate-1');
    expect(activateResponse.status).toBe(200);
    expect(activateResponse.body.data.status).toBe('Active');
    expect(latestAuditEvent(activateResponse.body.data)).toMatchObject({
      eventType: 'Activate',
      fromStatus: 'PendingActivation',
      toStatus: 'Active',
      correlationId: 'corr-activate-1'
    });

    const suspendResponse = await request(app)
      .post(`/v1/subscriptions/${subscriptionId}/suspend`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-correlation-id', 'corr-suspend-1');
    expect(suspendResponse.status).toBe(200);
    expect(suspendResponse.body.data.status).toBe('Suspended');
    expect(latestAuditEvent(suspendResponse.body.data)).toMatchObject({
      eventType: 'Suspend',
      fromStatus: 'Active',
      toStatus: 'Suspended',
      correlationId: 'corr-suspend-1'
    });

    const unsubscribeResponse = await request(app)
      .delete(`/v1/subscriptions/${subscriptionId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-correlation-id', 'corr-unsubscribe-1');
    expect(unsubscribeResponse.status).toBe(200);
    expect(unsubscribeResponse.body.data.status).toBe('Unsubscribed');
    expect(unsubscribeResponse.body.data.auditLog).toHaveLength(4);
    expect(latestAuditEvent(unsubscribeResponse.body.data)).toMatchObject({
      eventType: 'Unsubscribe',
      fromStatus: 'Suspended',
      toStatus: 'Unsubscribed',
      correlationId: 'corr-unsubscribe-1'
    });
    expect(fulfillmentClient.calls).toEqual([
      { action: 'resolve' },
      { action: 'activate', marketplaceSubscriptionId: 'marketplace-sub-123', planId: 'basic', quantity: 5 },
      { action: 'suspend', marketplaceSubscriptionId: 'marketplace-sub-123' },
      { action: 'unsubscribe', marketplaceSubscriptionId: 'marketplace-sub-123' }
    ]);
  });

  it('rejects marketplace webhooks with missing or expired security headers', async () => {
    const { app } = createHarness();
    const missingSignatureResponse = await request(app)
      .post('/api/webhooks/marketplace')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ action: 'Suspend', marketplaceSubscriptionId: 'marketplace-sub-123' }));

    expect(missingSignatureResponse.status).toBe(401);

    const expiredResponse = await postSignedWebhook(
      app,
      { action: 'Suspend', marketplaceSubscriptionId: 'marketplace-sub-123' },
      { timestamp: new Date(Date.now() - (config.marketplace.webhookTimestampToleranceMs + 1000)).toISOString() }
    );

    expect(expiredResponse.status).toBe(401);
  });

  it('processes marketplace webhook transitions, validates signatures, and treats duplicate events as idempotent', async () => {
    const { app } = createHarness();
    const token = await createToken();
    const subscribeResponse = await subscribe(app, token, 'corr-webhook-subscribe');
    const subscriptionId = subscribeResponse.body.data.id as string;

    await request(app)
      .post(`/v1/subscriptions/${subscriptionId}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-correlation-id', 'corr-webhook-activate');

    const payload = {
      action: 'Suspend',
      marketplaceSubscriptionId: subscribeResponse.body.data.marketplaceSubscriptionId,
      details: { initiatedBy: 'marketplace' }
    };

    const webhookResponse = await postSignedWebhook(app, payload, {
      eventId: 'marketplace-event-1',
      correlationId: 'corr-webhook-suspend'
    });

    expect(webhookResponse.status).toBe(202);
    expect(webhookResponse.body.data.status).toBe('Suspended');
    expect(latestAuditEvent(webhookResponse.body.data)).toMatchObject({
      eventType: 'Suspend',
      source: 'marketplace-webhook',
      correlationId: 'corr-webhook-suspend'
    });

    const duplicateResponse = await postSignedWebhook(app, payload, {
      eventId: 'marketplace-event-1',
      correlationId: 'corr-webhook-suspend-duplicate'
    });

    expect(duplicateResponse.status).toBe(200);
    expect(duplicateResponse.body.data.status).toBe('Suspended');
    expect(duplicateResponse.body.data.auditLog).toHaveLength(3);
  });

  it('logs actionable correlation details when fulfillment calls fail', async () => {
    const { app, logStream } = createHarness({ failOn: 'suspend' });
    const token = await createToken();
    const subscribeResponse = await subscribe(app, token, 'corr-failure-subscribe');
    const subscriptionId = subscribeResponse.body.data.id as string;

    await request(app)
      .post(`/v1/subscriptions/${subscriptionId}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-correlation-id', 'corr-failure-activate');

    const failureResponse = await request(app)
      .post(`/v1/subscriptions/${subscriptionId}/suspend`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-correlation-id', 'corr-failure-suspend');

    expect(failureResponse.status).toBe(502);
    expect(failureResponse.body.error.code).toBe('FULFILLMENT_REQUEST_FAILED');
    expect(failureResponse.body.meta.correlationId).toBe('corr-failure-suspend');

    const failureLog = logStream.entries.find((entry) => entry.message === 'Marketplace fulfillment request failed');
    expect(failureLog).toMatchObject({
      action: 'suspend',
      correlationId: 'corr-failure-suspend',
      requestId: expect.any(String),
      subscriptionId,
      marketplaceSubscriptionId: 'marketplace-sub-123'
    });
  });
});
