import { describe, expect, it, vi } from 'vitest';

import { PartnerCenterAuthService } from '../services/partner-center-auth';

describe('PartnerCenterAuthService', () => {
  it('caches Graph tokens until they near expiration', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'graph-token-1', expires_in: 3600, token_type: 'Bearer' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );

    const service = new PartnerCenterAuthService({
      logger: { info() {}, warn() {}, error() {}, child() { return this; } } as never,
      tenantId: 'pc-tenant-1',
      clientId: 'client-1',
      secretReference: 'env:PARTNER_CENTER_CLIENT_SECRET',
      fetchImpl: fetchMock,
      secretResolver: async () => 'super-secret'
    });

    const firstToken = await service.acquireGraphToken();
    const secondToken = await service.acquireGraphToken();

    expect(firstToken).toBe('graph-token-1');
    expect(secondToken).toBe('graph-token-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('validates Product Ingestion access and enriches the connection with organization details when available', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'graph-token-2', expires_in: 3600, token_type: 'Bearer' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: [{ id: 'org-1', displayName: 'Contoso' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );

    const service = new PartnerCenterAuthService({
      logger: { info() {}, warn() {}, error() {}, child() { return this; } } as never,
      tenantId: 'pc-tenant-1',
      clientId: 'client-1',
      secretReference: 'env:PARTNER_CENTER_CLIENT_SECRET',
      fetchImpl: fetchMock,
      secretResolver: async () => 'super-secret'
    });

    const result = await service.validateConnection();

    expect(result).toEqual({ organizationId: 'org-1', displayName: 'Contoso' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
