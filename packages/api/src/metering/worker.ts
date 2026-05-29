import type { MeteringWorkerRunResult } from '@fastsaas/shared';

import type { ApiConfig } from '../config';
import { logger } from '../lib/logger';
import type { Clock } from './clock';
import { MarketplaceMeteringError, type MarketplaceMeteringClient, type MarketplaceSubmitUsageEvent, type MarketplaceUsageEventPayload } from './client';
import type { ClaimedUsageEventRecord, UsageEventRepository } from './repository';

function computeRetryDelayMs(retryCount: number, config: ApiConfig, random: () => number): number {
  const exponentialDelay = config.metering.retryBaseDelayMs * Math.pow(2, Math.max(0, retryCount - 1));
  const jitter = Math.floor(exponentialDelay * config.metering.retryJitterRatio * random());
  return Math.min(config.metering.retryMaxDelayMs, exponentialDelay + jitter);
}

function isRetryable(error: MarketplaceMeteringError): boolean {
  return error.statusCode === 429 || [500, 502, 503, 504].includes(error.statusCode);
}

function buildMarketplacePayload(event: ClaimedUsageEventRecord): MarketplaceUsageEventPayload {
  return {
    resourceId: event.subscriptionId,
    quantity: event.quantity,
    dimension: event.dimensionId,
    effectiveStartTime: event.timestamp,
    planId: event.planId
  };
}

function buildMarketplaceRequest(event: ClaimedUsageEventRecord): MarketplaceSubmitUsageEvent {
  return {
    tenantId: event.tenantId,
    eventId: event.eventId,
    idempotencyKey: event.idempotencyKey,
    payload: buildMarketplacePayload(event)
  };
}

export class MeteringOutboxWorker {
  constructor(
    private readonly config: ApiConfig,
    private readonly repository: UsageEventRepository,
    private readonly client: MarketplaceMeteringClient,
    private readonly clock: Clock,
    private readonly random: () => number = Math.random
  ) {}

  async runNextBatch(): Promise<MeteringWorkerRunResult> {
    const dueEvents = await this.repository.claimDueBatch(
      this.clock.now(),
      this.config.metering.batchSize,
      this.config.metering.claimLeaseMs
    );
    const result: MeteringWorkerRunResult = {
      attempted: dueEvents.length,
      submitted: 0,
      retried: 0,
      deadLettered: 0
    };

    for (const event of dueEvents) {
      const outcome = await this.processEvent(event);
      result[outcome] += 1;
    }

    return result;
  }

  private async processEvent(event: ClaimedUsageEventRecord): Promise<'submitted' | 'retried' | 'deadLettered'> {
    try {
      await this.trySubmit(event, false);
      await this.repository.markSubmitted(event, this.clock.now());
      return 'submitted';
    } catch (error) {
      const marketplaceError = error instanceof MarketplaceMeteringError
        ? error
        : new MarketplaceMeteringError(500, error instanceof Error ? error.message : 'Marketplace submission failed');

      if (isRetryable(marketplaceError) && event.retryCount < this.config.metering.maxRetries) {
        const delayMs = marketplaceError.retryAfterSeconds
          ? Math.min(this.config.metering.retryMaxDelayMs, marketplaceError.retryAfterSeconds * 1000)
          : computeRetryDelayMs(event.retryCount + 1, this.config, this.random);
        const nextAttemptAt = new Date(this.clock.now().getTime() + delayMs);

        await this.repository.scheduleRetry(event, event.retryCount + 1, nextAttemptAt, {
          code: `HTTP_${marketplaceError.statusCode}`,
          message: marketplaceError.message,
          httpStatus: marketplaceError.statusCode
        });

        logger.warn({ eventId: event.eventId, retryCount: event.retryCount + 1, nextAttemptAt }, 'Scheduled usage event retry');
        return 'retried';
      }

      await this.repository.markDeadLetter(event, {
        usageEventId: event.id,
        tenantId: event.tenantId,
        eventId: event.eventId,
        reason: marketplaceError.message,
        httpStatus: marketplaceError.statusCode,
        retryCount: event.retryCount,
        payload: {
          ...buildMarketplacePayload(event),
          idempotencyKey: event.idempotencyKey
        }
      }, this.clock.now());

      logger.error({ eventId: event.eventId, statusCode: marketplaceError.statusCode }, 'Moved usage event to dead letter queue');
      return 'deadLettered';
    }
  }

  private async trySubmit(event: ClaimedUsageEventRecord, refreshed: boolean): Promise<void> {
    try {
      await this.client.submitUsageEvent(buildMarketplaceRequest(event));
    } catch (error) {
      const marketplaceError = error instanceof MarketplaceMeteringError
        ? error
        : new MarketplaceMeteringError(500, error instanceof Error ? error.message : 'Marketplace submission failed');

      if (!refreshed && (marketplaceError.statusCode === 401 || marketplaceError.statusCode === 403) && this.client.refreshAccessToken) {
        await this.client.refreshAccessToken();
        await this.trySubmit(event, true);
        return;
      }

      throw marketplaceError;
    }
  }
}

export { buildMarketplacePayload };
