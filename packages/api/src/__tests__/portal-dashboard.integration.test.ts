import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createSecurityHarness, type SecurityHarness } from './security/test-harness';

describe('GET /portal/dashboard', () => {
  let harness: SecurityHarness;

  beforeAll(async () => {
    harness = await createSecurityHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('returns 200 with a null subscription when the authenticated tenant has no subscription', async () => {
    const token = await harness.createToken({
      tenantId: 'tenant-without-subscription',
      userId: 'customer-no-sub',
      additionalClaims: {
        email: 'customer-no-sub@example.com',
        name: 'No Subscription Customer'
      }
    });

    const response = await request(harness.app)
      .get('/portal/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      user: {
        id: 'customer-no-sub',
        name: 'No Subscription Customer',
        email: 'customer-no-sub@example.com',
        company: ''
      },
      subscription: null,
      usage: null,
      actions: []
    });
  });

  it('returns dashboard subscription data when the tenant has a subscription', async () => {
    await harness.publisherPlanRepository.savePlan({
      publisherTenantId: 'publisher-tenant',
      id: 'growth-linked',
      name: 'Growth Linked',
      description: 'Linked marketplace growth plan.',
      status: 'active',
      features: ['25 seats included'],
      marketplacePlanId: 'growth',
      seatLimit: 25
    });
    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        harness.tenantMemberRepository.upsertByTenantAndUserId({
          tenantId: 'tenant-with-subscription',
          userId: `member-${index + 1}`,
          email: `member-${index + 1}@example.com`,
          role: 'Member'
        })
      )
    );

    await harness.createSubscriptionFixture({
      tenantId: 'tenant-with-subscription',
      planId: 'growth',
      seats: 12,
      metadata: {
        planName: 'Growth',
        billingCycle: 'annual',
        amount: '$249',
        company: 'Contoso Ltd'
      }
    });

    const token = await harness.createToken({
      tenantId: 'tenant-with-subscription',
      userId: 'customer-with-sub',
      additionalClaims: {
        email: 'customer-with-sub@example.com',
        name: 'Subscribed Customer'
      }
    });

    const response = await request(harness.app)
      .get('/portal/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: 'customer-with-sub',
      name: 'Subscribed Customer',
      email: 'customer-with-sub@example.com',
      company: 'Contoso Ltd'
    });
    expect(response.body.subscription).toMatchObject({
      tenantId: 'tenant-with-subscription',
      state: 'trialing',
      planId: 'growth',
      planName: 'Growth Linked',
      billingCycle: 'annual',
      amount: '$249'
    });
    expect(response.body.usage).toEqual({
      activeMembers: 8,
      seatsPurchased: 12,
      seatLimit: 25,
      apiRequestsThisMonth: 62400
    });
    expect(response.body.actions).toEqual([]);
  });
});

