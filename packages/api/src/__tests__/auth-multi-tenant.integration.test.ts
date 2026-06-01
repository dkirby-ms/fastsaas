import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app';
import { createConfig, type ApiConfig } from '../config';

let jwksServer: Server;
let signingKey: KeyLike;
let app: ReturnType<typeof createApp>;
let config: ApiConfig;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey) as JWK;

  jwk.alg = 'RS256';
  jwk.kid = 'multi-tenant-test-key-1';
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
    ENTRA_TENANT_ID: 'organizations',
    ENTRA_CLIENT_ID: 'fastsaas-tests-client',
    ENTRA_AUDIENCE: 'api://fastsaas-tests',
    ENTRA_JWKS_URI: `http://127.0.0.1:${port}/discovery/v2.0/keys`,
    JWT_REQUIRED_SCOPE: 'api:read'
  });
  app = createApp(config);
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

async function createToken(options?: { issuer?: string; tenantId?: string }) {
  const tenantId = options?.tenantId ?? '550e8400-e29b-41d4-a716-446655440000';

  return new SignJWT({
    scp: config.auth.requiredScope,
    tid: tenantId,
    oid: 'user-123',
    roles: ['Viewer']
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'multi-tenant-test-key-1' })
    .setIssuer(options?.issuer ?? `https://login.microsoftonline.com/${tenantId}/v2.0`)
    .setAudience(config.auth.audience[0])
    .setSubject('subject-123')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(signingKey);
}

describe('multi-tenant organizations authority', () => {
  it('accepts access tokens issued by external organization tenants', async () => {
    const tenantId = '550e8400-e29b-41d4-a716-446655440000';
    const token = await createToken({ tenantId });
    const response = await request(app)
      .get('/v1/auth/context')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      tenantId,
      userId: 'user-123',
      scopes: [config.auth.requiredScope],
      roles: ['Viewer']
    });
  });

  it.each([
    'https://login.microsoftonline.com/common/v2.0',
    'https://login.microsoftonline.com/consumers/v2.0',
    'https://login.microsoftonline.com/organizations/v2.0'
  ])('rejects special multi-tenant issuer %s', async (issuer) => {
    const token = await createToken({ issuer });
    const response = await request(app)
      .get('/v1/auth/context')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_UNAUTHORIZED');
    expect(response.body.error.message).toBe('Bearer token issuer is invalid');
  });

  it('rejects tokens whose issuer is not a Microsoft Entra tenant issuer', async () => {
    const token = await createToken({ issuer: 'https://issuer.invalid/customer-tenant-id/v2.0' });
    const response = await request(app)
      .get('/v1/auth/context')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_UNAUTHORIZED');
    expect(response.body.error.message).toBe('Bearer token issuer is invalid');
  });
});
