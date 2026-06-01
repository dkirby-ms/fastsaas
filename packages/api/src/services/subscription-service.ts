import { randomUUID } from 'node:crypto';

import type { MarketplaceWebhookPayload, Subscription, SubscriptionAuditEntry, SubscriptionStatus } from '@fastsaas/shared';
import type { Logger } from 'pino';

import { AppError } from '../errors/app-error';
import { redactMarketplaceTokens } from '../lib/marketplace-token-redaction';
import {
  MarketplaceFulfillmentError,
  type FulfillmentOperationResult,
  type MarketplaceFulfillmentClient
} from '../lib/marketplace-fulfillment';
import type { RecordedWebhookEvent, SubscriptionRepository } from '../repositories/subscription-repository';
import type { TenantMemberService } from './tenant-member-service';

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
  userEmail?: string;
  marketplaceToken: string;
  metadata?: Record<string, unknown>;
}

interface SubscriptionActionInput extends ActorContext {
  subscriptionId: string;
  tenantId: string;
  details?: Record<string, unknown>;
}

interface ChangePlanInput extends SubscriptionActionInput {
  operationId: string;
  planId: string;
}

interface ChangeQuantityInput extends SubscriptionActionInput {
  operationId: string;
  seats: number;
}

interface TransferInput extends SubscriptionActionInput {
  operationId: string;
  nextTenantId: string;
}

interface ProcessMarketplaceWebhookInput extends MarketplaceWebhookPayload {
  idempotencyKey: string;
}

interface ProcessMarketplaceWebhookResult {
  subscription: Subscription;
  duplicate: boolean;
}

type MarketplaceLifecycleAction = Extract<MarketplaceWebhookPayload['action'], 'Suspend' | 'Unsubscribe' | 'Reinstate'>;
type MarketplaceOperationAction = Extract<MarketplaceWebhookPayload['action'], 'ChangePlan' | 'ChangeQuantity' | 'Transfer'>;

const allowedTransitions: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  PendingActivation: ['Active', 'Unsubscribed'],
  Active: ['Suspended', 'Unsubscribed'],
  Suspended: ['Active', 'Unsubscribed'],
  Unsubscribed: []
};

function normalizeDetails(details?: Record<string, unknown>): Record<string, unknown> {
  return redactMarketplaceTokens(details ? { ...details } : {});
}

function isLifecycleAction(action: MarketplaceWebhookPayload['action']): action is MarketplaceLifecycleAction {
  return action === 'Suspend' || action === 'Unsubscribe' || action === 'Reinstate';
}

function getTargetStatus(action: MarketplaceLifecycleAction): SubscriptionStatus {
  switch (action) {
    case 'Suspend':
      return 'Suspended';
    case 'Unsubscribe':
      return 'Unsubscribed';
    case 'Reinstate':
      return 'Active';
    default:
      throw AppError.badRequest('Marketplace webhook action is not supported', { action });
  }
}

