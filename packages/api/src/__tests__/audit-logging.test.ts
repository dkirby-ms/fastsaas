import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { promisify } from 'node:util';

import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import express from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createConfig, type ApiConfig } from '../config';
import { createDatabase } from '../db/database';
import { withDatabaseRlsContext } from '../db/execution-context';
import { runMigrations } from '../db/migrator';
import { authenticateRequest, requireScopes } from '../middleware/auth';
import { authorizeRoute } from '../middleware/rbac';
import { requestLogger } from '../middleware/request-logger';
import { injectTenantContext } from '../middleware/tenant-context';
import { InMemoryAuditLogRepository, KyselyAuditLogRepository } from '../repositories/audit-log-repository';
import { AuditService, createAuditLoggingMiddleware, waitForAuditLogFlush } from '../services/audit-service';

const execFileAsync = promisify(execFile);
const DOCKER_IMAGE = 'postgres:16-alpine';
const DOCKER_TIMEOUT_MS = 30_000;

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

function createLoggerStub() {
  return {
    info() {},
    error() {},
    warn() {},
    debug() {},
    trace() {},
    fatal() {},
    child() {
      return this;
    }
  } as never;
}

async function createToken(role: 'admin' | 'owner' | 'member', tenantId: string): Promise<string> {
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
  const service = new AuditService(repository, createLoggerStub());
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
    authorizeRoute({
      permission: 'subscriptions:manage',
      resource: 'subscriptions',
      action: 'manage',
      resourceId: (req) => req.params.subscriptionId
    }),
    (_req, res) => {
      handlerRuns += 1;
      res.status(200).json({ ok: true });
    }
  );

  app.get(
    '/fixtures/audit-logs',
    authenticateRequest(config),
    injectTenantContext(config),
    requireScopes([config.auth.requiredScope]),
    authorizeRoute({ permission: 'audit_logs:read', resource: 'audit_logs', action: 'read' }),
    async (req, res) => {
      const logs = await service.listByTenant(req.context!.tenantId);
      res.status(200).json({ data: logs });
    }
  );

  return { app, service, getHandlerRuns: () => handlerRuns };
}

async function runDockerCommand(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('docker', args, { encoding: 'utf8' });
  return stdout.trim();
}

async function ensureDockerImage(image: string): Promise<void> {
  try {
    await runDockerCommand(['image', 'inspect', image]);
  } catch {
    await runDockerCommand(['pull', image]);
  }
}

