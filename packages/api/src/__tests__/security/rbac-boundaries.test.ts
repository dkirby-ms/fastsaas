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

const readBoundaryCases: BoundaryCase[] = [
  { role: 'Admin', resource: 'auth-context', action: 'read', method: 'get', path: '/v1/auth/context', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Owner', resource: 'auth-context', action: 'read', method: 'get', path: '/v1/auth/context', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Member', resource: 'auth-context', action: 'read', method: 'get', path: '/v1/auth/context', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Viewer', resource: 'auth-context', action: 'read', method: 'get', path: '/v1/auth/context', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Admin', resource: 'subscriptions', action: 'list', method: 'get', path: '/v1/subscriptions', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Owner', resource: 'subscriptions', action: 'list', method: 'get', path: '/v1/subscriptions', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Member', resource: 'subscriptions', action: 'list', method: 'get', path: '/v1/subscriptions', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Viewer', resource: 'subscriptions', action: 'list', method: 'get', path: '/v1/subscriptions', scopes: ['api:read'], expectedStatus: 200 },
  { role: 'Admin', resource: 'metering-dashboard', action: 'read', method: 'get', path: '/v1/metering/dashboard', scopes: ['metering:read'], expectedStatus: 200 },
  { role: 'Owner', resource: 'metering-dashboard', action: 'read', method: 'get', path: '/v1/metering/dashboard', scopes: ['metering:read'], expectedStatus: 200 },
  { role: 'Member', resource: 'metering-dashboard', action: 'read', method: 'get', path: '/v1/metering/dashboard', scopes: ['metering:read'], expectedStatus: 200 },
  { role: 'Viewer', resource: 'metering-dashboard', action: 'read', method: 'get', path: '/v1/metering/dashboard', scopes: ['metering:read'], expectedStatus: 200 }
];

let harness: SecurityHarness;

beforeAll(async () => {
  harness = await createSecurityHarness();
});

afterAll(async () => {
  await harness.close();
});

describe('RBAC boundary security catalog', () => {
  it.each(readBoundaryCases)(
    'allows $role to $action $resource when the required scope is present',
    async ({ role, method, path, scopes, expectedStatus }) => {
      const token = await harness.createToken({
        tenantId: `tenant-${role.toLowerCase()}`,
        roles: [role],
        scopes
      });

      const response = method === 'get'
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

    const response = await request(harness.app)
      .get(path)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.details.missingScopes).toEqual(missingScopes);
  });

  it.skip('TODO: enforce the Phase 1.5 Admin/Owner-only lifecycle matrix once RBAC middleware ships', async () => {
    expect(true).toBe(true);
  });

  it.skip('TODO(#45): add staging-only RLS validation for audit-log and billing exports once tenant-scoped tables are deployed', async () => {
    expect(true).toBe(true);
  });
});
