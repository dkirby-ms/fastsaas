import request from 'supertest';
import type { Logger } from 'pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PRODUCT_INGESTION_SCHEMAS, type ProductIngestionResourceTreeResponse } from '../lib/product-ingestion-types';
import { InMemoryPartnerCenterRepository } from '../repositories/partner-center-repository';
import { InMemoryProductCatalogRepository } from '../repositories/product-catalog-repository';
import { AssetVisibilityService } from '../services/asset-visibility-service';
import { createSecurityHarness, type SecurityHarness } from './security/test-harness';

function createLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis()
  } as unknown as Logger;
}

describe('AssetVisibilityService', () => {
  it('parses live resource-tree data into shared visibility types and caches the tree', async () => {
    const repository = new InMemoryProductCatalogRepository();
    const partnerCenterRepository = new InMemoryPartnerCenterRepository();
    await partnerCenterRepository.saveConnection({
      tenantId: 'publisher-tenant',
      pcTenantId: 'pc-tenant',
      clientId: 'client-id',
      authMode: 'CLIENT_SECRET',
      connectionStatus: 'CONNECTED',
      secretReference: 'env:PARTNER_CENTER_SECRET',
      lastValidatedAt: '2026-06-03T14:39:04.834+00:00',
      lastRotatedAt: '2026-06-03T14:39:04.834+00:00',
      expiresAt: null
    });

    const detail = await repository.replaceCatalogSnapshot({
      publisherTenantId: 'publisher-tenant',
      syncedAt: '2026-06-03T14:39:04.834+00:00',
      product: {
        externalOfferId: 'offer-1',
        durableProductId: 'product/offer-1',
        productType: 'softwareAsAService',
        alias: 'Offer One'
      },
      plans: [
        {
          externalPlanId: 'basic',
          durablePlanId: 'plan/basic',
          status: 'active'
        }
      ],
      submissions: [],
      resources: []
    });

    const liveTree: ProductIngestionResourceTreeResponse = {
      root: 'product/offer-1',
      target: { targetType: 'live' },
      resources: [
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.product,
          id: 'product/offer-1',
          resourceName: 'offer-product',
          alias: 'Offer One',
          identity: { externalId: 'offer-1' },
          type: 'softwareAsAService'
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.plan,
          id: 'plan/basic',
          resourceName: 'basic-plan',
          alias: 'Basic Plan',
          identity: { externalId: 'basic' },
          product: { resourceName: 'offer-product' }
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.listingAsset,
          id: 'listing-asset/hero',
          resourceName: 'hero-image',
          product: { resourceName: 'offer-product' },
          assetType: 'screenshot',
          url: 'https://cdn.example.com/hero.png',
          description: 'Hero screenshot',
          displayOrder: 1
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.listingTrailer,
          id: 'listing-trailer/demo',
          resourceName: 'demo-video',
          product: { resourceName: 'offer-product' },
          trailerType: 'video',
          videoUrl: 'https://cdn.example.com/demo.mp4',
          thumbnailUrl: 'https://cdn.example.com/demo.png',
          duration: 42
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.previewAudience,
          id: 'preview-audience/early',
          resourceName: 'early-access',
          product: { resourceName: 'offer-product' },
          audienceType: 'preview',
          description: 'Early preview users',
          members: [{ id: 'u1' }, { id: 'u2' }]
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.privateAudience,
          id: 'private-audience/vip',
          resourceName: 'vip-customers',
          product: { resourceName: 'offer-product' },
          audienceType: 'private',
          segmentDescription: 'VIP customers only'
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.priceAndAvailabilityOffer,
          id: 'price-and-availability-offer/offer-1',
          resourceName: 'offer-pricing',
          product: { resourceName: 'offer-product' },
          billingTerms: [{ billingTermType: 'monthly', duration: 1, durationUnit: 'month' }]
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.priceAndAvailabilityPlan,
          id: 'price-and-availability-plan/basic',
          resourceName: 'basic-pricing',
          product: { resourceName: 'offer-product' },
          plan: { resourceName: 'basic-plan' },
          pricing: {
            marketPrices: [{ region: 'US', currency: 'USD', price: 29, marketAvailability: 'available' }]
          },
          availability: { lifecycleState: 'generallyAvailable', availableForPurchase: true }
        }
      ]
    };

    const getResourceTree = vi.fn(async () => liveTree);
    const service = new AssetVisibilityService({
      repository,
      partnerCenterRepository,
      logger: createLogger(),
      now: () => new Date('2026-06-03T14:39:04.834+00:00'),
      cacheTtlMs: 60_000,
      clientFactory: () => ({
        getProductByExternalId: vi.fn(),
        getResourceTree,
        configure: vi.fn(),
        getConfigureStatus: vi.fn(),
        getConfigureJobDetails: vi.fn(),
        cancelConfigure: vi.fn(),
        waitForConfigureCompletion: vi.fn()
      })
    });

    const assets = await service.getListingAssets('publisher-tenant', detail.product.id);
    const trailers = await service.getListingTrailers('publisher-tenant', detail.product.id);
    const audiences = await service.getAudiences('publisher-tenant', detail.product.id);
    const pricing = await service.getPlanPricing('publisher-tenant', detail.product.id, detail.plans[0].id);

    expect(getResourceTree).toHaveBeenCalledTimes(1);
    expect(getResourceTree).toHaveBeenCalledWith('product/offer-1', 'live');
    expect(assets).toEqual([
      {
        id: 'listing-asset/hero',
        resourceName: 'hero-image',
        assetType: 'screenshot',
        url: 'https://cdn.example.com/hero.png',
        description: 'Hero screenshot',
        displayOrder: 1
      }
    ]);
    expect(trailers).toEqual([
      {
        id: 'listing-trailer/demo',
        resourceName: 'demo-video',
        trailerType: 'video',
        url: 'https://cdn.example.com/demo.mp4',
        thumbnailUrl: 'https://cdn.example.com/demo.png',
        duration: 42
      }
    ]);
    expect(audiences).toEqual({
      preview: [
        {
          id: 'preview-audience/early',
          resourceName: 'early-access',
          audienceType: 'preview',
          count: 2,
          description: 'Early preview users'
        }
      ],
      private: [
        {
          id: 'private-audience/vip',
          resourceName: 'vip-customers',
          audienceType: 'private',
          segmentDescription: 'VIP customers only'
        }
      ]
    });
    expect(pricing).toEqual({
      planId: detail.plans[0].id,
      planName: 'Basic Plan',
      markets: [
        {
          region: 'US',
          currency: 'USD',
          price: 29,
          marketAvailability: 'available'
        }
      ],
      billingTerms: [
        {
          billingTermType: 'monthly',
          duration: 1,
          durationUnit: 'month'
        }
      ],
      availability: {
        lifecycleState: 'generallyAvailable',
        availableForPurchase: true
      }
    });
  });
});

