import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';

import type { UsageEventIngestRequest } from '@fastsaas/shared';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import { Pool, type PoolClient } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app';
import { createConfig, type ApiConfig } from '../config';
import { createDatabase } from '../db/database';
import {
  APP_BYPASS_RLS_SETTING,
  APP_CURRENT_TENANT_SETTING,
  runWithSystemExecutionContext,
  runWithTenantExecutionContext
} from '../db/execution-context';
import { migrateToLatest } from '../db/migrator';
import { PgPoolSqlClient } from '../db/sql-client-adapter';
import type { MarketplaceFulfillmentClient } from '../lib/marketplace-fulfillment';
import { PostgresUsageEventRepository } from '../metering/postgres-repository';
import { KyselySubscriptionRepository } from '../repositories/subscription-repository';
import { SubscriptionService } from '../services/subscription-service';

const FIXED_NOW = '2026-05-31T21:35:32.766Z';
const POSTGRES_IMAGE = 'postgres:16-alpine';
const APP_DB_NAME = 'fastsaas_rls_test';
const APP_DB_USER = 'fastsaas_app';
const APP_DB_PASSWORD = 'fastsaas_app';
const dockerAvailable = canUseDocker();

if (!dockerAvailable) {
  console.warn('Skipping tenant RLS PostgreSQL integration tests because Docker is unavailable. Run npm run test:rls on a machine with Docker to exercise PostgreSQL RLS end to end.');
}

interface TestDatabase {
  adminPool: Pool;
  appPool: Pool;
  databaseUrl: string;
  migrationNames: string[];
  stop(): Promise<void>;
}

const describeWithPostgres = dockerAvailable ? describe.sequential : describe.skip;

let jwksServer: Server;
let signingKey: KeyLike;
let config: ApiConfig;
let testDatabase: TestDatabase;

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
    ENTRA_TENANT_ID: 'tenant-a',
    ENTRA_CLIENT_ID: 'fastsaas-tests-client',
    ENTRA_AUDIENCE: 'api://fastsaas-tests',
    ENTRA_ISSUER: 'https://login.microsoftonline.com/fastsaas-test-tenant/v2.0',
    ENTRA_JWKS_URI: `http://127.0.0.1:${port}/discovery/v2.0/keys`,
    JWT_REQUIRED_SCOPE: 'api:read',
    METERING_READ_SCOPE: 'metering:read',
    METERING_WRITE_SCOPE: 'metering:write'
  });

  if (dockerAvailable) {
    testDatabase = await createTestDatabase();
  }
}, 180_000);

afterAll(async () => {
  await Promise.allSettled([
    new Promise<void>((resolve, reject) => {
      jwksServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    }),
    testDatabase?.stop()
  ]);
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
    },
    async getOperation() {
      throw new Error('getOperation should not be called in tenant RLS tests');
    },
    async updateOperationStatus() {
      throw new Error('updateOperationStatus should not be called in tenant RLS tests');
    }
  };
}

