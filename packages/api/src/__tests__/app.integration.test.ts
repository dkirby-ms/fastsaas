import { createSecretKey } from 'node:crypto';
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
  JWT_SECRET: 'integration-test-secret'
});

const signingKey = createSecretKey(Buffer.from(config.auth.secret, 'utf8'));

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
  readonly actions: string[] = [];

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
    private readonly failOn?: 'resolve' | 'activate' | 'suspend' | 'unsubscribe'
  ) {}

  async resolveSubscription(): Promise<FulfillmentResolveResult> {
    this.actions.push('resolve');
    if (this.failOn === 'resolve') {
      throw new Error('resolve failed');
    }

    return this.resolved;
  }

  async activateSubscription(): Promise<void> {
    this.actions.push('activate');
    if (this.failOn === 'activate') {
      throw new Error('activate failed');
    }
  }

  async suspendSubscription(): Promise<void> {
    this.actions.push('suspend');
    if (this.failOn === 'suspend') {
      throw new Error('suspend failed');
    }
  }

  async unsubscribeSubscription(): Promise<void> {
    this.actions.push('unsubscribe');
    if (this.failOn === 'unsubscribe') {
      throw new Error('unsubscribe failed');
    }
  }
}

function createHarness(options?: { failOn?: 'resolve' | 'activate' | 'suspend' | 'unsubscribe' }) {
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
    expect(fulfillmentClient.actions).toEqual(['resolve', 'activate', 'suspend', 'unsubscribe']);
  });

  it('processes marketplace webhook transitions and records webhook-sourced audits', async () => {
    const { app } = createHarness();
    const token = await createToken();
    const subscribeResponse = await subscribe(app, token, 'corr-webhook-subscribe');
    const subscriptionId = subscribeResponse.body.data.id as string;

    await request(app)
      .post(`/v1/subscriptions/${subscriptionId}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-correlation-id', 'corr-webhook-activate');

    const webhookResponse = await request(app)
      .post('/api/webhooks/marketplace')
      .set('x-correlation-id', 'corr-webhook-suspend')
      .send({
        action: 'Suspend',
        marketplaceSubscriptionId: subscribeResponse.body.data.marketplaceSubscriptionId,
        details: { initiatedBy: 'marketplace' }
      });

    expect(webhookResponse.status).toBe(202);
    expect(webhookResponse.body.data.status).toBe('Suspended');
    expect(latestAuditEvent(webhookResponse.body.data)).toMatchObject({
      eventType: 'Suspend',
      source: 'marketplace-webhook',
      correlationId: 'corr-webhook-suspend'
    });
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