let harness: SecurityHarness;

beforeAll(async () => {
  harness = await createSecurityHarness();
});

afterAll(async () => {
  await harness.close();
});

describe('asset visibility publisher routes', () => {
  it('returns 401 for unauthenticated requests', async () => {
    const response = await request(harness.app).get('/v1/publisher/products/missing/assets');
    expect(response.status).toBe(401);
  });

  it('returns 404 for unknown products', async () => {
    const token = await harness.createToken({
      tenantId: 'publisher-admin',
      roles: ['Admin'],
      scopes: [harness.config.auth.requiredScope]
    });

    const response = await request(harness.app)
      .get('/v1/publisher/products/missing/assets')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it('serves assets, audiences, and plan pricing from live marketplace data', async () => {
    const token = await harness.createToken({
      tenantId: 'publisher-admin',
      roles: ['Admin'],
      scopes: [harness.config.auth.requiredScope]
    });

    const detail = await harness.productCatalogRepository.replaceCatalogSnapshot({
      publisherTenantId: 'publisher-admin',
      syncedAt: '2026-06-03T14:39:04.834+00:00',
      product: {
        externalOfferId: 'offer-1',
        durableProductId: 'product/offer-1',
        productType: 'softwareAsAService',
        alias: 'Offer One'
      },
      plans: [
        {
          externalPlanId: 'basic',
          durablePlanId: 'plan/basic',
          status: 'active'
        }
      ],
      submissions: [],
      resources: []
    });

    harness.setProductIngestionResourceTree('product/offer-1', 'live', {
      root: 'product/offer-1',
      target: { targetType: 'live' },
      resources: [
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.product,
          id: 'product/offer-1',
          resourceName: 'offer-product',
          alias: 'Offer One',
          identity: { externalId: 'offer-1' },
          type: 'softwareAsAService'
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.plan,
          id: 'plan/basic',
          resourceName: 'basic-plan',
          alias: 'Basic Plan',
          identity: { externalId: 'basic' },
          product: { resourceName: 'offer-product' }
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.listingAsset,
          id: 'listing-asset/hero',
          resourceName: 'hero-image',
          product: { resourceName: 'offer-product' },
          assetType: 'screenshot',
          url: 'https://cdn.example.com/hero.png'
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.listingTrailer,
          id: 'listing-trailer/demo',
          resourceName: 'demo-video',
          product: { resourceName: 'offer-product' },
          trailerType: 'video',
          videoUrl: 'https://cdn.example.com/demo.mp4'
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.previewAudience,
          id: 'preview-audience/early',
          resourceName: 'early-access',
          product: { resourceName: 'offer-product' },
          audienceType: 'preview',
          members: [{ id: 'u1' }]
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.privateAudience,
          id: 'private-audience/vip',
          resourceName: 'vip-customers',
          product: { resourceName: 'offer-product' },
          audienceType: 'private',
          segmentDescription: 'VIP customers only'
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.priceAndAvailabilityOffer,
          id: 'price-and-availability-offer/offer-1',
          resourceName: 'offer-pricing',
          product: { resourceName: 'offer-product' },
          billingTerms: [{ billingTermType: 'annual', duration: 1, durationUnit: 'year' }]
        },
        {
          $schema: PRODUCT_INGESTION_SCHEMAS.priceAndAvailabilityPlan,
          id: 'price-and-availability-plan/basic',
          resourceName: 'basic-pricing',
          product: { resourceName: 'offer-product' },
          plan: { resourceName: 'basic-plan' },
          pricing: {
            prices: [{ region: 'US', currency: 'USD', price: 49, marketAvailability: 'available' }]
          },
          availability: { lifecycleState: 'generallyAvailable', availableForPurchase: true }
        }
      ]
    });

    const assetsResponse = await request(harness.app)
      .get(`/v1/publisher/products/${detail.product.id}/assets`)
      .set('Authorization', `Bearer ${token}`);
    expect(assetsResponse.status).toBe(200);
    expect(assetsResponse.body.data).toEqual({
      assets: [
        {
          id: 'listing-asset/hero',
          resourceName: 'hero-image',
          assetType: 'screenshot',
          url: 'https://cdn.example.com/hero.png'
        }
      ],
      trailers: [
        {
          id: 'listing-trailer/demo',
          resourceName: 'demo-video',
          trailerType: 'video',
          url: 'https://cdn.example.com/demo.mp4'
        }
      ]
    });

    const audiencesResponse = await request(harness.app)
      .get(`/v1/publisher/products/${detail.product.id}/audiences`)
      .set('Authorization', `Bearer ${token}`);
    expect(audiencesResponse.status).toBe(200);
    expect(audiencesResponse.body.data).toEqual({
      preview: [
        {
          id: 'preview-audience/early',
          resourceName: 'early-access',
          audienceType: 'preview',
          count: 1
        }
      ],
      private: [
        {
          id: 'private-audience/vip',
          resourceName: 'vip-customers',
          audienceType: 'private',
          segmentDescription: 'VIP customers only'
        }
      ]
    });

    const pricingResponse = await request(harness.app)
      .get(`/v1/publisher/products/${detail.product.id}/plans/${detail.plans[0].id}/pricing`)
      .set('Authorization', `Bearer ${token}`);
    expect(pricingResponse.status).toBe(200);
    expect(pricingResponse.body.data).toEqual({
      planId: detail.plans[0].id,
      planName: 'Basic Plan',
      markets: [
        {
          region: 'US',
          currency: 'USD',
          price: 49,
          marketAvailability: 'available'
        }
      ],
      billingTerms: [
        {
          billingTermType: 'annual',
          duration: 1,
          durationUnit: 'year'
        }
      ],
      availability: {
        lifecycleState: 'generallyAvailable',
        availableForPurchase: true
      }
    });
  });
});
