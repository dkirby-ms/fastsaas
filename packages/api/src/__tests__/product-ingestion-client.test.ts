import { describe, expect, it, vi } from 'vitest';

import type { PartnerCenterAccountRecord, PartnerCenterCredentialRecord } from '../repositories/partner-center-repository';
import {
  ProductIngestionHttpClient,
  ProductIngestionJobFailedError,
  type ProductIngestionClientOptions
} from '../lib/product-ingestion-client';
import { PRODUCT_INGESTION_SCHEMAS } from '../lib/product-ingestion-types';

const account: PartnerCenterAccountRecord = {
  id: 'account-1',
  tenantId: 'tenant-1',
  pcTenantId: 'pc-tenant-1',
  clientId: 'client-1',
  authMode: 'CLIENT_SECRET',
  connectionStatus: 'CONNECTED',
  createdAt: '2026-06-02T01:49:24.679+00:00',
  updatedAt: '2026-06-02T01:49:24.679+00:00'
};

const credential: PartnerCenterCredentialRecord = {
  id: 'credential-1',
  accountId: 'account-1',
  secretReference: 'env:PARTNER_CENTER_CLIENT_SECRET',
  createdAt: '2026-06-02T01:49:24.679+00:00',
  updatedAt: '2026-06-02T01:49:24.679+00:00'
};

function createClient(overrides: Partial<ProductIngestionClientOptions> = {}) {
  const fetchImpl = overrides.fetchImpl ?? vi.fn<typeof fetch>();
  const sleep = overrides.sleep ?? vi.fn(async () => undefined);
  const logger =
    overrides.logger ??
    ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child() {
        return this;
      }
    } as never);
  const authProvider =
    overrides.authProvider ??
    ({
      acquireGraphToken: vi.fn(async () => 'graph-token'),
      validateConnection: vi.fn(),
      invalidate: vi.fn()
    } as never);

  const client = new ProductIngestionHttpClient({
    logger,
    authProvider,
    account,
    credential,
    fetchImpl,
    sleep,
    ...overrides
  });

  return {
    client,
    fetchImpl,
    sleep,
    logger,
    authProvider
  };
}

