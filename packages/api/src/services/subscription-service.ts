import { randomUUID } from 'node:crypto';

import type { MarketplaceWebhookPayload, Subscription, SubscriptionAuditEntry, SubscriptionStatus } from '@fastsaas/shared';
import type { Logger } from 'pino';

import { AppError } from '../errors/app-error';
import { MarketplaceFulfillmentError, type MarketplaceFulfillmentClient } from '../lib/marketplace-fulfillment';
import type { RecordedWebhookEvent, SubscriptionRepository } from '../repositories/subscription-repository';

interface ActorContext {
  requestId: string;
  correlationId: string;
  tenantId?: string;
  userId?: string;
  source: 'api' | 'marketplace-webhook';
}

interface SubscribeInput extends ActorContext {
  tenantId: string;
  userId: string;
  marketplaceToken: string;
  planId?: string;
  seats?: number;
  metadata?: Record<string, unknown>;
}

interface SubscriptionActionInput extends ActorContext {
  subscriptionId: string;
  tenantId: string;
  details?: Record<string, unknown>;
}

interface ProcessMarketplaceWebhookInput extends MarketplaceWebhookPayload {
  idempotencyKey: string;
}

interface ProcessMarketplaceWebhookResult {
  subscription: Subscription;
  duplicate: boolean;
}

const allowedTransitions: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  PendingActivation: ['Active', 'Unsubscribed'],
  Active: ['Suspended', 'Unsubscribed'],
  Suspended: ['Active', 'Unsubscribed'],
  Unsubscribed: []
};

function normalizeDetails(details?: Record<string, unknown>): Record<string, unknown> {
  return details ? { ...details } : {};
}

function getTargetStatus(action: MarketplaceWebhookPayload['action']): SubscriptionStatus {
  switch (action) {
    case 'Suspend':
      return 'Suspended';
    case 'Unsubscribe':
      return 'Unsubscribed';
    case 'Reinstate':
      return 'Active';
    default: {
      const unsupportedAction: never = action;
      return unsupportedAction;
    }
  }
}

function buildAuditEntry(input: {
  subscriptionId: string;
  eventType: string;
  source: string;
  fromStatus: SubscriptionStatus | null;
  toStatus: SubscriptionStatus;
  correlationId: string;
  requestId: string;
  details?: Record<string, unknown>;
}): SubscriptionAuditEntry {
  return {
    id: randomUUID(),
    subscriptionId: input.subscriptionId,
    eventType: input.eventType,
    source: input.source,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    correlationId: input.correlationId,
    requestId: input.requestId,
    details: normalizeDetails(input.details),
    createdAt: new Date().toISOString()
  };
}

export class SubscriptionService {
  constructor(
    private readonly repository: SubscriptionRepository,
    private readonly fulfillmentClient: MarketplaceFulfillmentClient,
    private readonly logger: Logger
  ) {}

  async listSubscriptions(tenantId: string): Promise<Subscription[]> {
    return this.repository.listByTenant(tenantId);
  }

  async getSubscriptionForTenant(subscriptionId: string, tenantId: string): Promise<Subscription> {
    const subscription = await this.repository.findById(subscriptionId);
    if (!subscription || subscription.tenantId !== tenantId) {
      throw AppError.notFound('Subscription was not found');
    }

    return subscription;
  }

