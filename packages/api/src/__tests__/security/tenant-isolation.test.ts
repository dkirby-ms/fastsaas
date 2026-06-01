import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { REDACTED_MARKETPLACE_TOKEN } from '../../lib/marketplace-token-redaction';
import { createSecurityHarness, type SecurityHarness } from './test-harness';

const itIfRls = process.env.SECURITY_RLS_ENABLED === 'true' ? it : it.skip;

let harness: SecurityHarness;

beforeAll(async () => {
  harness = await createSecurityHarness();
});

afterAll(async () => {
  await harness.close();
});

describe('tenant isolation security catalog', () => {
  it('returns only subscriptions that belong to the authenticated tenant', async () => {
    const tenantId = 'tenant-list-a';
    const otherTenantId = 'tenant-list-b';

    const first = await harness.createSubscriptionFixture({ tenantId, marketplaceToken: 'list-a-1' });
    const second = await harness.createSubscriptionFixture({ tenantId, marketplaceToken: 'list-a-2' });
    await harness.createSubscriptionFixture({ tenantId: otherTenantId, marketplaceToken: 'list-b-1' });

    const token = await harness.createToken({ tenantId, scopes: [harness.config.auth.requiredScope] });
    const response = await request(harness.app)
      .get('/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.map((subscription: { id: string }) => subscription.id).sort()).toEqual([first.id, second.id].sort());
    expect(response.body.data.every((subscription: { tenantId: string }) => subscription.tenantId === tenantId)).toBe(true);
  });

  it('hides another tenant\'s subscription when fetched by id', async () => {
    const ownerTenantId = 'tenant-owner-read';
    const attackerTenantId = 'tenant-attacker-read';
    const victimSubscription = await harness.createSubscriptionFixture({
      tenantId: ownerTenantId,
      marketplaceToken: 'victim-read-1'
    });

    const attackerToken = await harness.createToken({
      tenantId: attackerTenantId,
      scopes: [harness.config.auth.requiredScope]
    });

    const response = await request(harness.app)
      .get(`/v1/subscriptions/${victimSubscription.id}`)
      .set('Authorization', `Bearer ${attackerToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.message).toBe('Subscription was not found');
  });

  it('redacts marketplace purchase tokens from subscription responses', async () => {
    const tenantId = 'tenant-token-redaction';
    const rawMarketplaceToken = 'marketplace-secret-token';
    const createdSubscription = await harness.createSubscriptionFixture({
      tenantId,
      marketplaceToken: rawMarketplaceToken,
      metadata: {
        marketplaceToken: rawMarketplaceToken,
        nested: {
          marketplaceToken: rawMarketplaceToken
        }
      }
    });
    const token = await harness.createToken({
      tenantId,
      scopes: [harness.config.auth.requiredScope],
      roles: ['Owner']
    });

    expect(createdSubscription.metadata.marketplaceToken).toBe(REDACTED_MARKETPLACE_TOKEN);
    expect((createdSubscription.metadata.nested as { marketplaceToken: string }).marketplaceToken).toBe(
      REDACTED_MARKETPLACE_TOKEN
    );
    expect(createdSubscription.auditLog[0]?.details.marketplaceToken).toBe(REDACTED_MARKETPLACE_TOKEN);

    const subscriptionResponse = await request(harness.app)
      .get(`/v1/subscriptions/${createdSubscription.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(subscriptionResponse.status).toBe(200);
    expect(subscriptionResponse.body.data.metadata.marketplaceToken).toBe(REDACTED_MARKETPLACE_TOKEN);
    expect(subscriptionResponse.body.data.metadata.nested.marketplaceToken).toBe(REDACTED_MARKETPLACE_TOKEN);
    expect(subscriptionResponse.body.data.auditLog[0].details.marketplaceToken).toBe(REDACTED_MARKETPLACE_TOKEN);
  });

  it('blocks cross-tenant subscription state changes and preserves the owner record', async () => {
    const ownerTenantId = 'tenant-owner-write';
    const attackerTenantId = 'tenant-attacker-write';
    const victimSubscription = await harness.createSubscriptionFixture({
      tenantId: ownerTenantId,
      marketplaceToken: 'victim-write-1'
    });

    const attackerToken = await harness.createToken({
      tenantId: attackerTenantId,
      scopes: [harness.config.auth.requiredScope]
    });

    const attackResponse = await request(harness.app)
      .post(`/v1/subscriptions/${victimSubscription.id}/activate`)
      .set('Authorization', `Bearer ${attackerToken}`);

    expect(attackResponse.status).toBe(404);
    expect(attackResponse.body.error.code).toBe('NOT_FOUND');

    const ownerToken = await harness.createToken({
      tenantId: ownerTenantId,
      scopes: [harness.config.auth.requiredScope]
    });
    const ownerResponse = await request(harness.app)
      .get(`/v1/subscriptions/${victimSubscription.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.data.status).toBe('PendingActivation');
  });

  it('keeps metering dashboard counts tenant-scoped even when multiple tenants ingest usage', async () => {
    const tenantA = 'tenant-meter-a';
    const tenantB = 'tenant-meter-b';

    await harness.ingestUsageEventFixture({
      tenantId: tenantA,
      body: { subscriptionId: 'tenant-a-subscription', eventId: 'tenant-a-event-1' }
    });
    await harness.ingestUsageEventFixture({
      tenantId: tenantB,
      body: { subscriptionId: 'tenant-b-subscription', eventId: 'tenant-b-event-1' }
    });
    await harness.ingestUsageEventFixture({
      tenantId: tenantB,
      body: { subscriptionId: 'tenant-b-subscription', eventId: 'tenant-b-event-2' }
    });

    const tenantAToken = await harness.createToken({ tenantId: tenantA, scopes: [harness.config.metering.readScope] });
    const tenantBToken = await harness.createToken({ tenantId: tenantB, scopes: [harness.config.metering.readScope] });

    const [tenantAResponse, tenantBResponse] = await Promise.all([
      request(harness.app).get('/v1/metering/dashboard').set('Authorization', `Bearer ${tenantAToken}`),
      request(harness.app).get('/v1/metering/dashboard').set('Authorization', `Bearer ${tenantBToken}`)
    ]);

    expect(tenantAResponse.status).toBe(200);
    expect(tenantAResponse.body.data.pendingCount).toBe(1);
    expect(tenantBResponse.status).toBe(200);
    expect(tenantBResponse.body.data.pendingCount).toBe(2);
  });

  itIfRls('TODO(#45): verifies database-level RLS blocks direct cross-tenant reads in staging', async () => {
    expect(process.env.SECURITY_RLS_ENABLED).toBe('true');
  });
});
