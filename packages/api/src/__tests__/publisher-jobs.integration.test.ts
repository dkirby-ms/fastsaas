import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PRODUCT_INGESTION_SCHEMAS } from '../lib/product-ingestion-types';
import { createSecurityHarness, type SecurityHarness } from './security/test-harness';

let harness: SecurityHarness;

beforeAll(async () => {
  harness = await createSecurityHarness();
});

afterAll(async () => {
  await harness.close();
});

describe('publisher Product Ingestion job routes', () => {
  it('lists tenant-scoped jobs, returns detail, and cancels a running job', async () => {
    const adminToken = await harness.createToken({
      tenantId: 'publisher-admin',
      roles: ['Admin'],
      scopes: [harness.config.auth.requiredScope]
    });

    await harness.marketplaceJobRepository.createJob({
      publisherTenantId: 'publisher-admin',
      productId: 'product-1',
      jobId: 'job-100',
      requestPayloadHash: 'hash-100',
      status: 'running',
      result: {
        latestStatus: {
          $schema: PRODUCT_INGESTION_SCHEMAS.configureStatus,
          jobId: 'job-100',
          jobStatus: 'running',
          jobResult: 'pending',
          errors: []
        },
        poll: {
          attemptCount: 1,
          nextPollAt: '2026-06-02T12:08:22.730Z'
        }
      },
      errors: [
        {
          level: 'job',
          code: 'badRequest',
          message: 'Validation failed',
          resourceId: { resourceName: 'plan-a' }
        }
      ],
      createdAt: '2026-06-02T12:03:22.730Z'
    });
    await harness.marketplaceJobRepository.createJob({
      publisherTenantId: 'publisher-other',
      jobId: 'job-hidden',
      requestPayloadHash: 'hash-hidden',
      status: 'submitted',
      errors: [],
      createdAt: '2026-06-02T12:04:22.730Z'
    });

    harness.setProductIngestionCancelStatus('job-100', {
      $schema: PRODUCT_INGESTION_SCHEMAS.configureStatus,
      jobId: 'job-100',
      jobStatus: 'completed',
      jobResult: 'cancelled',
      jobEnd: '2026-06-02T12:09:22.730Z',
      errors: []
    });
    harness.setProductIngestionJobDetail('job-100', {
      $schema: PRODUCT_INGESTION_SCHEMAS.configureDetail,
      resources: [
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.product,
          alias: 'test-product',
          identity: { externalId: 'prod-1' },
          type: 'softwareAsAService'
        }
      ]
    });

    const listResponse = await request(harness.app)
      .get('/v1/publisher/jobs?page=1&pageSize=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.total).toBe(1);
    expect(listResponse.body.data.jobs).toHaveLength(1);
    expect(listResponse.body.data.jobs[0].jobId).toBe('job-100');

    const detailResponse = await request(harness.app)
      .get('/v1/publisher/jobs/job-100')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.errors).toEqual([
      {
        level: 'job',
        code: 'badRequest',
        message: 'Validation failed',
        resourceId: { resourceName: 'plan-a' }
      }
    ]);

    const cancelResponse = await request(harness.app)
      .post('/v1/publisher/jobs/job-100/cancel')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.data.status).toBe('cancelled');
    expect(cancelResponse.body.data.result.resources).toHaveLength(1);
    expect(cancelResponse.body.data.completedAt).toBe('2026-06-02T12:09:22.730Z');
  });
});
