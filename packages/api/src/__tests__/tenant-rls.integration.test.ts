import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { UsageEventIngestRequest, UsageEventRecord } from '@fastsaas/shared';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app';
import { createConfig, type ApiConfig } from '../config';
import { runWithSystemExecutionContext, runWithTenantExecutionContext } from '../db/execution-context';
import { PostgresUsageEventRepository, type PostgresUsageEventSqlClient } from '../metering/postgres-repository';
import type { MarketplaceFulfillmentClient } from '../lib/marketplace-fulfillment';
import { InMemorySubscriptionRepository } from '../repositories/subscription-repository';
import { SubscriptionService } from '../services/subscription-service';

const FIXED_NOW = '2026-05-31T21:35:32.766Z';

let jwksServer: Server;
let signingKey: KeyLike;
let config: ApiConfig;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = (await exportJWK(publicKey)) as JWK;

  jwk.alg = 'RS256';
  jwk.kid = 'tenant-rls-test-key';
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
    API_PORT: '3002',
    NODE_ENV: 'test',
    AZURE_AD_TENANT_ID: 'tenant-a',
    AZURE_AD_CLIENT_ID: 'fastsaas-tests-client',
    AZURE_AD_AUDIENCE: 'api://fastsaas-tests',
    AZURE_AD_ISSUER: 'https://login.microsoftonline.com/fastsaas-test-tenant/v2.0',
    AZURE_AD_JWKS_URI: `http://127.0.0.1:${port}/discovery/v2.0/keys`,
    JWT_REQUIRED_SCOPE: 'api:read',
    METERING_READ_SCOPE: 'metering:read',
    METERING_WRITE_SCOPE: 'metering:write'
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

async function createToken(tenantId: string, scope = config.auth.requiredScope): Promise<string> {
  return new SignJWT({
    scp: scope,
    oid: 'user-123',
    roles: ['member'],
    tid: tenantId
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'tenant-rls-test-key' })
    .setIssuer(config.auth.issuer)
    .setAudience(config.auth.audience[0])
    .setSubject('subject-123')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(signingKey);
}

function createAuditEntry(subscriptionId: string) {
  return {
    id: `${subscriptionId}-audit`,
    subscriptionId,
    eventType: 'Subscribe',
    source: 'api',
    fromStatus: null,
    toStatus: 'PendingActivation' as const,
    correlationId: `${subscriptionId}-corr`,
    requestId: `${subscriptionId}-req`,
    details: {},
    createdAt: FIXED_NOW
  };
}

function createNoopFulfillmentClient(): MarketplaceFulfillmentClient {
  return {
    async resolveSubscription() {
      throw new Error('resolveSubscription should not be called in tenant RLS tests');
    },
    async activateSubscription() {
      throw new Error('activateSubscription should not be called in tenant RLS tests');
    },
    async suspendSubscription() {
      throw new Error('suspendSubscription should not be called in tenant RLS tests');
    },
    async unsubscribeSubscription() {
      throw new Error('unsubscribeSubscription should not be called in tenant RLS tests');
    },
    async updateSubscription() {
      throw new Error('updateSubscription should not be called in tenant RLS tests');
    },
    async reinstateSubscription() {
      throw new Error('reinstateSubscription should not be called in tenant RLS tests');
    }
  };
}

interface StoredUsageEvent extends UsageEventRecord {
  claimToken: string | null;
  leaseExpiresAt: string | null;
}

class FakePostgresStore {
  readonly usageEvents = new Map<string, StoredUsageEvent>();
}

class RlsAwareFakePostgresClient implements PostgresUsageEventSqlClient {
  constructor(
    private readonly store: FakePostgresStore,
    private readonly session = { tenantId: '', bypassRls: false }
  ) {}

  async $transaction<T>(callback: (tx: RlsAwareFakePostgresClient) => Promise<T>): Promise<T> {
    return callback(new RlsAwareFakePostgresClient(this.store, { ...this.session }));
  }

  async $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number> {
    const normalized = normalize(query);

    if (normalized.startsWith("SELECT set_config('app.current_tenant'")) {
      this.session.tenantId = String(values[0] ?? '');
      return 1;
    }

    if (normalized.startsWith("SELECT set_config('app.bypass_rls'")) {
      this.session.bypassRls = String(values[0]) === 'true';
      return 1;
    }

    if (
      normalized.startsWith('CREATE TABLE') ||
      normalized.startsWith('CREATE INDEX') ||
      normalized.startsWith('ALTER TABLE') ||
      normalized.startsWith('DROP INDEX') ||
      normalized.startsWith('DROP POLICY') ||
      normalized.startsWith('CREATE POLICY')
    ) {
      return 0;
    }

    throw new Error(`Unhandled execute query: ${normalized}`);
  }

  async $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T> {
    const normalized = normalize(query);

    if (normalized.startsWith('SELECT') && normalized.includes('FROM usage_events') && normalized.includes('created_at >= $2::timestamptz')) {
      const [tenantId, createdAfter, idempotencyKey, eventId, eventTimestamp] = values;
      const row = [...this.store.usageEvents.values()]
        .filter((event) => this.canReadTenant(event.tenantId))
        .filter((event) => event.tenantId === tenantId)
        .filter((event) => new Date(event.createdAt) >= new Date(String(createdAfter)))
        .filter((event) => event.idempotencyKey === idempotencyKey || (event.eventId === eventId && event.timestamp === toIso(eventTimestamp)))
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];

      return (row ? [clone(row)] : []) as T;
    }

