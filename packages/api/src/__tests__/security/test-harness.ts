import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Subscription, UsageEventIngestRequest } from '@fastsaas/shared';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import request from 'supertest';

import { createApp } from '../../app';
import { createConfig, type ApiConfig } from '../../config';
import { logger } from '../../lib/logger';
import type { MarketplaceFulfillmentClient } from '../../lib/marketplace-fulfillment';
import { InMemoryUsageEventRepository } from '../../metering/repository';
import { SystemClock } from '../../metering/clock';
import { InMemorySubscriptionRepository } from '../../repositories/subscription-repository';
import { SubscriptionService } from '../../services/subscription-service';

export interface TokenOptions {
  scopes?: string[];
  roles?: string[];
  tenantId?: string;
  issuerTenantId?: string;
  tenantClaimKey?: 'tid' | 'tenant_id' | 'extension_tenant_id';
  omitTenantId?: boolean;
  userId?: string;
  subject?: string;
  omitSubject?: boolean;
  expiresIn?: string;
  audience?: string;
  issuer?: string;
  additionalClaims?: Record<string, unknown>;
}

export interface SecurityHarness {
  app: ReturnType<typeof createApp>;
  config: ApiConfig;
  meteringRepository: InMemoryUsageEventRepository;
  subscriptionRepository: InMemorySubscriptionRepository;
  createToken(options?: TokenOptions): Promise<string>;
  createSubscriptionFixture(options?: {
    tenantId?: string;
    marketplaceToken?: string;
    planId?: string;
    seats?: number;
    scopes?: string[];
    roles?: string[];
  }): Promise<Subscription>;
  ingestUsageEventFixture(options: {
    tenantId: string;
    body?: Partial<UsageEventIngestRequest>;
    scopes?: string[];
    roles?: string[];
  }): Promise<request.Response>;
  close(): Promise<void>;
}

function createFulfillmentClient(): MarketplaceFulfillmentClient {
  return {
    async resolveSubscription(marketplaceToken: string) {
      return {
        marketplaceSubscriptionId: `marketplace-${marketplaceToken}`,
        planId: 'basic',
        quantity: 5,
        offerId: 'offer-basic',
        purchaserTenantId: `purchaser-${marketplaceToken}`,
        beneficiaryTenantId: `beneficiary-${marketplaceToken}`,
        metadata: {
          fixture: 'security-suite'
        }
      };
    },
    async activateSubscription() {},
    async suspendSubscription() {},
    async unsubscribeSubscription() {},
    async updateSubscription() {},
    async reinstateSubscription() {}
  };
}

function buildUsageEvent(body: Partial<UsageEventIngestRequest> = {}): UsageEventIngestRequest {
  return {
    eventId: body.eventId ?? `event-${randomUUID()}`,
    subscriptionId: body.subscriptionId ?? `subscription-${randomUUID()}`,
    planId: body.planId ?? 'basic',
    dimensionId: body.dimensionId ?? 'api-calls',
    quantity: body.quantity ?? 1,
    timestamp: body.timestamp ?? new Date().toISOString(),
    idempotencyKey: body.idempotencyKey,
    metadata: body.metadata
  };
}

export async function createSecurityHarness(): Promise<SecurityHarness> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey) as JWK;

  jwk.alg = 'RS256';
  jwk.kid = 'security-suite-key-1';
  jwk.use = 'sig';

  const jwksServer = createServer((req, res) => {
    if (req.url !== '/discovery/v2.0/keys') {
      res.statusCode = 404;
      res.end();
      return;
    }

    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });

  await new Promise<void>((resolve) => {
    jwksServer.listen(0, '127.0.0.1', () => resolve());
  });

  const { port } = jwksServer.address() as AddressInfo;
  const config = createConfig({
    API_PORT: '3001',
    NODE_ENV: 'test',
    AZURE_AD_TENANT_ID: 'tenant-security-home',
    AZURE_AD_CLIENT_ID: 'fastsaas-security-tests-client',
    AZURE_AD_AUDIENCE: 'api://fastsaas-security-tests',
    AZURE_AD_ISSUER: 'https://login.microsoftonline.com/tenant-security-home/v2.0',
    AZURE_AD_JWKS_URI: `http://127.0.0.1:${port}/discovery/v2.0/keys`,
    JWT_REQUIRED_SCOPE: 'api:read',
    METERING_READ_SCOPE: 'metering:read',
    METERING_WRITE_SCOPE: 'metering:write'
  });

  const meteringRepository = new InMemoryUsageEventRepository(new SystemClock());
  const subscriptionRepository = new InMemorySubscriptionRepository();
  const subscriptionService = new SubscriptionService(subscriptionRepository, createFulfillmentClient(), logger);
  const app = createApp(config, {
    repository: meteringRepository,
    subscriptionService
  });

  async function createToken(options: TokenOptions = {}): Promise<string> {
    const tenantId = options.tenantId ?? config.auth.azureTenantId;
    const tenantClaimKey = options.tenantClaimKey ?? 'tenant_id';
    const payload: Record<string, unknown> = {
      roles: options.roles ?? ['Member'],
      oid: options.omitSubject ? undefined : (options.userId ?? 'user-123'),
      ...options.additionalClaims
    };

    if (!options.omitTenantId) {
      if (tenantClaimKey === 'tid') {
        payload.tid = tenantId;
      } else {
        if (options.issuerTenantId) {
          payload.tid = options.issuerTenantId;
        }

        payload[tenantClaimKey] = tenantId;
      }
    }

    if (options.scopes === undefined) {
      payload.scp = config.auth.requiredScope;
    } else if (options.scopes.length > 0) {
      payload.scp = options.scopes.join(' ');
    }

    let token = new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'security-suite-key-1' })
      .setIssuer(options.issuer ?? config.auth.issuer)
      .setAudience(options.audience ?? config.auth.audience[0])
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? '10m');

    if (!options.omitSubject) {
      token = token.setSubject(options.subject ?? 'subject-123');
    }

    return token.sign(privateKey as KeyLike);
  }

  async function createSubscriptionFixture(options: {
    tenantId?: string;
    marketplaceToken?: string;
    planId?: string;
    seats?: number;
    scopes?: string[];
    roles?: string[];
  } = {}): Promise<Subscription> {
    const token = await createToken({
      tenantId: options.tenantId,
      scopes: options.scopes,
      roles: options.roles ?? ['Owner']
    });

    const response = await request(app)
      .post('/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        marketplaceToken: options.marketplaceToken ?? `fixture-${randomUUID()}`,
        planId: options.planId,
        seats: options.seats,
        metadata: {
          fixture: 'security-suite'
        }
      });

    if (response.status !== 201 || !response.body.data) {
      throw new Error(`Expected subscription fixture creation to succeed, received ${response.status}`);
    }

    return response.body.data as Subscription;
  }

  async function ingestUsageEventFixture(options: {
    tenantId: string;
    body?: Partial<UsageEventIngestRequest>;
    scopes?: string[];
    roles?: string[];
  }): Promise<request.Response> {
    const token = await createToken({
      tenantId: options.tenantId,
      scopes: options.scopes ?? [config.metering.writeScope],
      roles: options.roles
    });

    return request(app)
      .post('/v1/metering/events')
      .set('Authorization', `Bearer ${token}`)
      .send(buildUsageEvent(options.body));
  }

  return {
    app,
    config,
    meteringRepository,
    subscriptionRepository,
    createToken,
    createSubscriptionFixture,
    ingestUsageEventFixture,
    async close() {
      await new Promise<void>((resolve, reject) => {
        jwksServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}