describe('portal settings and plans routes', () => {
  let harness: SecurityHarness;

  beforeEach(async () => {
    harness = await createSecurityHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('returns auth-derived settings for the current customer', async () => {
    await harness.createSubscriptionFixture({
      tenantId: 'tenant-settings',
      metadata: {
        company: 'Contoso Settings'
      }
    });

    const token = await harness.createToken({
      tenantId: 'tenant-settings',
      userId: 'settings-user',
      additionalClaims: {
        email: 'settings@example.com',
        name: 'Settings User'
      }
    });

    const response = await request(harness.app)
      .get('/portal/settings')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      displayName: 'Settings User',
      email: 'settings@example.com',
      company: 'Contoso Settings',
      timezone: 'America/Chicago',
      notificationsEnabled: true
    });
  });

  it('echoes updated settings without persisting them', async () => {
    const token = await harness.createToken({
      tenantId: 'tenant-settings-update',
      userId: 'settings-user-update',
      additionalClaims: {
        email: 'settings-update@example.com',
        name: 'Settings User Update'
      }
    });

    const payload = {
      displayName: 'Updated Name',
      email: 'updated@example.com',
      company: 'Updated Co',
      timezone: 'America/Los_Angeles',
      notificationsEnabled: false
    };

    const response = await request(harness.app)
      .put('/portal/settings')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
  });

  it('returns active plans and the current marketplace plan selection', async () => {
    await harness.publisherPlanRepository.savePlan({
      publisherTenantId: 'publisher-tenant',
      id: 'starter',
      name: 'Starter',
      description: 'Starter plan',
      status: 'active',
      features: ['Up to 10 team members'],
      marketplacePlanId: 'starter',
      seatLimit: 10
    });
    await harness.publisherPlanRepository.savePlan({
      publisherTenantId: 'publisher-tenant',
      id: 'growth',
      name: 'Growth',
      description: 'Growth plan',
      status: 'active',
      features: ['Up to 25 team members', 'Priority support'],
      marketplacePlanId: 'growth',
      seatLimit: 25
    });
    await harness.publisherPlanRepository.savePlan({
      publisherTenantId: 'publisher-tenant',
      id: 'scale',
      name: 'Scale',
      description: 'Scale plan',
      status: 'active',
      features: ['Unlimited team members'],
      marketplacePlanId: 'scale',
      seatLimit: null
    });
    await harness.publisherPlanRepository.savePlan({
      publisherTenantId: 'publisher-tenant',
      id: 'legacy',
      name: 'Legacy',
      description: 'Archived legacy plan',
      status: 'archived',
      features: ['Legacy support'],
      marketplacePlanId: 'legacy',
      seatLimit: 5
    });
    await harness.createSubscriptionFixture({
      tenantId: 'tenant-plans',
      planId: 'growth'
    });

    const token = await harness.createToken({
      tenantId: 'tenant-plans',
      userId: 'plans-user',
      additionalClaims: {
        email: 'plans@example.com'
      }
    });

    const response = await request(harness.app)
      .get('/portal/plans')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.currentPlanId).toBe('growth');
    expect(response.body.availablePlans).toEqual([
      {
        id: 'starter',
        name: 'Starter',
        description: 'Starter plan',
        pricingSummary: null,
        features: [{ label: 'Up to 10 team members', included: true }]
      },
      {
        id: 'growth',
        name: 'Growth',
        description: 'Growth plan',
        pricingSummary: null,
        recommended: true,
        features: [
          { label: 'Up to 25 team members', included: true },
          { label: 'Priority support', included: true }
        ]
      },
      {
        id: 'scale',
        name: 'Scale',
        description: 'Scale plan',
        pricingSummary: null,
        features: [{ label: 'Unlimited team members', included: true }]
      }
    ]);
  });

  it('returns a simulated updated plan selection', async () => {
    await harness.publisherPlanRepository.savePlan({
      publisherTenantId: 'publisher-tenant',
      id: 'starter-post',
      name: 'Starter Post',
      description: 'Starter post plan',
      status: 'active',
      features: [],
      marketplacePlanId: 'starter-post',
      seatLimit: 10
    });
    await harness.publisherPlanRepository.savePlan({
      publisherTenantId: 'publisher-tenant',
      id: 'growth-post',
      name: 'Growth Post',
      description: 'Growth post plan',
      status: 'active',
      features: [],
      marketplacePlanId: 'growth-post',
      seatLimit: 25
    });

    const token = await harness.createToken({
      tenantId: 'tenant-plans-post',
      userId: 'plans-post-user',
      additionalClaims: {
        email: 'plans-post@example.com'
      }
    });

    const response = await request(harness.app)
      .post('/portal/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: 'starter-post' });

    expect(response.status).toBe(200);
    expect(response.body.currentPlanId).toBe('starter-post');
    expect(response.body.availablePlans).toEqual([
      {
        id: 'starter-post',
        name: 'Starter Post',
        description: 'Starter post plan',
        pricingSummary: null,
        features: []
      },
      {
        id: 'growth-post',
        name: 'Growth Post',
        description: 'Growth post plan',
        pricingSummary: null,
        recommended: true,
        features: []
      }
    ]);
  });
});