  async subscribe(input: SubscribeInput): Promise<Subscription> {
    const resolvedSubscription = await this.withFulfillment('resolve', input, undefined, async () => {
      return this.fulfillmentClient.resolveSubscription(input.marketplaceToken, input.requestId, input.correlationId);
    });

    const existingSubscription = await this.repository.findByMarketplaceSubscriptionId(resolvedSubscription.marketplaceSubscriptionId);
    if (existingSubscription) {
      throw AppError.conflict('A subscription already exists for the marketplace purchase', {
        marketplaceSubscriptionId: resolvedSubscription.marketplaceSubscriptionId,
        subscriptionId: existingSubscription.id
      });
    }

    const auditEntry = buildAuditEntry({
      subscriptionId: 'pending',
      eventType: 'Subscribe',
      source: input.source,
      fromStatus: null,
      toStatus: 'PendingActivation',
      correlationId: input.correlationId,
      requestId: input.requestId,
      details: {
        marketplaceToken: input.marketplaceToken,
        resolvedPlanId: resolvedSubscription.planId,
        resolvedQuantity: resolvedSubscription.quantity
      }
    });

    const subscription = await this.repository.createSubscription({
      tenantId: input.tenantId,
      marketplaceSubscriptionId: resolvedSubscription.marketplaceSubscriptionId,
      planId: input.planId ?? resolvedSubscription.planId,
      seats: input.seats ?? resolvedSubscription.quantity,
      offerId: resolvedSubscription.offerId,
      purchaserTenantId: resolvedSubscription.purchaserTenantId,
      beneficiaryTenantId: resolvedSubscription.beneficiaryTenantId,
      correlationId: input.correlationId,
      metadata: {
        ...normalizeDetails(resolvedSubscription.metadata),
        ...normalizeDetails(input.metadata)
      },
      auditEntry
    });

    this.logger.info(
      {
        subscriptionId: subscription.id,
        marketplaceSubscriptionId: subscription.marketplaceSubscriptionId,
        tenantId: subscription.tenantId,
        status: subscription.status,
        requestId: input.requestId,
        correlationId: input.correlationId,
        source: input.source,
        userId: input.userId
      },
      'Subscription created from marketplace purchase'
    );

    return subscription;
  }

  async activateSubscription(input: SubscriptionActionInput): Promise<Subscription> {
    const subscription = await this.getSubscriptionForTenant(input.subscriptionId, input.tenantId);
    this.assertTransition(subscription.status, 'Active');

    if (input.source === 'api') {
      await this.withFulfillment('activate', input, subscription, async () => {
        await this.fulfillmentClient.activateSubscription(
          subscription.marketplaceSubscriptionId,
          subscription.planId,
          subscription.seats,
          input.requestId,
          input.correlationId
        );
      });
    }

    return this.transition(subscription, 'Active', input, input.source === 'api' ? 'Activate' : 'Reinstate', input.details);
  }

  async suspendSubscription(input: SubscriptionActionInput): Promise<Subscription> {
    const subscription = await this.getSubscriptionForTenant(input.subscriptionId, input.tenantId);
    this.assertTransition(subscription.status, 'Suspended');

    if (input.source === 'api') {
      await this.withFulfillment('suspend', input, subscription, async () => {
        await this.fulfillmentClient.suspendSubscription(subscription.marketplaceSubscriptionId, input.requestId, input.correlationId);
      });
    }

    return this.transition(subscription, 'Suspended', input, 'Suspend', input.details);
  }

  async unsubscribeSubscription(input: SubscriptionActionInput): Promise<Subscription> {
    const subscription = await this.getSubscriptionForTenant(input.subscriptionId, input.tenantId);
    this.assertTransition(subscription.status, 'Unsubscribed');

    if (input.source === 'api') {
      await this.withFulfillment('unsubscribe', input, subscription, async () => {
        await this.fulfillmentClient.unsubscribeSubscription(subscription.marketplaceSubscriptionId, input.requestId, input.correlationId);
      });
    }

    return this.transition(subscription, 'Unsubscribed', input, 'Unsubscribe', input.details);
  }

