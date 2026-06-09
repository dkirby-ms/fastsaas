import test from 'node:test';
import assert from 'node:assert/strict';
import { customerApiPaths, encodePathSegment, operatorAdminMockPaths, operatorAdminPaths } from './api-paths.ts';

test('encodePathSegment escapes reserved URL characters', () => {
  assert.equal(encodePathSegment('tenant/a?b=c&d=e'), 'tenant%2Fa%3Fb%3Dc%26d%3De');
});

test('customer subscription paths encode malicious IDs', () => {
  const subscriptionId = 'sub/../evil?status=active';

  assert.equal(customerApiPaths.subscription(subscriptionId), '/v1/subscriptions/sub%2F..%2Fevil%3Fstatus%3Dactive');
  assert.equal(customerApiPaths.activateSubscription(subscriptionId), '/v1/subscriptions/sub%2F..%2Fevil%3Fstatus%3Dactive/activate');
});

test('portal action paths encode malicious IDs', () => {
  const actionId = 'rotate/keys?force=true';

  assert.equal(customerApiPaths.action(actionId), '/portal/actions/rotate%2Fkeys%3Fforce%3Dtrue');
});

test('operator admin paths encode plan and tenant IDs for live APIs', () => {
  const planId = 'plan/basic?draft=true';
  const tenantId = 'tenant/abc?state=suspended';

  assert.equal(operatorAdminPaths.marketplacePlans, '/v1/operator/marketplace-plans');
  assert.equal(operatorAdminPaths.plan(planId), '/v1/operator/plans/plan%2Fbasic%3Fdraft%3Dtrue');
  assert.equal(operatorAdminPaths.planArchive(planId), '/v1/operator/plans/plan%2Fbasic%3Fdraft%3Dtrue/archive');
  assert.equal(operatorAdminPaths.planUnarchive(planId), '/v1/operator/plans/plan%2Fbasic%3Fdraft%3Dtrue/unarchive');
  assert.equal(operatorAdminPaths.tenant(tenantId), '/v1/operator/tenants/tenant%2Fabc%3Fstate%3Dsuspended');
  assert.equal(
    operatorAdminPaths.tenantAction(tenantId, 'activate'),
    '/v1/operator/tenants/tenant%2Fabc%3Fstate%3Dsuspended/activate',
  );
});

test('operator admin mock paths encode tenant IDs identically', () => {
  const tenantId = 'sub/abc?next=cancel';

  assert.equal(operatorAdminMockPaths.marketplacePlans, '/operator/marketplace-plans');
  assert.equal(
    operatorAdminMockPaths.tenantAction(tenantId, 'cancel'),
    '/operator/tenants/sub%2Fabc%3Fnext%3Dcancel/cancel',
  );
});
