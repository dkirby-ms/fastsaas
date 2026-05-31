import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSecurityHarness, type SecurityHarness } from './test-harness';

function tamperJwtPayload(token: string, claims: Record<string, unknown>): string {
  const [header, payload, signature] = token.split('.');
  const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
  const tamperedPayload = Buffer.from(JSON.stringify({
    ...decodedPayload,
    ...claims
  })).toString('base64url');

  return `${header}.${tamperedPayload}.${signature}`;
}

let harness: SecurityHarness;

beforeAll(async () => {
  harness = await createSecurityHarness();
});

afterAll(async () => {
  await harness.close();
});

describe('JWT tampering security catalog', () => {
  it('rejects a token whose tenant claim targets a different tenant', async () => {
    const token = await harness.createToken({
      tenantId: 'tenant-forged',
      issuerTenantId: 'tenant-forged',
      scopes: [harness.config.auth.requiredScope]
    });

    const response = await request(harness.app)
      .get('/v1/auth/context')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('AUTH_FORBIDDEN');
    expect(response.body.error.message).toBe('The access token was issued for a different tenant');
  });

  it('rejects an expired token', async () => {
    const token = await harness.createToken({
      tenantId: harness.config.auth.azureTenantId,
      scopes: [harness.config.auth.requiredScope],
      expiresIn: '-1m'
    });

    const response = await request(harness.app)
      .get('/v1/auth/context')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('rejects a token missing all tenant claims', async () => {
    const token = await harness.createToken({
      omitTenantId: true,
      scopes: [harness.config.auth.requiredScope]
    });

    const response = await request(harness.app)
      .get('/v1/auth/context')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.message).toBe('Tenant context is missing from the access token');
  });

  it('rejects a token missing both subject and object identifier claims', async () => {
    const token = await harness.createToken({
      tenantId: harness.config.auth.azureTenantId,
      scopes: [harness.config.auth.requiredScope],
      omitSubject: true
    });

    const response = await request(harness.app)
      .get('/v1/auth/context')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Token subject claim is required');
  });

  it('rejects a token whose payload was modified without resigning it', async () => {
    const validToken = await harness.createToken({
      tenantId: harness.config.auth.azureTenantId,
      scopes: [harness.config.auth.requiredScope]
    });
    const tamperedToken = tamperJwtPayload(validToken, { roles: ['Admin'], tid: 'tenant-escalated' });

    const response = await request(harness.app)
      .get('/v1/auth/context')
      .set('Authorization', `Bearer ${tamperedToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_UNAUTHORIZED');
  });
});
