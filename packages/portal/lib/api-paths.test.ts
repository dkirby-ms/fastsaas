import test from 'node:test';
import assert from 'node:assert/strict';
import { customerApiPaths, encodePathSegment, publisherAdminMockPaths, publisherAdminPaths } from './api-paths.ts';

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

test('publisher admin paths encode plan and tenant IDs for live APIs', () => {
  const planId = 'plan/basic?draft=true';
  const tenantId = 'tenant/abc?state=suspended';

  assert.equal(publisherAdminPaths.marketplacePlans, '/v1/publisher/marketplace-plans');
  assert.equal(publisherAdminPaths.plan(planId), '/v1/publisher/plans/plan%2Fbasic%3Fdraft%3Dtrue');
  assert.equal(publisherAdminPaths.tenant(tenantId), '/v1/publisher/tenants/tenant%2Fabc%3Fstate%3Dsuspended');
  assert.equal(
    publisherAdminPaths.tenantAction(tenantId, 'activate'),
    '/v1/publisher/tenants/tenant%2Fabc%3Fstate%3Dsuspended/activate',
  );
});

test('publisher admin mock paths encode tenant IDs identically', () => {
  const tenantId = 'sub/abc?next=cancel';

  assert.equal(publisherAdminMockPaths.marketplacePlans, '/publisher/marketplace-plans');
  assert.equal(
    publisherAdminMockPaths.tenantAction(tenantId, 'cancel'),
    '/publisher/tenants/sub%2Fabc%3Fnext%3Dcancel/cancel',
  );
});