function canUseDocker(): boolean {
  try {
    execFileSync('docker', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function execDocker(args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForQuery(connectionString: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const pool = new Pool({ connectionString });
    try {
      await pool.query('SELECT 1');
      await pool.end();
      return;
    } catch (error) {
      lastError = error;
      await pool.end().catch(() => undefined);
      await sleep(1_000);
    }
  }

  throw lastError ?? new Error('PostgreSQL did not become ready in time');
}

async function initializeBaseSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE subscriptions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
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
    )
  `);
  await pool.query(`
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
    )
  `);
  await pool.query(`
    CREATE TABLE marketplace_webhook_events (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      idempotency_key TEXT NOT NULL UNIQUE,
      marketplace_subscription_id TEXT NOT NULL,
      action TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL,
      error_message TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ NULL
    )
  `);
}

async function seedPreMigrationData(pool: Pool): Promise<void> {
  await pool.query(`
    INSERT INTO subscriptions (
      id,
      tenant_id,
      marketplace_subscription_id,
      plan_id,
      seats,
      status,
      correlation_id,
      metadata,
      created_at,
      updated_at
    ) VALUES
      ('sub-a', 'tenant-a', 'mp-sub-a', 'plan-growth', 5, 'PendingActivation', 'corr-a', '{}'::jsonb, $1::timestamptz, $1::timestamptz),
      ('sub-b', 'tenant-b', 'mp-sub-b', 'plan-growth', 9, 'PendingActivation', 'corr-b', '{}'::jsonb, $1::timestamptz, $1::timestamptz)
  `, [FIXED_NOW]);
  await pool.query(`
    INSERT INTO subscription_audit_logs (
      id,
      subscription_id,
      event_type,
      source,
      from_status,
      to_status,
      correlation_id,
      request_id,
      details,
      created_at
    ) VALUES
      ('audit-a', 'sub-a', 'Subscribe', 'api', NULL, 'PendingActivation', 'corr-a', 'req-a', '{}'::jsonb, $1::timestamptz),
      ('audit-b', 'sub-b', 'Subscribe', 'api', NULL, 'PendingActivation', 'corr-b', 'req-b', '{}'::jsonb, $1::timestamptz)
  `, [FIXED_NOW]);
  await pool.query(`
    INSERT INTO marketplace_webhook_events (
      id,
      idempotency_key,
      marketplace_subscription_id,
      action,
      correlation_id,
      request_id,
      payload,
      status,
      created_at,
      processed_at
    ) VALUES
      ('webhook-a', 'webhook-key-a', 'mp-sub-a', 'Resolve', 'corr-a', 'req-a', '{}'::jsonb, 'processed', $1::timestamptz, $1::timestamptz),
      ('webhook-b', 'webhook-key-b', 'mp-sub-b', 'Resolve', 'corr-b', 'req-b', '{}'::jsonb, 'processed', $1::timestamptz, $1::timestamptz)
  `, [FIXED_NOW]);
}

async function createTestDatabase(): Promise<TestDatabase> {
  const containerName = `fastsaas-rls-${randomUUID().slice(0, 8)}`;
  execDocker([
    'run',
    '--rm',
    '--detach',
    '--name',
    containerName,
    '--env',
    'POSTGRES_PASSWORD=postgres',
    '--publish',
    '127.0.0.1::5432',
    POSTGRES_IMAGE
  ]);

  const portOutput = execDocker(['port', containerName, '5432/tcp']);
  const portMatch = portOutput.match(/:(\d+)\s*$/);
  if (!portMatch) {
    throw new Error(`Unable to resolve PostgreSQL port from: ${portOutput}`);
  }

  const port = Number(portMatch[1]);
  const adminUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  await waitForQuery(adminUrl);

  const bootstrapPool = new Pool({ connectionString: adminUrl });
  await bootstrapPool.query(`CREATE ROLE ${APP_DB_USER} LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  await bootstrapPool.query(`CREATE DATABASE ${APP_DB_NAME} OWNER ${APP_DB_USER}`);
  await bootstrapPool.end();

  const adminPool = new Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${port}/${APP_DB_NAME}` });
  await adminPool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  const databaseUrl = `postgresql://${APP_DB_USER}:${APP_DB_PASSWORD}@127.0.0.1:${port}/${APP_DB_NAME}`;
  const appPool = new Pool({ connectionString: databaseUrl });
  await initializeBaseSchema(appPool);
  await seedPreMigrationData(appPool);

  const db = createDatabase(databaseUrl);
  const result = await migrateToLatest(db);
  await db.destroy();

  return {
    adminPool,
    appPool,
    databaseUrl,
    migrationNames: (result.results ?? []).map((migration) => migration.migrationName),
    async stop() {
      await Promise.allSettled([adminPool.end(), appPool.end()]);
      execDocker(['rm', '--force', containerName]);
    }
  };
}

