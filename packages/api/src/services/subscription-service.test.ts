import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import type {
  FulfillmentOperationResult,
  FulfillmentResolveResult,
  MarketplaceFulfillmentClient
} from '../lib/marketplace-fulfillment';
import { InMemorySubscriptionRepository } from '../repositories/subscription-repository';
import { InMemoryTenantMemberRepository } from '../repositories/tenant-member-repository';
import { SubscriptionService } from './subscription-service';
import { TenantMemberService } from './tenant-member-service';

const subscribeInput = {
  tenantId: 'caller-tenant',
  userId: 'user-123',
  userEmail: 'owner@example.com',
  marketplaceToken: 'marketplace-token',
  requestId: 'req-123',
  correlationId: 'corr-123',
  source: 'api' as const,
  metadata: { source: 'unit-test' }
};

function createService(overrides: Partial<FulfillmentResolveResult> = {}) {
  const repository = new InMemorySubscriptionRepository();
  const tenantMemberRepository = new InMemoryTenantMemberRepository();
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
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis()
  } as unknown as Logger;
  const tenantMemberService = new TenantMemberService(tenantMemberRepository, logger);
  const service = new SubscriptionService(repository, fulfillmentClient, logger, tenantMemberService);

  return {
    service,
    repository,
    loggerSpies: logger,
    resolvedSubscription,
    tenantMemberRepository
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

  it('bootstraps the caller as tenant owner when the beneficiary tenant has no owner', async () => {
    const { service, tenantMemberRepository } = createService({ beneficiaryTenantId: 'beneficiary-tenant-c' });

    await service.subscribe(subscribeInput);

    const member = await tenantMemberRepository.findByTenantAndUserId('beneficiary-tenant-c', subscribeInput.userId);
    expect(member?.role).toBe('Owner');
    expect(member?.email).toBe(subscribeInput.userEmail);
  });

  it('does not overwrite an existing tenant owner during bootstrap', async () => {
    const { service, tenantMemberRepository } = createService({ beneficiaryTenantId: 'beneficiary-tenant-d' });
    await tenantMemberRepository.create({
      tenantId: 'beneficiary-tenant-d',
      userId: 'existing-owner',
      email: 'existing-owner@example.com',
      role: 'Owner'
    });

    await service.subscribe(subscribeInput);

    const existingOwner = await tenantMemberRepository.findByTenantAndUserId('beneficiary-tenant-d', 'existing-owner');
    const caller = await tenantMemberRepository.findByTenantAndUserId('beneficiary-tenant-d', subscribeInput.userId);

    expect(existingOwner?.role).toBe('Owner');
    expect(caller).toBeNull();
  });
});

