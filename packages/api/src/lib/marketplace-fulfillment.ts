import { URL } from 'node:url';

import type { Logger } from 'pino';

import type { MarketplaceBearerTokenProvider } from '../services/marketplace-oauth-service';

export interface FulfillmentResolveResult {
  marketplaceSubscriptionId: string;
  planId: string;
  quantity: number;
  offerId?: string;
  purchaserTenantId?: string;
  beneficiaryTenantId?: string;
  metadata?: Record<string, unknown>;
}

export interface FulfillmentOperationResult {
  id: string;
  subscriptionId: string;
  action: string;
  status: string;
  offerId?: string;
  publisherId?: string;
  planId?: string;
  quantity?: number;
  errorStatusCode?: string;
  errorMessage?: string;
}

export interface MarketplaceFulfillmentClient {
  resolveSubscription(marketplaceToken: string, requestId: string, correlationId: string): Promise<FulfillmentResolveResult>;
  activateSubscription(marketplaceSubscriptionId: string, planId: string, quantity: number, requestId: string, correlationId: string): Promise<void>;
  suspendSubscription(marketplaceSubscriptionId: string, requestId: string, correlationId: string): Promise<void>;
  unsubscribeSubscription(marketplaceSubscriptionId: string, requestId: string, correlationId: string): Promise<void>;
  updateSubscription(marketplaceSubscriptionId: string, planId: string, quantity: number, requestId: string, correlationId: string): Promise<void>;
  reinstateSubscription(marketplaceSubscriptionId: string, requestId: string, correlationId: string): Promise<void>;
  getOperation(marketplaceSubscriptionId: string, operationId: string, requestId: string, correlationId: string): Promise<FulfillmentOperationResult>;
  updateOperationStatus(
    marketplaceSubscriptionId: string,
    operationId: string,
    status: 'Success' | 'Failure',
    requestId: string,
    correlationId: string
  ): Promise<void>;
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

export const MARKETPLACE_FULFILLMENT_TOKEN_SCOPE = '20e940b3-4c77-4b0b-9a53-9e16a1b010a7/.default';

interface MarketplaceHttpClientOptions {
  baseUrl: string;
  apiVersion: string;
  tokenProvider: MarketplaceBearerTokenProvider;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

function extractErrorStatusCode(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
    ? error.statusCode
    : undefined;
}

function extractErrorResponseBody(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'responseBody' in error ? error.responseBody : error;
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
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: MarketplaceHttpClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

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

  async getOperation(
    marketplaceSubscriptionId: string,
    operationId: string,
    requestId: string,
    correlationId: string
  ): Promise<FulfillmentOperationResult> {
    const url = new URL(
      `/api/saas/subscriptions/${encodeURIComponent(marketplaceSubscriptionId)}/operations/${encodeURIComponent(operationId)}`,
      this.options.baseUrl
    );
    url.searchParams.set('api-version', this.options.apiVersion);

    const response = await this.request<Record<string, unknown>>(url, {
      method: 'GET',
      action: 'get-operation',
      requestId,
      correlationId
    });

    return {
      id: typeof response.id === 'string' ? response.id : operationId,
      subscriptionId:
        typeof response.subscriptionId === 'string' ? response.subscriptionId : marketplaceSubscriptionId,
      action: typeof response.action === 'string' ? response.action : 'Unknown',
      status: typeof response.status === 'string' ? response.status : 'Unknown',
      offerId: typeof response.offerId === 'string' ? response.offerId : undefined,
      publisherId: typeof response.publisherId === 'string' ? response.publisherId : undefined,
      planId: typeof response.planId === 'string' ? response.planId : undefined,
      quantity: typeof response.quantity === 'number' ? response.quantity : undefined,
      errorStatusCode: typeof response.errorStatusCode === 'string' ? response.errorStatusCode : undefined,
      errorMessage: typeof response.errorMessage === 'string' ? response.errorMessage : undefined
    };
  }

  async updateOperationStatus(
    marketplaceSubscriptionId: string,
    operationId: string,
    status: 'Success' | 'Failure',
    requestId: string,
    correlationId: string
  ): Promise<void> {
    const url = new URL(
      `/api/saas/subscriptions/${encodeURIComponent(marketplaceSubscriptionId)}/operations/${encodeURIComponent(operationId)}`,
      this.options.baseUrl
    );
    url.searchParams.set('api-version', this.options.apiVersion);

    await this.request(url, {
      method: 'PATCH',
      action: 'update-operation',
      requestId,
      correlationId,
      body: { status }
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
    let accessToken: string;

    try {
      accessToken = await this.options.tokenProvider.getAccessToken();
    } catch (error) {
      const statusCode = extractErrorStatusCode(error) ?? 503;
      const responseBody = extractErrorResponseBody(error);
      this.options.logger.warn(
        {
          action: options.action,
          correlationId: options.correlationId,
          requestId: options.requestId,
          statusCode,
          responseBody
        },
        'Marketplace fulfillment token acquisition failed'
      );

      throw new MarketplaceFulfillmentError(
        `Marketplace fulfillment ${options.action} request could not acquire an Azure AD access token`,
        `${options.action}:acquire-access-token`,
        statusCode,
        responseBody
      );
    }

    const response = await this.fetchImpl(url, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
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
