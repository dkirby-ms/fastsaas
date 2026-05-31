import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createConfig, type ApiConfig } from '../config';
import { authenticateRequest, requireScopes } from '../middleware/auth';
import { authorizeRoute, RBAC_ACTIONS, RBAC_RESOURCES, RBAC_ROLES, type RbacAction, type RbacResource, type RbacRole } from '../middleware/rbac';
import { requestLogger } from '../middleware/request-logger';
import { injectTenantContext } from '../middleware/tenant-context';
import { RBAC_MATRIX_FIXTURE } from './rbac-matrix.fixture';

const ACTION_METHODS: Record<RbacAction, 'get' | 'post' | 'put' | 'delete'> = {
  create: 'post',
  read: 'get',
  update: 'put',
  delete: 'delete',
  manage: 'post'
};

let jwksServer: Server;
let signingKey: KeyLike;
let config: ApiConfig;

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

async function createToken(role: RbacRole, tenantId = 'tenant-a'): Promise<string> {
  return new SignJWT({
    scp: config.auth.requiredScope,
    oid: 'user-123',
    roles: [role],
    tid: tenantId
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

  const baseMiddleware = [authenticateRequest(config), injectTenantContext(config), requireScopes([config.auth.requiredScope])] as const;

  for (const resource of RBAC_RESOURCES) {
    for (const action of RBAC_ACTIONS) {
      const path = `/fixtures/${resource}/${action}`;
      const handler = (req: express.Request, res: express.Response) => {
        executedHandlers.push(`${resource}:${action}`);
        res.status(200).json({ resource, action, resourceId: req.params.resourceId ?? `${resource}-1` });
      };
      const middleware = authorizeRoute({ resource, action, resourceId: () => `${resource}-1` });

      switch (ACTION_METHODS[action]) {
        case 'get':
          app.get(path, ...baseMiddleware, middleware, handler);
          break;
        case 'post':
          app.post(path, ...baseMiddleware, middleware, handler);
          break;
        case 'put':
          app.put(path, ...baseMiddleware, middleware, handler);
          break;
        case 'delete':
          app.delete(path, ...baseMiddleware, middleware, handler);
          break;
      }
    }
  }

  return app;
}

describe('RBAC permissions matrix', () => {
  it.each(RBAC_ROLES)('enforces the full matrix for %s', async (role) => {
    const executedHandlers: string[] = [];
    const app = buildFixtureApp(executedHandlers);
    const token = await createToken(role);

    for (const resource of RBAC_RESOURCES) {
      for (const action of RBAC_ACTIONS) {
        const expectedAllowed = RBAC_MATRIX_FIXTURE[role][resource][action];
        const method = ACTION_METHODS[action];
        const response = await request(app)[method](`/fixtures/${resource}/${action}`).set('Authorization', `Bearer ${token}`);

        expect(response.status, `${role} ${resource}:${action}`).toBe(expectedAllowed ? 200 : 403);
        expect(executedHandlers.filter((entry) => entry === `${resource}:${action}`)).toHaveLength(expectedAllowed ? 1 : 0);
      }
    }
  });
});