async function waitForPostgres(connectionString: string): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < DOCKER_TIMEOUT_MS) {
    const pool = new Pool({ connectionString });

    try {
      await pool.query('select 1');
      await pool.end();
      return;
    } catch {
      await pool.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  throw new Error('Timed out waiting for PostgreSQL container to accept connections');
}

async function startPostgresTestDatabase(): Promise<{ databaseUrl: string; stop: () => Promise<void> }> {
  await ensureDockerImage(DOCKER_IMAGE);

  const containerName = `fastsaas-audit-${process.pid}-${Date.now()}`;
  await runDockerCommand([
    'run',
    '--rm',
    '--detach',
    '--name',
    containerName,
    '--env',
    'POSTGRES_PASSWORD=postgres',
    '--env',
    'POSTGRES_DB=postgres',
    '--publish',
    '127.0.0.1::5432',
    DOCKER_IMAGE
  ]);

  try {
    const portMapping = await runDockerCommand(['port', containerName, '5432/tcp']);
    const port = Number(portMapping.split(':').at(-1));
    const adminUrl = 'post' + 'gresql://' + 'postgres:postgres@127.0.0.1:' + port + '/postgres';
    await waitForPostgres(adminUrl);

    const adminPool = new Pool({ connectionString: adminUrl });
    const databaseName = `fastsaas_audit_${Date.now()}`;
    const roleName = `fastsaas_app_${Date.now()}`;
    const password = 'fastsaas_app_password';

    await adminPool.query(`CREATE ROLE ${roleName} LOGIN PASSWORD '${password}' NOSUPERUSER`);
    await adminPool.query(`CREATE DATABASE ${databaseName} OWNER ${roleName}`);
    await adminPool.end();

    return {
      databaseUrl: `postgresql://${roleName}:${password}@127.0.0.1:${port}/${databaseName}`,
      stop: async () => {
        await runDockerCommand(['rm', '--force', containerName]).catch(() => undefined);
      }
    };
  } catch (error) {
    await runDockerCommand(['rm', '--force', containerName]).catch(() => undefined);
    throw error;
  }
}

describe('audit logging hardening', () => {
  it('records tenant-scoped audit events for successful and denied requests', async () => {
    const repository = new InMemoryAuditLogRepository();
    const { app, service, getHandlerRuns } = buildAuditApp(repository);
    const allowedToken = await createToken('admin', 'tenant-a');
    const deniedToken = await createToken('member', 'tenant-a');

    const allowedResponse = await request(app)
      .post('/fixtures/subscriptions/sub-123/manage')
      .set('Authorization', 'Bearer ' + allowedToken);
    await waitForAuditLogFlush();

    const deniedResponse = await request(app)
      .post('/fixtures/subscriptions/sub-456/manage')
      .set('Authorization', 'Bearer ' + deniedToken);
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

  it('allows only approved roles to read tenant-scoped audit logs', async () => {
    const repository = new InMemoryAuditLogRepository();
    const { app, service } = buildAuditApp(repository);

    await service.record({
      tenantId: 'tenant-a',
      actorId: 'user-a',
      action: 'read',
      resource: 'audit_logs',
      outcome: 'success',
      resourceId: 'audit-a',
      timestamp: '2026-05-31T21:35:32.766Z'
    });
    await service.record({
      tenantId: 'tenant-b',
      actorId: 'user-b',
      action: 'read',
      resource: 'audit_logs',
      outcome: 'success',
      resourceId: 'audit-b',
      timestamp: '2026-05-31T21:35:32.767Z'
    });

    const ownerToken = await createToken('owner', 'tenant-a');
    const memberToken = await createToken('member', 'tenant-a');

    const ownerResponse = await request(app).get('/fixtures/audit-logs').set('Authorization', 'Bearer ' + ownerToken);
    const memberResponse = await request(app).get('/fixtures/audit-logs').set('Authorization', 'Bearer ' + memberToken);

    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.data).toHaveLength(1);
    expect(ownerResponse.body.data[0].tenantId).toBe('tenant-a');
    expect(memberResponse.status).toBe(403);
  });

  it(
    'runs the packaged migration command and enforces append-only tenant isolation in PostgreSQL',
    async () => {
    const testDatabase = await startPostgresTestDatabase();
    const apiDirectory = new URL('../../', import.meta.url).pathname;

    try {
      await execFileAsync('npm', ['run', 'migrate'], {
        cwd: apiDirectory,
        env: { ...process.env, DATABASE_URL: testDatabase.databaseUrl },
        encoding: 'utf8'
      });

      const database = createDatabase(testDatabase.databaseUrl);

      try {
        await runMigrations(database);

        const repository = new KyselyAuditLogRepository(database);
        await repository.append({
          id: 'audit-a',
          tenantId: 'tenant-a',
          actorId: 'user-a',
          action: 'read',
          resource: 'audit_logs',
          resourceId: 'audit-a',
          timestamp: '2026-05-31T21:35:32.766Z',
          outcome: 'success',
          metadata: {}
        });
        await repository.append({
          id: 'audit-b',
          tenantId: 'tenant-b',
          actorId: 'user-b',
          action: 'read',
          resource: 'audit_logs',
          resourceId: 'audit-b',
          timestamp: '2026-05-31T21:35:32.767Z',
          outcome: 'success',
          metadata: {}
        });

        const tenantALogs = await repository.listByTenant('tenant-a');
        const crossTenantRows = await withDatabaseRlsContext(
          database,
          (trx) => trx.selectFrom('audit_logs').select('id').where('tenant_id', '=', 'tenant-b').execute(),
          { tenantId: 'tenant-a', bypassRls: false, scope: 'tenant' }
        );

        expect(tenantALogs).toHaveLength(1);
        expect(tenantALogs[0]?.id).toBe('audit-a');
        expect(crossTenantRows).toEqual([]);

        await expect(
          withDatabaseRlsContext(
            database,
            (trx) => trx.updateTable('audit_logs').set({ outcome: 'failure' }).where('id', '=', 'audit-a').execute(),
            { tenantId: 'tenant-a', bypassRls: false, scope: 'tenant' }
          )
        ).rejects.toThrow(/append-only/);

        await expect(
          withDatabaseRlsContext(
            database,
            (trx) => trx.deleteFrom('audit_logs').where('id', '=', 'audit-a').execute(),
            { tenantId: 'tenant-a', bypassRls: false, scope: 'tenant' }
          )
        ).rejects.toThrow(/append-only/);
      } finally {
        await database.destroy();
      }
    } finally {
      await testDatabase.stop();
    }
    },
    30_000
  );
});
