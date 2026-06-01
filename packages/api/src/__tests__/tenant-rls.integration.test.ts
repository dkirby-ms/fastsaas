import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { UsageEventIngestRequest } from '@fastsaas/shared';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app';
import { createConfig, type ApiConfig } from '../config';
import { createPool, type Database } from '../db/database';
import { runWithSystemExecutionContext, runWithTenantExecutionContext } from '../db/execution-context';
import { runDatabaseMigrations } from '../db/migrator';
import { PgPoolSqlClient } from '../db/sql-client-adapter';
import { PostgresUsageEventRepository } from '../metering/postgres-repository';
import type { MarketplaceFulfillmentClient } from '../lib/marketplace-fulfillment';
import { KyselySubscriptionRepository } from '../repositories/subscription-repository';
import { SubscriptionService } from '../services/subscription-service';

const FIXED_NOW = '2026-05-31T21:35:32.766Z';
const databaseUrl = process.env.TEST_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
const describeWithDatabase = databaseUrl ? describe : describe.skip;

let jwksServer: Server;
let signingKey: KeyLike;
let config: ApiConfig;
let adminPool: Pool;
let pool: Pool;
let database: Kysely<Database>;
let sqlClient: PgPoolSqlClient;
let schemaName: string;
let roleName: string | undefined;

function getDatabase(): Kysely<Database> {
  return database;
}

function getSqlClient(): PgPoolSqlClient {
  return sqlClient;
}

function buildDatabaseUrl(baseUrl: string, username: string, password: string): string {
  const url = new URL(baseUrl);
  url.username = username;
  url.password = password;
  return url.toString();
}

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

  if (!databaseUrl) {
    return;
  }

  schemaName = `tenant_rls_${randomUUID().replace(/-/g, '')}`;
  adminPool = createPool(databaseUrl);
  await adminPool.query(`CREATE SCHEMA ${schemaName}`);

  let appDatabaseUrl = databaseUrl;
  const currentUserResult = await adminPool.query<{ isSuperuser: boolean }>(
    `SELECT rolsuper AS "isSuperuser" FROM pg_roles WHERE rolname = current_user`
  );

  if (currentUserResult.rows[0]?.isSuperuser) {
    roleName = `tenant_rls_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const rolePassword = randomUUID().replace(/-/g, '');

    await adminPool.query(`CREATE ROLE ${roleName} LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
    await adminPool.query(`GRANT USAGE, CREATE ON SCHEMA ${schemaName} TO ${roleName}`);
    appDatabaseUrl = buildDatabaseUrl(databaseUrl, roleName, rolePassword);
  }

  pool = new Pool({
    connectionString: appDatabaseUrl,
    options: `-c search_path=${schemaName},public`
  });
  database = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool
    })
  });
  sqlClient = new PgPoolSqlClient(pool);

  await pool.query(`
    CREATE TABLE subscriptions (
      id TEXT PRIMARY KEY DEFAULT ('sub-' || substr(md5(random()::text || clock_timestamp()::text), 1, 24)),
      tenant_id TEXT NOT NULL,
      marketplace_subscription_id TEXT NOT NULL UNIQUE,
      plan_id TEXT NOT NULL,
      seats INTEGER NOT NULL,
      status TEXT NOT NULL,
      offer_id TEXT NULL,
      purchaser_tenant_id TEXT NULL,
      beneficiary_tenant_id TEXT NULL,
      correlation_id TEXT NOT NULL,
      metadata JSONB NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE subscription_audit_logs (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      from_status TEXT NULL,
      to_status TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      details JSONB NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE marketplace_webhook_events (
      idempotency_key TEXT PRIMARY KEY,
      marketplace_subscription_id TEXT NOT NULL,
      action TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ NULL
    );
  `);

  await runDatabaseMigrations(database);
});

afterAll(async () => {
  const cleanupTasks = [database?.destroy(), pool?.end()].filter((task): task is Promise<void> => Boolean(task));
  await Promise.allSettled(cleanupTasks);

  if (adminPool && schemaName) {
    await adminPool.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    if (roleName) {
      await adminPool.query(`DROP ROLE IF EXISTS ${roleName}`);
    }
    await adminPool.end();
  }

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

describeWithDatabase('tenant middleware and RLS rollout', () => {
  it('keeps subscription reads and writes isolated to the authenticated tenant', async () => {
    const repository = new KyselySubscriptionRepository(getDatabase());
    const tenantASubscription = await runWithTenantExecutionContext('tenant-a', 'req-a-create', () =>
      repository.createSubscription({
        tenantId: 'tenant-a',
        marketplaceSubscriptionId: 'mp-sub-a',
        planId: 'plan-growth',
        seats: 5,
        correlationId: 'corr-a',
        metadata: {},
        auditEntry: createAuditEntry('sub-a')
      })
    );
    const tenantBSubscription = await runWithTenantExecutionContext('tenant-b', 'req-b-create', () =>
      repository.createSubscription({
        tenantId: 'tenant-b',
        marketplaceSubscriptionId: 'mp-sub-b',
        planId: 'plan-growth',
        seats: 9,
        correlationId: 'corr-b',
        metadata: {},
        auditEntry: createAuditEntry('sub-b')
      })
    );
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
      .set('Authorization', 'Bearer '.concat(tenantAToken));
    const getCrossTenantResponse = await request(app)
      .get(`/v1/subscriptions/${tenantBSubscription.id}`)
      .set('Authorization', 'Bearer '.concat(tenantAToken));

    await expect(
      runWithTenantExecutionContext('tenant-a', 'req-a-update', () =>
        repository.transitionSubscription({
          subscriptionId: tenantBSubscription.id,
          tenantId: 'tenant-b',
          toStatus: 'Subscribed',
          correlationId: 'corr-cross-tenant',
          auditEntry: {
            ...createAuditEntry('sub-b'),
            id: 'sub-b-transition-audit',
            toStatus: 'Subscribed',
            fromStatus: 'PendingActivation'
          }
        })
      )
    ).rejects.toThrow(/not found/i);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.map((subscription: { id: string }) => subscription.id)).toEqual([tenantASubscription.id]);
    expect(getCrossTenantResponse.status).toBe(404);
    expect(getCrossTenantResponse.body.error.code).toBe('NOT_FOUND');
  });

  it('uses PostgreSQL RLS to block cross-tenant metering reads and writes', async () => {
    const repository = new PostgresUsageEventRepository(getSqlClient());
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

    await expect(
      runWithTenantExecutionContext('tenant-a', 'req-a-cross-write', () =>
        repository.ingest('tenant-b', tenantBEvent, 'key-cross-tenant', now)
      )
    ).rejects.toThrow(/row-level security|policy/i);

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
