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
      request(harness.app).get('/v1/operator/dashboard').set('Authorization', `Bearer ${ownerToken}`),
      request(harness.app).get('/v1/operator/dashboard').set('Authorization', `Bearer ${memberToken}`)
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
      .get('/v1/operator/dashboard')
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
      .post('/v1/operator/plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ id: 'growth', name: 'Growth', description: 'Default growth plan', status: 'active' });

    const subscriptionsResponse = await request(harness.app)
      .get('/v1/operator/subscriptions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(subscriptionsResponse.status).toBe(200);
    expect(subscriptionsResponse.body.data).toHaveLength(2);
    expect(subscriptionsResponse.body.data.every((subscription: { tenantId: string }) => subscription.tenantId === 'publisher-admin')).toBe(true);

    const updatePlanResponse = await request(harness.app)
      .put('/v1/operator/plans/growth')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Growth Plus',
        description: 'Updated publisher-managed growth plan.',
        status: 'active',
        marketplacePlanId: 'growth-plus',
        seatLimit: 50
      });

    expect(updatePlanResponse.status).toBe(200);
    expect(updatePlanResponse.body.data.plans.find((plan: { id: string }) => plan.id === 'growth')).toMatchObject({
      name: 'Growth Plus',
      marketplacePlanId: 'growth-plus',
      seatLimit: 50
    });

    const plansResponse = await request(harness.app)
      .get('/v1/operator/plans')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(plansResponse.status).toBe(200);
    expect(plansResponse.body.data.plans.find((plan: { id: string }) => plan.id === 'growth')).toMatchObject({
      name: 'Growth Plus',
      marketplacePlanId: 'growth-plus',
      seatLimit: 50
    });

    const dashboardResponse = await request(harness.app)
      .get('/v1/operator/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(dashboardResponse.status).toBe(200);
    expect(dashboardResponse.body.data).toMatchObject({
      activeTenants: 0,
      churnedTenants: 0,
      totalSeats: 0
    });
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
      .post('/v1/operator/plans')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ id: 'starter', name: 'Starter', description: 'Test plan', status: 'active' });
    await request(harness.app)
      .post('/v1/operator/plans')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ id: 'growth', name: 'Growth', description: 'Test plan', status: 'active' });

    const createResponse = await request(harness.app)
      .post('/v1/operator/tenants')
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
      .put(`/v1/operator/tenants/${tenantId}`)
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
      .post(`/v1/operator/tenants/${tenantId}/suspend`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(suspendResponse.status).toBe(200);
    expect(suspendResponse.body.data.status).toBe('suspended');

    const activateResponse = await request(harness.app)
      .post(`/v1/operator/tenants/${tenantId}/activate`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(activateResponse.status).toBe(200);
    expect(activateResponse.body.data.status).toBe('active');

    const cancelResponse = await request(harness.app)
      .post(`/v1/operator/tenants/${tenantId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.data.status).toBe('canceled');

    const dashboardAfterCancelResponse = await request(harness.app)
      .get('/v1/operator/dashboard')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(dashboardAfterCancelResponse.status).toBe(200);
    expect(dashboardAfterCancelResponse.body.data).toMatchObject({
      activeTenants: 0,
      churnedTenants: 1,
      totalSeats: 0
    });

    const detailResponse = await request(harness.app)
      .get(`/v1/operator/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.audit.length).toBeGreaterThanOrEqual(4);
    expect(detailResponse.body.data.subscriptionId).toBe(tenantId);
  });

  it('archives and unarchives publisher plans and hides archived plans by default', async () => {
    const adminToken = await harness.createToken({
      tenantId: 'publisher-archive-admin',
      roles: ['Admin'],
      scopes: [harness.config.auth.requiredScope]
    });

    const createResponse = await request(harness.app)
      .post('/v1/operator/plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ id: 'growth', name: 'Growth', description: 'Archive test plan', status: 'active' });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.status).toBe('active');

    const archiveResponse = await request(harness.app)
      .patch('/v1/operator/plans/growth/archive')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body.data).toMatchObject({
      id: 'growth',
      status: 'archived'
    });

    const activeOnlyResponse = await request(harness.app)
      .get('/v1/operator/plans')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(activeOnlyResponse.status).toBe(200);
    expect(activeOnlyResponse.body.data.plans.some((plan: { id: string }) => plan.id === 'growth')).toBe(false);

    const includeArchivedResponse = await request(harness.app)
      .get('/v1/operator/plans?includeArchived=true')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(includeArchivedResponse.status).toBe(200);
    expect(includeArchivedResponse.body.data.plans.find((plan: { id: string }) => plan.id === 'growth')).toMatchObject({
      id: 'growth',
      status: 'archived'
    });

    const unarchiveResponse = await request(harness.app)
      .patch('/v1/operator/plans/growth/unarchive')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(unarchiveResponse.status).toBe(200);
    expect(unarchiveResponse.body.data).toMatchObject({
      id: 'growth',
      status: 'active'
    });

    const restoredResponse = await request(harness.app)
      .get('/v1/operator/plans')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(restoredResponse.status).toBe(200);
    expect(restoredResponse.body.data.plans.find((plan: { id: string }) => plan.id === 'growth')).toMatchObject({
      id: 'growth',
      status: 'active'
    });
  });
});
