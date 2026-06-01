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