describe('SubscriptionService.processMarketplaceWebhook', () => {
  it('acknowledges Subscribe webhooks when the subscription is not yet stored locally', async () => {
    const { service, repository, loggerSpies } = createService();

    const result = await service.processMarketplaceWebhook({
      action: 'Subscribe',
      marketplaceSubscriptionId: 'missing-marketplace-subscription',
      idempotencyKey: 'marketplace:event-subscribe',
      requestId: 'req-subscribe',
      correlationId: 'corr-subscribe'
    });

    expect(result).toEqual({
      subscription: undefined,
      duplicate: false,
      acknowledgedWithoutAction: true
    });
    expect(loggerSpies.info).toHaveBeenCalledWith(
      {
        action: 'Subscribe',
        marketplaceSubscriptionId: 'missing-marketplace-subscription',
        requestId: 'req-subscribe',
        correlationId: 'corr-subscribe'
      },
      'Received Subscribe webhook for subscription missing-marketplace-subscription not yet in local database — acknowledging without action.'
    );

    await expect(repository.findWebhookEventByIdempotencyKey('marketplace:event-subscribe')).resolves.toMatchObject({
      status: 'processed',
      action: 'Subscribe',
      marketplaceSubscriptionId: 'missing-marketplace-subscription',
      payload: expect.objectContaining({
        noop: true,
        subscriptionFound: false
      })
    });
  });

  it('acknowledges non-creation webhooks when the subscription is missing locally', async () => {
    const { service, repository, loggerSpies } = createService();

    const result = await service.processMarketplaceWebhook({
      action: 'Suspend',
      marketplaceSubscriptionId: 'missing-marketplace-subscription',
      idempotencyKey: 'marketplace:event-suspend',
      requestId: 'req-suspend',
      correlationId: 'corr-suspend'
    });

    expect(result).toEqual({
      subscription: undefined,
      duplicate: false,
      acknowledgedWithoutAction: true
    });
    expect(loggerSpies.warn).toHaveBeenCalledWith(
      {
        action: 'Suspend',
        marketplaceSubscriptionId: 'missing-marketplace-subscription',
        requestId: 'req-suspend',
        correlationId: 'corr-suspend'
      },
      'Received Suspend webhook for subscription missing-marketplace-subscription not found in local database — acknowledging without action.'
    );

    await expect(repository.findWebhookEventByIdempotencyKey('marketplace:event-suspend')).resolves.toMatchObject({
      status: 'failed',
      action: 'Suspend',
      marketplaceSubscriptionId: 'missing-marketplace-subscription',
      payload: expect.objectContaining({
        noop: true,
        subscriptionFound: false
      })
    });
  });

  it('reprocesses a missing-subscription mutating webhook once the subscription exists locally', async () => {
    const { service, repository } = createService();
    const idempotencyKey = 'marketplace:event-suspend-retry';

    await service.processMarketplaceWebhook({
      action: 'Suspend',
      marketplaceSubscriptionId: 'missing-marketplace-subscription',
      idempotencyKey,
      requestId: 'req-suspend-missing',
      correlationId: 'corr-suspend-missing'
    });

    const createdSubscription = await repository.createManagedSubscription({
      tenantId: 'tenant-suspend',
      marketplaceSubscriptionId: 'missing-marketplace-subscription',
      planId: 'plan-growth',
      seats: 10,
      status: 'Active',
      correlationId: 'corr-create-suspend',
      metadata: {},
      auditEntry: {
        id: 'audit-suspend-create',
        subscriptionId: 'placeholder',
        eventType: 'Subscribe',
        source: 'api',
        fromStatus: null,
        toStatus: 'Active',
        correlationId: 'corr-create-suspend',
        requestId: 'req-create-suspend',
        details: {},
        createdAt: '2026-06-05T19:39:45.172+00:00'
      }
    });

    const retryResult = await service.processMarketplaceWebhook({
      action: 'Suspend',
      marketplaceSubscriptionId: createdSubscription.marketplaceSubscriptionId,
      idempotencyKey,
      requestId: 'req-suspend-retry',
      correlationId: 'corr-suspend-retry'
    });

    expect(retryResult).toMatchObject({
      subscription: expect.objectContaining({
        id: createdSubscription.id,
        status: 'Suspended'
      }),
      duplicate: false,
      acknowledgedWithoutAction: false
    });
    await expect(repository.findWebhookEventByIdempotencyKey(idempotencyKey)).resolves.toMatchObject({
      status: 'processed',
      action: 'Suspend',
      tenantId: createdSubscription.tenantId
    });
  });

  it('acknowledges Renew webhooks even when the subscription already exists locally', async () => {
    const { service, repository, loggerSpies } = createService();
    const createdSubscription = await repository.createManagedSubscription({
      tenantId: 'tenant-renew',
      marketplaceSubscriptionId: 'marketplace-renew-subscription',
      planId: 'plan-growth',
      seats: 10,
      status: 'Active',
      correlationId: 'corr-create',
      metadata: {},
      auditEntry: {
        id: 'audit-renew-create',
        subscriptionId: 'placeholder',
        eventType: 'Subscribe',
        source: 'api',
        fromStatus: null,
        toStatus: 'Active',
        correlationId: 'corr-create',
        requestId: 'req-create',
        details: {},
        createdAt: '2026-06-05T17:44:07.201+00:00'
      }
    });

    const result = await service.processMarketplaceWebhook({
      action: 'Renew',
      marketplaceSubscriptionId: createdSubscription.marketplaceSubscriptionId,
      idempotencyKey: 'marketplace:event-renew',
      requestId: 'req-renew',
      correlationId: 'corr-renew'
    });

    expect(result).toEqual({
      subscription: createdSubscription,
      duplicate: false,
      acknowledgedWithoutAction: true
    });
    expect(loggerSpies.info).toHaveBeenCalledWith(
      {
        action: 'Renew',
        marketplaceSubscriptionId: 'marketplace-renew-subscription',
        requestId: 'req-renew',
        correlationId: 'corr-renew',
        subscriptionId: createdSubscription.id,
        tenantId: createdSubscription.tenantId
      },
      'Received Renew webhook for subscription marketplace-renew-subscription — acknowledging without action.'
    );
  });
});
