import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSecurityHarness, type SecurityHarness } from './test-harness';

let harness: SecurityHarness;

beforeAll(async () => {
  harness = await createSecurityHarness();
});

afterAll(async () => {
  await harness.close();
});

describe('privilege escalation security catalog', () => {
  it('does not let an elevated role bypass the metering write scope requirement', async () => {
    const token = await harness.createToken({
      tenantId: 'tenant-escalation-scope-write',
      roles: ['Admin'],
      scopes: [harness.config.auth.requiredScope]
    });

    const response = await request(harness.app)
      .post('/v1/metering/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventId: 'escalation-write-1',
        subscriptionId: 'subscription-1',
        planId: 'basic',
        dimensionId: 'api-calls',
        quantity: 1,
        timestamp: new Date().toISOString()
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('AUTH_FORBIDDEN');
    expect(response.body.error.details.missingScopes).toEqual([harness.config.metering.writeScope]);
  });

  it('does not let an elevated role bypass the metering read scope requirement', async () => {
    const token = await harness.createToken({
      tenantId: 'tenant-escalation-scope-read',
      roles: ['Owner'],
      scopes: [harness.config.auth.requiredScope]
    });

    const response = await request(harness.app)
      .get('/v1/metering/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.details.missingScopes).toEqual([harness.config.metering.readScope]);
  });

  it('does not let an elevated role bypass the baseline subscription scope requirement', async () => {
    const token = await harness.createToken({
      tenantId: 'tenant-escalation-subscriptions',
      roles: ['PublisherAdmin'],
      scopes: []
    });

    const response = await request(harness.app)
      .get('/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.details.missingScopes).toEqual([harness.config.auth.requiredScope]);
  });

  it.skip('TODO: member users must be denied subscription lifecycle actions once RBAC middleware lands', async () => {
    expect(true).toBe(true);
  });

  it.skip('TODO: viewer users must be denied publisher-only actions once the publisher surface ships', async () => {
    expect(true).toBe(true);
  });
});
