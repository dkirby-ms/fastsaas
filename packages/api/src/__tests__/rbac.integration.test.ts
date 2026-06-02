import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import express from 'express';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createConfig, type ApiConfig } from '../config';
import { authenticateRequest, requireScopes } from '../middleware/auth';
import {
  authorizeRoute,
  RBAC_PERMISSION_DESCRIPTORS,
  RBAC_ROLES,
  toPermission,
  type RbacAction,
  type RbacRole
} from '../middleware/rbac';
import { requestLogger } from '../middleware/request-logger';
import { injectTenantContext } from '../middleware/tenant-context';
import { InMemoryTenantMemberRepository } from '../repositories/tenant-member-repository';
import { TenantMemberService } from '../services/tenant-member-service';
import { RBAC_MATRIX_FIXTURE } from './rbac-matrix.fixture';

const ACTION_METHODS: Record<RbacAction, 'get' | 'post'> = {
  view: 'get',
  write: 'post',
  manage: 'post',
  export: 'get'
};

let jwksServer: Server;
let signingKey: KeyLike;
let config: ApiConfig;
let tenantMemberService: TenantMemberService;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = (await exportJWK(publicKey)) as JWK;

  jwk.alg = 'RS256';
  jwk.kid = 'rbac-test-key';
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
    API_PORT: '3003',
    NODE_ENV: 'test',
    ENTRA_TENANT_ID: 'tenant-a',
    ENTRA_CLIENT_ID: 'fastsaas-tests-client',
    ENTRA_AUDIENCE: 'api://fastsaas-tests',
    ENTRA_ISSUER: 'https://login.microsoftonline.com/tenant-a/v2.0',
    ENTRA_JWKS_URI: `http://127.0.0.1:${port}/discovery/v2.0/keys`,
    JWT_REQUIRED_SCOPE: 'api:read'
  });

  tenantMemberService = new TenantMemberService(
    new InMemoryTenantMemberRepository(),
    { info() {}, warn() {}, error() {}, child() { return this; } } as never
  );
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

async function createToken(options: { role?: RbacRole; roles?: string[]; tenantId?: string } = {}): Promise<string> {
  return new SignJWT({
    scp: config.auth.requiredScope,
    oid: 'user-123',
    roles: options.roles ?? (options.role ? [options.role] : ['Viewer']),
    tid: options.tenantId ?? 'tenant-a'
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'rbac-test-key' })
    .setIssuer(config.auth.issuer)
    .setAudience(config.auth.audience[0])
    .setSubject('subject-123')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(signingKey);
}

function buildFixtureApp(executedHandlers: string[]) {
  const app = express();
  app.use(requestLogger);
  app.use(express.json());

  const baseMiddleware = [
    authenticateRequest(config),
    injectTenantContext(config, tenantMemberService, { authorizationModel: 'publisher' }),
    requireScopes([config.auth.requiredScope])
  ] as const;

  for (const permission of RBAC_PERMISSION_DESCRIPTORS) {
    const path = `/fixtures/${permission.resource}/${permission.action}`;
    const key = toPermission(permission.resource, permission.action);
    const handler = (_req: express.Request, res: express.Response) => {
      executedHandlers.push(key);
      res.status(200).json({ permission: key, label: permission.label });
    };
    const middleware = authorizeRoute({
      resource: permission.resource,
      action: permission.action,
      resourceId: () => `${permission.resource}-1`
    });

    if (ACTION_METHODS[permission.action] === 'get') {
      app.get(path, ...baseMiddleware, middleware, handler);
    } else {
      app.post(path, ...baseMiddleware, middleware, handler);
    }
  }

  return app;
}

describe('RBAC permissions matrix', () => {
  it.each(RBAC_ROLES)('enforces the approved role model for %s', async (role) => {
    const executedHandlers: string[] = [];
    const app = buildFixtureApp(executedHandlers);
    const token = await createToken({ role });

    for (const permission of RBAC_PERMISSION_DESCRIPTORS) {
      const permissionKey = toPermission(permission.resource, permission.action);
      const expectedAllowed = RBAC_MATRIX_FIXTURE[role][permissionKey];
      const method = ACTION_METHODS[permission.action];
      const response = await request(app)[method](`/fixtures/${permission.resource}/${permission.action}`).set(
        'Authorization',
        `Bearer ${token}`
      );

      expect(response.status, `${role} ${permissionKey}`).toBe(expectedAllowed ? 200 : 403);
      expect(executedHandlers.filter((entry) => entry === permissionKey)).toHaveLength(expectedAllowed ? 1 : 0);
    }
  });

  it('falls back to tenant membership when JWT roles are empty', async () => {
    const app = express();
    app.use(requestLogger);
    app.use(express.json());
    app.post(
      '/fixtures/subscriptions/manage',
      authenticateRequest(config),
      injectTenantContext(config, tenantMemberService, { authorizationModel: 'customer' }),
      requireScopes([config.auth.requiredScope]),
      authorizeRoute({ resource: 'subscriptions', action: 'manage', resourceId: () => 'subscriptions-1' }),
      (_req, res) => {
        res.status(200).json({ ok: true });
      }
    );

    const deniedToken = await createToken({ tenantId: 'tenant-a', role: 'Owner' });
    const deniedResponse = await request(app)
      .post('/fixtures/subscriptions/manage')
      .set('Authorization', `Bearer ${deniedToken}`);

    expect(deniedResponse.status).toBe(403);

    await tenantMemberService.bootstrapOwnerIfNeeded({
      tenantId: 'tenant-a',
      userId: 'user-123',
      email: 'external@example.com'
    });

    const token = await createToken({ tenantId: 'tenant-a', roles: [] });

    const response = await request(app)
      .post('/fixtures/subscriptions/manage')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
  });
});
