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

  it('does not let a member user trigger subscription lifecycle actions reserved for Admin and Owner', async () => {
    const tenantId = 'tenant-escalation-member-lifecycle';
    const subscription = await harness.createSubscriptionFixture({ tenantId, marketplaceToken: 'escalation-member-lifecycle' });
    const memberToken = await harness.createToken({
      tenantId,
      roles: ['Member'],
      scopes: [harness.config.auth.requiredScope]
    });

    const response = await request(harness.app)
      .post(`/v1/subscriptions/${subscription.id}/activate`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('AUTH_FORBIDDEN');
    expect(response.body.error.details.requiredRoles).toEqual(['Admin', 'Owner']);
    expect(response.body.error.details.tokenRoles).toEqual(['Member']);

    const ownerToken = await harness.createToken({
      tenantId,
      roles: ['Owner'],
      scopes: [harness.config.auth.requiredScope]
    });
    const ownerResponse = await request(harness.app)
      .get(`/v1/subscriptions/${subscription.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.data.status).toBe('PendingActivation');
  });

  it('does not let a viewer user trigger subscription lifecycle actions reserved for Admin and Owner', async () => {
    const tenantId = 'tenant-escalation-viewer-lifecycle';
    const subscription = await harness.createSubscriptionFixture({ tenantId, marketplaceToken: 'escalation-viewer-lifecycle' });
    const viewerToken = await harness.createToken({
      tenantId,
      roles: ['Viewer'],
      scopes: [harness.config.auth.requiredScope]
    });

    const response = await request(harness.app)
      .delete(`/v1/subscriptions/${subscription.id}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('AUTH_FORBIDDEN');
    expect(response.body.error.details.requiredRoles).toEqual(['Admin', 'Owner']);
    expect(response.body.error.details.tokenRoles).toEqual(['Viewer']);

    const ownerToken = await harness.createToken({
      tenantId,
      roles: ['Owner'],
      scopes: [harness.config.auth.requiredScope]
    });
    const ownerResponse = await request(harness.app)
      .get(`/v1/subscriptions/${subscription.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.data.status).toBe('PendingActivation');
  });
});
