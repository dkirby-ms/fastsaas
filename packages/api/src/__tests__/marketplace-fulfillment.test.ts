import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '../lib/logger';
import { MarketplaceFulfillmentHttpClient } from '../lib/marketplace-fulfillment';

describe('MarketplaceFulfillmentHttpClient', () => {
  const fetchMock = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    fetchMock.mockReset();
    global.fetch = originalFetch;
  });

  it('sends plan and quantity when activating a subscription', async () => {
    const client = new MarketplaceFulfillmentHttpClient({
      baseUrl: 'https://marketplaceapi.microsoft.com',
      apiVersion: '2018-08-31',
      authToken: 'test-token',
      logger
    });

    await client.activateSubscription('sub-123', 'basic', 5, 'req-1', 'corr-1');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: 'https://marketplaceapi.microsoft.com/api/saas/subscriptions/sub-123/activate?api-version=2018-08-31' }),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ planId: 'basic', quantity: 5 })
      })
    );
  });

  it('uses delete for unsubscribe and patch for update', async () => {
    const client = new MarketplaceFulfillmentHttpClient({
      baseUrl: 'https://marketplaceapi.microsoft.com',
      apiVersion: '2018-08-31',
      authToken: 'test-token',
      logger
    });

    await client.unsubscribeSubscription('sub-123', 'req-2', 'corr-2');
    await client.updateSubscription('sub-123', 'pro', 12, 'req-3', 'corr-3');
    await client.reinstateSubscription('sub-123', 'req-4', 'corr-4');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ href: 'https://marketplaceapi.microsoft.com/api/saas/subscriptions/sub-123?api-version=2018-08-31' }),
      expect.objectContaining({ method: 'DELETE', body: undefined })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ href: 'https://marketplaceapi.microsoft.com/api/saas/subscriptions/sub-123?api-version=2018-08-31' }),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ planId: 'pro', quantity: 12 })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ href: 'https://marketplaceapi.microsoft.com/api/saas/subscriptions/sub-123/reinstate?api-version=2018-08-31' }),
      expect.objectContaining({ method: 'POST', body: undefined })
    );
  });
});
