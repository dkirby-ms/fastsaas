import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { sql } from 'kysely';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createConfig, type ApiConfig } from '../config';
import { withDatabaseRlsContext } from '../db/execution-context';
import { redactMarketplaceTokens, REDACTED_MARKETPLACE_TOKEN } from '../lib/marketplace-token-redaction';
import { authenticateRequest, requireScopes } from '../middleware/auth';
import { authorizeRoute } from '../middleware/rbac';
import { requestLogger } from '../middleware/request-logger';
import { injectTenantContext } from '../middleware/tenant-context';
import { KyselyAuditLogRepository } from '../repositories/audit-log-repository';
import { AuditService, createAuditLoggingMiddleware, waitForAuditLogFlush } from '../services/audit-service';
import { PostgresTestDatabase } from './postgres-test-db';

let jwksServer: Server;
let signingKey: KeyLike;
let config: ApiConfig;
let postgres: PostgresTestDatabase;

beforeAll(async () => {
  postgres = await PostgresTestDatabase.start();

  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = (await exportJWK(publicKey)) as JWK;

  jwk.alg = 'RS256';
  jwk.kid = 'audit-test-key';
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
    API_PORT: '3004',
    NODE_ENV: 'test',
    ENTRA_TENANT_ID: 'tenant-a',
    ENTRA_CLIENT_ID: 'fastsaas-tests-client',
    ENTRA_AUDIENCE: 'api://fastsaas-tests',
    ENTRA_ISSUER: 'https://login.microsoftonline.com/tenant-a/v2.0',
    ENTRA_JWKS_URI: `http://127.0.0.1:${port}/discovery/v2.0/keys`,
    JWT_REQUIRED_SCOPE: 'api:read'
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

  await postgres.destroy();
});

beforeEach(async () => {
  await postgres.resetAuditLogs();
});

async function createToken(role: 'Admin' | 'Viewer', tenantId: string): Promise<string> {
  return new SignJWT({
    scp: config.auth.requiredScope,
    oid: `${tenantId}-user`,
    roles: [role],
    tid: tenantId
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'audit-test-key' })
    .setIssuer(config.auth.issuer)
    .setAudience(config.auth.audience[0])
    .setSubject(`${tenantId}-subject`)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(signingKey);
}

