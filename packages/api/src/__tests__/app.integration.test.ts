import { createSecretKey } from 'node:crypto';

import SwaggerParser from '@apidevtools/swagger-parser';
import { SignJWT } from 'jose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../app';
import { createConfig } from '../config';

const config = createConfig({
  API_PORT: '3001',
  JWT_AUDIENCE: 'api://fastsaas-tests',
  JWT_ISSUER: 'https://login.microsoftonline.com/fastsaas-test/v2.0/',
  JWT_REQUIRED_SCOPE: 'api:read',
  JWT_SECRET: 'integration-test-secret'
});

const app = createApp(config);
const signingKey = createSecretKey(Buffer.from(config.auth.secret, 'utf8'));

async function createToken(options?: { scope?: string; tenantId?: string }) {
  return new SignJWT({
    scope: options?.scope ?? config.auth.requiredScope,
    tenant_id: options?.tenantId ?? 'tenant-123',
    roles: ['member']
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(config.auth.issuer)
    .setAudience(config.auth.audience)
    .setSubject('user-123')
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

  it('returns 200 and tenant context for an authenticated request', async () => {
    const token = await createToken();
    const response = await request(app)
      .get('/v1/auth/context')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      tenantId: 'tenant-123',
      userId: 'user-123',
      scopes: [config.auth.requiredScope],
      roles: ['member']
    });
  });

  it('publishes an OpenAPI spec for the health and auth routes', async () => {
    const response = await request(app).get('/openapi.json');
    const document = await SwaggerParser.validate(response.body);

    expect(response.status).toBe(200);
    expect(document.paths).toHaveProperty('/health');
    expect(document.paths).toHaveProperty('/v1/auth/context');
  });
});
