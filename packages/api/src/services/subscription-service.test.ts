import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import type { MarketplaceFulfillmentClient, FulfillmentResolveResult } from '../lib/marketplace-fulfillment';
import { InMemorySubscriptionRepository } from '../repositories/subscription-repository';
import { SubscriptionService } from './subscription-service';

const subscribeInput = {
  tenantId: 'caller-tenant',
  userId: 'user-123',
  marketplaceToken: 'marketplace-token',
  requestId: 'req-123',
  correlationId: 'corr-123',
  source: 'api' as const,
  metadata: { source: 'unit-test' }
};

function createService(overrides: Partial<FulfillmentResolveResult> = {}) {
  const repository = new InMemorySubscriptionRepository();
  const resolvedSubscription: FulfillmentResolveResult = {
    marketplaceSubscriptionId: 'marketplace-subscription-123',
    planId: 'plan-growth',
    quantity: 10,
    offerId: 'offer-growth',
    purchaserTenantId: 'purchaser-tenant',
    beneficiaryTenantId: 'beneficiary-tenant',
    metadata: { fromResolve: true },
    ...overrides
  };
  const fulfillmentClient = {
    resolveSubscription: vi.fn().mockResolvedValue(resolvedSubscription),
    activateSubscription: vi.fn(),
    suspendSubscription: vi.fn(),
    unsubscribeSubscription: vi.fn(),
    updateSubscription: vi.fn(),
    reinstateSubscription: vi.fn()
  } satisfies MarketplaceFulfillmentClient;
  const info = vi.fn();
  const warn = vi.fn();
  const error = vi.fn();
  const logger = { info, warn, error } as unknown as Logger;
  const service = new SubscriptionService(repository, fulfillmentClient, logger);

  return {
    service,
    repository,
    fulfillmentClient,
    resolvedSubscription,
    loggerSpies: { info, warn, error }
  };
}

describe('SubscriptionService.subscribe', () => {
  it('binds the subscription tenant to beneficiaryTenantId when it differs from the caller tenant', async () => {
    const { service } = createService({ beneficiaryTenantId: 'beneficiary-tenant-a' });

    const subscription = await service.subscribe(subscribeInput);

    expect(subscription.tenantId).toBe('beneficiary-tenant-a');
    expect(subscription.beneficiaryTenantId).toBe('beneficiary-tenant-a');
  });

  it('falls back to the caller tenant when resolve omits beneficiaryTenantId', async () => {
    const { service, loggerSpies } = createService({ beneficiaryTenantId: undefined });

    const subscription = await service.subscribe(subscribeInput);

    expect(subscription.tenantId).toBe(subscribeInput.tenantId);
    expect(subscription.beneficiaryTenantId).toBeUndefined();
    expect(loggerSpies.warn).not.toHaveBeenCalled();
  });

  it('logs a warning when the caller tenant differs from beneficiaryTenantId', async () => {
    const { service, loggerSpies, resolvedSubscription } = createService({
      marketplaceSubscriptionId: 'marketplace-subscription-456',
      beneficiaryTenantId: 'beneficiary-tenant-b'
    });

    await service.subscribe(subscribeInput);

    expect(loggerSpies.warn).toHaveBeenCalledWith(
      {
        callerTenantId: subscribeInput.tenantId,
        beneficiaryTenantId: resolvedSubscription.beneficiaryTenantId,
        marketplaceSubscriptionId: resolvedSubscription.marketplaceSubscriptionId,
        requestId: subscribeInput.requestId
      },
      'Caller tenant differs from beneficiary tenant — using beneficiaryTenantId as subscription owner'
    );
  });
});
