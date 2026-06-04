import { describe, expect, it, vi, beforeEach } from 'vitest';

import { logger } from '../lib/logger';
import { MarketplaceFulfillmentHttpClient } from '../lib/marketplace-fulfillment';

function createTokenProvider(token = 'oauth-token') {
  return {
    getAccessToken: vi.fn(async () => token),
    invalidate: vi.fn()
  };
}

describe('MarketplaceFulfillmentHttpClient', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  });

  it('sends plan and quantity when activating a subscription', async () => {
    const tokenProvider = createTokenProvider();
    const client = new MarketplaceFulfillmentHttpClient({
      baseUrl: 'https://marketplaceapi.microsoft.com',
      apiVersion: '2018-08-31',
      tokenProvider,
      logger,
      fetchImpl: fetchMock
    });

    await client.activateSubscription('sub-123', 'basic', 5, 'req-1', 'corr-1');

    expect(tokenProvider.getAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: 'https://marketplaceapi.microsoft.com/api/saas/subscriptions/sub-123/activate?api-version=2018-08-31' }),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer oauth-token',
          'x-ms-requestid': 'req-1',
          'x-ms-correlationid': 'corr-1'
        }),
        body: JSON.stringify({ planId: 'basic', quantity: 5 })
      })
    );
  });

  it('resolves via post with marketplace token and spec headers', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'sub-123',
          planId: 'basic',
          quantity: 5,
          saasSubscriptionStatus: 'PendingFulfillmentStart'
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const tokenProvider = createTokenProvider('oauth-token-2');
    const client = new MarketplaceFulfillmentHttpClient({
      baseUrl: 'https://marketplaceapi.microsoft.com',
      apiVersion: '2018-08-31',
      tokenProvider,
      logger,
      fetchImpl: fetchMock
    });

    await expect(client.resolveSubscription('marketplace-token', 'req-2', 'corr-2')).resolves.toMatchObject({
      marketplaceSubscriptionId: 'sub-123',
      planId: 'basic',
      quantity: 5
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: 'https://marketplaceapi.microsoft.com/api/saas/subscriptions/resolve?api-version=2018-08-31' }),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer oauth-token-2',
          'x-ms-requestid': 'req-2',
          'x-ms-correlationid': 'corr-2',
          'x-ms-marketplace-token': 'marketplace-token'
        }),
        body: undefined
      })
    );
  });

  it('uses delete for unsubscribe and patch for update', async () => {
    const tokenProvider = createTokenProvider('oauth-token-3');
    const client = new MarketplaceFulfillmentHttpClient({
      baseUrl: 'https://marketplaceapi.microsoft.com',
      apiVersion: '2018-08-31',
      tokenProvider,
      logger,
      fetchImpl: fetchMock
    });

    await client.unsubscribeSubscription('sub-123', 'req-3', 'corr-3');
    await client.updateSubscription('sub-123', 'pro', 12, 'req-4', 'corr-4');
    await client.reinstateSubscription('sub-123', 'req-5', 'corr-5');

    expect(tokenProvider.getAccessToken).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ href: 'https://marketplaceapi.microsoft.com/api/saas/subscriptions/sub-123?api-version=2018-08-31' }),
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: 'Bearer oauth-token-3',
          'x-ms-requestid': 'req-3',
          'x-ms-correlationid': 'corr-3'
        }),
        body: undefined
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ href: 'https://marketplaceapi.microsoft.com/api/saas/subscriptions/sub-123?api-version=2018-08-31' }),
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          Authorization: 'Bearer oauth-token-3',
          'x-ms-requestid': 'req-4',
          'x-ms-correlationid': 'corr-4'
        }),
        body: JSON.stringify({ planId: 'pro', quantity: 12 })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ href: 'https://marketplaceapi.microsoft.com/api/saas/subscriptions/sub-123/reinstate?api-version=2018-08-31' }),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer oauth-token-3',
          'x-ms-requestid': 'req-5',
          'x-ms-correlationid': 'corr-5'
        }),
        body: undefined
      })
    );
  });

  it('gets and updates marketplace operations', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'op-123',
            subscriptionId: 'sub-123',
            action: 'ChangePlan',
            status: 'InProgress',
            planId: 'scale'
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const tokenProvider = createTokenProvider('oauth-token-4');
    const client = new MarketplaceFulfillmentHttpClient({
      baseUrl: 'https://marketplaceapi.microsoft.com',
      apiVersion: '2018-08-31',
      tokenProvider,
      logger,
      fetchImpl: fetchMock
    });

    const operation = await client.getOperation('sub-123', 'op-123', 'req-5', 'corr-5');
    await client.updateOperationStatus('sub-123', 'op-123', 'Success', 'req-6', 'corr-6');

    expect(operation).toMatchObject({
      id: 'op-123',
      subscriptionId: 'sub-123',
      action: 'ChangePlan',
      status: 'InProgress',
      planId: 'scale'
    });
    expect(tokenProvider.getAccessToken).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        href: 'https://marketplaceapi.microsoft.com/api/saas/subscriptions/sub-123/operations/op-123?api-version=2018-08-31'
      }),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer oauth-token-4',
          'x-ms-requestid': 'req-5',
          'x-ms-correlationid': 'corr-5'
        }),
        body: undefined
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        href: 'https://marketplaceapi.microsoft.com/api/saas/subscriptions/sub-123/operations/op-123?api-version=2018-08-31'
      }),
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          Authorization: 'Bearer oauth-token-4',
          'x-ms-requestid': 'req-6',
          'x-ms-correlationid': 'corr-6'
        }),
        body: JSON.stringify({ status: 'Success' })
      })
    );
  });

  it('wraps token acquisition failures with fulfillment context', async () => {
    const tokenProvider = {
      getAccessToken: vi.fn(async () => {
        throw Object.assign(new Error('AADSTS7000215'), {
          statusCode: 401,
          responseBody: { error: 'invalid_client' }
        });
      }),
      invalidate: vi.fn()
    };
    const client = new MarketplaceFulfillmentHttpClient({
      baseUrl: 'https://marketplaceapi.microsoft.com',
      apiVersion: '2018-08-31',
      tokenProvider,
      logger,
      fetchImpl: fetchMock
    });

    await expect(client.activateSubscription('sub-123', 'basic', 5, 'req-7', 'corr-7')).rejects.toMatchObject({
      name: 'MarketplaceFulfillmentError',
      action: 'activate:acquire-access-token',
      statusCode: 401,
      message: expect.stringContaining('Azure AD access token'),
      responseBody: { error: 'invalid_client' }
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