describe('ProductIngestionHttpClient', () => {
  it('resolves a product by external ID before loading its resource tree', async () => {
    const { client, fetchImpl } = createClient({
      fetchImpl: vi.fn(async () =>
        new Response(
          JSON.stringify({
            $schema: PRODUCT_INGESTION_SCHEMAS.product,
            id: 'product/prod-123',
            identity: { externalId: 'contoso-saas' },
            type: 'softwareAsAService',
            alias: 'Contoso SaaS'
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      ) as typeof fetch
    });

    const response = await client.getProductByExternalId('contoso-saas');

    expect(response.id).toBe('product/prod-123');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const lookupUrl = fetchImpl.mock.calls[0]?.[0];
    expect(lookupUrl instanceof URL ? lookupUrl.href : String(lookupUrl)).toBe(
      'https://graph.microsoft.com/rp/product-ingestion/product?%24version=2022-03-01-preview5&externalId=contoso-saas'
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      headers: { Authorization: 'Bearer graph-token' }
    });
  });

  it('builds resource-tree requests with the schema version and target environment', async () => {
    const { client, fetchImpl } = createClient({
      fetchImpl: vi.fn(async () =>
        new Response(JSON.stringify({ root: 'product/prod-123', target: { targetType: 'preview' }, resources: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      ) as typeof fetch
    });

    const response = await client.getResourceTree('product/prod-123', 'preview');

    expect(response.root).toBe('product/prod-123');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const resourceTreeUrl = fetchImpl.mock.calls[0]?.[0];
    expect(resourceTreeUrl instanceof URL ? resourceTreeUrl.href : String(resourceTreeUrl)).toBe(
      'https://graph.microsoft.com/rp/product-ingestion/resource-tree/product/prod-123?%24version=2022-03-01-preview5&targetType=preview'
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      headers: { Authorization: 'Bearer graph-token' }
    });
  });

  it('serializes configure payloads and normalizes configure status responses', async () => {
    const { client, fetchImpl } = createClient({
      fetchImpl: vi.fn(async () =>
        new Response(
          JSON.stringify({
            $schema: PRODUCT_INGESTION_SCHEMAS.configureStatus,
            jobID: 'job-123',
            jobStatus: 'running',
            jobResult: 'pending',
            errors: []
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      ) as typeof fetch
    });

    const request = {
      $schema: PRODUCT_INGESTION_SCHEMAS.configure,
      resources: [
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.product,
          resourceName: 'myProduct',
          identity: { externalId: 'contoso-saas' },
          type: 'softwareAsAService',
          alias: 'Contoso SaaS'
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.plan,
          resourceName: 'myPlan',
          product: { resourceName: 'myProduct' },
          identity: { externalId: 'starter' },
          alias: 'Starter'
        }
      ]
    } as const;

    const status = await client.configure(request);

    expect(status).toMatchObject({
      jobId: 'job-123',
      jobStatus: 'running',
      jobResult: 'pending'
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const configureUrl = fetchImpl.mock.calls[0]?.[0];
    expect(configureUrl instanceof URL ? configureUrl.href : String(configureUrl)).toBe(
      'https://graph.microsoft.com/rp/product-ingestion/configure?%24version=2022-03-01-preview5'
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify(request)
    });
  });

  it('retries transient failures with exponential backoff and retry-after support', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('slow down', { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(new Response('still failing', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jobId: 'job-234', jobStatus: 'completed', jobResult: 'succeeded', errors: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );
    const sleep = vi.fn(async () => undefined);

    const { client } = createClient({ fetchImpl, sleep, retryBaseDelayMs: 100 });

    const status = await client.getConfigureStatus('job-234');

    expect(status.jobResult).toBe('succeeded');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 2000);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });

  it('throws structured job failures with resource-level details', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobId: 'job-345',
            jobStatus: 'completed',
            jobResult: 'failed',
            errors: [
              {
                code: 'badRequest',
                message: 'Validation failed',
                resourceId: { resourceName: 'myPlan' },
                details: [
                  {
                    code: 'schemaValidationError',
                    message: 'Missing pricing block',
                    resourceId: 'plan/product-123/plan-456'
                  }
                ]
              }
            ]
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ $schema: PRODUCT_INGESTION_SCHEMAS.configureDetail, resources: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );

    const { client } = createClient({ fetchImpl });

    await expect(client.waitForConfigureCompletion('job-345', { timeoutMs: 10, pollIntervalMs: 1 })).rejects.toMatchObject({
      name: 'ProductIngestionJobFailedError',
      job: expect.objectContaining({ jobId: 'job-345', jobResult: 'failed' }),
      failures: [
        {
          level: 'job',
          code: 'badRequest',
          message: 'Validation failed',
          resourceId: { resourceName: 'myPlan' }
        },
        {
          level: 'detail',
          code: 'schemaValidationError',
          message: 'Missing pricing block',
          resourceId: 'plan/product-123/plan-456'
        }
      ]
    } satisfies Partial<ProductIngestionJobFailedError>);
  });

  it('returns configure job details after a successful wait', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jobId: 'job-456', jobStatus: 'running', jobResult: 'pending', errors: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jobId: 'job-456', jobStatus: 'completed', jobResult: 'succeeded', errors: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            $schema: PRODUCT_INGESTION_SCHEMAS.configureDetail,
            resources: [
              {
                $schema: PRODUCT_INGESTION_SCHEMAS.product,
                id: 'product/prod-456',
                identity: { externalId: 'contoso-saas' },
                type: 'softwareAsAService',
                alias: 'Contoso SaaS'
              }
            ]
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      );
    const sleep = vi.fn(async () => undefined);

    const { client } = createClient({ fetchImpl, sleep });

    const detail = await client.waitForConfigureCompletion('job-456', { pollIntervalMs: 25, timeoutMs: 500 });

    expect(detail.resources).toHaveLength(1);
    expect(detail.resources[0]).toMatchObject({ id: 'product/prod-456' });
    expect(sleep).toHaveBeenCalledWith(25);
  });
});
