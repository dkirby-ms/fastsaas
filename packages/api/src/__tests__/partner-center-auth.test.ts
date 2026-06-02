import { describe, expect, it, vi } from 'vitest';

import type { PartnerCenterAccountRecord, PartnerCenterCredentialRecord } from '../repositories/partner-center-repository';
import { PartnerCenterAuthService } from '../services/partner-center-auth';

const account: PartnerCenterAccountRecord = {
  id: 'account-1',
  tenantId: 'tenant-1',
  pcTenantId: 'pc-tenant-1',
  clientId: 'client-1',
  authMode: 'CLIENT_SECRET',
  connectionStatus: 'PENDING',
  createdAt: '2026-06-02T00:44:50.069+00:00',
  updatedAt: '2026-06-02T00:44:50.069+00:00'
};

const credential: PartnerCenterCredentialRecord = {
  id: 'credential-1',
  accountId: 'account-1',
  secretReference: 'env:PARTNER_CENTER_CLIENT_SECRET',
  createdAt: '2026-06-02T00:44:50.069+00:00',
  updatedAt: '2026-06-02T00:44:50.069+00:00'
};

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
      fetchImpl: fetchMock,
      secretResolver: async () => 'super-secret'
    });

    const firstToken = await service.acquireGraphToken(account, credential);
    const secondToken = await service.acquireGraphToken(account, credential);

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
      fetchImpl: fetchMock,
      secretResolver: async () => 'super-secret'
    });

    const result = await service.validateConnection(account, credential);

    expect(result).toEqual({ organizationId: 'org-1', displayName: 'Contoso' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
