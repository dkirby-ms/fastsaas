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

describe('publisher administration routes', () => {
  it('enforces Admin and Owner access on publisher routes', async () => {
    const ownerToken = await harness.createToken({
      tenantId: 'publisher-tenant',
      roles: ['Owner'],
      scopes: [harness.config.auth.requiredScope]
    });
    const memberToken = await harness.createToken({
      tenantId: 'publisher-tenant',
      roles: ['Member'],
      scopes: [harness.config.auth.requiredScope]
    });

    const [ownerResponse, memberResponse] = await Promise.all([
      request(harness.app).get('/v1/publisher/dashboard').set('Authorization', `Bearer ${ownerToken}`),
      request(harness.app).get('/v1/publisher/dashboard').set('Authorization', `Bearer ${memberToken}`)
    ]);

    expect(ownerResponse.status).toBe(200);
    expect(memberResponse.status).toBe(403);
    expect(memberResponse.body.error).not.toHaveProperty('details');
  });

  it('rejects tenant-membership-only access on publisher routes', async () => {
    await harness.createSubscriptionFixture({ tenantId: 'publisher-membership-only', marketplaceToken: 'publisher-membership-only' });

    const membershipOnlyToken = await harness.createToken({
      tenantId: 'publisher-membership-only',
      roles: [],
      scopes: [harness.config.auth.requiredScope]
    });

    const response = await request(harness.app)
      .get('/v1/publisher/dashboard')
      .set('Authorization', `Bearer ${membershipOnlyToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error).not.toHaveProperty('details');
  });

  it('scopes publisher subscriptions to the actor tenant and overlays publisher plan updates', async () => {
    await harness.createSubscriptionFixture({ tenantId: 'publisher-admin', marketplaceToken: 'publisher-fixture-a', planId: 'starter' });
    await harness.createSubscriptionFixture({ tenantId: 'publisher-admin', marketplaceToken: 'publisher-fixture-b', planId: 'growth' });
    await harness.createSubscriptionFixture({ tenantId: 'customer-tenant-a', marketplaceToken: 'publisher-fixture-hidden', planId: 'scale' });

    const adminToken = await harness.createToken({
      tenantId: 'publisher-admin',
      roles: ['Admin'],
      scopes: [harness.config.auth.requiredScope]
    });

    // Create the plan so the update succeeds (no longer seeded by defaults)
    await request(harness.app)
      .post('/v1/publisher/plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ id: 'growth', name: 'Growth', description: 'Default growth plan', status: 'active' });

    const subscriptionsResponse = await request(harness.app)
      .get('/v1/publisher/subscriptions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(subscriptionsResponse.status).toBe(200);
    expect(subscriptionsResponse.body.data).toHaveLength(2);
    expect(subscriptionsResponse.body.data.every((subscription: { tenantId: string }) => subscription.tenantId === 'publisher-admin')).toBe(true);

    const updatePlanResponse = await request(harness.app)
      .put('/v1/publisher/plans/growth')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Growth Plus',
        description: 'Updated publisher-managed growth plan.',
        status: 'active'
      });

    expect(updatePlanResponse.status).toBe(200);
    expect(updatePlanResponse.body.data.plans.find((plan: { id: string }) => plan.id === 'growth')?.name).toBe('Growth Plus');

    const dashboardResponse = await request(harness.app)
      .get('/v1/publisher/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(dashboardResponse.status).toBe(200);
    expect(dashboardResponse.body.data.subscriptionCount).toBe(2);
    expect(dashboardResponse.body.data.plans.some((plan: { planName: string }) => plan.planName === 'Growth Plus')).toBe(true);
  });

  it('creates, updates, and transitions managed tenants', async () => {
    const ownerToken = await harness.createToken({
      tenantId: 'publisher-owner',
      roles: ['Owner'],
      scopes: [harness.config.auth.requiredScope]
    });

    // Create plans needed by this test (no longer seeded by defaults)
    await request(harness.app)
      .post('/v1/publisher/plans')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ id: 'starter', name: 'Starter', description: 'Test plan', status: 'active' });
    await request(harness.app)
      .post('/v1/publisher/plans')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ id: 'growth', name: 'Growth', description: 'Test plan', status: 'active' });

    const createResponse = await request(harness.app)
      .post('/v1/publisher/tenants')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        displayName: 'Contoso Ltd',
        primaryDomain: 'contoso.example',
        planId: 'starter',
        seats: 12,
        status: 'trialing'
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.displayName).toBe('Contoso Ltd');
    expect(createResponse.body.data.status).toBe('trialing');
    expect(createResponse.body.data.subscriptionId).toBeDefined();

    const tenantId = createResponse.body.data.id as string;
    const updateResponse = await request(harness.app)
      .put(`/v1/publisher/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        displayName: 'Contoso Europe',
        primaryDomain: 'eu.contoso.example',
        planId: 'growth',
        seats: 24,
        status: 'past_due'
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.planId).toBe('growth');
    expect(updateResponse.body.data.status).toBe('past_due');

    const suspendResponse = await request(harness.app)
      .post(`/v1/publisher/tenants/${tenantId}/suspend`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(suspendResponse.status).toBe(200);
    expect(suspendResponse.body.data.status).toBe('suspended');

    const activateResponse = await request(harness.app)
      .post(`/v1/publisher/tenants/${tenantId}/activate`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(activateResponse.status).toBe(200);
    expect(activateResponse.body.data.status).toBe('active');

    const cancelResponse = await request(harness.app)
      .post(`/v1/publisher/tenants/${tenantId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.data.status).toBe('canceled');

    const detailResponse = await request(harness.app)
      .get(`/v1/publisher/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.audit.length).toBeGreaterThanOrEqual(4);
    expect(detailResponse.body.data.subscriptionId).toBe(tenantId);
  });
});
