import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import type { ProductIngestionClientLike } from '../lib/product-ingestion-client';
import { PRODUCT_INGESTION_SCHEMAS, type ProductIngestionConfigureDetail, type ProductIngestionConfigureStatus } from '../lib/product-ingestion-types';
import { InMemoryMarketplaceJobRepository, type MarketplaceJobRecord } from '../repositories/marketplace-job-repository';
import { InMemoryPartnerCenterRepository } from '../repositories/partner-center-repository';
import type { PartnerCenterAuthProvider } from './partner-center-auth';
import { JobPollingService, calculatePollDelayMs } from './job-polling-service';

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis()
} as unknown as Logger;

const authProvider: PartnerCenterAuthProvider = {
  acquireGraphToken: vi.fn(async () => 'graph-token'),
  validateConnection: vi.fn(async () => ({ organizationId: 'org-1', displayName: 'Test Org' })),
  invalidate: vi.fn()
};

function createStatus(overrides: Partial<ProductIngestionConfigureStatus> = {}): ProductIngestionConfigureStatus {
  return {
    $schema: PRODUCT_INGESTION_SCHEMAS.configureStatus,
    jobId: 'job-123',
    jobStatus: 'running',
    jobResult: 'pending',
    errors: [],
    ...overrides
  };
}

function createDetail(): ProductIngestionConfigureDetail {
  return {
    $schema: PRODUCT_INGESTION_SCHEMAS.configureDetail,
    resources: [
      {
        $schema: PRODUCT_INGESTION_SCHEMAS.product,
        alias: 'test-product',
        identity: { externalId: 'prod-1' },
        type: 'softwareAsAService'
      }
    ]
  };
}

async function seedPartnerCenter(repository: InMemoryPartnerCenterRepository, tenantId = 'publisher-tenant'): Promise<void> {
  await repository.saveConnection({
    tenantId,
    pcTenantId: 'pc-tenant',
    clientId: 'pc-client',
    authMode: 'CLIENT_SECRET',
    connectionStatus: 'CONNECTED',
    secretReference: 'env:PARTNER_CENTER_CLIENT_SECRET'
  });
}

async function seedJob(repository: InMemoryMarketplaceJobRepository, overrides: Partial<MarketplaceJobRecord> = {}): Promise<MarketplaceJobRecord> {
  return repository.createJob({
    publisherTenantId: overrides.publisherTenantId ?? 'publisher-tenant',
    jobId: overrides.jobId ?? 'job-123',
    requestPayloadHash: overrides.requestPayloadHash ?? 'hash-123',
    status: overrides.status ?? 'submitted',
    result: overrides.result ?? { poll: { attemptCount: 0 } },
    errors: overrides.errors ?? [],
    createdAt: overrides.createdAt,
    polledAt: overrides.polledAt ?? null,
    completedAt: overrides.completedAt ?? null,
    productId: overrides.productId ?? null
  });
}

function createService(client: ProductIngestionClientLike, overrides: { now?: () => Date; random?: () => number; maxPollDurationMs?: number } = {}) {
  const repository = new InMemoryMarketplaceJobRepository();
  const partnerCenterRepository = new InMemoryPartnerCenterRepository();
  const service = new JobPollingService(repository, partnerCenterRepository, authProvider, logger, {
    now: overrides.now,
    random: overrides.random,
    maxPollDurationMs: overrides.maxPollDurationMs,
    clientFactory: () => client
  });

  return { repository, partnerCenterRepository, service };
}

