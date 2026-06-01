import type { MeteringDashboardSummary, UsageEventIngestRequest, UsageEventIngestResponse } from '@fastsaas/shared';

import type { ApiConfig } from '../config';
import { AppError } from '../errors/app-error';
import type { SubscriptionRepository } from '../repositories/subscription-repository';
import type { Clock } from './clock';
import type { UsageEventRepository } from './repository';

export function buildIdempotencyKey(tenantId: string, event: UsageEventIngestRequest): string {
  return event.idempotencyKey ?? `${tenantId}:${event.eventId}:${new Date(event.timestamp).toISOString()}`;
}

function validateRequest(event: UsageEventIngestRequest): void {
  if (!event.eventId?.trim()) {
    throw AppError.badRequest('eventId is required');
  }

  if (!event.subscriptionId?.trim()) {
    throw AppError.badRequest('subscriptionId is required');
  }

  if (!event.planId?.trim()) {
    throw AppError.badRequest('planId is required');
  }

  if (!event.dimensionId?.trim()) {
    throw AppError.badRequest('dimensionId is required');
  }

  if (!Number.isFinite(event.quantity) || event.quantity <= 0) {
    throw AppError.badRequest('quantity must be a positive number');
  }

  const timestamp = new Date(event.timestamp);
  if (Number.isNaN(timestamp.getTime())) {
    throw AppError.badRequest('timestamp must be a valid ISO-8601 value');
  }
}

export class MeteringService {
  constructor(
    private readonly config: ApiConfig,
    private readonly repository: UsageEventRepository,
    private readonly clock: Clock,
    private readonly subscriptionRepository?: Pick<SubscriptionRepository, 'findById'>
  ) {}

  async ingestEvent(tenantId: string, event: UsageEventIngestRequest): Promise<UsageEventIngestResponse> {
    validateRequest(event);

    const resolvedEvent = await this.resolveOwnedSubscription(tenantId, event);
    return this.repository.ingest(tenantId, resolvedEvent, buildIdempotencyKey(tenantId, resolvedEvent), this.clock.now());
  }

  private async resolveOwnedSubscription(tenantId: string, event: UsageEventIngestRequest): Promise<UsageEventIngestRequest> {
    if (!this.subscriptionRepository) {
      return event;
    }

    const subscription = await this.subscriptionRepository.findById(event.subscriptionId);
    if (!subscription || subscription.tenantId !== tenantId) {
      throw AppError.notFound('Subscription was not found');
    }

    return {
      ...event,
      subscriptionId: subscription.marketplaceSubscriptionId,
      metadata: {
        ...event.metadata,
        tenantSubscriptionId: subscription.id
      }
    };
  }

  async getDashboardSummary(tenantId: string): Promise<MeteringDashboardSummary> {
    return this.repository.getDashboardSummary(tenantId, this.clock.now(), this.config.metering.submissionSlaMs);
  }
}
