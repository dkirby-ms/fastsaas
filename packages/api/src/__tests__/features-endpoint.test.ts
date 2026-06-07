/**
 * Integration tests for GET /v1/features (customer-facing endpoint).
 *
 * Verifies:
 *  - Returns the list of enabled feature keys for a tenant with an active subscription
 *  - Returns an empty array when the tenant has no active subscription
 *  - Returns 401 for unauthenticated requests
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';

import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app';
import { createConfig, type ApiConfig } from '../config';
import { InMemoryPlanFeatureGateRepository } from '../repositories/plan-feature-gate-repository';
import { InMemorySubscriptionRepository } from '../repositories/subscription-repository';
import { DefaultPlanFeatureGateService } from '../services/plan-feature-gate-service';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let jwksServer: Server;
let signingKey: KeyLike;
let app: ReturnType<typeof createApp>;
let config: ApiConfig;
let subscriptionRepository: InMemorySubscriptionRepository;

const TENANT_WITH_ACTIVE_SUB = 'tenant-with-active-sub';
const TENANT_WITHOUT_SUB = 'tenant-without-sub';
const PLAN_ID = 'plan-pro';

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = (await exportJWK(publicKey)) as JWK;

  jwk.alg = 'RS256';
  jwk.kid = 'features-test-key-1';
  jwk.use = 'sig';
  signingKey = privateKey;

  jwksServer = createServer((req, res) => {
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
  config = createConfig({
    API_PORT: '3001',
    NODE_ENV: 'test',
    ENTRA_TENANT_ID: 'features-test-home-tenant',
    ENTRA_CLIENT_ID: 'features-test-client',
    ENTRA_AUDIENCE: 'api://features-tests',
    ENTRA_ISSUER: 'https://login.microsoftonline.com/features-test-home-tenant/v2.0',
    ENTRA_JWKS_URI: `http://127.0.0.1:${port}/discovery/v2.0/keys`,
    JWT_REQUIRED_SCOPE: 'api:read'
  });

  // Repositories
  subscriptionRepository = new InMemorySubscriptionRepository();
  const featureGateRepository = new InMemoryPlanFeatureGateRepository();

  // Seed an active subscription for TENANT_WITH_ACTIVE_SUB on PLAN_ID
  await subscriptionRepository.createManagedSubscription({
    tenantId: TENANT_WITH_ACTIVE_SUB,
    marketplaceSubscriptionId: `marketplace-${randomUUID()}`,
    planId: PLAN_ID,
    seats: 10,
    status: 'Active',
    offerId: 'offer-basic',
    correlationId: randomUUID(),
    metadata: {},
    auditEntry: { action: 'subscribe', createdAt: new Date().toISOString(), source: 'api', userId: 'seed-user' }
  });

  // Seed feature gates: two enabled, one disabled
  await featureGateRepository.upsertMany([
    { publisherTenantId: TENANT_WITH_ACTIVE_SUB, planId: PLAN_ID, featureKey: 'advanced-analytics', enabled: true },
    { publisherTenantId: TENANT_WITH_ACTIVE_SUB, planId: PLAN_ID, featureKey: 'sso', enabled: true },
    { publisherTenantId: TENANT_WITH_ACTIVE_SUB, planId: PLAN_ID, featureKey: 'export', enabled: false }
  ]);

  const planFeatureGateService = new DefaultPlanFeatureGateService(featureGateRepository, subscriptionRepository);

  app = createApp(config, {
    subscriptionRepository,
    planFeatureGateService
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    jwksServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

// ---------------------------------------------------------------------------
// Helper: mint a test JWT
// ---------------------------------------------------------------------------

async function mintToken(tenantId: string): Promise<string> {
  return new SignJWT({ scp: config.auth.requiredScope, tenant_id: tenantId, oid: 'user-test', roles: ['Member'] })
    .setProtectedHeader({ alg: 'RS256', kid: 'features-test-key-1' })
    .setIssuer(config.auth.issuer)
    .setAudience(config.auth.audience[0])
    .setIssuedAt()
    .setExpirationTime('10m')
    .setSubject('subject-test')
    .sign(signingKey);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /v1/features', () => {
  it('returns 200 with enabled feature keys for a tenant with an active subscription', async () => {
    const token = await mintToken(TENANT_WITH_ACTIVE_SUB);

    const response = await request(app)
      .get('/v1/features')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.data.features).toEqual(
      expect.arrayContaining(['advanced-analytics', 'sso'])
    );
    // disabled feature must not appear
    expect(response.body.data.features).not.toContain('export');
  });

  it('returns 200 with an empty features array when the tenant has no active subscription', async () => {
    const token = await mintToken(TENANT_WITHOUT_SUB);

    const response = await request(app)
      .get('/v1/features')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.data.features).toEqual([]);
  });

  it('returns 401 for an unauthenticated request', async () => {
    const response = await request(app).get('/v1/features');

    expect(response.status).toBe(401);
  });
});
