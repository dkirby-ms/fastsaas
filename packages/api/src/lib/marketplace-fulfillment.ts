import { URL } from 'node:url';

import type { Logger } from 'pino';

export interface FulfillmentResolveResult {
  marketplaceSubscriptionId: string;
  planId: string;
  quantity: number;
  offerId?: string;
  purchaserTenantId?: string;
  beneficiaryTenantId?: string;
  metadata?: Record<string, unknown>;
}

export interface MarketplaceFulfillmentClient {
  resolveSubscription(marketplaceToken: string, requestId: string, correlationId: string): Promise<FulfillmentResolveResult>;
  activateSubscription(marketplaceSubscriptionId: string, planId: string, quantity: number, requestId: string, correlationId: string): Promise<void>;
  suspendSubscription(marketplaceSubscriptionId: string, requestId: string, correlationId: string): Promise<void>;
  unsubscribeSubscription(marketplaceSubscriptionId: string, requestId: string, correlationId: string): Promise<void>;
  updateSubscription(marketplaceSubscriptionId: string, planId: string, quantity: number, requestId: string, correlationId: string): Promise<void>;
  reinstateSubscription(marketplaceSubscriptionId: string, requestId: string, correlationId: string): Promise<void>;
}

export class MarketplaceFulfillmentError extends Error {
  constructor(
    message: string,
    public readonly action: string,
    public readonly statusCode: number,
    public readonly responseBody?: unknown
  ) {
    super(message);
    this.name = 'MarketplaceFulfillmentError';
  }
}

interface MarketplaceHttpClientOptions {
  baseUrl: string;
  apiVersion: string;
  authToken: string;
  logger: Logger;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text.length > 0 ? text : undefined;
}

export class MarketplaceFulfillmentHttpClient implements MarketplaceFulfillmentClient {
  constructor(private readonly options: MarketplaceHttpClientOptions) {}

  async resolveSubscription(marketplaceToken: string, requestId: string, correlationId: string): Promise<FulfillmentResolveResult> {
    const url = new URL('/api/saas/subscriptions/resolve', this.options.baseUrl);
    url.searchParams.set('api-version', this.options.apiVersion);
    url.searchParams.set('token', marketplaceToken);

    return this.request<FulfillmentResolveResult>(url, {
      method: 'GET',
      action: 'resolve',
      requestId,
      correlationId
    });
  }

  async activateSubscription(
    marketplaceSubscriptionId: string,
    planId: string,
    quantity: number,
    requestId: string,
    correlationId: string
  ): Promise<void> {
    const url = new URL(`/api/saas/subscriptions/${encodeURIComponent(marketplaceSubscriptionId)}/activate`, this.options.baseUrl);
    url.searchParams.set('api-version', this.options.apiVersion);

    await this.request(url, {
      method: 'POST',
      action: 'activate',
      requestId,
      correlationId,
      body: { planId, quantity }
    });
  }

  async suspendSubscription(marketplaceSubscriptionId: string, requestId: string, correlationId: string): Promise<void> {
    const url = new URL(`/api/saas/subscriptions/${encodeURIComponent(marketplaceSubscriptionId)}/suspend`, this.options.baseUrl);
    url.searchParams.set('api-version', this.options.apiVersion);

    await this.request(url, {
      method: 'POST',
      action: 'suspend',
      requestId,
      correlationId,
      body: {}
    });
  }

  async unsubscribeSubscription(marketplaceSubscriptionId: string, requestId: string, correlationId: string): Promise<void> {
    const url = new URL(`/api/saas/subscriptions/${encodeURIComponent(marketplaceSubscriptionId)}`, this.options.baseUrl);
    url.searchParams.set('api-version', this.options.apiVersion);

    await this.request(url, {
      method: 'DELETE',
      action: 'unsubscribe',
      requestId,
      correlationId
    });
  }

  async updateSubscription(
    marketplaceSubscriptionId: string,
    planId: string,
    quantity: number,
    requestId: string,
    correlationId: string
  ): Promise<void> {
    const url = new URL(`/api/saas/subscriptions/${encodeURIComponent(marketplaceSubscriptionId)}`, this.options.baseUrl);
    url.searchParams.set('api-version', this.options.apiVersion);

    await this.request(url, {
      method: 'PATCH',
      action: 'update',
      requestId,
      correlationId,
      body: { planId, quantity }
    });
  }

  async reinstateSubscription(marketplaceSubscriptionId: string, requestId: string, correlationId: string): Promise<void> {
    const url = new URL(`/api/saas/subscriptions/${encodeURIComponent(marketplaceSubscriptionId)}/reinstate`, this.options.baseUrl);
    url.searchParams.set('api-version', this.options.apiVersion);

    await this.request(url, {
      method: 'POST',
      action: 'reinstate',
      requestId,
      correlationId
    });
  }

  private async request<T = void>(
    url: URL,
    options: {
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      action: string;
      requestId: string;
      correlationId: string;
      body?: Record<string, unknown>;
    }
  ): Promise<T> {
    const response = await fetch(url, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${this.options.authToken}`,
        'Content-Type': 'application/json',
        'x-request-id': options.requestId,
        'x-correlation-id': options.correlationId
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
      const responseBody = await parseResponseBody(response);
      this.options.logger.warn(
        {
          action: options.action,
          correlationId: options.correlationId,
          requestId: options.requestId,
          statusCode: response.status,
          responseBody
        },
        'Marketplace fulfillment API returned a non-success response'
      );

      throw new MarketplaceFulfillmentError(
        `Marketplace fulfillment ${options.action} request failed with status ${response.status}`,
        options.action,
        response.status,
        responseBody
      );
    }

    return (await parseResponseBody(response)) as T;
  }
}
