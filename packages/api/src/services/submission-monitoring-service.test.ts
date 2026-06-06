import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import { PRODUCT_INGESTION_SCHEMAS, type ProductIngestionResourceTreeResponse } from '../lib/product-ingestion-types';
import { InMemoryProductCatalogRepository } from '../repositories/product-catalog-repository';
import { SubmissionMonitoringService } from './submission-monitoring-service';

function createLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis()
  } as unknown as Logger;
}

describe('SubmissionMonitoringService', () => {
  it('returns environment states, history, and validation issues', async () => {
    const repository = new InMemoryProductCatalogRepository();

    const product = await repository.replaceCatalogSnapshot({
      publisherTenantId: 'publisher-tenant',
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
        },
        {
          durableSubmissionId: 'submission/live-1',
          targetType: 'live',
          status: 'published'
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

    const draftTree: ProductIngestionResourceTreeResponse = {
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
          $schema: PRODUCT_INGESTION_SCHEMAS.plan,
          id: 'plan/basic',
          resourceName: 'basic-plan',
          product: { resourceName: 'offer-product' },
          alias: 'Basic',
          identity: { externalId: 'basic' }
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
    };
    const previewTree: ProductIngestionResourceTreeResponse = {
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
    };
    const liveTree: ProductIngestionResourceTreeResponse = {
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
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.submission,
          id: 'submission/live-1',
          product: { resourceName: 'offer-product' },
          target: { targetType: 'live' },
          status: 'Published',
          result: 'succeeded',
          created: '2026-06-02T14:00:00.000+00:00'
        }
      ]
    };

    const service = new SubmissionMonitoringService({
      repository,
      logger: createLogger(),
      now: () => new Date('2026-06-02T16:54:45.149+00:00'),
      tokenProvider: {
        getAccessToken: vi.fn(async () => 'token'),
        invalidate: vi.fn()
      },
      clientFactory: () => ({
        getProductByExternalId: vi.fn(),
        getResourceTree: vi.fn(async (_productId: string, environment?: 'draft' | 'preview' | 'live') => {
          switch (environment) {
            case 'draft':
              return draftTree;
            case 'preview':
              return previewTree;
            case 'live':
              return liveTree;
            default:
              throw new Error('Unexpected environment');
          }
        }),
        configure: vi.fn(),
        getConfigureStatus: vi.fn(),
        getConfigureJobDetails: vi.fn(),
        cancelConfigure: vi.fn(),
        waitForConfigureCompletion: vi.fn()
      })
    });

    const response = await service.getProductSubmissions('publisher-tenant', product.product.id);

    expect(response.productId).toBe(product.product.id);
    expect(response.environments.preview.currentSubmission).toMatchObject({
      submissionId: 'submission/preview-1',
      status: 'Failed',
      result: 'failed'
    });
    expect(response.environments.preview.validationIssues).toEqual([
      expect.objectContaining({
        resourceName: 'basic-plan',
        message: 'Missing billing term',
        level: 'error'
      })
    ]);
    expect(response.history.map((entry) => entry.environment)).toEqual(['draft', 'preview', 'live']);
    expect(response.environments.draft.resources.map((resource) => resource.resourceType)).toContain('plan');
  });

  it('computes a draft vs live diff', async () => {
    const repository = new InMemoryProductCatalogRepository();
    const product = await repository.replaceCatalogSnapshot({
      publisherTenantId: 'publisher-tenant',
      syncedAt: '2026-06-02T16:54:45.149+00:00',
      product: {
        externalOfferId: 'offer-1',
        durableProductId: 'product/offer-1',
        productType: 'softwareAsAService',
        alias: 'Offer One'
      },
      plans: [],
      submissions: [],
      resources: []
    });

    const service = new SubmissionMonitoringService({
      repository,
      logger: createLogger(),
      tokenProvider: {
        getAccessToken: vi.fn(async () => 'token'),
        invalidate: vi.fn()
      },
      now: () => new Date('2026-06-02T16:54:45.149+00:00'),
      clientFactory: () => ({
        getProductByExternalId: vi.fn(),
        getResourceTree: vi.fn(async (_productId: string, environment?: 'draft' | 'preview' | 'live') => {
          if (environment === 'draft') {
            return {
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
                }
              ]
            };
          }

          return {
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
          };
        }),
        configure: vi.fn(),
        getConfigureStatus: vi.fn(),
        getConfigureJobDetails: vi.fn(),
        cancelConfigure: vi.fn(),
        waitForConfigureCompletion: vi.fn()
      })
    });

    const response = await service.getProductDiff('publisher-tenant', product.product.id);

    expect(response.hasChanges).toBe(true);
    expect(response.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ changeType: 'modified', resourceType: 'product' }),
        expect.objectContaining({ changeType: 'added', resourceName: 'listing-en-us' })
      ])
    );
  });
});
