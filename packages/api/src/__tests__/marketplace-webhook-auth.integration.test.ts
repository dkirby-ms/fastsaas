import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Subscription } from '@fastsaas/shared';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app';
import { createConfig, type MarketplaceWebhookAuthMode } from '../config';
import type { SubscriptionService } from '../services/subscription-service';

const marketplaceClientId = 'marketplace-client-id';
const marketplaceTenantId = '11111111-2222-3333-4444-555555555555';

let jwksServer: Server | undefined;

function buildSubscription(): Subscription {
  return {
    id: 'sub-internal-123',
    tenantId: 'tenant-123',
    marketplaceSubscriptionId: 'marketplace-sub-123',
    planId: 'starter',
    seats: 5,
    status: 'Suspended',
    correlationId: 'corr-123',
    metadata: {},
    createdAt: '2026-06-03T20:11:42.315+00:00',
    updatedAt: '2026-06-03T20:11:42.315+00:00',
    auditLog: []
  };
}

function createHarness(authMode: MarketplaceWebhookAuthMode, overrides: Record<string, string> = {}) {
  const processMarketplaceWebhook = vi.fn().mockResolvedValue({
    subscription: buildSubscription(),
    duplicate: false
  });

  const app = createApp(
    createConfig({
      NODE_ENV: 'test',
      ENTRA_CLIENT_ID: 'fastsaas-api-client',
      MARKETPLACE_CLIENT_ID: marketplaceClientId,
      MARKETPLACE_TENANT_ID: marketplaceTenantId,
      MARKETPLACE_WEBHOOK_AUTH_MODE: authMode,
      ...overrides
    }),
    {
      subscriptionService: {
        processMarketplaceWebhook
      } as unknown as SubscriptionService
    }
  );

  return {
    app,
    processMarketplaceWebhook
  };
}

async function startMarketplaceJwksServer(keys: Record<string, unknown>[]): Promise<string> {
  jwksServer = createServer((req, res) => {
    if (req.url !== '/keys') {
      res.statusCode = 404;
      res.end();
      return;
    }

    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys }));
  });

  await new Promise<void>((resolve, reject) => {
    jwksServer!.once('error', reject);
    jwksServer!.listen(0, '127.0.0.1', () => {
      jwksServer!.off('error', reject);
      resolve();
    });
  });

  const address = jwksServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to determine JWKS server address');
  }

  return `http://127.0.0.1:${(address as AddressInfo).port}/keys`;
}

async function createBearerToken(options: {
  audience?: string;
  expiresIn?: string;
  issuer?: string;
  tenantId?: string;
}) {
  const tenantId = options.tenantId ?? marketplaceTenantId;
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  const kid = 'marketplace-test-key';
  const jwksUri = await startMarketplaceJwksServer([
    {
      ...publicJwk,
      alg: 'RS256',
      kid,
      use: 'sig'
    }
  ]);

  const token = await new SignJWT({
    oid: 'marketplace-callback-service',
    tid: tenantId
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(options.issuer ?? `https://login.microsoftonline.com/${tenantId}/v2.0`)
    .setAudience(options.audience ?? marketplaceClientId)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '5m')
    .sign(privateKey);

  return {
    jwksUri,
    token
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  if (jwksServer) {
    await new Promise<void>((resolve, reject) => {
      jwksServer!.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    jwksServer = undefined;
  }
});

describe('marketplace webhook auth', () => {
  it('rejects jwt mode requests when no bearer token is present', async () => {
    const { app, processMarketplaceWebhook } = createHarness('jwt');
    const body = JSON.stringify({
      action: 'Suspend',
      marketplaceSubscriptionId: 'marketplace-sub-123'
    });

    const response = await request(app).post('/api/webhooks/marketplace').set('Content-Type', 'application/json').send(body);

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Marketplace webhook authorization header is required');
    expect(processMarketplaceWebhook).not.toHaveBeenCalled();
  });

  it('accepts bearer-authenticated marketplace webhooks in jwt mode', async () => {
    const { jwksUri, token } = await createBearerToken({});
    const { app, processMarketplaceWebhook } = createHarness('jwt', {
      MARKETPLACE_JWKS_URI: jwksUri
    });
    const body = JSON.stringify({
      action: 'Suspend',
      marketplaceSubscriptionId: 'marketplace-sub-123'
    });

    const response = await request(app)
      .post('/api/webhooks/marketplace')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(202);
    expect(processMarketplaceWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Suspend',
        marketplaceSubscriptionId: 'marketplace-sub-123',
        idempotencyKey: expect.stringContaining('marketplace:Suspend:marketplace-sub-123:'),
        requestId: expect.any(String),
        correlationId: expect.any(String)
      })
    );
  });

  it('rejects bearer tokens with an unexpected audience in jwt mode', async () => {
    const { jwksUri, token } = await createBearerToken({ audience: 'wrong-audience' });
    const { app, processMarketplaceWebhook } = createHarness('jwt', {
      MARKETPLACE_JWKS_URI: jwksUri
    });
    const body = JSON.stringify({
      action: 'Suspend',
      marketplaceSubscriptionId: 'marketplace-sub-123'
    });

    const response = await request(app)
      .post('/api/webhooks/marketplace')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Marketplace webhook bearer token is invalid or expired');
    expect(processMarketplaceWebhook).not.toHaveBeenCalled();
  });

  it('allows unauthenticated marketplace webhooks in none mode', async () => {
    const { app, processMarketplaceWebhook } = createHarness('none');
    const body = JSON.stringify({
      action: 'Suspend',
      marketplaceSubscriptionId: 'marketplace-sub-123'
    });

    const response = await request(app).post('/api/webhooks/marketplace').set('Content-Type', 'application/json').send(body);

    expect(response.status).toBe(202);
    expect(processMarketplaceWebhook).toHaveBeenCalledOnce();
  });
});
