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

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

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
    reinstateSubscription: vi.fn(),
    getOperation: vi.fn<() => Promise<FulfillmentOperationResult>>(),
    updateOperationStatus: vi.fn()
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
    fulfillmentClient,
    loggerSpies: logger,
    resolvedSubscription,
    tenantMemberRepository
  };
}

describe('SubscriptionService.subscribe', () => {
  it('rejects subscription creation when the resolved beneficiary tenant differs from the caller tenant', async () => {
    const { service } = createService({ beneficiaryTenantId: 'beneficiary-tenant-a' });

    await expect(service.subscribe(subscribeInput)).rejects.toMatchObject({
      statusCode: 403,
      code: 'AUTH_FORBIDDEN',
      message: 'The marketplace purchase belongs to a different tenant'
    });
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

    await expect(service.subscribe(subscribeInput)).rejects.toMatchObject({
      statusCode: 403
    });

    expect(loggerSpies.warn).toHaveBeenCalledWith(
      {
        callerTenantId: subscribeInput.tenantId,
        beneficiaryTenantId: resolvedSubscription.beneficiaryTenantId,
        marketplaceSubscriptionId: resolvedSubscription.marketplaceSubscriptionId,
        requestId: subscribeInput.requestId
      },
      'Resolved marketplace purchase belongs to a different beneficiary tenant than the caller — denying subscription access'
    );
  });

  it('bootstraps the caller as tenant owner when the resolved subscription belongs to the caller tenant', async () => {
    const { service, tenantMemberRepository } = createService({ beneficiaryTenantId: subscribeInput.tenantId });

    await service.subscribe(subscribeInput);

    const member = await tenantMemberRepository.findByTenantAndUserId(subscribeInput.tenantId, subscribeInput.userId);
    expect(member?.role).toBe('Owner');
    expect(member?.email).toBe(subscribeInput.userEmail);
  });

  it('does not overwrite an existing tenant owner during bootstrap', async () => {
    const { service, tenantMemberRepository } = createService({ beneficiaryTenantId: subscribeInput.tenantId });
    await tenantMemberRepository.create({
      tenantId: subscribeInput.tenantId,
      userId: 'existing-owner',
      email: 'existing-owner@example.com',
      role: 'Owner'
    });

    await service.subscribe(subscribeInput);

    const existingOwner = await tenantMemberRepository.findByTenantAndUserId(subscribeInput.tenantId, 'existing-owner');
    const caller = await tenantMemberRepository.findByTenantAndUserId(subscribeInput.tenantId, subscribeInput.userId);

    expect(existingOwner?.role).toBe('Owner');
    expect(caller).toBeNull();
  });

  it('returns the existing subscription when the marketplace purchase was already provisioned', async () => {
    const { service } = createService({
      marketplaceSubscriptionId: 'marketplace-subscription-existing',
      beneficiaryTenantId: subscribeInput.tenantId
    });

    const created = await service.subscribe(subscribeInput);
    const retried = await service.subscribe(subscribeInput);

    expect(retried).toEqual(created);
  });
});