async function waitForAuditLogCount(service: AuditService, tenantId: string, expectedCount: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await service.listByTenant(tenantId)).length >= expectedCount) {
      return;
    }

    await waitForAuditLogFlush();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for ${expectedCount} audit log entries for ${tenantId}`);
}

function buildAuditApp() {
  const repository = new KyselyAuditLogRepository(postgres.db);
  const service = new AuditService(repository, {
    info() {},
    error() {},
    warn() {},
    debug() {},
    trace() {},
    fatal() {},
    child() {
      return this;
    }
  } as never);
  const app = express();
  let handlerRuns = 0;

  app.use(requestLogger);
  app.use(express.json());
  app.use(createAuditLoggingMiddleware(service));
  app.post(
    '/fixtures/subscriptions/:subscriptionId/manage',
    authenticateRequest(config),
    injectTenantContext(config, undefined, { authorizationModel: 'publisher' }),
    requireScopes([config.auth.requiredScope]),
    authorizeRoute({ resource: 'subscriptions', action: 'manage', resourceId: (req) => req.params.subscriptionId }),
    (_req, res) => {
      handlerRuns += 1;
      res.status(200).json({ ok: true });
    }
  );

  return { app, service, getHandlerRuns: () => handlerRuns };
}

describe('audit logging hardening', () => {
  it('records tenant-scoped audit events for successful and denied requests', async () => {
    const { app, service, getHandlerRuns } = buildAuditApp();
    const allowedToken = await createToken('Admin', 'tenant-a');
    const deniedToken = await createToken('Viewer', 'tenant-a');

    const allowedResponse = await request(app)
      .post('/fixtures/subscriptions/sub-123/manage')
      .set('Authorization', `Bearer ${allowedToken}`);
    await waitForAuditLogFlush();

    const deniedResponse = await request(app)
      .post('/fixtures/subscriptions/sub-456/manage')
      .set('Authorization', `Bearer ${deniedToken}`);
    await waitForAuditLogFlush();
    await waitForAuditLogCount(service, 'tenant-a', 2);

    const logs = await service.listByTenant('tenant-a');

    expect(allowedResponse.status).toBe(200);
    expect(deniedResponse.status).toBe(403);
    expect(getHandlerRuns()).toBe(1);
    expect(logs).toHaveLength(2);
    expect(logs.map((entry) => entry.outcome).sort()).toEqual(['denied', 'success']);
    expect(logs.every((entry) => entry.tenantId === 'tenant-a')).toBe(true);
    expect(logs.every((entry) => entry.actorId === 'tenant-a-user')).toBe(true);
    expect(logs.map((entry) => entry.resourceId).sort()).toEqual(['sub-123', 'sub-456']);
  });

  it('redacts marketplace purchase tokens from stored audit history on read', async () => {
    const repository = new KyselyAuditLogRepository(postgres.db);
    const service = new AuditService(repository, {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      child: () => undefined
    } as never);
    const rawMarketplaceToken = 'marketplace-secret-token';

    await repository.append({
      id: 'audit-redacted-on-read',
      tenantId: 'tenant-a',
      actorId: 'user-a',
      action: 'manage',
      resource: 'subscriptions',
      resourceId: rawMarketplaceToken,
      timestamp: '2026-06-01T21:41:30.419+00:00',
      outcome: 'success',
      metadata: {
        method: 'POST',
        path: '/v1/subscriptions',
        requestBody: {
          marketplaceToken: rawMarketplaceToken,
          nested: { marketplaceToken: rawMarketplaceToken }
        }
      }
    });

    const [log] = await service.listByTenant('tenant-a');

    expect(log?.resourceId).toBe(REDACTED_MARKETPLACE_TOKEN);
    expect(log?.metadata).toEqual(
      redactMarketplaceTokens({
        method: 'POST',
        path: '/v1/subscriptions',
        requestBody: {
          marketplaceToken: rawMarketplaceToken,
          nested: { marketplaceToken: rawMarketplaceToken }
        }
      })
    );
    expect(JSON.stringify(log)).not.toContain(rawMarketplaceToken);
  });

  it('enforces append-only audit logs with PostgreSQL triggers', async () => {
    const repository = new KyselyAuditLogRepository(postgres.db);
    const entry = await repository.append({
      id: 'audit-append-only',
      tenantId: 'tenant-a',
      actorId: 'user-a',
      action: 'view',
      resource: 'audit_logs',
      resourceId: 'audit-append-only',
      timestamp: '2026-05-31T21:35:32.766Z',
      outcome: 'success',
      metadata: {}
    });

    await expect(
      withDatabaseRlsContext(
        postgres.db,
        (trx) =>
          trx
            .updateTable('audit_logs')
            .set({ outcome: 'failure' })
            .where('id', '=', entry.id)
            .executeTakeFirst(),
        { tenantId: 'tenant-a', bypassRls: false, scope: 'tenant' }
      )
    ).rejects.toThrow('audit_logs is append-only');

    await expect(
      withDatabaseRlsContext(
        postgres.db,
        (trx) => trx.deleteFrom('audit_logs').where('id', '=', entry.id).executeTakeFirst(),
        { tenantId: 'tenant-a', bypassRls: false, scope: 'tenant' }
      )
    ).rejects.toThrow('audit_logs is append-only');
  });

  it('enforces tenant-scoped audit log reads with PostgreSQL RLS context switching', async () => {
    const repository = new KyselyAuditLogRepository(postgres.db);

    await repository.append({
      id: 'audit-tenant-a',
      tenantId: 'tenant-a',
      actorId: 'user-a',
      action: 'view',
      resource: 'audit_logs',
      resourceId: 'audit-tenant-a',
      timestamp: '2026-05-31T21:35:32.766Z',
      outcome: 'success',
      metadata: { tenant: 'a' }
    });
    await repository.append({
      id: 'audit-tenant-b',
      tenantId: 'tenant-b',
      actorId: 'user-b',
      action: 'view',
      resource: 'audit_logs',
      resourceId: 'audit-tenant-b',
      timestamp: '2026-05-31T21:35:32.767Z',
      outcome: 'success',
      metadata: { tenant: 'b' }
    });

    const tenantALogs = await repository.listByTenant('tenant-a');
    const tenantBLogs = await repository.listByTenant('tenant-b');
    const tenantACrossTenantQuery = await withDatabaseRlsContext(
      postgres.db,
      (trx) => trx.selectFrom('audit_logs').select(['id', 'tenant_id']).where('tenant_id', '=', 'tenant-b').execute(),
      { tenantId: 'tenant-a', bypassRls: false, scope: 'tenant' }
    );
    const systemView = await withDatabaseRlsContext(
      postgres.db,
      (trx) => trx.selectFrom('audit_logs').select(['id', 'tenant_id']).orderBy('id').execute(),
      { tenantId: 'system', bypassRls: true, scope: 'system' }
    );
    const forcedRls = await sql<{ relforcerowsecurity: boolean }>`
      select relforcerowsecurity
      from pg_class
      where relname = 'audit_logs'
    `.execute(postgres.adminDb);

    expect(tenantALogs.some((entry) => entry.tenantId === 'tenant-b')).toBe(false);
    expect(tenantBLogs.some((entry) => entry.tenantId === 'tenant-a')).toBe(false);
    expect(tenantACrossTenantQuery).toEqual([]);
    expect(systemView.map((row) => row.tenant_id).sort()).toEqual(['tenant-a', 'tenant-b']);
    expect(forcedRls.rows[0]?.relforcerowsecurity).toBe(true);
  });
});
