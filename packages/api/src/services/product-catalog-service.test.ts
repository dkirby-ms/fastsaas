import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import { PRODUCT_INGESTION_SCHEMAS, type ProductIngestionResourceTreeResponse } from '../lib/product-ingestion-types';
import { InMemoryProductCatalogRepository } from '../repositories/product-catalog-repository';
import type { PartnerCenterAuthProvider } from './partner-center-auth';
import { ProductCatalogService } from './product-catalog-service';
import type { PublisherActorContext } from './publisher-service';

const actor: PublisherActorContext = {
  tenantId: 'publisher-tenant',
  userId: 'user-123',
  requestId: 'req-123',
  correlationId: 'corr-123'
};

const initialTree: ProductIngestionResourceTreeResponse = {
  root: 'product/prod-123',
  target: { targetType: 'preview' },
  resources: [
    {
      $schema: PRODUCT_INGESTION_SCHEMAS.product,
      id: 'product/prod-123',
      resourceName: 'contosoProduct',
      identity: { externalId: 'contoso-saas' },
      type: 'softwareAsAService',
      alias: 'Contoso SaaS',
      lifecycleState: 'preview'
    },
    {
      $schema: PRODUCT_INGESTION_SCHEMAS.plan,
      id: 'plan/plan-123',
      resourceName: 'starterPlan',
      product: { resourceName: 'contosoProduct' },
      identity: { externalId: 'starter' },
      alias: 'Starter',
      lifecycleState: 'preview'
    },
    {
      $schema: PRODUCT_INGESTION_SCHEMAS.priceAndAvailabilityPlan,
      id: 'price/plan-123',
      product: { resourceName: 'contosoProduct' },
      plan: { resourceName: 'starterPlan' },
      markets: ['US'],
      pricing: { priceByMarket: { US: { usd: 99 } } },
      availability: { visibleTo: 'public' }
    },
    {
      $schema: PRODUCT_INGESTION_SCHEMAS.submission,
      id: 'submission/sub-123',
      product: { resourceName: 'contosoProduct' },
      target: { targetType: 'preview' },
      status: 'InReview',
      result: 'pending'
    },
    {
      $schema: PRODUCT_INGESTION_SCHEMAS.listing,
      id: 'listing/listing-123',
      product: { resourceName: 'contosoProduct' },
      title: 'Contoso SaaS listing'
    }
  ]
};

const updatedTree: ProductIngestionResourceTreeResponse = {
  root: 'product/prod-123',
  target: { targetType: 'live' },
  resources: [
    {
      $schema: PRODUCT_INGESTION_SCHEMAS.product,
      id: 'product/prod-123',
      resourceName: 'contosoProduct',
      identity: { externalId: 'contoso-saas' },
      type: 'softwareAsAService',
      alias: 'Contoso SaaS Premium',
      lifecycleState: 'generallyAvailable'
    },
    {
      $schema: PRODUCT_INGESTION_SCHEMAS.plan,
      id: 'plan/plan-123',
      resourceName: 'starterPlan',
      product: { resourceName: 'contosoProduct' },
      identity: { externalId: 'starter' },
      alias: 'Starter',
      lifecycleState: 'generallyAvailable'
    },
    {
      $schema: PRODUCT_INGESTION_SCHEMAS.priceAndAvailabilityPlan,
      id: 'price/plan-123-v2',
      product: { resourceName: 'contosoProduct' },
      plan: { resourceName: 'starterPlan' },
      markets: ['US', 'CA'],
      pricing: { priceByMarket: { US: { usd: 129 }, CA: { cad: 169 } } },
      availability: { visibleTo: 'public' }
    },
    {
      $schema: PRODUCT_INGESTION_SCHEMAS.submission,
      id: 'submission/sub-456',
      product: { resourceName: 'contosoProduct' },
      target: { targetType: 'live' },
      status: 'Published',
      result: 'succeeded'
    }
  ]
};

function createLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis()
  } as unknown as Logger;
}

function createAuthProvider(): PartnerCenterAuthProvider {
  return {
    acquireGraphToken: vi.fn(async () => 'graph-token'),
    validateConnection: vi.fn(async () => ({ organizationId: 'org-123', displayName: 'Contoso' })),
    invalidate: vi.fn()
  };
}

async function createService(trees: ProductIngestionResourceTreeResponse[]) {
  const repository = new InMemoryProductCatalogRepository();

  const getProductByExternalId = vi.fn(async (externalId: string) => {
    if (externalId !== 'contoso-saas') {
      throw new Error(`Unexpected external ID lookup: ${externalId}`);
    }

    return structuredClone(initialTree.resources[0]);
  });

  const getResourceTree = vi.fn(async () => {
    const nextTree = trees.shift();
    if (!nextTree) {
      throw new Error('No resource tree fixture available');
    }

    return nextTree;
  });

  const service = new ProductCatalogService({
    repository,
    authProvider: createAuthProvider(),
    logger: createLogger(),
    clientFactory: () => ({
      getProductByExternalId,
      getResourceTree,
      configure: vi.fn(),
      getConfigureStatus: vi.fn(),
      getConfigureJobDetails: vi.fn(),
      cancelConfigure: vi.fn(),
      waitForConfigureCompletion: vi.fn()
    })
  });

  return { service, repository, getProductByExternalId, getResourceTree };
}

