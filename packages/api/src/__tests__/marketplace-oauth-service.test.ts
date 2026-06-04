import { describe, expect, it, vi } from 'vitest';

import { MarketplaceOAuthService } from '../services/marketplace-oauth-service';

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child() {
      return this;
    }
  } as never;
}

function createMarketplaceConfig() {
  return {
    baseUrl: 'https://marketplaceapi.microsoft.com',
    apiVersion: '2018-08-31',
    clientId: 'marketplace-client-id',
    tenantId: 'marketplace-tenant-id',
    clientSecret: 'marketplace-client-secret',
    tokenScope: 'https://graph.microsoft.com/.default',
    productIngestionBaseUrl: 'https://graph.microsoft.com/rp/product-ingestion',
    jwksUri: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
    expectedAudience: 'marketplace-client-id',
    webhookAuthMode: 'jwt' as const
  };
}

describe('MarketplaceOAuthService', () => {
  it('caches access tokens until they near expiration', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'oauth-token-1', expires_in: 3600, token_type: 'Bearer' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );

    const service = new MarketplaceOAuthService({
      logger: createLogger(),
      marketplace: createMarketplaceConfig(),
      fetchImpl: fetchMock,
      now: () => new Date('2026-06-02T16:16:43Z')
    });

    await expect(service.getAccessToken()).resolves.toBe('oauth-token-1');
    await expect(service.getAccessToken()).resolves.toBe('oauth-token-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes cached tokens when they are within the five-minute expiry buffer', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'oauth-token-1', expires_in: 330, token_type: 'Bearer' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'oauth-token-2', expires_in: 3600, token_type: 'Bearer' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );
    const nowValues = [new Date('2026-06-02T16:16:43Z'), new Date('2026-06-02T16:17:14Z')];

    const service = new MarketplaceOAuthService({
      logger: createLogger(),
      marketplace: createMarketplaceConfig(),
      fetchImpl: fetchMock,
      now: () => nowValues.shift() ?? new Date('2026-06-02T16:17:20Z')
    });

    await expect(service.getAccessToken()).resolves.toBe('oauth-token-1');
    await expect(service.getAccessToken()).resolves.toBe('oauth-token-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces Azure AD error details when token exchange fails', async () => {
    const service = new MarketplaceOAuthService({
      logger: createLogger(),
      marketplace: createMarketplaceConfig(),
      fetchImpl: vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: 'invalid_client',
            error_description: 'AADSTS7000215: Invalid client secret is provided.'
          }),
          {
            status: 401,
            headers: { 'content-type': 'application/json' }
          }
        )
      ) as typeof fetch,
      now: () => new Date('2026-06-02T16:16:43Z')
    });

    await expect(service.getAccessToken()).rejects.toMatchObject({
      name: 'PartnerCenterAuthError',
      action: 'acquire-marketplace-token',
      statusCode: 401,
      message: expect.stringContaining('invalid_client')
    });
  });
});
