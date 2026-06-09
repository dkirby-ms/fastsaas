import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSecurityHarness, type SecurityHarness } from './test-harness';

interface BoundaryCase {
  role: 'Admin' | 'Owner' | 'Member' | 'Viewer';
  resource: string;
  action: string;
  method: 'get' | 'post';
  path: string;
  scopes: string[];
  expectedStatus: number;
}

interface LifecycleBoundaryCase {
  role: 'Admin' | 'Owner' | 'Member' | 'Viewer';
  action: 'activate' | 'suspend' | 'unsubscribe';
  initialStatus: 'PendingActivation' | 'Active';
  expectedStatus: number;
  expectedSubscriptionStatus: 'PendingActivation' | 'Active' | 'Suspended' | 'Unsubscribed';
}

const readBoundaryCases: BoundaryCase[] = [
  { role: 'Admin', resource: 'auth-context', action: 'read', method: 'get', path: '/v1/auth/context', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Owner', resource: 'auth-context', action: 'read', method: 'get', path: '/v1/auth/context', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Member', resource: 'auth-context', action: 'read', method: 'get', path: '/v1/auth/context', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Viewer', resource: 'auth-context', action: 'read', method: 'get', path: '/v1/auth/context', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Admin', resource: 'subscriptions', action: 'list', method: 'get', path: '/v1/subscriptions', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Owner', resource: 'subscriptions', action: 'list', method: 'get', path: '/v1/subscriptions', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Member', resource: 'subscriptions', action: 'list', method: 'get', path: '/v1/subscriptions', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Viewer', resource: 'subscriptions', action: 'list', method: 'get', path: '/v1/subscriptions', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Admin', resource: 'members', action: 'list', method: 'get', path: '/v1/members', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Owner', resource: 'members', action: 'list', method: 'get', path: '/v1/members', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Member', resource: 'members', action: 'list', method: 'get', path: '/v1/members', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Viewer', resource: 'members', action: 'list', method: 'get', path: '/v1/members', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Admin', resource: 'metering-dashboard', action: 'read', method: 'get', path: '/v1/metering/dashboard', scopes: ['metering:read'], expectedStatus: 200 },
  { role: 'Owner', resource: 'metering-dashboard', action: 'read', method: 'get', path: '/v1/metering/dashboard', scopes: ['metering:read'], expectedStatus: 200 },
  { role: 'Member', resource: 'metering-dashboard', action: 'read', method: 'get', path: '/v1/metering/dashboard', scopes: ['metering:read'], expectedStatus: 200 },
  { role: 'Viewer', resource: 'metering-dashboard', action: 'read', method: 'get', path: '/v1/metering/dashboard', scopes: ['metering:read'], expectedStatus: 200 },
  { role: 'Admin', resource: 'operator-dashboard', action: 'read', method: 'get', path: '/v1/operator/dashboard', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Owner', resource: 'operator-dashboard', action: 'read', method: 'get', path: '/v1/operator/dashboard', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Member', resource: 'operator-dashboard', action: 'read', method: 'get', path: '/v1/operator/dashboard', scopes: ['api:read'], expectedStatus: 403 },
  { role: 'Viewer', resource: 'operator-dashboard', action: 'read', method: 'get', path: '/v1/operator/dashboard', scopes: ['api:read'], expectedStatus: 403 }
];

const lifecycleBoundaryCases: LifecycleBoundaryCase[] = [
  { role: 'Admin', action: 'activate', initialStatus: 'PendingActivation', expectedStatus: 200, expectedSubscriptionStatus: 'Active' },
  { role: 'Owner', action: 'activate', initialStatus: 'PendingActivation', expectedStatus: 200, expectedSubscriptionStatus: 'Active' },
  { role: 'Member', action: 'activate', initialStatus: 'PendingActivation', expectedStatus: 403, expectedSubscriptionStatus: 'PendingActivation' },
  { role: 'Viewer', action: 'activate', initialStatus: 'PendingActivation', expectedStatus: 403, expectedSubscriptionStatus: 'PendingActivation' },
  { role: 'Admin', action: 'suspend', initialStatus: 'Active', expectedStatus: 200, expectedSubscriptionStatus: 'Suspended' },
  { role: 'Owner', action: 'suspend', initialStatus: 'Active', expectedStatus: 200, expectedSubscriptionStatus: 'Suspended' },
  { role: 'Member', action: 'suspend', initialStatus: 'Active', expectedStatus: 403, expectedSubscriptionStatus: 'Active' },
  { role: 'Viewer', action: 'suspend', initialStatus: 'Active', expectedStatus: 403, expectedSubscriptionStatus: 'Active' },
  { role: 'Admin', action: 'unsubscribe', initialStatus: 'PendingActivation', expectedStatus: 200, expectedSubscriptionStatus: 'Unsubscribed' },
  { role: 'Owner', action: 'unsubscribe', initialStatus: 'PendingActivation', expectedStatus: 200, expectedSubscriptionStatus: 'Unsubscribed' },
  { role: 'Member', action: 'unsubscribe', initialStatus: 'PendingActivation', expectedStatus: 403, expectedSubscriptionStatus: 'PendingActivation' },
  { role: 'Viewer', action: 'unsubscribe', initialStatus: 'PendingActivation', expectedStatus: 403, expectedSubscriptionStatus: 'PendingActivation' }
];

