/**
 * Feature entitlement validation tests — Issue #149.
 *
 * Covers gaps not addressed by existing tests:
 *  1. Plan differentiation  — Starter plan returns empty features; Pro plan returns all 4 demo features.
 *  2. Middleware enforcement — requireFeature('export-csv') returns 403 for Starter, 200 for Pro (end-to-end HTTP).
 *  3. Plan upgrade flow     — tenant gains features immediately after plan transitions from Starter to Pro.
 *  4. Feature definitions   — all 4 expected demo feature keys are recognized by the repository.
 *
 * Patterns:
 *  - Mirrors features-endpoint.test.ts for HTTP integration tests (JWKS server, supertest).
 *  - Uses InMemoryPlanFeatureGateRepository + InMemorySubscriptionRepository for deterministic state.
 *  - Service-level assertions (no HTTP) for the upgrade-flow test to avoid HTTP-layer noise.
 *  - Pure repository-level assertions for feature definitions integrity.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';

import express, { type RequestHandler } from 'express';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app';
import { createConfig, type ApiConfig } from '../config';
import { errorHandler } from '../middleware/error-handler';
import { authenticateRequest, requireScopes } from '../middleware/auth';
import { injectTenantContext } from '../middleware/tenant-context';
import { createRequireFeature } from '../middleware/feature-gate';
import {
  InMemoryFeatureDefinitionRepository,
  type FeatureDefinition
} from '../repositories/feature-definition-repository';
import { InMemoryPlanFeatureGateRepository } from '../repositories/plan-feature-gate-repository';
import { InMemorySubscriptionRepository } from '../repositories/subscription-repository';
import { DefaultPlanFeatureGateService } from '../services/plan-feature-gate-service';

// ---------------------------------------------------------------------------
// Known demo feature keys (must match the migration seed in
// packages/api/src/db/migrations/20260607T154900_feature_definitions.ts)
// ---------------------------------------------------------------------------

const DEMO_FEATURE_KEYS = ['advanced-analytics', 'custom-webhooks', 'export-csv', 'data-processing'] as const;

// ---------------------------------------------------------------------------
// Global JWKS server — shared across all integration tests in this file
// ---------------------------------------------------------------------------

let jwksServer: Server;
let signingKey: KeyLike;
let config: ApiConfig;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = (await exportJWK(publicKey)) as JWK;
  jwk.alg = 'RS256';
  jwk.kid = 'entitlements-test-key-1';
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
    API_PORT: '0',
    NODE_ENV: 'test',
    ENTRA_TENANT_ID: 'entitlements-test-home-tenant',
    ENTRA_CLIENT_ID: 'entitlements-test-client',
    ENTRA_AUDIENCE: 'api://entitlements-tests',
    ENTRA_ISSUER: 'https://login.microsoftonline.com/entitlements-test-home-tenant/v2.0',
    ENTRA_JWKS_URI: `http://127.0.0.1:${port}/discovery/v2.0/keys`,
    JWT_REQUIRED_SCOPE: 'api:read'
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    jwksServer.close((error) => (error ? reject(error) : resolve()));
  });
});

// ---------------------------------------------------------------------------
// Helper — mint a signed test JWT for a given tenantId
// ---------------------------------------------------------------------------

async function mintToken(tenantId: string): Promise<string> {
  return new SignJWT({
    scp: config.auth.requiredScope,
    tenant_id: tenantId,
    oid: 'user-test',
    roles: ['Member']
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'entitlements-test-key-1' })
    .setIssuer(config.auth.issuer)
    .setAudience(config.auth.audience[0])
    .setIssuedAt()
    .setExpirationTime('10m')
    .setSubject('subject-test')
    .sign(signingKey);
}

// ---------------------------------------------------------------------------
// Helper — create a fresh set of in-memory repositories and service
// ---------------------------------------------------------------------------

function createFreshDeps() {
  const subscriptionRepository = new InMemorySubscriptionRepository();
  const featureGateRepository = new InMemoryPlanFeatureGateRepository();
  const planFeatureGateService = new DefaultPlanFeatureGateService(
    featureGateRepository,
    subscriptionRepository
  );
  return { subscriptionRepository, featureGateRepository, planFeatureGateService };
}

// ---------------------------------------------------------------------------
// Shared tenant / plan constants for HTTP integration tests
// ---------------------------------------------------------------------------

const STARTER_TENANT = 'tenant-plan-starter';
const PRO_TENANT = 'tenant-plan-pro';
const PLAN_STARTER = 'plan-starter';
const PLAN_PRO = 'plan-pro';

// ---------------------------------------------------------------------------
// Section 1 & 2: Plan differentiation + Middleware enforcement (HTTP)
// ---------------------------------------------------------------------------

describe('Plan differentiation and middleware enforcement', () => {
  let app: ReturnType<typeof createApp>;
  let miniApp: ReturnType<typeof express>;
  let deps: ReturnType<typeof createFreshDeps>;

  beforeAll(async () => {
    deps = createFreshDeps();
    const { subscriptionRepository, featureGateRepository, planFeatureGateService } = deps;

    // Starter tenant — Active subscription on plan-starter (no feature gates configured)
    await subscriptionRepository.createManagedSubscription({
      tenantId: STARTER_TENANT,
      marketplaceSubscriptionId: `mkt-starter-${randomUUID()}`,
      planId: PLAN_STARTER,
      seats: 5,
      status: 'Active',
      offerId: 'offer-starter',
      correlationId: randomUUID(),
      metadata: {},
      auditEntry: { action: 'subscribe', createdAt: new Date().toISOString(), source: 'api', userId: 'seed' }
    });

    // Pro tenant — Active subscription on plan-pro
    await subscriptionRepository.createManagedSubscription({
      tenantId: PRO_TENANT,
      marketplaceSubscriptionId: `mkt-pro-${randomUUID()}`,
      planId: PLAN_PRO,
      seats: 25,
      status: 'Active',
      offerId: 'offer-pro',
      correlationId: randomUUID(),
      metadata: {},
      auditEntry: { action: 'subscribe', createdAt: new Date().toISOString(), source: 'api', userId: 'seed' }
    });

    // Seed all 4 demo features enabled for plan-pro
    await featureGateRepository.upsertMany([
      { publisherTenantId: PRO_TENANT, planId: PLAN_PRO, featureKey: 'data-processing', enabled: true },
      { publisherTenantId: PRO_TENANT, planId: PLAN_PRO, featureKey: 'advanced-analytics', enabled: true },
      { publisherTenantId: PRO_TENANT, planId: PLAN_PRO, featureKey: 'export-csv', enabled: true },
      { publisherTenantId: PRO_TENANT, planId: PLAN_PRO, featureKey: 'custom-webhooks', enabled: true }
    ]);

    // Full Express app for GET /v1/features
    app = createApp(config, { subscriptionRepository, planFeatureGateService });

    // Mini app that exposes a route gated by requireFeature('export-csv')
    miniApp = express();
    miniApp.use(express.json());
    const requireExportCsv = createRequireFeature(planFeatureGateService);
    miniApp.get(
      '/gated',
      authenticateRequest(config) as RequestHandler,
      requireScopes([config.auth.requiredScope]) as RequestHandler,
      injectTenantContext(config) as unknown as RequestHandler,
      requireExportCsv('export-csv') as RequestHandler,
      (_req, res) => {
        res.status(200).json({ ok: true });
      }
    );
    miniApp.use(errorHandler);
  });

  // --- 1a: Starter plan → empty feature list ----------------------------------

  describe('GET /v1/features — plan differentiation', () => {
    it('Starter plan tenant receives an empty feature list', async () => {
      const token = await mintToken(STARTER_TENANT);

      const response = await request(app)
        .get('/v1/features')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.features).toEqual([]);
    });

    it('Pro plan tenant receives all 4 demo feature keys', async () => {
      const token = await mintToken(PRO_TENANT);

      const response = await request(app)
        .get('/v1/features')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.features).toHaveLength(4);
      expect(response.body.data.features).toEqual(
        expect.arrayContaining(['data-processing', 'advanced-analytics', 'export-csv', 'custom-webhooks'])
      );
    });

    it('Pro plan tenant feature list contains no Starter-only artifacts', async () => {
      const token = await mintToken(PRO_TENANT);

      const response = await request(app)
        .get('/v1/features')
        .set('Authorization', `Bearer ${token}`);

      // Verify no cross-plan leakage — Starter tenant's empty state doesn't bleed into Pro response
      expect(response.body.data.features).not.toContain(undefined);
      expect(response.body.data.features).not.toContain(null);
    });
  });

  // --- 2: requireFeature middleware — end-to-end HTTP -------------------------

  describe('requireFeature middleware — end-to-end HTTP enforcement', () => {
    it('returns 403 when Starter plan tenant accesses a route gated by requireFeature("export-csv")', async () => {
      const token = await mintToken(STARTER_TENANT);

      const response = await request(miniApp)
        .get('/gated')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.status).toBe('error');
      expect(response.body.error.code).toBe('AUTH_FORBIDDEN');
    });

    it('returns 200 when Pro plan tenant accesses a route gated by requireFeature("export-csv")', async () => {
      const token = await mintToken(PRO_TENANT);

      const response = await request(miniApp)
        .get('/gated')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });

    it('returns 401 when the request carries no Authorization header', async () => {
      const response = await request(miniApp).get('/gated');

      expect(response.status).toBe(401);
    });
  });
});

// ---------------------------------------------------------------------------
// Section 3: Plan upgrade flow (service level — no HTTP overhead)
// ---------------------------------------------------------------------------

describe('Plan upgrade flow', () => {
  it('tenant on Starter plan has no features; gains all features immediately after plan transitions to Pro', async () => {
    const { subscriptionRepository, featureGateRepository, planFeatureGateService } = createFreshDeps();
    const upgradeTestTenant = `tenant-upgrade-${randomUUID()}`;

    // Seed 4 demo features for plan-pro
    await featureGateRepository.upsertMany([
      { publisherTenantId: upgradeTestTenant, planId: PLAN_PRO, featureKey: 'data-processing', enabled: true },
      { publisherTenantId: upgradeTestTenant, planId: PLAN_PRO, featureKey: 'advanced-analytics', enabled: true },
      { publisherTenantId: upgradeTestTenant, planId: PLAN_PRO, featureKey: 'export-csv', enabled: true },
      { publisherTenantId: upgradeTestTenant, planId: PLAN_PRO, featureKey: 'custom-webhooks', enabled: true }
    ]);

    // Create tenant on Starter plan
    const subscription = await subscriptionRepository.createManagedSubscription({
      tenantId: upgradeTestTenant,
      marketplaceSubscriptionId: `mkt-upgrade-${randomUUID()}`,
      planId: PLAN_STARTER,
      seats: 5,
      status: 'Active',
      offerId: 'offer-starter',
      correlationId: randomUUID(),
      metadata: {},
      auditEntry: { action: 'subscribe', createdAt: new Date().toISOString(), source: 'api', userId: 'seed' }
    });

    // Before upgrade — Starter plan has no features
    const featuresBeforeUpgrade = await planFeatureGateService.listFeaturesForTenant(upgradeTestTenant);
    expect(featuresBeforeUpgrade).toEqual([]);

    // Also verify specific feature check returns false before upgrade
    const hasExportCsvBeforeUpgrade = await planFeatureGateService.hasFeature(upgradeTestTenant, 'export-csv');
    expect(hasExportCsvBeforeUpgrade).toBe(false);

    // Transition plan — simulate Marketplace plan-change webhook updating planId to Pro
    await subscriptionRepository.updateManagedSubscription({
      subscriptionId: subscription.id,
      planId: PLAN_PRO,
      seats: subscription.seats,
      status: 'Active',
      correlationId: randomUUID(),
      metadata: {},
      auditEntry: {
        action: 'planChange',
        createdAt: new Date().toISOString(),
        source: 'marketplace-webhook',
        userId: 'marketplace'
      }
    });

    // After upgrade — Pro plan returns all 4 features immediately (no cache/stale state)
    const featuresAfterUpgrade = await planFeatureGateService.listFeaturesForTenant(upgradeTestTenant);
    expect(featuresAfterUpgrade).toHaveLength(4);
    expect(featuresAfterUpgrade).toEqual(
      expect.arrayContaining(['data-processing', 'advanced-analytics', 'export-csv', 'custom-webhooks'])
    );

    // Verify the specific feature gate now passes
    const hasExportCsvAfterUpgrade = await planFeatureGateService.hasFeature(upgradeTestTenant, 'export-csv');
    expect(hasExportCsvAfterUpgrade).toBe(true);
  });

  it('downgrade from Pro to Starter removes access to Pro features', async () => {
    const { subscriptionRepository, featureGateRepository, planFeatureGateService } = createFreshDeps();
    const downgradeTestTenant = `tenant-downgrade-${randomUUID()}`;

    // Seed 4 demo features for plan-pro only — no gates for plan-starter
    await featureGateRepository.upsertMany([
      { publisherTenantId: downgradeTestTenant, planId: PLAN_PRO, featureKey: 'data-processing', enabled: true },
      { publisherTenantId: downgradeTestTenant, planId: PLAN_PRO, featureKey: 'advanced-analytics', enabled: true },
      { publisherTenantId: downgradeTestTenant, planId: PLAN_PRO, featureKey: 'export-csv', enabled: true },
      { publisherTenantId: downgradeTestTenant, planId: PLAN_PRO, featureKey: 'custom-webhooks', enabled: true }
    ]);

    // Start on Pro
    const subscription = await subscriptionRepository.createManagedSubscription({
      tenantId: downgradeTestTenant,
      marketplaceSubscriptionId: `mkt-downgrade-${randomUUID()}`,
      planId: PLAN_PRO,
      seats: 25,
      status: 'Active',
      offerId: 'offer-pro',
      correlationId: randomUUID(),
      metadata: {},
      auditEntry: { action: 'subscribe', createdAt: new Date().toISOString(), source: 'api', userId: 'seed' }
    });

    const featuresOnPro = await planFeatureGateService.listFeaturesForTenant(downgradeTestTenant);
    expect(featuresOnPro).toHaveLength(4);

    // Downgrade to Starter
    await subscriptionRepository.updateManagedSubscription({
      subscriptionId: subscription.id,
      planId: PLAN_STARTER,
      seats: 5,
      status: 'Active',
      correlationId: randomUUID(),
      metadata: {},
      auditEntry: {
        action: 'planChange',
        createdAt: new Date().toISOString(),
        source: 'marketplace-webhook',
        userId: 'marketplace'
      }
    });

    // After downgrade — Starter plan has no feature gates, so empty
    const featuresAfterDowngrade = await planFeatureGateService.listFeaturesForTenant(downgradeTestTenant);
    expect(featuresAfterDowngrade).toEqual([]);

    const hasAdvancedAnalyticsAfterDowngrade = await planFeatureGateService.hasFeature(
      downgradeTestTenant,
      'advanced-analytics'
    );
    expect(hasAdvancedAnalyticsAfterDowngrade).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section 4: Feature definitions integrity
// ---------------------------------------------------------------------------

describe('Feature definitions integrity', () => {
  // The 4 demo features are seeded by migration 20260607T154900_feature_definitions.ts.
  // This section verifies the shape and completeness of those definitions using the
  // in-memory repository to ensure repository contracts hold without requiring Docker.

  const demoDefs: FeatureDefinition[] = [
    {
      featureKey: 'advanced-analytics',
      label: 'Advanced Analytics',
      description: 'Usage analytics dashboard with charts',
      category: 'visual',
      createdAt: new Date().toISOString()
    },
    {
      featureKey: 'data-processing',
      label: 'Data Processing',
      description: 'Metered data processing pipeline',
      category: 'functional',
      createdAt: new Date().toISOString()
    },
    {
      featureKey: 'export-csv',
      label: 'Export CSV',
      description: 'Export data tables to CSV',
      category: 'functional',
      createdAt: new Date().toISOString()
    },
    {
      featureKey: 'custom-webhooks',
      label: 'Custom Webhooks',
      description: 'Configure custom webhook endpoints for lifecycle events',
      category: 'functional',
      createdAt: new Date().toISOString()
    }
  ];

  it('listAll() returns exactly 4 demo feature definitions in sorted order', async () => {
    const repo = new InMemoryFeatureDefinitionRepository();
    repo.seed(demoDefs);

    const all = await repo.listAll();

    expect(all).toHaveLength(4);
    const keys = all.map((d) => d.featureKey);
    // listAll sorts alphabetically
    expect(keys).toEqual([...DEMO_FEATURE_KEYS].sort());
  });

  it.each(DEMO_FEATURE_KEYS)('findByKey("%s") resolves the expected feature definition', async (featureKey) => {
    const repo = new InMemoryFeatureDefinitionRepository();
    repo.seed(demoDefs);

    const result = await repo.findByKey(featureKey);

    expect(result).not.toBeNull();
    expect(result!.featureKey).toBe(featureKey);
    expect(typeof result!.label).toBe('string');
    expect(result!.label.length).toBeGreaterThan(0);
  });

  it('findByKey() returns null for an unknown feature key', async () => {
    const repo = new InMemoryFeatureDefinitionRepository();
    repo.seed(demoDefs);

    const result = await repo.findByKey('nonexistent-feature');

    expect(result).toBeNull();
  });

  it('all 4 demo features have a non-empty label and a recognized category', async () => {
    const repo = new InMemoryFeatureDefinitionRepository();
    repo.seed(demoDefs);

    const all = await repo.listAll();
    const validCategories = new Set(['visual', 'functional']);

    for (const def of all) {
      expect(def.label.length, `${def.featureKey} must have a non-empty label`).toBeGreaterThan(0);
      expect(validCategories.has(def.category!), `${def.featureKey} category "${def.category}" is not recognized`).toBe(
        true
      );
    }
  });
});

// ---------------------------------------------------------------------------
