import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import SwaggerParser from '@apidevtools/swagger-parser';
import { exportJWK, generateKeyPair, SignJWT, type KeyLike, type JWK } from 'jose';
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
  jwk.kid = 'test-key-1';
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
    AZURE_AD_TENANT_ID: 'fastsaas-test-tenant',
    AZURE_AD_CLIENT_ID: 'fastsaas-tests-client',
    AZURE_AD_AUDIENCE: 'api://fastsaas-tests',
    AZURE_AD_ISSUER: 'https://login.microsoftonline.com/fastsaas-test-tenant/v2.0',
    AZURE_AD_JWKS_URI: `http://127.0.0.1:${port}/discovery/v2.0/keys`,
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

async function createToken(options?: { scope?: string; tenantId?: string; omitTenantId?: boolean }) {
  const payload: Record<string, unknown> = {
    scp: options?.scope ?? config.auth.requiredScope,
    oid: 'user-123',
    roles: ['member']
  };

  if (!options?.omitTenantId) {
    payload.tid = options?.tenantId ?? config.auth.azureTenantId;
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
    .setIssuer(config.auth.issuer)
    .setAudience(config.auth.audience[0])
    .setSubject('subject-123')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(signingKey);
}

describe('API foundation and auth baseline', () => {
  it('returns 401 when the bearer token is missing', async () => {
    const response = await request(app).get('/v1/auth/context');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('returns 403 when the token lacks the required scope', async () => {
    const token = await createToken({ scope: 'api:write' });
    const response = await request(app)
      .get('/v1/auth/context')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('AUTH_FORBIDDEN');
    expect(response.body.error.details.missingScopes).toEqual([config.auth.requiredScope]);
  });

  it('returns 403 when a valid token is missing tenant claims', async () => {
    const token = await createToken({ omitTenantId: true });
    const response = await request(app)
      .get('/v1/auth/context')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('AUTH_FORBIDDEN');
    expect(response.body.error.message).toBe('Tenant context is missing from the access token');
  });

  it('returns 200 and tenant context for an authenticated request', async () => {
    const token = await createToken();
    const response = await request(app)
      .get('/v1/auth/context')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      tenantId: config.auth.azureTenantId,
      userId: 'user-123',
      scopes: [config.auth.requiredScope],
      roles: ['member']
    });
  });

  it('sanitizes an invalid request id before echoing it back', async () => {
    const invalidRequestId = 'x'.repeat(129);
    const response = await request(app)
      .get('/health')
      .set('x-request-id', invalidRequestId);

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.headers['x-request-id']).not.toBe(invalidRequestId);
    expect(response.body.meta.requestId).toBe(response.headers['x-request-id']);
  });

  it('publishes an OpenAPI spec for the health and auth routes', async () => {
    const response = await request(app).get('/openapi.json');
    const document = await SwaggerParser.validate(response.body);

    expect(response.status).toBe(200);
    expect(document.paths).toHaveProperty('/health');
    expect(document.paths).toHaveProperty('/v1/auth/context');
  });
});