describe('JobPollingService', () => {
  it('transitions a submitted job to running and then completed', async () => {
    const nowValues = [
      new Date('2026-06-02T12:03:22.730Z'),
      new Date('2026-06-02T12:03:27.730Z')
    ];
    const getConfigureStatus = vi
      .fn<() => Promise<ProductIngestionConfigureStatus>>()
      .mockResolvedValueOnce(createStatus({ jobStatus: 'running', jobResult: 'pending' }))
      .mockResolvedValueOnce(createStatus({ jobStatus: 'completed', jobResult: 'succeeded', jobEnd: '2026-06-02T12:03:27.730Z' }));
    const client: ProductIngestionClientLike = {
      getProductByExternalId: vi.fn(),
      getResourceTree: vi.fn(),
      configure: vi.fn(),
      getConfigureStatus,
      getConfigureJobDetails: vi.fn(async () => createDetail()),
      cancelConfigure: vi.fn(),
      waitForConfigureCompletion: vi.fn()
    };
    const { repository, partnerCenterRepository, service } = createService(client, {
      now: () => nowValues.shift() ?? new Date('2026-06-02T12:03:27.730Z'),
      random: () => 0
    });
    await seedPartnerCenter(partnerCenterRepository);
    const job = await seedJob(repository);

    const running = await service.pollJob(job);
    expect(running.status).toBe('running');
    expect(running.result?.poll?.attemptCount).toBe(1);
    expect(running.result?.poll?.nextPollAt).toBe('2026-06-02T12:03:27.730Z');

    const completed = await service.pollJob(running);
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBe('2026-06-02T12:03:27.730Z');
    expect(completed.result?.detail?.resources).toHaveLength(1);
  });

  it('filters listed jobs by productId when requested', async () => {
    const client: ProductIngestionClientLike = {
      getProductByExternalId: vi.fn(),
      getResourceTree: vi.fn(),
      configure: vi.fn(),
      getConfigureStatus: vi.fn(),
      getConfigureJobDetails: vi.fn(),
      cancelConfigure: vi.fn(),
      waitForConfigureCompletion: vi.fn()
    };
    const { repository, service } = createService(client);
    await seedJob(repository, { jobId: 'job-123', productId: 'offer-1', createdAt: '2026-06-02T12:03:22.730Z' });
    await seedJob(repository, { jobId: 'job-456', productId: 'offer-2', createdAt: '2026-06-02T12:04:22.730Z' });

    const listed = await service.listJobs('publisher-tenant', { productId: 'offer-1', page: 1, pageSize: 10 });

    expect(listed.total).toBe(1);
    expect(listed.jobs).toHaveLength(1);
    expect(listed.jobs[0]).toMatchObject({ jobId: 'job-123', productId: 'offer-1' });
  });

  it('captures flattened per-resource errors for failed jobs', async () => {
    const client: ProductIngestionClientLike = {
      getProductByExternalId: vi.fn(),
      getResourceTree: vi.fn(),
      configure: vi.fn(),
      getConfigureStatus: vi.fn(async () =>
        createStatus({
          jobStatus: 'completed',
          jobResult: 'failed',
          errors: [
            {
              code: 'badRequest',
              message: 'Validation failed',
              resourceId: { resourceName: 'plan-a' },
              details: [
                {
                  code: 'schemaValidationError',
                  message: 'Missing title',
                  resourceId: { resourceName: 'listing-en-us' }
                }
              ]
            }
          ]
        })
      ),
      getConfigureJobDetails: vi.fn(async () => createDetail()),
      cancelConfigure: vi.fn(),
      waitForConfigureCompletion: vi.fn()
    };
    const { repository, partnerCenterRepository, service } = createService(client, {
      now: () => new Date('2026-06-02T12:03:22.730Z'),
      random: () => 0
    });
    await seedPartnerCenter(partnerCenterRepository);
    const job = await seedJob(repository);

    const failed = await service.pollJob(job);

    expect(failed.status).toBe('failed');
    expect(failed.errors).toEqual([
      {
        level: 'job',
        code: 'badRequest',
        message: 'Validation failed',
        resourceId: { resourceName: 'plan-a' }
      },
      {
        level: 'detail',
        code: 'schemaValidationError',
        message: 'Missing title',
        resourceId: { resourceName: 'listing-en-us' }
      }
    ]);
  });

  it('cancels a running job and stores the cancelled state', async () => {
    const client: ProductIngestionClientLike = {
      getProductByExternalId: vi.fn(),
      getResourceTree: vi.fn(),
      configure: vi.fn(),
      getConfigureStatus: vi.fn(),
      getConfigureJobDetails: vi.fn(async () => createDetail()),
      cancelConfigure: vi.fn(async () => createStatus({ jobStatus: 'completed', jobResult: 'cancelled', jobEnd: '2026-06-02T12:05:22.730Z' })),
      waitForConfigureCompletion: vi.fn()
    };
    const { repository, partnerCenterRepository, service } = createService(client, {
      now: () => new Date('2026-06-02T12:04:22.730Z'),
      random: () => 0
    });
    await seedPartnerCenter(partnerCenterRepository);
    await seedJob(repository, {
      status: 'running',
      result: { poll: { attemptCount: 1, nextPollAt: '2026-06-02T12:05:22.730Z' } }
    });

    const cancelled = await service.cancelJob(
      {
        tenantId: 'publisher-tenant',
        userId: 'user-1',
        requestId: 'req-1',
        correlationId: 'corr-1'
      },
      'job-123'
    );

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.completedAt).toBe('2026-06-02T12:05:22.730Z');
  });

  it('uses exponential backoff with jitter for polling intervals', () => {
    expect(calculatePollDelayMs(1, { pollBaseDelayMs: 1_000, pollMaxDelayMs: 10_000, pollJitterRatio: 0.25 }, () => 0.5)).toBe(1125);
    expect(calculatePollDelayMs(4, { pollBaseDelayMs: 1_000, pollMaxDelayMs: 10_000, pollJitterRatio: 0.25 }, () => 1)).toBe(10000);
  });

  it('marks long-running jobs as timed out', async () => {
    const client: ProductIngestionClientLike = {
      getProductByExternalId: vi.fn(),
      getResourceTree: vi.fn(),
      configure: vi.fn(),
      getConfigureStatus: vi.fn(),
      getConfigureJobDetails: vi.fn(),
      cancelConfigure: vi.fn(),
      waitForConfigureCompletion: vi.fn()
    };
    const { repository, partnerCenterRepository, service } = createService(client, {
      now: () => new Date('2026-06-02T12:13:22.730Z'),
      random: () => 0,
      maxPollDurationMs: 60_000
    });
    await seedPartnerCenter(partnerCenterRepository);
    const job = await seedJob(repository, {
      createdAt: '2026-06-02T12:03:22.730Z',
      status: 'running'
    });

    expect(service.isPollingTimedOut(job)).toBe(true);
    const failed = await service.markTimedOut(job);
    expect(failed.status).toBe('failed');
    expect(failed.errors.at(-1)).toMatchObject({ code: 'poll_timeout' });
  });
});