async function withTenantSession<T>(
  pool: Pool,
  tenantId: string | undefined,
  bypassRls: boolean,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('${APP_CURRENT_TENANT_SETTING}', $1, true)`, [tenantId ?? '']);
    await client.query(`SELECT set_config('${APP_BYPASS_RLS_SETTING}', $1, true)`, [bypassRls ? 'true' : 'false']);
    const result = await callback(client);
    await client.query('ROLLBACK');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

describeWithPostgres('tenant middleware and RLS rollout', () => {
  it('runs the Kysely migration through an executable path and backfills tenant columns', async () => {
    expect(testDatabase.migrationNames).toContain('20260531T213532_tenant_rls');

    const auditLogs = await testDatabase.adminPool.query(
      'SELECT subscription_id, tenant_id FROM subscription_audit_logs ORDER BY subscription_id ASC'
    );
    const webhookEvents = await testDatabase.adminPool.query(
      'SELECT marketplace_subscription_id, tenant_id FROM marketplace_webhook_events ORDER BY marketplace_subscription_id ASC'
    );
    const policies = await testDatabase.adminPool.query(`
      SELECT tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('subscriptions', 'subscription_audit_logs', 'usage_events', 'usage_event_dead_letters', 'marketplace_webhook_events')
      ORDER BY tablename ASC
    `);

    expect(auditLogs.rows).toEqual([
      { subscription_id: 'sub-a', tenant_id: 'tenant-a' },
      { subscription_id: 'sub-b', tenant_id: 'tenant-b' }
    ]);
    expect(webhookEvents.rows).toEqual([
      { marketplace_subscription_id: 'mp-sub-a', tenant_id: 'tenant-a' },
      { marketplace_subscription_id: 'mp-sub-b', tenant_id: 'tenant-b' }
    ]);
    expect(policies.rows.map((row) => `${row.tablename}:${row.policyname}`)).toEqual([
      'marketplace_webhook_events:marketplace_webhook_events_tenant_isolation',
      'subscription_audit_logs:subscription_audit_logs_tenant_isolation',
      'subscriptions:subscriptions_tenant_isolation',
      'usage_event_dead_letters:usage_event_dead_letters_tenant_isolation',
      'usage_events:usage_events_tenant_isolation'
    ]);
  });

  it('sets app.current_tenant so PostgreSQL only returns the matching tenant rows', async () => {
    const visibleRows = await withTenantSession(testDatabase.appPool, 'tenant-a', false, async (client) => {
      const result = await client.query('SELECT id FROM subscriptions ORDER BY id ASC');
      return result.rows.map((row) => row.id);
    });
    const bypassRows = await withTenantSession(testDatabase.appPool, undefined, true, async (client) => {
      const result = await client.query('SELECT id FROM subscriptions ORDER BY id ASC');
      return result.rows.map((row) => row.id);
    });

    expect(visibleRows).toEqual(['sub-a']);
    expect(bypassRows).toEqual(['sub-a', 'sub-b']);
  });

  it('keeps subscription reads isolated to the authenticated tenant', async () => {
    const subscriptionDb = createDatabase(testDatabase.databaseUrl);
    const repository = new KyselySubscriptionRepository(subscriptionDb);
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

    try {
      const listResponse = await request(app)
        .get('/v1/subscriptions')
        .set('Authorization', `Bearer ${tenantAToken}`);
      const getCrossTenantResponse = await request(app)
        .get('/v1/subscriptions/sub-b')
        .set('Authorization', `Bearer ${tenantAToken}`);

      expect(listResponse.status).toBe(200);
      expect(listResponse.body.data.map((subscription: { id: string }) => subscription.id)).toEqual(['sub-a']);
      expect(getCrossTenantResponse.status).toBe(404);
      expect(getCrossTenantResponse.body.error.code).toBe('NOT_FOUND');
    } finally {
      await subscriptionDb.destroy();
    }
  });

  it('blocks cross-tenant metering reads with real PostgreSQL RLS', async () => {
    const repository = new PostgresUsageEventRepository(new PgPoolSqlClient(testDatabase.appPool));
    const now = new Date(FIXED_NOW);
    const tenantAEvent: UsageEventIngestRequest = {
      eventId: 'evt-tenant-a',
      subscriptionId: 'sub-a',
      planId: 'plan-growth',
      dimensionId: 'api-calls',
      quantity: 3,
      timestamp: FIXED_NOW,
      metadata: { tenant: 'a' }
    };
    const tenantBEvent: UsageEventIngestRequest = {
      eventId: 'evt-tenant-b',
      subscriptionId: 'sub-b',
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
    expect(systemTenantBList.map((event) => event.id)).toContain(insertedTenantB.event.id);
  });
});
