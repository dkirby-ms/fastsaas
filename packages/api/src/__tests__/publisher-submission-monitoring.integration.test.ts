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

describe('publisher submission monitoring routes', () => {
  it('returns environment state, validation issues, history, and draft/live diff', async () => {
    const adminToken = await harness.createToken({
      tenantId: 'publisher-admin',
      roles: ['Admin'],
      scopes: [harness.config.auth.requiredScope]
    });

    const detail = await harness.productCatalogRepository.replaceCatalogSnapshot({
      publisherTenantId: 'publisher-admin',
      syncedAt: '2026-06-02T16:54:45.149+00:00',
      product: {
        externalOfferId: 'offer-1',
        durableProductId: 'product/offer-1',
        productType: 'softwareAsAService',
        alias: 'Offer One'
      },
      plans: [],
      submissions: [
        {
          durableSubmissionId: 'submission/preview-1',
          targetType: 'preview',
          status: 'failed'
        }
      ],
      resources: [
        {
          resourceType: 'product',
          durableId: 'product/offer-1',
          schemaVersion: PRODUCT_INGESTION_SCHEMAS.product,
          environment: 'preview',
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

    harness.setProductIngestionResourceTree('product/offer-1', 'draft', {
      root: 'product/offer-1',
      target: { targetType: 'draft' },
      resources: [
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.product,
          id: 'product/offer-1',
          resourceName: 'offer-product',
          alias: 'Offer One Draft',
          identity: { externalId: 'offer-1' },
          type: 'softwareAsAService'
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.listing,
          id: 'listing/en-us',
          resourceName: 'listing-en-us',
          product: { resourceName: 'offer-product' },
          title: 'Draft title'
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.submission,
          id: 'submission/draft-1',
          product: { resourceName: 'offer-product' },
          target: { targetType: 'draft' },
          status: 'InProgress',
          result: 'pending',
          created: '2026-06-02T16:00:00.000+00:00'
        }
      ]
    });
    harness.setProductIngestionResourceTree('product/offer-1', 'preview', {
      root: 'product/offer-1',
      target: { targetType: 'preview' },
      resources: [
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.product,
          id: 'product/offer-1',
          resourceName: 'offer-product',
          alias: 'Offer One Preview',
          identity: { externalId: 'offer-1' },
          type: 'softwareAsAService'
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.plan,
          id: 'plan/basic',
          resourceName: 'basic-plan',
          product: { resourceName: 'offer-product' },
          alias: 'Basic',
          identity: { externalId: 'basic' },
          validationErrors: [
            {
              code: 'schemaValidationError',
              message: 'Missing billing term'
            }
          ]
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.submission,
          id: 'submission/preview-1',
          product: { resourceName: 'offer-product' },
          target: { targetType: 'preview' },
          status: 'Failed',
          result: 'failed',
          created: '2026-06-02T15:00:00.000+00:00'
        }
      ]
    });
    harness.setProductIngestionResourceTree('product/offer-1', 'live', {
      root: 'product/offer-1',
      target: { targetType: 'live' },
      resources: [
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.product,
          id: 'product/offer-1',
          resourceName: 'offer-product',
          alias: 'Offer One Live',
          identity: { externalId: 'offer-1' },
          type: 'softwareAsAService'
        }
      ]
    });

    const submissionsResponse = await request(harness.app)
      .get(`/v1/publisher/products/${detail.product.id}/submissions`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(submissionsResponse.status).toBe(200);
    expect(submissionsResponse.body.data.environments.preview.currentSubmission).toMatchObject({
      submissionId: 'submission/preview-1',
      status: 'Failed'
    });
    expect(submissionsResponse.body.data.environments.preview.validationIssues).toEqual([
      expect.objectContaining({
        resourceName: 'basic-plan',
        message: 'Missing billing term'
      })
    ]);
    expect(submissionsResponse.body.data.history).toHaveLength(2);

    const diffResponse = await request(harness.app)
      .get(`/v1/publisher/products/${detail.product.id}/diff`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(diffResponse.status).toBe(200);
    expect(diffResponse.body.data.hasChanges).toBe(true);
    expect(diffResponse.body.data.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceType: 'product', changeType: 'modified' }),
        expect.objectContaining({ resourceType: 'listing', changeType: 'added' })
      ])
    );
  });
});