    if (normalized.startsWith('INSERT INTO usage_events')) {
      const [id, tenantId, eventId, subscriptionId, planId, dimensionId, quantity, eventTimestamp, idempotencyKey, nextAttemptAt, metadataJson, createdAt] = values;
      if (!this.canWriteTenant(String(tenantId))) {
        throw new Error(`RLS blocked insert for tenant ${String(tenantId)}`);
      }

      const record: StoredUsageEvent = {
        id: String(id),
        tenantId: String(tenantId),
        eventId: String(eventId),
        subscriptionId: String(subscriptionId),
        planId: String(planId),
        dimensionId: String(dimensionId),
        quantity: Number(quantity),
        timestamp: toIso(eventTimestamp)!,
        idempotencyKey: String(idempotencyKey),
        status: 'pending',
        retryCount: 0,
        nextAttemptAt: toIso(nextAttemptAt),
        submittedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastHttpStatus: null,
        metadata: JSON.parse(String(metadataJson)) as Record<string, unknown>,
        createdAt: toIso(createdAt)!,
        updatedAt: toIso(createdAt)!,
        claimToken: null,
        leaseExpiresAt: null
      };
      this.store.usageEvents.set(record.id, record);
      return [clone(record)] as T;
    }

    if (normalized.startsWith('SELECT') && normalized.includes('FROM usage_events') && normalized.includes('WHERE id = $1')) {
      const [id] = values;
      const record = this.store.usageEvents.get(String(id));
      return record && this.canReadTenant(record.tenantId) ? [clone(record)] as T : [] as T;
    }

    if (normalized.startsWith('SELECT') && normalized.includes('FROM usage_events') && normalized.includes('WHERE tenant_id = $1')) {
      const [tenantId] = values;
      return [...this.store.usageEvents.values()]
        .filter((event) => this.canReadTenant(event.tenantId))
        .filter((event) => event.tenantId === tenantId)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .map((event) => clone(event)) as T;
    }

    throw new Error(`Unhandled query: ${normalized}`);
  }

  private canReadTenant(tenantId: string): boolean {
    return this.session.bypassRls || tenantId === this.session.tenantId;
  }

  private canWriteTenant(tenantId: string): boolean {
    return this.canReadTenant(tenantId);
  }
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('tenant middleware and RLS rollout', () => {
  it('keeps subscription reads isolated to the authenticated tenant', async () => {
    const repository = new InMemorySubscriptionRepository();
    const tenantASubscription = await repository.createSubscription({
      tenantId: 'tenant-a',
      marketplaceSubscriptionId: 'mp-sub-a',
      planId: 'plan-growth',
      seats: 5,
      correlationId: 'corr-a',
      metadata: {},
      auditEntry: createAuditEntry('sub-a')
    });
    const tenantBSubscription = await repository.createSubscription({
      tenantId: 'tenant-b',
      marketplaceSubscriptionId: 'mp-sub-b',
      planId: 'plan-growth',
      seats: 9,
      correlationId: 'corr-b',
      metadata: {},
      auditEntry: createAuditEntry('sub-b')
    });
    const subscriptionService = new SubscriptionService(
      repository,
      createNoopFulfillmentClient(),
      {
        info() {},
        error() {},
        warn() {}
      } as never
    );
    const app = createApp(config, { subscriptionService });
    const tenantAToken = await createToken('tenant-a');

    const listResponse = await request(app)
      .get('/v1/subscriptions')
      .set('Authorization', `Bearer ${tenantAToken}`);
    const getCrossTenantResponse = await request(app)
      .get(`/v1/subscriptions/${tenantBSubscription.id}`)
      .set('Authorization', `Bearer ${tenantAToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.map((subscription: { id: string }) => subscription.id)).toEqual([tenantASubscription.id]);
    expect(getCrossTenantResponse.status).toBe(404);
    expect(getCrossTenantResponse.body.error.code).toBe('NOT_FOUND');
  });

  it('applies tenant session context so cross-tenant metering reads return no rows', async () => {
    const repository = new PostgresUsageEventRepository(new RlsAwareFakePostgresClient(new FakePostgresStore()));
    const now = new Date(FIXED_NOW);
    const tenantAEvent: UsageEventIngestRequest = {
      eventId: 'evt-tenant-a',
      subscriptionId: 'sub-tenant-a',
      planId: 'plan-growth',
      dimensionId: 'api-calls',
      quantity: 3,
      timestamp: FIXED_NOW,
      metadata: { tenant: 'a' }
    };
    const tenantBEvent: UsageEventIngestRequest = {
      eventId: 'evt-tenant-b',
      subscriptionId: 'sub-tenant-b',
      planId: 'plan-growth',
      dimensionId: 'api-calls',
      quantity: 7,
      timestamp: FIXED_NOW,
      metadata: { tenant: 'b' }
    };

    const insertedTenantA = await runWithTenantExecutionContext('tenant-a', 'req-a', () =>
      repository.ingest('tenant-a', tenantAEvent, 'key-a', now)
    );
    const insertedTenantB = await runWithTenantExecutionContext('tenant-b', 'req-b', () =>
      repository.ingest('tenant-b', tenantBEvent, 'key-b', now)
    );

    const crossTenantList = await runWithTenantExecutionContext('tenant-a', 'req-a-read', () =>
      repository.listByTenant('tenant-b')
    );
    const crossTenantRecord = await runWithTenantExecutionContext('tenant-a', 'req-a-by-id', () =>
      repository.getById(insertedTenantB.event.id)
    );
    const systemTenantBList = await runWithSystemExecutionContext(() => repository.listByTenant('tenant-b'));

    expect(insertedTenantA.deduplicated).toBe(false);
    expect(insertedTenantB.deduplicated).toBe(false);
    expect(crossTenantList).toEqual([]);
    expect(crossTenantRecord).toBeNull();
    expect(systemTenantBList.map((event) => event.id)).toEqual([insertedTenantB.event.id]);
  });
});