describe('ProductCatalogService', () => {
  it('imports a Partner Center resource tree into the local catalog cache', async () => {
    const { service, repository, getProductByExternalId, getResourceTree } = await createService([structuredClone(initialTree)]);

    const imported = await service.importProduct(actor, { externalId: 'contoso-saas' });
    const products = await service.listProducts(actor.tenantId);
    const resourceTree = await service.getResourceTree(actor.tenantId, imported.id);
    const stored = await repository.getProductDetailById(actor.tenantId, imported.id);

    expect(getProductByExternalId).toHaveBeenCalledWith('contoso-saas');
    expect(getResourceTree).toHaveBeenCalledWith('product/prod-123');
    expect(imported.alias).toBe('Contoso SaaS');
    expect(imported.externalOfferId).toBe('contoso-saas');
    expect(imported.plans).toHaveLength(1);
    expect(imported.plans[0]).toMatchObject({
      externalPlanId: 'starter',
      durablePlanId: 'plan/plan-123',
      status: 'preview',
      pricingSummary: expect.objectContaining({ markets: ['US'] })
    });
    expect(imported.submissions).toEqual([
      expect.objectContaining({ durableSubmissionId: 'submission/sub-123', targetType: 'preview', status: 'InReview' })
    ]);
    expect(products).toHaveLength(1);
    expect(products[0]?.id).toBe(imported.id);
    expect(resourceTree.root).toBe('product/prod-123');
    expect(resourceTree.resources).toHaveLength(5);
    expect(stored?.plans).toHaveLength(1);
    expect(stored?.submissions).toHaveLength(1);
  });

  it('re-syncs an imported product and replaces the cached plans, submissions, and resources', async () => {
    const { service, repository, getProductByExternalId, getResourceTree } = await createService([structuredClone(initialTree), structuredClone(updatedTree)]);

    const imported = await service.importProduct(actor, { externalId: 'contoso-saas' });
    const synced = await service.syncProduct(actor, imported.id);
    const resourceTree = await service.getResourceTree(actor.tenantId, imported.id);
    const stored = await repository.getProductDetailById(actor.tenantId, imported.id);

    expect(getProductByExternalId).toHaveBeenCalledTimes(1);
    expect(getProductByExternalId).toHaveBeenCalledWith('contoso-saas');
    expect(getResourceTree).toHaveBeenNthCalledWith(1, 'product/prod-123');
    expect(getResourceTree).toHaveBeenNthCalledWith(2, 'product/prod-123');
    expect(synced.id).toBe(imported.id);
    expect(synced.alias).toBe('Contoso SaaS Premium');
    expect(synced.lifecycleState).toBe('generallyAvailable');
    expect(synced.plans).toEqual([
      expect.objectContaining({ externalPlanId: 'starter', status: 'generallyAvailable' })
    ]);
    expect(synced.submissions).toEqual([
      expect.objectContaining({ durableSubmissionId: 'submission/sub-456', targetType: 'live', status: 'Published' })
    ]);
    expect(resourceTree.target).toEqual({ targetType: 'live' });
    expect(resourceTree.resources).toHaveLength(4);
    expect(stored?.plans).toHaveLength(1);
    expect(stored?.submissions).toHaveLength(1);
    expect(stored?.product.alias).toBe('Contoso SaaS Premium');
  });

  it('lists flattened marketplace plans across all synced products', async () => {
    const repository = new InMemoryProductCatalogRepository();
    const service = new ProductCatalogService({
      repository,
      authProvider: createAuthProvider(),
      logger: createLogger(),
      clientFactory: () => ({
        getProductByExternalId: vi.fn(),
        getResourceTree: vi.fn(),
        configure: vi.fn(),
        getConfigureStatus: vi.fn(),
        getConfigureJobDetails: vi.fn(),
        cancelConfigure: vi.fn(),
        waitForConfigureCompletion: vi.fn()
      })
    });

    await repository.replaceCatalogSnapshot({
      publisherTenantId: actor.tenantId,
      syncedAt: '2026-06-06T00:00:00.000Z',
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
          status: 'preview',
          pricingSummary: { markets: ['US'] }
        }
      ],
      submissions: [],
      resources: []
    });
    const secondDetail = await repository.replaceCatalogSnapshot({
      publisherTenantId: actor.tenantId,
      syncedAt: '2026-06-06T00:00:01.000Z',
      product: {
        externalOfferId: 'offer-2',
        durableProductId: 'product/offer-2',
        productType: 'softwareAsAService',
        alias: 'Offer Two'
      },
      plans: [
        {
          externalPlanId: 'enterprise',
          durablePlanId: 'plan/enterprise',
          status: 'generallyAvailable'
        }
      ],
      submissions: [],
      resources: []
    });

    const plans = await service.listMarketplacePlans(actor.tenantId);

    expect(plans).toEqual([
      expect.objectContaining({
        externalPlanId: 'basic',
        durablePlanId: 'plan/basic',
        status: 'preview',
        pricingSummary: { markets: ['US'] }
      }),
      expect.objectContaining({
        externalPlanId: 'enterprise',
        durablePlanId: 'plan/enterprise',
        productId: secondDetail.product.id,
        status: 'generallyAvailable',
        pricingSummary: null
      })
    ]);
  });
});
