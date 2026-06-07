import type { Logger } from 'pino';
import type { MarketplacePlanSummary } from '@fastsaas/shared';

import { AppError } from '../errors/app-error';
import { ProductIngestionClient, type ProductIngestionClientLike, type ProductIngestionError } from '../lib/product-ingestion-client';
import {
  PRODUCT_INGESTION_SCHEMAS,
  type PlanResource,
  type PriceAndAvailabilityPlanResource,
  type ProductIngestionEnvironment,
  type ProductIngestionResource,
  type ProductIngestionResourceReference,
  type ProductIngestionResourceTreeResponse,
  type ProductResource,
  type SubmissionResource
} from '../lib/product-ingestion-types';
import type {
  ProductCatalogRepository,
  ReplaceMarketplaceCatalogSnapshotInput,
  StoredMarketplacePlan,
  StoredMarketplaceProduct,
  StoredMarketplaceProductDetail,
  StoredMarketplaceSubmission
} from '../repositories/product-catalog-repository';
import type { MarketplaceBearerTokenProvider } from './marketplace-oauth-service';
import type { PartnerCenterAuthProvider } from './partner-center-auth';
import type { PublisherActorContext } from './publisher-service';

export interface ProductCatalogPlan {
  id: string;
  externalPlanId: string;
  durablePlanId: string;
  status: string;
  pricingSummary?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCatalogSubmission {
  id: string;
  durableSubmissionId: string;
  targetType: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCatalogProduct {
  id: string;
  externalOfferId: string;
  durableProductId: string;
  productType: string;
  alias: string;
  lifecycleState?: string;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCatalogProductDetail extends ProductCatalogProduct {
  plans: ProductCatalogPlan[];
  submissions: ProductCatalogSubmission[];
}

export interface ProductCatalogImportInput {
  externalId: string;
}

export interface ProductCatalogServiceOptions {
  repository: ProductCatalogRepository;
  authProvider?: PartnerCenterAuthProvider;
  tokenProvider?: MarketplaceBearerTokenProvider;
  logger: Logger;
  clientFactory?: (args: { publisherTenantId: string }) => ProductIngestionClientLike;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getExternalIdentity(value: { externalId?: string; externalID?: string } | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return typeof value.externalId === 'string' && value.externalId.length > 0
    ? value.externalId
    : typeof value.externalID === 'string' && value.externalID.length > 0
      ? value.externalID
      : undefined;
}

function buildResourceKeys(resource: ProductResource | PlanResource): Set<string> {
  const keys = new Set<string>();
  if (typeof resource.id === 'string' && resource.id.length > 0) {
    keys.add(resource.id);
  }
  if (typeof resource.resourceName === 'string' && resource.resourceName.length > 0) {
    keys.add(resource.resourceName);
  }

  const externalId = getExternalIdentity(resource.identity);
  if (externalId) {
    keys.add(externalId);
  }

  return keys;
}

function resourceReferenceMatches(reference: ProductIngestionResourceReference | undefined, keys: Set<string>): boolean {
  if (!reference) {
    return false;
  }

  if (typeof reference === 'string') {
    return keys.has(reference);
  }

  if ('resourceName' in reference && typeof reference.resourceName === 'string') {
    return keys.has(reference.resourceName);
  }

  const candidate = reference as { externalId?: string; externalID?: string };
  const externalId =
    typeof candidate.externalId === 'string' && candidate.externalId.length > 0
      ? candidate.externalId
      : typeof candidate.externalID === 'string' && candidate.externalID.length > 0
        ? candidate.externalID
        : undefined;

  return externalId ? keys.has(externalId) : false;
}

function isPlanResource(resource: ProductIngestionResource): resource is PlanResource {
  return resource.$schema.startsWith('https://schema.mp.microsoft.com/schema/plan/') && 'product' in resource;
}

function isSubmissionResource(resource: ProductIngestionResource): resource is SubmissionResource {
  return resource.$schema.startsWith('https://schema.mp.microsoft.com/schema/submission/') && 'product' in resource;
}

function isPriceAndAvailabilityPlanResource(resource: ProductIngestionResource): resource is PriceAndAvailabilityPlanResource {
  return resource.$schema.startsWith('https://schema.mp.microsoft.com/schema/price-and-availability-plan/') && 'plan' in resource;
}

function getResourceType(resource: ProductIngestionResource): string {
  switch (resource.$schema) {
    case PRODUCT_INGESTION_SCHEMAS.product:
      return 'product';
    case PRODUCT_INGESTION_SCHEMAS.plan:
      return 'plan';
    case PRODUCT_INGESTION_SCHEMAS.submission:
      return 'submission';
    case PRODUCT_INGESTION_SCHEMAS.listing:
      return 'listing';
    case PRODUCT_INGESTION_SCHEMAS.property:
      return 'property';
    case PRODUCT_INGESTION_SCHEMAS.priceAndAvailabilityPlan:
      return 'priceAndAvailabilityPlan';
    case PRODUCT_INGESTION_SCHEMAS.softwareAsAServiceTechnicalConfiguration:
      return 'softwareAsAServiceTechnicalConfiguration';
    default:
      return 'unknown';
  }
}

function deriveDurableId(resource: ProductIngestionResource, index: number): string {
  if (typeof resource.id === 'string' && resource.id.length > 0) {
    return resource.id;
  }

  const identity = 'identity' in resource && isRecord(resource.identity) ? getExternalIdentity(resource.identity) : undefined;
  if (identity) {
    return identity;
  }

  if (typeof resource.resourceName === 'string' && resource.resourceName.length > 0) {
    return resource.resourceName;
  }

  return `${getResourceType(resource)}-${index}`;
}

function normalizeEnvironment(value: string | undefined): ProductIngestionEnvironment {
  return value === 'preview' || value === 'live' ? value : 'draft';
}

function buildPricingSummary(resources: PriceAndAvailabilityPlanResource[]): Record<string, unknown> | undefined {
  if (resources.length === 0) {
    return undefined;
  }

  if (resources.length === 1) {
    const resource = resources[0];
    return {
      markets: resource.markets ?? [],
      pricing: isRecord(resource.pricing) ? resource.pricing : resource.pricing ?? null,
      availability: isRecord(resource.availability) ? resource.availability : resource.availability ?? null,
      privateAudiences: Array.isArray(resource.privateAudiences) ? resource.privateAudiences : []
    };
  }

  return {
    entries: resources.map((resource) => ({
      durableId: resource.id ?? resource.resourceName,
      markets: resource.markets ?? [],
      pricing: isRecord(resource.pricing) ? resource.pricing : resource.pricing ?? null,
      availability: isRecord(resource.availability) ? resource.availability : resource.availability ?? null,
      privateAudiences: Array.isArray(resource.privateAudiences) ? resource.privateAudiences : []
    }))
  };
}

function mapProduct(product: StoredMarketplaceProduct): ProductCatalogProduct {
  return {
    id: product.id,
    externalOfferId: product.externalOfferId,
    durableProductId: product.durableProductId,
    productType: product.productType,
    alias: product.alias,
    lifecycleState: product.lifecycleState,
    lastSyncedAt: product.lastSyncedAt,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

function mapPlan(plan: StoredMarketplacePlan): ProductCatalogPlan {
  return {
    id: plan.id,
    externalPlanId: plan.externalPlanId,
    durablePlanId: plan.durablePlanId,
    status: plan.status,
    pricingSummary: plan.pricingSummary,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt
  };
}

function mapSubmission(submission: StoredMarketplaceSubmission): ProductCatalogSubmission {
  return {
    id: submission.id,
    durableSubmissionId: submission.durableSubmissionId,
    targetType: submission.targetType,
    status: submission.status,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt
  };
}

function mapDetail(detail: StoredMarketplaceProductDetail): ProductCatalogProductDetail {
  return {
    ...mapProduct(detail.product),
    plans: detail.plans.map((plan) => mapPlan(plan)),
    submissions: detail.submissions.map((submission) => mapSubmission(submission))
  };
}

export class ProductCatalogService {
  private readonly clientFactory: NonNullable<ProductCatalogServiceOptions['clientFactory']>;

  constructor(private readonly options: ProductCatalogServiceOptions) {
    this.clientFactory =
      options.clientFactory ??
      (({ publisherTenantId }) => {
        if (this.options.tokenProvider) {
          return new ProductIngestionClient({
            logger: this.options.logger.child({ component: 'product-ingestion-client', tenantId: publisherTenantId }),
            tokenProvider: this.options.tokenProvider
          });
        }

        if (!this.options.authProvider) {
          throw new Error('ProductCatalogService requires tokenProvider or authProvider');
        }

        return new ProductIngestionClient({
          logger: this.options.logger.child({ component: 'product-ingestion-client', tenantId: publisherTenantId }),
          authProvider: this.options.authProvider
        });
      });
  }

  async listProducts(publisherTenantId: string): Promise<ProductCatalogProduct[]> {
    const products = await this.options.repository.listProducts(publisherTenantId);
    return products.map((product) => mapProduct(product));
  }

  async listMarketplacePlans(publisherTenantId: string): Promise<MarketplacePlanSummary[]> {
    const plans = await this.options.repository.listAllPlans(publisherTenantId);
    return plans.map((plan) => ({
      id: plan.id,
      externalPlanId: plan.externalPlanId,
      durablePlanId: plan.durablePlanId,
      productId: plan.productId,
      status: plan.status,
      pricingSummary: plan.pricingSummary ?? null
    }));
  }

  async getProduct(publisherTenantId: string, productId: string): Promise<ProductCatalogProductDetail> {
    const detail = await this.options.repository.getProductDetailById(publisherTenantId, productId);
    if (!detail) {
      throw AppError.notFound('Marketplace product was not found', { productId });
    }

    return mapDetail(detail);
  }

  async getResourceTree(
    publisherTenantId: string,
    productId: string
  ): Promise<ProductIngestionResourceTreeResponse<ProductIngestionResource>> {
    const detail = await this.options.repository.getProductById(publisherTenantId, productId);
    if (!detail) {
      throw AppError.notFound('Marketplace product was not found', { productId });
    }

    const resources = await this.options.repository.listResourcesByProductId(publisherTenantId, productId);
    const targetType = resources[0]?.environment;

    return {
      root: detail.durableProductId,
      target: targetType ? { targetType: normalizeEnvironment(targetType) } : undefined,
      resources: resources.map((resource) => resource.jsonSnapshot as ProductIngestionResource)
    };
  }

  async importProduct(actor: PublisherActorContext, input: ProductCatalogImportInput): Promise<ProductCatalogProductDetail> {
    const externalId = input.externalId.trim();
    if (!externalId) {
      throw AppError.badRequest('externalId is required');
    }

    const client = await this.loadClient(actor.tenantId);

    try {
      const product = await client.getProductByExternalId(externalId);
      this.options.logger.info(
        { externalId, productResponse: JSON.stringify(product) },
        'Partner Center getProductByExternalId response'
      );
      const durableProductId = product.id?.trim();
      if (!durableProductId) {
        this.options.logger.error(
          { externalId, productKeys: Object.keys(product || {}), productResponse: JSON.stringify(product) },
          'Partner Center returned product with no durable ID'
        );
        throw AppError.serviceUnavailable('Partner Center product sync is temporarily unavailable');
      }

      const tree = await client.getResourceTree(durableProductId);
      const detail = await this.persistResourceTree(actor, tree, externalId);
      this.options.logger.info({ actorTenantId: actor.tenantId, externalId, requestId: actor.requestId }, 'Imported marketplace product');
      return detail;
    } catch (error) {
      throw this.toAppError(error, externalId);
    }
  }

  async syncProduct(actor: PublisherActorContext, productId: string): Promise<ProductCatalogProductDetail> {
    const existing = await this.options.repository.getProductById(actor.tenantId, productId);
    if (!existing) {
      throw AppError.notFound('Marketplace product was not found', { productId });
    }

    const client = await this.loadClient(actor.tenantId);
    const externalLookupId = existing.durableProductId || existing.externalOfferId;

    try {
      const tree = await client.getResourceTree(externalLookupId);
      const detail = await this.persistResourceTree(actor, tree, existing.externalOfferId, existing.id);
      this.options.logger.info({ actorTenantId: actor.tenantId, productId, requestId: actor.requestId }, 'Synchronized marketplace product');
      return detail;
    } catch (error) {
      throw this.toAppError(error, existing.externalOfferId);
    }
  }

  private async loadClient(publisherTenantId: string): Promise<ProductIngestionClientLike> {
    if (!this.options.tokenProvider && !this.options.authProvider) {
      throw AppError.badRequest('Marketplace OAuth configuration or a Partner Center auth provider is required before importing marketplace products');
    }

    return this.clientFactory({ publisherTenantId });
  }

  private async persistResourceTree(
    actor: PublisherActorContext,
    tree: ProductIngestionResourceTreeResponse<ProductIngestionResource>,
    fallbackExternalId: string,
    existingProductId?: string
  ): Promise<ProductCatalogProductDetail> {
    const snapshot = this.buildCatalogSnapshot(actor.tenantId, tree, fallbackExternalId, existingProductId);
    const detail = await this.options.repository.replaceCatalogSnapshot(snapshot);
    return mapDetail(detail);
  }

  private buildCatalogSnapshot(
    publisherTenantId: string,
    tree: ProductIngestionResourceTreeResponse<ProductIngestionResource>,
    fallbackExternalId: string,
    existingProductId?: string
  ): ReplaceMarketplaceCatalogSnapshotInput {
    const product = tree.resources.find((resource): resource is ProductResource => resource.$schema === PRODUCT_INGESTION_SCHEMAS.product);
    if (!product) {
      throw AppError.badRequest('Partner Center resource tree did not include a product resource');
    }

    const syncedAt = new Date().toISOString();
    const productKeys = buildResourceKeys(product);
    const defaultEnvironment = normalizeEnvironment(tree.target?.targetType);
    const planResources = tree.resources.filter(
      (resource): resource is PlanResource => isPlanResource(resource) && resourceReferenceMatches(resource.product, productKeys)
    );
    const submissionResources = tree.resources.filter(
      (resource): resource is SubmissionResource =>
        isSubmissionResource(resource) && resourceReferenceMatches(resource.product, productKeys)
    );
    const pricingResources = tree.resources.filter(
      (resource): resource is PriceAndAvailabilityPlanResource => isPriceAndAvailabilityPlanResource(resource)
    );

    return {
      publisherTenantId,
      existingProductId,
      syncedAt,
      product: {
        externalOfferId: getExternalIdentity(product.identity) ?? fallbackExternalId,
        durableProductId: product.id ?? tree.root,
        productType: product.type,
        alias: product.alias,
        lifecycleState: product.lifecycleState
      },
      plans: planResources.map((plan) => {
        const planKeys = buildResourceKeys(plan);
        const planPricingResources = pricingResources.filter((resource) => resourceReferenceMatches(resource.plan, planKeys));
        return {
          externalPlanId: getExternalIdentity(plan.identity) ?? deriveDurableId(plan, 0),
          durablePlanId: plan.id ?? deriveDurableId(plan, 0),
          status: plan.lifecycleState ?? 'unknown',
          pricingSummary: buildPricingSummary(planPricingResources)
        };
      }),
      submissions: submissionResources.map((submission, index) => ({
        durableSubmissionId: submission.id ?? deriveDurableId(submission, index),
        targetType: normalizeEnvironment(submission.target?.targetType),
        status: submission.status ?? submission.result ?? submission.lifecycleState ?? 'unknown'
      })),
      resources: tree.resources.map((resource, index) => ({
        resourceType: getResourceType(resource),
        durableId: deriveDurableId(resource, index),
        jsonSnapshot: resource as Record<string, unknown>,
        schemaVersion: typeof resource.$schema === 'string' ? resource.$schema : 'unknown',
        environment:
          resource.$schema === PRODUCT_INGESTION_SCHEMAS.submission
            ? normalizeEnvironment((resource as SubmissionResource).target?.targetType)
            : defaultEnvironment
      }))
    };
  }

  private toAppError(error: unknown, externalId: string): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (this.isProductIngestionError(error)) {
      this.options.logger.error(
        { externalId, statusCode: error.statusCode, action: error.action, message: (error as { message?: string }).message },
        'Partner Center API error during product import'
      );

      if (error.statusCode === 404) {
        return AppError.notFound('Partner Center product was not found', { externalId });
      }

      if (error.statusCode >= 500) {
        return AppError.serviceUnavailable('Partner Center product sync is temporarily unavailable');
      }

      return AppError.badRequest('Partner Center product import failed', { externalId });
    }

    this.options.logger.error(
      { externalId, errorType: typeof error, errorName: (error as { name?: string }).name, errorMessage: (error as { message?: string }).message, stack: (error as { stack?: string }).stack },
      'Unexpected error during Partner Center product import'
    );

    return AppError.serviceUnavailable('Partner Center product sync is temporarily unavailable');
  }

  private isProductIngestionError(error: unknown): error is ProductIngestionError {
    return !!error && typeof error === 'object' && 'statusCode' in error && 'action' in error;
  }
}