let harness: SecurityHarness;

beforeAll(async () => {
  harness = await createSecurityHarness();
});

afterAll(async () => {
  await harness.close();
});

async function seedLifecycleSubscription(tenantId: string, initialStatus: 'PendingActivation' | 'Active') {
  const subscription = await harness.createSubscriptionFixture({
    tenantId,
    marketplaceToken: `lifecycle-${tenantId}-${initialStatus.toLowerCase()}`
  });

  if (initialStatus === 'Active') {
    const ownerToken = await harness.createToken({
      tenantId,
      roles: ['Owner'],
      scopes: [harness.config.auth.requiredScope]
    });

    const activationResponse = await request(harness.app)
      .post(`/v1/subscriptions/${subscription.id}/activate`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(activationResponse.status).toBe(200);
  }

  return subscription;
}

function buildLifecyclePath(action: LifecycleBoundaryCase['action'], subscriptionId: string): { method: 'post' | 'delete'; path: string } {
  switch (action) {
    case 'activate':
      return { method: 'post', path: `/v1/subscriptions/${subscriptionId}/activate` };
    case 'suspend':
      return { method: 'post', path: `/v1/subscriptions/${subscriptionId}/suspend` };
    case 'unsubscribe':
      return { method: 'delete', path: `/v1/subscriptions/${subscriptionId}` };
    default: {
      const unsupportedAction: never = action;
      return unsupportedAction;
    }
  }
}

describe('RBAC boundary security catalog', () => {
  it.each(readBoundaryCases)(
    'allows $role to $action $resource when the required scope is present',
    async ({ role, method, path, scopes, expectedStatus }) => {
      const token = await harness.createToken({
        tenantId: `tenant-${role.toLowerCase()}`,
        roles: [role],
        scopes
      });

      const response =
        method === 'get'
          ? await request(harness.app).get(path).set('Authorization', `Bearer ${token}`)
          : await request(harness.app).post(path).set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(expectedStatus);
    }
  );

  it.each([
    { role: 'Admin', scopes: [], path: '/v1/auth/context', missingScopes: ['api:read'] },
    { role: 'Owner', scopes: ['api:read'], path: '/v1/metering/dashboard', missingScopes: ['metering:read'] },
    { role: 'Member', scopes: ['metering:read'], path: '/v1/subscriptions', missingScopes: ['api:read'] },
    { role: 'Viewer', scopes: ['api:read'], path: '/v1/metering/dashboard', missingScopes: ['metering:read'] }
  ])('denies $role when the route-specific scope is missing for $path', async ({ role, scopes, path, missingScopes }) => {
    const token = await harness.createToken({
      tenantId: `tenant-missing-${role.toLowerCase()}`,
      roles: [role],
      scopes
    });

    const response = await request(harness.app).get(path).set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error).not.toHaveProperty('details');
    expect(response.body.error.message).toContain('scope');
  });

  it('blocks member metering writes even when the metering write scope is present', async () => {
    const tenantId = 'tenant-member-metering-write';
    const subscription = await harness.createSubscriptionFixture({
      tenantId,
      marketplaceToken: 'member-metering-write-subscription'
    });
    const token = await harness.createToken({
      tenantId,
      roles: ['Member'],
      scopes: [harness.config.metering.writeScope]
    });

    const response = await request(harness.app)
      .post('/v1/metering/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventId: 'member-metering-write-event',
        subscriptionId: subscription.id,
        planId: subscription.planId,
        dimensionId: 'api-calls',
        quantity: 1,
        timestamp: new Date().toISOString()
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('AUTH_FORBIDDEN');
  });

  it.each(lifecycleBoundaryCases)(
    'enforces Admin/Owner-only subscription lifecycle access for $role on $action',
    async ({ role, action, initialStatus, expectedStatus, expectedSubscriptionStatus }) => {
      const tenantId = `tenant-lifecycle-${role.toLowerCase()}-${action}`;
      const subscription = await seedLifecycleSubscription(tenantId, initialStatus);
      const token = await harness.createToken({
        tenantId,
        roles: [role],
        scopes: [harness.config.auth.requiredScope]
      });
      const { method, path } = buildLifecyclePath(action, subscription.id);

      const response =
        method === 'delete'
          ? await request(harness.app).delete(path).set('Authorization', `Bearer ${token}`)
          : await request(harness.app).post(path).set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(expectedStatus);

      if (expectedStatus === 403) {
        expect(response.body.error.code).toBe('AUTH_FORBIDDEN');
        expect(response.body.error).not.toHaveProperty('details');
      }

      const ownerToken = await harness.createToken({
        tenantId,
        roles: ['Owner'],
        scopes: [harness.config.auth.requiredScope]
      });
      const verificationResponse = await request(harness.app)
        .get(`/v1/subscriptions/${subscription.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(verificationResponse.status).toBe(200);
      expect(verificationResponse.body.data.status).toBe(expectedSubscriptionStatus);
    }
  );

  it('blocks operator app roles from satisfying customer RBAC without tenant membership', async () => {
    await harness.createSubscriptionFixture({ tenantId: 'tenant-jwt-only-customer', marketplaceToken: 'jwt-only-customer' });

    const token = await harness.createToken({
      tenantId: 'tenant-jwt-only-customer',
      roles: ['Admin'],
      scopes: [harness.config.auth.requiredScope],
      seedTenantMembership: false,
      userId: 'jwt-only-user',
      subject: 'subject-jwt-only-user'
    });

    const response = await request(harness.app)
      .post('/v1/members/invite')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 'member-denied', email: 'member-denied@example.com', role: 'Member' });

    expect(response.status).toBe(403);
  });

  it('blocks member role promotion when an external customer lacks app roles', async () => {
    const tenantId = 'tenant-external-members';
    await harness.createSubscriptionFixture({ tenantId, marketplaceToken: 'members-bootstrap' });

    const ownerToken = await harness.createToken({
      tenantId,
      roles: [],
      scopes: [harness.config.auth.requiredScope]
    });
    const inviteResponse = await request(harness.app)
      .post('/v1/members/invite')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: 'member-1', email: 'member-1@example.com', role: 'Member' });

    expect(inviteResponse.status).toBe(201);

    const memberToken = await harness.createToken({
      tenantId,
      roles: [],
      userId: 'member-1',
      subject: 'subject-member-1',
      scopes: [harness.config.auth.requiredScope]
    });
    const promoteResponse = await request(harness.app)
      .patch(`/v1/members/${inviteResponse.body.data.id}/role`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ role: 'Admin' });

    expect(promoteResponse.status).toBe(403);
  });

  it('blocks viewer writes for tenant membership management', async () => {
    const tenantId = 'tenant-viewer-members';
    await harness.createSubscriptionFixture({ tenantId, marketplaceToken: 'viewer-bootstrap' });

    const ownerToken = await harness.createToken({
      tenantId,
      roles: [],
      scopes: [harness.config.auth.requiredScope]
    });
    const inviteResponse = await request(harness.app)
      .post('/v1/members/invite')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: 'viewer-1', email: 'viewer-1@example.com', role: 'Viewer' });

    expect(inviteResponse.status).toBe(201);

    const viewerToken = await harness.createToken({
      tenantId,
      roles: [],
      userId: 'viewer-1',
      subject: 'subject-viewer-1',
      scopes: [harness.config.auth.requiredScope]
    });
    const deleteResponse = await request(harness.app)
      .delete(`/v1/members/${inviteResponse.body.data.id}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(deleteResponse.status).toBe(403);
  });

  it.skip('TODO(#45): add staging-only RLS validation for audit-log and billing exports once tenant-scoped tables are deployed', async () => {
    expect(true).toBe(true);
  });
});
