import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import type {
  FulfillmentOperationResult,
  FulfillmentResolveResult,
  MarketplaceFulfillmentClient
} from '../lib/marketplace-fulfillment';
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
  const getOperation = vi.fn<[string, string, string, string], Promise<FulfillmentOperationResult>>();
  const fulfillmentClient = {
    resolveSubscription: vi.fn().mockResolvedValue(resolvedSubscription),
    activateSubscription: vi.fn(),
    suspendSubscription: vi.fn(),
    unsubscribeSubscription: vi.fn(),
    updateSubscription: vi.fn(),
    reinstateSubscription: vi.fn(),
    getOperation,
    updateOperationStatus: vi.fn()
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

async function createActiveSubscription(service: SubscriptionService) {
  const subscription = await service.subscribe(subscribeInput);

  return service.activateSubscription({
    subscriptionId: subscription.id,
    tenantId: subscription.tenantId,
    requestId: 'req-activate',
    correlationId: 'corr-activate',
    source: 'api'
  });
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

describe('SubscriptionService marketplace update webhooks', () => {
  it('handles ChangePlan with audit trail and marketplace operation acknowledgement', async () => {
    const { service, fulfillmentClient, resolvedSubscription } = createService();
    const subscription = await createActiveSubscription(service);

    fulfillmentClient.getOperation.mockResolvedValue({
      id: 'op-change-plan',
      subscriptionId: resolvedSubscription.marketplaceSubscriptionId,
      action: 'ChangePlan',
      status: 'InProgress',
      planId: 'plan-scale',
      quantity: subscription.seats
    });

    const result = await service.processMarketplaceWebhook({
      action: 'ChangePlan',
      marketplaceSubscriptionId: resolvedSubscription.marketplaceSubscriptionId,
      operationId: 'op-change-plan',
      planId: 'plan-scale',
      idempotencyKey: 'webhook-change-plan',
      requestId: 'req-change-plan',
      correlationId: 'corr-change-plan'
    });

    expect(result.duplicate).toBe(false);
    expect(result.subscription.planId).toBe('plan-scale');
    expect(result.subscription.status).toBe('Active');
    expect(result.subscription.auditLog.at(-1)).toMatchObject({
      eventType: 'ChangePlan',
      fromStatus: 'Active',
      toStatus: 'Active',
      details: expect.objectContaining({
        operationId: 'op-change-plan',
        previousPlanId: 'plan-growth',
        nextPlanId: 'plan-scale'
      })
    });
    expect(fulfillmentClient.getOperation).toHaveBeenCalledWith(
      resolvedSubscription.marketplaceSubscriptionId,
      'op-change-plan',
      'req-change-plan',
      'corr-change-plan'
    );
    expect(fulfillmentClient.updateOperationStatus).toHaveBeenCalledWith(
      resolvedSubscription.marketplaceSubscriptionId,
      'op-change-plan',
      'Success',
      'req-change-plan',
      'corr-change-plan'
    );
  });

  it('handles ChangeQuantity with audit trail and marketplace operation acknowledgement', async () => {
    const { service, fulfillmentClient, resolvedSubscription } = createService();
    const subscription = await createActiveSubscription(service);

    fulfillmentClient.getOperation.mockResolvedValue({
      id: 'op-change-quantity',
      subscriptionId: resolvedSubscription.marketplaceSubscriptionId,
      action: 'ChangeQuantity',
      status: 'InProgress',
      planId: subscription.planId,
      quantity: 25
    });

    const result = await service.processMarketplaceWebhook({
      action: 'ChangeQuantity',
      marketplaceSubscriptionId: resolvedSubscription.marketplaceSubscriptionId,
      operationId: 'op-change-quantity',
      quantity: 25,
      idempotencyKey: 'webhook-change-quantity',
      requestId: 'req-change-quantity',
      correlationId: 'corr-change-quantity'
    });

    expect(result.duplicate).toBe(false);
    expect(result.subscription.seats).toBe(25);
    expect(result.subscription.auditLog.at(-1)).toMatchObject({
      eventType: 'ChangeQuantity',
      details: expect.objectContaining({
        operationId: 'op-change-quantity',
        previousSeats: 10,
        nextSeats: 25
      })
    });
    expect(fulfillmentClient.updateOperationStatus).toHaveBeenCalledWith(
      resolvedSubscription.marketplaceSubscriptionId,
      'op-change-quantity',
      'Success',
      'req-change-quantity',
      'corr-change-quantity'
    );
  });

  it('handles Transfer by rebinding tenant ownership and acknowledging the marketplace operation', async () => {
    const { service, fulfillmentClient, resolvedSubscription } = createService();
    await createActiveSubscription(service);

    fulfillmentClient.getOperation.mockResolvedValue({
      id: 'op-transfer',
      subscriptionId: resolvedSubscription.marketplaceSubscriptionId,
      action: 'Transfer',
      status: 'InProgress'
    });

    const result = await service.processMarketplaceWebhook({
      action: 'Transfer',
      marketplaceSubscriptionId: resolvedSubscription.marketplaceSubscriptionId,
      operationId: 'op-transfer',
      beneficiaryTenantId: 'beneficiary-tenant-b',
      idempotencyKey: 'webhook-transfer',
      requestId: 'req-transfer',
      correlationId: 'corr-transfer'
    });

    expect(result.duplicate).toBe(false);
    expect(result.subscription.tenantId).toBe('beneficiary-tenant-b');
    expect(result.subscription.beneficiaryTenantId).toBe('beneficiary-tenant-b');
    expect(result.subscription.auditLog.at(-1)).toMatchObject({
      eventType: 'Transfer',
      details: expect.objectContaining({
        operationId: 'op-transfer',
        previousTenantId: 'beneficiary-tenant',
        nextTenantId: 'beneficiary-tenant-b'
      })
    });
    expect(fulfillmentClient.updateOperationStatus).toHaveBeenCalledWith(
      resolvedSubscription.marketplaceSubscriptionId,
      'op-transfer',
      'Success',
      'req-transfer',
      'corr-transfer'
    );
  });
});