function readStringDetail(details: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = details?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumberDetail(details: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = details?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getOperationId(payload: MarketplaceWebhookPayload): string | undefined {
  return payload.operationId ?? readStringDetail(payload.details, 'operationId');
}

function getWebhookPlanId(payload: MarketplaceWebhookPayload): string | undefined {
  return payload.planId ?? readStringDetail(payload.details, 'planId');
}

function getWebhookQuantity(payload: MarketplaceWebhookPayload): number | undefined {
  return payload.quantity ?? readNumberDetail(payload.details, 'quantity');
}

function getWebhookBeneficiaryTenantId(payload: MarketplaceWebhookPayload): string | undefined {
  return payload.beneficiaryTenantId ?? readStringDetail(payload.details, 'beneficiaryTenantId') ?? readStringDetail(payload.details, 'tenantId');
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
    private readonly logger: Logger,
    private readonly tenantMemberService?: TenantMemberService
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

    if (
      resolvedSubscription.beneficiaryTenantId &&
      input.tenantId &&
      resolvedSubscription.beneficiaryTenantId !== input.tenantId
    ) {
      this.logger.warn(
        {
          callerTenantId: input.tenantId,
          beneficiaryTenantId: resolvedSubscription.beneficiaryTenantId,
          marketplaceSubscriptionId: resolvedSubscription.marketplaceSubscriptionId,
          requestId: input.requestId
        },
        'Caller tenant differs from beneficiary tenant — using beneficiaryTenantId as subscription owner'
      );
    }

    const subscription = await this.repository.createSubscription({
      tenantId: resolvedSubscription.beneficiaryTenantId ?? input.tenantId,
      marketplaceSubscriptionId: resolvedSubscription.marketplaceSubscriptionId,
      planId: resolvedSubscription.planId,
      seats: resolvedSubscription.quantity,
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

    await this.tenantMemberService?.bootstrapOwnerIfNeeded({
      tenantId: subscription.tenantId,
      userId: input.userId,
      email: input.userEmail
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

  async changePlanSubscription(input: ChangePlanInput): Promise<Subscription> {
    const subscription = await this.getSubscriptionForTenant(input.subscriptionId, input.tenantId);
    const operation = await this.getValidatedMarketplaceOperation(subscription, input.operationId, 'ChangePlan', input);

    if (operation.planId && operation.planId !== input.planId) {
      throw AppError.badRequest('Marketplace operation plan did not match the webhook payload', {
        operationId: input.operationId,
        expectedPlanId: input.planId,
        actualPlanId: operation.planId
      });
    }

    if (subscription.planId === input.planId) {
      await this.completeMarketplaceOperation(subscription, input.operationId, input);
      return subscription;
    }

    const updatedSubscription = await this.updateSubscriptionRecord(subscription, input, {
      eventType: 'ChangePlan',
      planId: input.planId,
      details: {
        ...normalizeDetails(input.details),
        operationId: input.operationId,
        previousPlanId: subscription.planId,
        nextPlanId: input.planId,
        operationStatus: operation.status
      }
    });

    await this.completeMarketplaceOperation(updatedSubscription, input.operationId, input);
    return updatedSubscription;
  }

  async changeQuantitySubscription(input: ChangeQuantityInput): Promise<Subscription> {
    const subscription = await this.getSubscriptionForTenant(input.subscriptionId, input.tenantId);
    const operation = await this.getValidatedMarketplaceOperation(subscription, input.operationId, 'ChangeQuantity', input);

    if (operation.quantity !== undefined && operation.quantity !== input.seats) {
      throw AppError.badRequest('Marketplace operation quantity did not match the webhook payload', {
        operationId: input.operationId,
        expectedQuantity: input.seats,
        actualQuantity: operation.quantity
      });
    }

    if (subscription.seats === input.seats) {
      await this.completeMarketplaceOperation(subscription, input.operationId, input);
      return subscription;
    }

    const updatedSubscription = await this.updateSubscriptionRecord(subscription, input, {
      eventType: 'ChangeQuantity',
      seats: input.seats,
      details: {
        ...normalizeDetails(input.details),
        operationId: input.operationId,
        previousSeats: subscription.seats,
        nextSeats: input.seats,
        operationStatus: operation.status
      }
    });

    await this.completeMarketplaceOperation(updatedSubscription, input.operationId, input);
    return updatedSubscription;
  }

  async transferSubscription(input: TransferInput): Promise<Subscription> {
    const subscription = await this.getSubscriptionForTenant(input.subscriptionId, input.tenantId);
    const operation = await this.getValidatedMarketplaceOperation(subscription, input.operationId, 'Transfer', input);

    if (subscription.tenantId === input.nextTenantId && subscription.beneficiaryTenantId === input.nextTenantId) {
      await this.completeMarketplaceOperation(subscription, input.operationId, input);
      return subscription;
    }

    const updatedSubscription = await this.updateSubscriptionRecord(subscription, input, {
      eventType: 'Transfer',
      tenantId: input.nextTenantId,
      beneficiaryTenantId: input.nextTenantId,
      details: {
        ...normalizeDetails(input.details),
        operationId: input.operationId,
        previousTenantId: subscription.tenantId,
        nextTenantId: input.nextTenantId,
        previousBeneficiaryTenantId: subscription.beneficiaryTenantId,
        nextBeneficiaryTenantId: input.nextTenantId,
        operationStatus: operation.status
      }
    });

    await this.completeMarketplaceOperation(updatedSubscription, input.operationId, input);
    return updatedSubscription;
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
        operationId: payload.operationId,
        planId: payload.planId,
        quantity: payload.quantity,
        beneficiaryTenantId: payload.beneficiaryTenantId,
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

    if (isLifecycleAction(payload.action)) {
      const targetStatus = getTargetStatus(payload.action);
      if (subscription.status === targetStatus) {
        await this.repository.recordWebhookEvent({
          ...webhookEventBase,
          tenantId: subscription.tenantId,
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
        case 'ChangePlan': {
          const operationId = getOperationId(payload);
          const planId = getWebhookPlanId(payload);
          if (!operationId || !planId) {
            throw AppError.badRequest('ChangePlan webhook must include operationId and planId');
          }

          updatedSubscription = await this.changePlanSubscription({
            ...actionContext,
            operationId,
            planId
          });
          break;
        }
        case 'ChangeQuantity': {
          const operationId = getOperationId(payload);
          const seats = getWebhookQuantity(payload);
          if (!operationId || seats === undefined) {
            throw AppError.badRequest('ChangeQuantity webhook must include operationId and quantity');
          }

          updatedSubscription = await this.changeQuantitySubscription({
            ...actionContext,
            operationId,
            seats
          });
          break;
        }
        case 'Transfer': {
          const operationId = getOperationId(payload);
          const nextTenantId = getWebhookBeneficiaryTenantId(payload);
          if (!operationId || !nextTenantId) {
            throw AppError.badRequest('Transfer webhook must include operationId and beneficiaryTenantId');
          }

          updatedSubscription = await this.transferSubscription({
            ...actionContext,
            operationId,
            nextTenantId
          });
          break;
        }
        default:
          throw AppError.badRequest('Marketplace webhook action is not supported', {
            action: payload.action
          });
      }

      await this.repository.recordWebhookEvent({
        ...webhookEventBase,
        tenantId: updatedSubscription.tenantId
      });
      return {
        subscription: updatedSubscription,
        duplicate: false
      };
    } catch (error) {
      await this.repository.recordWebhookEvent({
        ...webhookEventBase,
        tenantId: subscription.tenantId,
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
      tenantId: subscription.tenantId,
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

  private async updateSubscriptionRecord(
    subscription: Subscription,
    context: SubscriptionActionInput,
    input: {
      eventType: string;
      planId?: string;
      seats?: number;
      tenantId?: string;
      beneficiaryTenantId?: string;
      details?: Record<string, unknown>;
    }
  ): Promise<Subscription> {
    const auditEntry = buildAuditEntry({
      subscriptionId: subscription.id,
      eventType: input.eventType,
      source: context.source,
      fromStatus: subscription.status,
      toStatus: subscription.status,
      correlationId: context.correlationId,
      requestId: context.requestId,
      details: input.details
    });

    const updatedSubscription = await this.repository.updateManagedSubscription({
      subscriptionId: subscription.id,
      tenantId: input.tenantId ?? subscription.tenantId,
      planId: input.planId ?? subscription.planId,
      seats: input.seats ?? subscription.seats,
      status: subscription.status,
      offerId: subscription.offerId,
      purchaserTenantId: subscription.purchaserTenantId,
      beneficiaryTenantId: input.beneficiaryTenantId ?? subscription.beneficiaryTenantId,
      correlationId: context.correlationId,
      metadata: normalizeDetails(subscription.metadata),
      auditEntry
    });

    this.logger.info(
      {
        subscriptionId: updatedSubscription.id,
        marketplaceSubscriptionId: updatedSubscription.marketplaceSubscriptionId,
        tenantId: updatedSubscription.tenantId,
        requestId: context.requestId,
        correlationId: context.correlationId,
        source: context.source,
        eventType: input.eventType
      },
      'Subscription change persisted'
    );

    return updatedSubscription;
  }

  private async getValidatedMarketplaceOperation(
    subscription: Subscription,
    operationId: string,
    expectedAction: MarketplaceOperationAction,
    context: Pick<ActorContext, 'requestId' | 'correlationId'>
  ): Promise<FulfillmentOperationResult> {
    const operation = await this.withFulfillment('get-operation', context, subscription, async () => {
      return this.fulfillmentClient.getOperation(
        subscription.marketplaceSubscriptionId,
        operationId,
        context.requestId,
        context.correlationId
      );
    });

    if (operation.subscriptionId !== subscription.marketplaceSubscriptionId) {
      throw AppError.badRequest('Marketplace operation did not match the webhook subscription', {
        operationId,
        expectedSubscriptionId: subscription.marketplaceSubscriptionId,
        actualSubscriptionId: operation.subscriptionId
      });
    }

    if (operation.action !== expectedAction) {
      throw AppError.badRequest('Marketplace operation did not match the webhook action', {
        operationId,
        expectedAction,
        actualAction: operation.action
      });
    }

    if (operation.status === 'Failed') {
      throw AppError.conflict('Marketplace operation is already marked as failed', {
        operationId,
        action: operation.action,
        status: operation.status,
        errorStatusCode: operation.errorStatusCode,
        errorMessage: operation.errorMessage
      });
    }

    return operation;
  }

  private async completeMarketplaceOperation(
    subscription: Subscription,
    operationId: string,
    context: Pick<ActorContext, 'requestId' | 'correlationId'>
  ): Promise<void> {
    await this.withFulfillment('update-operation', context, subscription, async () => {
      await this.fulfillmentClient.updateOperationStatus(
        subscription.marketplaceSubscriptionId,
        operationId,
        'Success',
        context.requestId,
        context.correlationId
      );
    });
  }

  private async withFulfillment<T>(
    action:
      | 'resolve'
      | 'activate'
      | 'suspend'
      | 'unsubscribe'
      | 'update'
      | 'reinstate'
      | 'get-operation'
      | 'update-operation',
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
