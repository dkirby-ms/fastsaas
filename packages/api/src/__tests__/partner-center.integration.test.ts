import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSecurityHarness, type SecurityHarness } from './security/test-harness';

let harness: SecurityHarness;

beforeAll(async () => {
  harness = await createSecurityHarness();
});

afterAll(async () => {
  await harness.close();
});

describe('partner center publisher routes', () => {
  it('connects, reports status, and disconnects a tenant-scoped Partner Center account', async () => {
    const adminToken = await harness.createToken({
      tenantId: 'publisher-admin',
      roles: ['Admin'],
      scopes: [harness.config.auth.requiredScope]
    });

    const connectResponse = await request(harness.app)
      .post('/v1/publisher/partner-center/connect')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        pcTenantId: 'partner-center-tenant',
        clientId: 'partner-center-client',
        authMode: 'CLIENT_SECRET',
        secretReference: 'env:PARTNER_CENTER_CLIENT_SECRET',
        rotationMetadata: {
          source: 'test-key-vault'
        },
        expiresAt: '2027-01-01T00:00:00.000Z'
      });

    expect(connectResponse.status).toBe(200);
    expect(connectResponse.body.data.connectionStatus).toBe('CONNECTED');
    expect(connectResponse.body.data.lastValidatedAt).toBeDefined();
    expect(connectResponse.body.data).not.toHaveProperty('secretReference');

    const statusResponse = await request(harness.app)
      .get('/v1/publisher/partner-center/status')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.data.connected).toBe(true);
    expect(statusResponse.body.data.connection.clientId).toBe('partner-center-client');
    expect(statusResponse.body.data.connection.connectionStatus).toBe('CONNECTED');

    const otherTenantToken = await harness.createToken({
      tenantId: 'publisher-other',
      roles: ['Admin'],
      scopes: [harness.config.auth.requiredScope]
    });
    const otherTenantStatus = await request(harness.app)
      .get('/v1/publisher/partner-center/status')
      .set('Authorization', `Bearer ${otherTenantToken}`);

    expect(otherTenantStatus.status).toBe(200);
    expect(otherTenantStatus.body.data.connected).toBe(false);
    expect(otherTenantStatus.body.data.connection).toBeUndefined();

    const disconnectResponse = await request(harness.app)
      .delete('/v1/publisher/partner-center/disconnect')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(disconnectResponse.status).toBe(200);
    expect(disconnectResponse.body.data).toEqual({ disconnected: true });

    const finalStatusResponse = await request(harness.app)
      .get('/v1/publisher/partner-center/status')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(finalStatusResponse.status).toBe(200);
    expect(finalStatusResponse.body.data.connected).toBe(false);
  });

  it('requires publisher admin access for partner center management routes', async () => {
    const memberToken = await harness.createToken({
      tenantId: 'publisher-member',
      roles: ['Member'],
      scopes: [harness.config.auth.requiredScope]
    });

    const response = await request(harness.app)
      .post('/v1/publisher/partner-center/connect')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        pcTenantId: 'partner-center-tenant',
        clientId: 'partner-center-client',
        authMode: 'CLIENT_SECRET',
        secretReference: 'env:PARTNER_CENTER_CLIENT_SECRET'
      });

    expect(response.status).toBe(403);
  });
});