  async processMarketplaceWebhook(payload: ProcessMarketplaceWebhookInput): Promise<ProcessMarketplaceWebhookResult> {
    const requestId = payload.requestId ?? randomUUID();
    const correlationId = payload.correlationId ?? requestId;
    const webhookEventBase: RecordedWebhookEvent = {
      idempotencyKey: payload.idempotencyKey,
      marketplaceSubscriptionId: payload.marketplaceSubscriptionId,
      action: payload.action,
      requestId,
      correlationId,
      payload: {
        action: payload.action,
        marketplaceSubscriptionId: payload.marketplaceSubscriptionId,
        details: normalizeDetails(payload.details)
      },
      status: 'processed',
      processedAt: new Date().toISOString()
    };

    const existingEvent = await this.repository.findWebhookEventByIdempotencyKey(payload.idempotencyKey);
    const subscription = await this.repository.findByMarketplaceSubscriptionId(payload.marketplaceSubscriptionId);
    if (!subscription) {
      await this.repository.recordWebhookEvent({
        ...webhookEventBase,
        status: 'failed',
        errorMessage: 'Subscription for marketplace webhook was not found'
      });
      throw AppError.notFound('Subscription for marketplace webhook was not found', {
        marketplaceSubscriptionId: payload.marketplaceSubscriptionId
      });
    }

    if (existingEvent?.status === 'processed') {
      return {
        subscription,
        duplicate: true
      };
    }

    const targetStatus = getTargetStatus(payload.action);
    if (subscription.status === targetStatus) {
      await this.repository.recordWebhookEvent({
        ...webhookEventBase,
        payload: {
          ...webhookEventBase.payload,
          duplicate: true,
          noop: true
        }
      });

      return {
        subscription,
        duplicate: true
      };
    }

    try {
      const actionContext: SubscriptionActionInput = {
        subscriptionId: subscription.id,
        tenantId: subscription.tenantId,
        requestId,
        correlationId,
        source: 'marketplace-webhook',
        details: normalizeDetails(payload.details)
      };

      let updatedSubscription: Subscription;
      switch (payload.action) {
        case 'Suspend':
          updatedSubscription = await this.suspendSubscription(actionContext);
          break;
        case 'Unsubscribe':
          updatedSubscription = await this.unsubscribeSubscription(actionContext);
          break;
        case 'Reinstate':
          updatedSubscription = await this.activateSubscription(actionContext);
          break;
        default:
          throw AppError.badRequest('Marketplace webhook action is not supported', {
            action: payload.action
          });
      }

      await this.repository.recordWebhookEvent(webhookEventBase);
      return {
        subscription: updatedSubscription,
        duplicate: false
      };
    } catch (error) {
      await this.repository.recordWebhookEvent({
        ...webhookEventBase,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown webhook processing error'
      });
      throw error;
    }
  }

  private assertTransition(currentStatus: SubscriptionStatus, nextStatus: SubscriptionStatus): void {
    const validNextStatuses = allowedTransitions[currentStatus] ?? [];
    if (!validNextStatuses.includes(nextStatus)) {
      throw AppError.conflict('Subscription state transition is not allowed', {
        currentStatus,
        nextStatus,
        validNextStatuses
      });
    }
  }

  private async transition(
    subscription: Subscription,
    nextStatus: SubscriptionStatus,
    context: SubscriptionActionInput,
    eventType: string,
    details?: Record<string, unknown>
  ): Promise<Subscription> {
    const auditEntry = buildAuditEntry({
      subscriptionId: subscription.id,
      eventType,
      source: context.source,
      fromStatus: subscription.status,
      toStatus: nextStatus,
      correlationId: context.correlationId,
      requestId: context.requestId,
      details
    });

    const updatedSubscription = await this.repository.transitionSubscription({
      subscriptionId: subscription.id,
      toStatus: nextStatus,
      correlationId: context.correlationId,
      auditEntry
    });

    this.logger.info(
      {
        subscriptionId: updatedSubscription.id,
        marketplaceSubscriptionId: updatedSubscription.marketplaceSubscriptionId,
        tenantId: updatedSubscription.tenantId,
        requestId: context.requestId,
        correlationId: context.correlationId,
        fromStatus: subscription.status,
        toStatus: nextStatus,
        source: context.source,
        eventType
      },
      'Subscription state transition persisted'
    );

    return updatedSubscription;
  }

  private async withFulfillment<T>(
    action: 'resolve' | 'activate' | 'suspend' | 'unsubscribe' | 'update' | 'reinstate',
    context: Pick<ActorContext, 'requestId' | 'correlationId'>,
    subscription: Subscription | undefined,
    operation: () => Promise<T>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const details = {
        action,
        requestId: context.requestId,
        correlationId: context.correlationId,
        subscriptionId: subscription?.id,
        marketplaceSubscriptionId: subscription?.marketplaceSubscriptionId,
        statusCode: error instanceof MarketplaceFulfillmentError ? error.statusCode : undefined,
        responseBody: error instanceof MarketplaceFulfillmentError ? error.responseBody : undefined
      };

      this.logger.error({ ...details, err: error }, 'Marketplace fulfillment request failed');
      throw new AppError(502, 'FULFILLMENT_REQUEST_FAILED', `Marketplace fulfillment ${action} request failed`, details);
    }
  }
}
