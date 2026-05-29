import { logger } from '../lib/logger';

export interface MarketplaceUsageEventPayload {
  resourceId: string;
  quantity: number;
  dimension: string;
  effectiveStartTime: string;
  planId: string;
}

export interface MarketplaceSubmitUsageEvent {
  tenantId: string;
  eventId: string;
  idempotencyKey: string;
  payload: MarketplaceUsageEventPayload;
}

export interface MarketplaceMeteringClient {
  submitUsageEvent(event: MarketplaceSubmitUsageEvent): Promise<void>;
  refreshAccessToken?(): Promise<void>;
}

export class MarketplaceMeteringError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'MarketplaceMeteringError';
  }
}

export class HttpMarketplaceMeteringClient implements MarketplaceMeteringClient {
  constructor(private readonly endpoint?: string, private readonly apiKey?: string) {}

  async submitUsageEvent(event: MarketplaceSubmitUsageEvent): Promise<void> {
    if (!this.endpoint) {
      logger.warn({ eventId: event.eventId }, 'Marketplace metering endpoint not configured; simulating submission');
      return;
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {})
      },
      body: JSON.stringify(event.payload)
    });

    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after') ?? undefined);
      const body = await response.text().catch(() => 'Marketplace metering request failed');
      throw new MarketplaceMeteringError(response.status, body || 'Marketplace metering request failed', Number.isFinite(retryAfter) ? retryAfter : undefined);
    }
  }

  async refreshAccessToken(): Promise<void> {
    logger.info('Marketplace metering client refresh requested');
  }
}
