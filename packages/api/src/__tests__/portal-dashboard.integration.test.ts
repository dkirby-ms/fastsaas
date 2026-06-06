import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
