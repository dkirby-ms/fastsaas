import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';

import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createConfig, type ApiConfig } from '../config';
import { authenticateRequest, requireScopes } from '../middleware/auth';
import { authorizeRoute } from '../middleware/rbac';
import { requestLogger } from '../middleware/request-logger';
import { injectTenantContext } from '../middleware/tenant-context';
import { AuditLogImmutableError, InMemoryAuditLogRepository } from '../repositories/audit-log-repository';
import { AuditService, createAuditLoggingMiddleware, waitForAuditLogFlush } from '../services/audit-service';

let jwksServer: Server;
let signingKey: KeyLike;
let config: ApiConfig;

beforeAll(async () => {
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
    AZURE_AD_TENANT_ID: 'tenant-a',
    AZURE_AD_CLIENT_ID: 'fastsaas-tests-client',
    AZURE_AD_AUDIENCE: 'api://fastsaas-tests',
    AZURE_AD_ISSUER: 'https://login.microsoftonline.com/tenant-a/v2.0',
    AZURE_AD_JWKS_URI: `http://127.0.0.1:${port}/discovery/v2.0/keys`,
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
});

async function createToken(role: 'customer_admin' | 'customer_user', tenantId: string): Promise<string> {
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

function buildAuditApp(repository: InMemoryAuditLogRepository) {
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
    injectTenantContext(config),
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
    const repository = new InMemoryAuditLogRepository();
    const { app, service, getHandlerRuns } = buildAuditApp(repository);
    const allowedToken = await createToken('customer_admin', 'tenant-a');
    const deniedToken = await createToken('customer_user', 'tenant-a');

    const allowedResponse = await request(app)
      .post('/fixtures/subscriptions/sub-123/manage')
      .set('Authorization', `Bearer ${allowedToken}`);
    await waitForAuditLogFlush();

    const deniedResponse = await request(app)
      .post('/fixtures/subscriptions/sub-456/manage')
      .set('Authorization', `Bearer ${deniedToken}`);
    await waitForAuditLogFlush();

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

  it('keeps audit logs tenant scoped when reading the audit trail', async () => {
    const repository = new InMemoryAuditLogRepository();
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

    await service.record({
      tenantId: 'tenant-a',
      actorId: 'user-a',
      action: 'read',
      resource: 'users',
      outcome: 'success',
      resourceId: 'user-a',
      timestamp: '2026-05-31T21:35:32.766Z'
    });
    await service.record({
      tenantId: 'tenant-b',
      actorId: 'user-b',
      action: 'read',
      resource: 'users',
      outcome: 'success',
      resourceId: 'user-b',
      timestamp: '2026-05-31T21:35:32.767Z'
    });

    const tenantALogs = await service.listByTenant('tenant-a');
    const tenantBLogs = await service.listByTenant('tenant-b');

    expect(tenantALogs).toHaveLength(1);
    expect(tenantBLogs).toHaveLength(1);
    expect(tenantALogs[0]?.tenantId).toBe('tenant-a');
    expect(tenantBLogs[0]?.tenantId).toBe('tenant-b');
  });

  it('rejects audit log updates and deletes to preserve append-only history', async () => {
    const repository = new InMemoryAuditLogRepository();
    const entry = await repository.append({
      id: 'audit-1',
      tenantId: 'tenant-a',
      actorId: 'user-a',
      action: 'read',
      resource: 'users',
      resourceId: 'user-a',
      timestamp: '2026-05-31T21:35:32.766Z',
      outcome: 'success',
      metadata: {}
    });

    await expect(repository.update(entry.id, { outcome: 'failure' })).rejects.toBeInstanceOf(AuditLogImmutableError);
    await expect(repository.delete(entry.id)).rejects.toBeInstanceOf(AuditLogImmutableError);
  });

  it('ships a migration with append-only guards and tenant isolation for audit logs', () => {
    const migrationPath = new URL('../db/migrations/20260531T213532_audit_logs.ts', import.meta.url);
    const source = readFileSync(migrationPath, 'utf8');

    expect(source).toContain('CREATE TABLE IF NOT EXISTS audit_logs');
    expect(source).toContain('BEFORE UPDATE OR DELETE ON audit_logs');
    expect(source).toContain('audit_logs_reject_mutation');
    expect(source).toContain("buildEnableTenantRlsStatements('audit_logs', 'tenant_id')");
  });
});