describe('SubscriptionService.processMarketplaceWebhook', () => {
  it('creates, activates, and bootstraps the beneficiary from a Subscribe webhook', async () => {
    const { service, repository, tenantMemberRepository, loggerSpies } = createService();

    const result = await service.processMarketplaceWebhook({
      action: 'Subscribe',
      marketplaceSubscriptionId: 'missing-marketplace-subscription',
      offerId: 'offer-growth',
      planId: 'plan-growth',
      quantity: 10,
      beneficiary: {
        emailId: 'beneficiary@example.com',
        objectId: 'beneficiary-user',
        tenantId: 'beneficiary-tenant'
      },
      purchaser: {
        emailId: 'purchaser@example.com',
        objectId: 'purchaser-user',
        tenantId: 'purchaser-tenant'
      },
      idempotencyKey: 'marketplace:event-subscribe',
      requestId: 'req-subscribe',
      correlationId: 'corr-subscribe'
    });

    expect(result).toMatchObject({
      subscription: expect.objectContaining({
        marketplaceSubscriptionId: 'missing-marketplace-subscription',
        tenantId: 'beneficiary-tenant',
        status: 'Active',
        planId: 'plan-growth',
        seats: 10,
        offerId: 'offer-growth',
        purchaserTenantId: 'purchaser-tenant',
        beneficiaryTenantId: 'beneficiary-tenant'
      }),
      duplicate: false,
      acknowledgedWithoutAction: false
    });
    expect(loggerSpies.warn).not.toHaveBeenCalled();

    const owner = await tenantMemberRepository.findByTenantAndUserId('beneficiary-tenant', 'beneficiary-user');
    expect(owner?.role).toBe('Owner');
    expect(owner?.email).toBe('beneficiary@example.com');

    await expect(repository.findWebhookEventByIdempotencyKey('marketplace:event-subscribe')).resolves.toMatchObject({
      status: 'processed',
      action: 'Subscribe',
      marketplaceSubscriptionId: 'missing-marketplace-subscription',
      payload: expect.objectContaining({
        subscriptionCreated: true,
        activationAttempted: true,
        activationFailed: false,
        subscriptionStatus: 'Active'
      })
    });
  });

  it('activates an existing pending subscription when Subscribe arrives after the portal path', async () => {
    const { service, repository } = createService();
    const createdSubscription = await repository.createManagedSubscription({
      tenantId: 'beneficiary-tenant',
      marketplaceSubscriptionId: 'marketplace-subscription-portal-first',
      planId: 'plan-growth',
      seats: 10,
      status: 'PendingActivation',
      correlationId: 'corr-create-pending',
      metadata: {},
      auditEntry: {
        id: 'audit-portal-first',
        subscriptionId: 'placeholder',
        eventType: 'Subscribe',
        source: 'api',
        fromStatus: null,
        toStatus: 'PendingActivation',
        correlationId: 'corr-create-pending',
        requestId: 'req-create-pending',
        details: {},
        createdAt: '2026-06-05T19:39:45.172+00:00'
      }
    });

    const result = await service.processMarketplaceWebhook({
      action: 'Subscribe',
      marketplaceSubscriptionId: createdSubscription.marketplaceSubscriptionId,
      offerId: 'offer-growth',
      planId: 'plan-growth',
      quantity: 10,
      beneficiary: {
        emailId: 'beneficiary@example.com',
        objectId: 'beneficiary-user',
        tenantId: 'beneficiary-tenant'
      },
      purchaser: {
        tenantId: 'purchaser-tenant'
      },
      idempotencyKey: 'marketplace:event-subscribe-portal-first',
      requestId: 'req-subscribe-portal-first',
      correlationId: 'corr-subscribe-portal-first'
    });

    expect(result).toMatchObject({
      subscription: expect.objectContaining({
        id: createdSubscription.id,
        status: 'Active'
      }),
      duplicate: false,
      acknowledgedWithoutAction: false
    });
  });

  it('leaves the subscription pending activation when Microsoft activation fails', async () => {
    const activateError = new Error('activate failed');
    const failingService = createService();
    failingService.fulfillmentClient.activateSubscription.mockRejectedValue(activateError);

    const result = await failingService.service.processMarketplaceWebhook({
      action: 'Subscribe',
      marketplaceSubscriptionId: 'marketplace-subscription-activate-fail',
      offerId: 'offer-growth',
      planId: 'plan-growth',
      quantity: 10,
      beneficiary: {
        emailId: 'beneficiary@example.com',
        objectId: 'beneficiary-user',
        tenantId: 'beneficiary-tenant'
      },
      purchaser: {
        tenantId: 'purchaser-tenant'
      },
      idempotencyKey: 'marketplace:event-subscribe-activate-fail',
      requestId: 'req-subscribe-activate-fail',
      correlationId: 'corr-subscribe-activate-fail'
    });

    expect(result).toMatchObject({
      subscription: expect.objectContaining({
        marketplaceSubscriptionId: 'marketplace-subscription-activate-fail',
        status: 'PendingActivation'
      }),
      duplicate: false,
      acknowledgedWithoutAction: false
    });

    await expect(
      failingService.repository.findWebhookEventByIdempotencyKey('marketplace:event-subscribe-activate-fail')
    ).resolves.toMatchObject({
      status: 'failed',
      payload: expect.objectContaining({
        activationAttempted: true,
        activationFailed: true,
        subscriptionStatus: 'PendingActivation'
      })
    });
  });

  it('retries Subscribe activation after a failed delivery records the event as failed', async () => {
    const { service, repository, fulfillmentClient } = createService();
    fulfillmentClient.activateSubscription.mockRejectedValueOnce(new Error('activate failed')).mockResolvedValueOnce(undefined);
    const payload = {
      action: 'Subscribe' as const,
      marketplaceSubscriptionId: 'marketplace-subscription-activate-retry',
      offerId: 'offer-growth',
      planId: 'plan-growth',
      quantity: 10,
      beneficiary: {
        emailId: 'beneficiary@example.com',
        objectId: 'beneficiary-user',
        tenantId: 'beneficiary-tenant'
      },
      purchaser: {
        tenantId: 'purchaser-tenant'
      },
      idempotencyKey: 'marketplace:event-subscribe-activate-retry',
      requestId: 'req-subscribe-activate-retry-1',
      correlationId: 'corr-subscribe-activate-retry-1'
    };

    const firstAttempt = await service.processMarketplaceWebhook(payload);
    const retryAttempt = await service.processMarketplaceWebhook({
      ...payload,
      requestId: 'req-subscribe-activate-retry-2',
      correlationId: 'corr-subscribe-activate-retry-2'
    });

    expect(firstAttempt).toMatchObject({
      subscription: expect.objectContaining({
        marketplaceSubscriptionId: 'marketplace-subscription-activate-retry',
        status: 'PendingActivation'
      }),
      duplicate: false
    });
    expect(retryAttempt).toMatchObject({
      subscription: expect.objectContaining({
        marketplaceSubscriptionId: 'marketplace-subscription-activate-retry',
        status: 'Active'
      }),
      duplicate: false
    });
    expect(fulfillmentClient.activateSubscription).toHaveBeenCalledTimes(2);
    await expect(repository.findWebhookEventByIdempotencyKey(payload.idempotencyKey)).resolves.toMatchObject({
      status: 'processed',
      payload: expect.objectContaining({
        activationFailed: false,
        subscriptionStatus: 'Active'
      })
    });
  });

  it('treats a concurrent Subscribe redelivery as a duplicate while the first delivery is still processing', async () => {
    const activateStarted = createDeferred();
    const allowActivateToFinish = createDeferred();
    const { service, repository, fulfillmentClient } = createService();
    fulfillmentClient.activateSubscription.mockImplementation(async () => {
      activateStarted.resolve();
      await allowActivateToFinish.promise;
    });
    const payload = {
      action: 'Subscribe' as const,
      marketplaceSubscriptionId: 'marketplace-subscription-concurrent',
      offerId: 'offer-growth',
      planId: 'plan-growth',
      quantity: 10,
      beneficiary: {
        emailId: 'beneficiary@example.com',
        objectId: 'beneficiary-user',
        tenantId: 'beneficiary-tenant'
      },
      purchaser: {
        tenantId: 'purchaser-tenant'
      },
      idempotencyKey: 'marketplace:event-subscribe-concurrent',
      requestId: 'req-subscribe-concurrent-1',
      correlationId: 'corr-subscribe-concurrent-1'
    };

    const firstAttemptPromise = service.processMarketplaceWebhook(payload);
    await activateStarted.promise;

    const duplicateAttempt = await service.processMarketplaceWebhook({
      ...payload,
      requestId: 'req-subscribe-concurrent-2',
      correlationId: 'corr-subscribe-concurrent-2'
    });

    expect(duplicateAttempt.duplicate).toBe(true);
    expect(duplicateAttempt.subscription).toMatchObject({
      marketplaceSubscriptionId: 'marketplace-subscription-concurrent',
      status: 'PendingActivation'
    });
    expect(await repository.listAll()).toHaveLength(1);
    expect(fulfillmentClient.activateSubscription).toHaveBeenCalledTimes(1);

    allowActivateToFinish.resolve();
    await expect(firstAttemptPromise).resolves.toMatchObject({
      duplicate: false,
      subscription: expect.objectContaining({
        marketplaceSubscriptionId: 'marketplace-subscription-concurrent',
        status: 'Active'
      })
    });
    await expect(repository.findWebhookEventByIdempotencyKey(payload.idempotencyKey)).resolves.toMatchObject({
      status: 'processed'
    });
  });

  it('treats a repeated Subscribe webhook as a duplicate once the subscription is already active', async () => {
    const { service } = createService();
    const payload = {
      action: 'Subscribe' as const,
      marketplaceSubscriptionId: 'marketplace-subscription-duplicate',
      offerId: 'offer-growth',
      planId: 'plan-growth',
      quantity: 10,
      beneficiary: {
        emailId: 'beneficiary@example.com',
        objectId: 'beneficiary-user',
        tenantId: 'beneficiary-tenant'
      },
      purchaser: {
        tenantId: 'purchaser-tenant'
      },
      idempotencyKey: 'marketplace:event-subscribe-duplicate',
      requestId: 'req-subscribe-duplicate',
      correlationId: 'corr-subscribe-duplicate'
    };

    await service.processMarketplaceWebhook(payload);
    const result = await service.processMarketplaceWebhook(payload);

    expect(result).toMatchObject({
      subscription: expect.objectContaining({
        marketplaceSubscriptionId: 'marketplace-subscription-duplicate',
        status: 'Active'
      }),
      duplicate: true
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
