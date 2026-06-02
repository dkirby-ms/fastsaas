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

describe('publisher offer routes', () => {
  it('serves product catalog data through /offers aliases', async () => {
    const adminToken = await harness.createToken({
      tenantId: 'publisher-admin',
      roles: ['Admin'],
      scopes: [harness.config.auth.requiredScope]
    });

    const detail = await harness.productCatalogRepository.replaceCatalogSnapshot({
      publisherTenantId: 'publisher-admin',
      syncedAt: '2026-06-02T15:45:00.000+00:00',
      product: {
        externalOfferId: 'offer-1',
        durableProductId: 'product/offer-1',
        productType: 'softwareAsAService',
        alias: 'Offer One'
      },
      plans: [],
      submissions: [],
      resources: [
        {
          resourceType: 'product',
          durableId: 'product/offer-1',
          schemaVersion: PRODUCT_INGESTION_SCHEMAS.product,
          environment: 'draft',
          jsonSnapshot: {
            $schema: PRODUCT_INGESTION_SCHEMAS.product,
            id: 'product/offer-1',
            alias: 'Offer One',
            identity: { externalId: 'offer-1' },
            type: 'softwareAsAService'
          }
        }
      ]
    });

    const listResponse = await request(harness.app).get('/v1/publisher/offers').set('Authorization', `Bearer ${adminToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0].externalOfferId).toBe('offer-1');

    const detailResponse = await request(harness.app)
      .get(`/v1/publisher/offers/${detail.product.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.id).toBe(detail.product.id);
    expect(detailResponse.body.data.externalOfferId).toBe('offer-1');

    const resourceTreeResponse = await request(harness.app)
      .get(`/v1/publisher/offers/${detail.product.id}/resource-tree`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resourceTreeResponse.status).toBe(200);
    expect(resourceTreeResponse.body.data.root).toBe('product/offer-1');
    expect(resourceTreeResponse.body.data.resources).toHaveLength(1);
  });

  it('creates and filters offer submissions by offerId', async () => {
    const adminToken = await harness.createToken({
      tenantId: 'publisher-admin',
      roles: ['Admin'],
      scopes: [harness.config.auth.requiredScope]
    });

    await harness.marketplaceJobRepository.createJob({
      publisherTenantId: 'publisher-admin',
      productId: 'offer-1',
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
          nextPollAt: '2026-06-02T15:45:00.000+00:00'
        }
      },
      errors: [],
      createdAt: '2026-06-02T15:45:00.000+00:00'
    });
    await harness.marketplaceJobRepository.createJob({
      publisherTenantId: 'publisher-admin',
      productId: 'offer-2',
      jobId: 'job-200',
      requestPayloadHash: 'hash-200',
      status: 'submitted',
      errors: [],
      createdAt: '2026-06-02T15:45:00.000+00:00'
    });

    harness.setProductIngestionConfigureResponses([
      {
        $schema: PRODUCT_INGESTION_SCHEMAS.configureStatus,
        jobId: 'job-201',
        jobStatus: 'running',
        jobResult: 'pending',
        errors: []
      }
    ]);
    harness.setProductIngestionCancelStatus('job-100', {
      $schema: PRODUCT_INGESTION_SCHEMAS.configureStatus,
      jobId: 'job-100',
      jobStatus: 'completed',
      jobResult: 'cancelled',
      jobEnd: '2026-06-02T15:45:00.000+00:00',
      errors: []
    });

    const submitResponse = await request(harness.app)
      .post('/v1/publisher/offers/offer-1/submissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        resources: [
          {
            $schema: PRODUCT_INGESTION_SCHEMAS.product,
            id: 'product/offer-1',
            alias: 'Offer One',
            identity: { externalId: 'offer-1' },
            type: 'softwareAsAService'
          }
        ]
      });

    expect(submitResponse.status).toBe(201);
    expect(submitResponse.body.data.jobId).toBe('job-201');
    expect(submitResponse.body.data.productId).toBe('offer-1');
    expect(submitResponse.body.data.status).toBe('running');

    const listResponse = await request(harness.app)
      .get('/v1/publisher/offers/offer-1/submissions?page=1&pageSize=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.total).toBe(2);
    expect(listResponse.body.data.jobs).toHaveLength(2);
    expect(listResponse.body.data.jobs.map((job: { productId?: string }) => job.productId)).toEqual(['offer-1', 'offer-1']);

    const detailResponse = await request(harness.app)
      .get('/v1/publisher/offers/offer-1/submissions/job-100')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.jobId).toBe('job-100');
    expect(detailResponse.body.data.productId).toBe('offer-1');

    const hiddenDetailResponse = await request(harness.app)
      .get('/v1/publisher/offers/offer-1/submissions/job-200')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(hiddenDetailResponse.status).toBe(404);

    const cancelResponse = await request(harness.app)
      .post('/v1/publisher/offers/offer-1/submissions/job-100/cancel')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.data.status).toBe('cancelled');
    expect(cancelResponse.body.data.productId).toBe('offer-1');
  });
});
