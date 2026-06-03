import type {
  Availability,
  BillingTerm,
  ListingAsset,
  ListingTrailer,
  Market,
  PlanPricing,
  PreviewAudience,
  PrivateAudience
} from '@fastsaas/shared';
import type { Logger } from 'pino';

import { AppError } from '../errors/app-error';
import { ProductIngestionClient, ProductIngestionError, type ProductIngestionClientLike } from '../lib/product-ingestion-client';
import {
  PRODUCT_INGESTION_SCHEMAS,
  type ListingAssetResource,
  type ListingTrailerResource,
  type PlanResource,
  type ProductResource,
  type PreviewAudienceResource,
  type PriceAndAvailabilityOfferResource,
  type PriceAndAvailabilityPlanResource,
  type PrivateAudienceResource,
  type ProductIngestionResource,
  type ProductIngestionResourceReference,
  type ProductIngestionResourceTreeResponse
} from '../lib/product-ingestion-types';
import type { PartnerCenterConnectionRecord, PartnerCenterRepository } from '../repositories/partner-center-repository';
import type { ProductCatalogRepository, StoredMarketplaceProductDetail } from '../repositories/product-catalog-repository';
import type { MarketplaceBearerTokenProvider } from './marketplace-oauth-service';
import type { PartnerCenterAuthProvider } from './partner-center-auth';

export interface AssetVisibilityAudienceResponse {
  preview: PreviewAudience[];
  private: PrivateAudience[];
}

export interface AssetVisibilityServiceOptions {
  repository: ProductCatalogRepository;
  partnerCenterRepository?: PartnerCenterRepository;
  authProvider?: PartnerCenterAuthProvider;
  tokenProvider?: MarketplaceBearerTokenProvider;
  logger: Logger;
  clientFactory?: (args: { account?: PartnerCenterConnectionRecord }) => ProductIngestionClientLike;
  now?: () => Date;
  cacheTtlMs?: number;
}

interface CachedTreeEntry {
  expiresAt: number;
  tree: ProductIngestionResourceTreeResponse<ProductIngestionResource>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function toBooleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
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

function buildResourceKeys(resource: { id?: string; resourceName?: string; identity?: { externalId?: string; externalID?: string } }): Set<string> {
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
  const externalId = getExternalIdentity(candidate);
  return externalId ? keys.has(externalId) : false;
}

function schemaMatches(schema: string | undefined, expected: string, schemaName: string): boolean {
  return typeof schema === 'string' && (schema === expected || schema.includes(`/schema/${schemaName}/`));
}

function isProductResource(resource: ProductIngestionResource): resource is ProductResource {
  return schemaMatches(resource.$schema, PRODUCT_INGESTION_SCHEMAS.product, 'product') && 'identity' in resource;
}

function isPlanResource(resource: ProductIngestionResource): resource is PlanResource {
  return schemaMatches(resource.$schema, PRODUCT_INGESTION_SCHEMAS.plan, 'plan') && 'product' in resource;
}

function isListingAssetResource(resource: ProductIngestionResource): resource is ListingAssetResource {
  return schemaMatches(resource.$schema, PRODUCT_INGESTION_SCHEMAS.listingAsset, 'listing-asset') && 'product' in resource;
}

function isListingTrailerResource(resource: ProductIngestionResource): resource is ListingTrailerResource {
  return schemaMatches(resource.$schema, PRODUCT_INGESTION_SCHEMAS.listingTrailer, 'listing-trailer') && 'product' in resource;
}

function isPreviewAudienceResource(resource: ProductIngestionResource): resource is PreviewAudienceResource {
  return schemaMatches(resource.$schema, PRODUCT_INGESTION_SCHEMAS.previewAudience, 'preview-audience') && 'product' in resource;
}

function isPrivateAudienceResource(resource: ProductIngestionResource): resource is PrivateAudienceResource {
  return schemaMatches(resource.$schema, PRODUCT_INGESTION_SCHEMAS.privateAudience, 'private-audiences') && 'product' in resource;
}

function isPriceAndAvailabilityOfferResource(resource: ProductIngestionResource): resource is PriceAndAvailabilityOfferResource {
  return schemaMatches(resource.$schema, PRODUCT_INGESTION_SCHEMAS.priceAndAvailabilityOffer, 'price-and-availability-offer') && 'product' in resource;
}

function isPriceAndAvailabilityPlanResource(resource: ProductIngestionResource): resource is PriceAndAvailabilityPlanResource {
  return schemaMatches(resource.$schema, PRODUCT_INGESTION_SCHEMAS.priceAndAvailabilityPlan, 'price-and-availability-plan') && 'plan' in resource;
}

function getResourceId(resource: ProductIngestionResource, fallbackPrefix: string, index: number): string {
  return resource.id ?? resource.resourceName ?? `${fallbackPrefix}-${index}`;
}

function getResourceName(resource: ProductIngestionResource, fallbackPrefix: string, index: number): string {
  return resource.resourceName ?? resource.id ?? `${fallbackPrefix}-${index}`;
}

function uniqueByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function toListingAsset(resource: ListingAssetResource, index: number): ListingAsset | undefined {
  const url = toStringOrUndefined(resource.url) ?? toStringOrUndefined(resource.fileSasUri);
  if (!url) {
    return undefined;
  }

  return {
    id: getResourceId(resource, 'listing-asset', index),
    resourceName: getResourceName(resource, 'listing-asset', index),
    assetType: toStringOrUndefined(resource.assetType) ?? 'unknown',
    url,
    description: toStringOrUndefined(resource.description),
    displayOrder: toNumberOrUndefined(resource.displayOrder)
  };
}

function toListingTrailer(resource: ListingTrailerResource, index: number): ListingTrailer | undefined {
  const url = toStringOrUndefined(resource.url) ?? toStringOrUndefined(resource.videoUrl) ?? toStringOrUndefined(resource.fileSasUri);
  if (!url) {
    return undefined;
  }

  return {
    id: getResourceId(resource, 'listing-trailer', index),
    resourceName: getResourceName(resource, 'listing-trailer', index),
    trailerType: toStringOrUndefined(resource.trailerType) ?? 'video',
    url,
    thumbnailUrl: toStringOrUndefined(resource.thumbnailUrl),
    duration: toNumberOrUndefined(resource.duration)
  };
}

function toPreviewAudience(resource: PreviewAudienceResource, index: number): PreviewAudience {
  const members = asArray(resource.members);

  return {
    id: getResourceId(resource, 'preview-audience', index),
    resourceName: getResourceName(resource, 'preview-audience', index),
    audienceType: toStringOrUndefined(resource.audienceType) ?? 'preview',
    count: toNumberOrUndefined(resource.count) ?? (members.length > 0 ? members.length : undefined),
    description: toStringOrUndefined(resource.description)
  };
}

function toPrivateAudience(resource: PrivateAudienceResource, index: number): PrivateAudience {
  return {
    id: getResourceId(resource, 'private-audience', index),
    resourceName: getResourceName(resource, 'private-audience', index),
    audienceType: toStringOrUndefined(resource.audienceType) ?? 'private',
    segmentDescription: toStringOrUndefined(resource.segmentDescription) ?? toStringOrUndefined(resource.description)
  };
}

function deriveMarketAvailability(entry: Record<string, unknown>): string {
  return (
    toStringOrUndefined(entry.marketAvailability) ??
    toStringOrUndefined(entry.availability) ??
    (toBooleanOrUndefined(entry.availableForPurchase) === false ? 'notAvailable' : undefined) ??
    'available'
  );
}

function toMarketEntry(entry: Record<string, unknown>): Market | undefined {
  const region =
    toStringOrUndefined(entry.region) ??
    toStringOrUndefined(entry.market) ??
    toStringOrUndefined(entry.marketCode) ??
    toStringOrUndefined(entry.id);
  if (!region) {
    return undefined;
  }

  return {
    region,
    currency: toStringOrUndefined(entry.currency) ?? toStringOrUndefined(entry.currencyCode) ?? 'USD',
    price:
      toNumberOrUndefined(entry.price) ??
      toNumberOrUndefined(entry.amount) ??
      toNumberOrUndefined(entry.listPrice) ??
      toNumberOrUndefined(entry.value) ??
      0,
    marketAvailability: deriveMarketAvailability(entry)
  };
}

function extractMarkets(resource: PriceAndAvailabilityPlanResource): Market[] {
  const pricing = asRecord(resource.pricing);
  const candidates = [
    ...asArray(pricing?.marketPrices),
    ...asArray(pricing?.prices),
    ...asArray(pricing?.marketPricing),
    ...asArray((resource as Record<string, unknown>).marketPrices)
  ];

  const explicitMarkets = candidates
    .map((entry) => (isRecord(entry) ? toMarketEntry(entry) : undefined))
    .filter((entry): entry is Market => Boolean(entry));
  if (explicitMarkets.length > 0) {
    return uniqueByKey(explicitMarkets, (entry) => `${entry.region}:${entry.currency}:${entry.price}:${entry.marketAvailability}`);
  }

  const marketIds = asArray(resource.markets)
    .map((entry) => toStringOrUndefined(entry))
    .filter((entry): entry is string => Boolean(entry));

  return uniqueByKey(
    marketIds.map((region) => ({
      region,
      currency: toStringOrUndefined(pricing?.currency) ?? toStringOrUndefined(pricing?.currencyCode) ?? 'USD',
      price:
        toNumberOrUndefined(pricing?.price) ??
        toNumberOrUndefined(pricing?.amount) ??
        toNumberOrUndefined(pricing?.listPrice) ??
        0,
      marketAvailability: 'available'
    } satisfies Market)),
    (entry) => `${entry.region}:${entry.currency}:${entry.price}:${entry.marketAvailability}`
  );
}

function normalizeBillingTermType(value: string | undefined): BillingTerm['billingTermType'] {
  if (value === 'monthly' || value === 'annual' || value === 'one-time') {
    return value;
  }

  if (value === 'month' || value === 'months') {
    return 'monthly';
  }

  if (value === 'year' || value === 'years') {
    return 'annual';
  }

  return value ?? 'monthly';
}

function normalizeDurationUnit(value: string | undefined, type: BillingTerm['billingTermType']): BillingTerm['durationUnit'] {
  if (value === 'month' || value === 'year' || value === 'one-time') {
    return value;
  }

  if (type === 'annual') {
    return 'year';
  }

  if (type === 'one-time') {
    return 'one-time';
  }

  return 'month';
}

function toBillingTermEntry(entry: Record<string, unknown>): BillingTerm | undefined {
  const rawType =
    toStringOrUndefined(entry.billingTermType) ??
    toStringOrUndefined(entry.termType) ??
    toStringOrUndefined(entry.billingPeriod) ??
    toStringOrUndefined(entry.type);
  const billingTermType = normalizeBillingTermType(rawType);
  const duration =
    toNumberOrUndefined(entry.duration) ??
    toNumberOrUndefined(entry.termDuration) ??
    1;

  return {
    billingTermType,
    duration,
    durationUnit: normalizeDurationUnit(toStringOrUndefined(entry.durationUnit) ?? toStringOrUndefined(entry.unit), billingTermType)
  };
}

function extractBillingTerms(
  offerResources: PriceAndAvailabilityOfferResource[],
  planResources: PriceAndAvailabilityPlanResource[]
): BillingTerm[] {
  const candidates = [
    ...offerResources.flatMap((resource) => asArray(resource.billingTerms)),
    ...planResources.flatMap((resource) => {
      const pricing = asRecord(resource.pricing);
      return [...asArray(pricing?.billingTerms), ...asArray((resource as Record<string, unknown>).billingTerms)];
    })
  ];

  return uniqueByKey(
    candidates
      .map((entry) => (isRecord(entry) ? toBillingTermEntry(entry) : undefined))
      .filter((entry): entry is BillingTerm => Boolean(entry)),
    (entry) => `${entry.billingTermType}:${entry.duration}:${entry.durationUnit}`
  );
}

function extractAvailability(
  offerResources: PriceAndAvailabilityOfferResource[],
  planResources: PriceAndAvailabilityPlanResource[]
): Availability {
  const candidates = [
    ...planResources.map((resource) => asRecord(resource.availability)),
    ...offerResources.map((resource) => asRecord(resource.availability))
  ].filter((entry): entry is Record<string, unknown> => Boolean(entry));

  for (const candidate of candidates) {
    const lifecycleState =
      toStringOrUndefined(candidate.lifecycleState) ??
      toStringOrUndefined(candidate.state) ??
      'generallyAvailable';
    const availableForPurchase =
      toBooleanOrUndefined(candidate.availableForPurchase) ??
      toBooleanOrUndefined(candidate.isPurchasable) ??
      lifecycleState !== 'notAvailable';

    return {
      lifecycleState,
      availableForPurchase
    };
  }

  return {
    lifecycleState: 'generallyAvailable',
    availableForPurchase: true
  };
}

function getProductKeys(detail: StoredMarketplaceProductDetail): Set<string> {
  return buildResourceKeys({
    id: detail.product.durableProductId,
    identity: { externalId: detail.product.externalOfferId }
  });
}

function getTreeProductKeys(
  tree: ProductIngestionResourceTreeResponse<ProductIngestionResource>,
  detail: StoredMarketplaceProductDetail
): Set<string> {
  const keys = getProductKeys(detail);
  const treeProduct = tree.resources.find(
    (resource): resource is ProductResource =>
      isProductResource(resource) &&
      (resource.id === detail.product.durableProductId || getExternalIdentity(resource.identity) === detail.product.externalOfferId)
  );

  if (treeProduct) {
    for (const key of buildResourceKeys(treeProduct)) {
      keys.add(key);
    }
  }

  return keys;
}

function getPlanResource(tree: ProductIngestionResourceTreeResponse<ProductIngestionResource>, detail: StoredMarketplaceProductDetail, planId: string) {
  const productKeys = getTreeProductKeys(tree, detail);
  const planResources = tree.resources.filter(
    (resource): resource is PlanResource => isPlanResource(resource) && resourceReferenceMatches(resource.product, productKeys)
  );

  return planResources.find((resource) => {
    const planKeys = buildResourceKeys({
      id: resource.id,
      resourceName: resource.resourceName,
      identity: resource.identity
    });
    return planKeys.has(planId);
  });
}

export class AssetVisibilityService {
  private readonly clientFactory: NonNullable<AssetVisibilityServiceOptions['clientFactory']>;
  private readonly now: () => Date;
  private readonly cacheTtlMs: number;
  private readonly resourceTreeCache = new Map<string, CachedTreeEntry>();

  constructor(private readonly options: AssetVisibilityServiceOptions) {
    this.clientFactory =
      options.clientFactory ??
      (({ account }) => {
        if (this.options.tokenProvider) {
          return new ProductIngestionClient({
            logger: this.options.logger.child({ component: 'product-ingestion-client', tenantId: account?.account.tenantId }),
            tokenProvider: this.options.tokenProvider
          });
        }

        if (!this.options.authProvider || !account) {
          throw new Error('AssetVisibilityService requires tokenProvider or authProvider with a Partner Center connection');
        }

        return new ProductIngestionClient({
          logger: this.options.logger.child({ component: 'product-ingestion-client', tenantId: account.account.tenantId }),
          authProvider: this.options.authProvider,
          account: account.account,
          credential: account.credential
        });
      });
    this.now = options.now ?? (() => new Date());
    this.cacheTtlMs = options.cacheTtlMs ?? 60 * 60 * 1000;
  }

  async getListingAssets(publisherTenantId: string, productId: string): Promise<ListingAsset[]> {
    const { tree } = await this.loadProductTree(publisherTenantId, productId);
    return tree.resources
      .filter((resource): resource is ListingAssetResource => isListingAssetResource(resource))
      .map((resource, index) => toListingAsset(resource, index))
      .filter((resource): resource is ListingAsset => Boolean(resource));
  }

  async getListingTrailers(publisherTenantId: string, productId: string): Promise<ListingTrailer[]> {
    const { tree } = await this.loadProductTree(publisherTenantId, productId);
    return tree.resources
      .filter((resource): resource is ListingTrailerResource => isListingTrailerResource(resource))
      .map((resource, index) => toListingTrailer(resource, index))
      .filter((resource): resource is ListingTrailer => Boolean(resource));
  }

  async getAudiences(publisherTenantId: string, productId: string): Promise<AssetVisibilityAudienceResponse> {
    const { tree } = await this.loadProductTree(publisherTenantId, productId);

    return {
      preview: tree.resources
        .filter((resource): resource is PreviewAudienceResource => isPreviewAudienceResource(resource))
        .map((resource, index) => toPreviewAudience(resource, index)),
      private: tree.resources
        .filter((resource): resource is PrivateAudienceResource => isPrivateAudienceResource(resource))
        .map((resource, index) => toPrivateAudience(resource, index))
    };
  }

  async getPlanPricing(publisherTenantId: string, productId: string, planId: string): Promise<PlanPricing> {
    const { detail, tree } = await this.loadProductTree(publisherTenantId, productId);
    const storedPlan = detail.plans.find(
      (plan) => plan.id === planId || plan.externalPlanId === planId || plan.durablePlanId === planId
    );
    if (!storedPlan) {
      throw AppError.notFound('Marketplace plan was not found', { productId, planId });
    }

    const planResource =
      getPlanResource(tree, detail, storedPlan.id) ??
      getPlanResource(tree, detail, storedPlan.externalPlanId) ??
      getPlanResource(tree, detail, storedPlan.durablePlanId);
    const planKeys = buildResourceKeys({
      id: storedPlan.durablePlanId,
      resourceName: planResource?.resourceName,
      identity: { externalId: storedPlan.externalPlanId }
    });

    const productKeys = getTreeProductKeys(tree, detail);
    const offerResources = tree.resources.filter(
      (resource): resource is PriceAndAvailabilityOfferResource =>
        isPriceAndAvailabilityOfferResource(resource) && resourceReferenceMatches(resource.product, productKeys)
    );
    const pricingResources = tree.resources.filter(
      (resource): resource is PriceAndAvailabilityPlanResource =>
        isPriceAndAvailabilityPlanResource(resource) && resourceReferenceMatches(resource.plan, planKeys)
    );

    return {
      planId: storedPlan.id,
      planName: planResource?.alias ?? storedPlan.externalPlanId,
      markets: uniqueByKey(
        pricingResources.flatMap((resource) => extractMarkets(resource)),
        (entry) => `${entry.region}:${entry.currency}:${entry.price}:${entry.marketAvailability}`
      ),
      billingTerms: extractBillingTerms(offerResources, pricingResources),
      availability: extractAvailability(offerResources, pricingResources)
    };
  }

  private async loadProductTree(
    publisherTenantId: string,
    productId: string
  ): Promise<{ detail: StoredMarketplaceProductDetail; tree: ProductIngestionResourceTreeResponse<ProductIngestionResource> }> {
    const detail = await this.options.repository.getProductDetailById(publisherTenantId, productId);
    if (!detail) {
      throw AppError.notFound('Marketplace product was not found', { productId });
    }

    const cacheKey = `${publisherTenantId}:${detail.product.durableProductId}`;
    const now = this.now().getTime();
    const cached = this.resourceTreeCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return {
        detail,
        tree: clone(cached.tree)
      };
    }

    const client = await this.loadClient(publisherTenantId);
    try {
      const tree = await client.getResourceTree(detail.product.durableProductId, 'live');
      this.resourceTreeCache.set(cacheKey, {
        expiresAt: now + this.cacheTtlMs,
        tree: clone(tree)
      });
      return { detail, tree };
    } catch (error) {
      throw this.toAppError(error);
    }
  }

  private async loadClient(publisherTenantId: string): Promise<ProductIngestionClientLike> {
    const connection = this.options.partnerCenterRepository
      ? await this.options.partnerCenterRepository.findByTenant(publisherTenantId)
      : null;

    if (!connection && !this.options.tokenProvider) {
      throw AppError.serviceUnavailable(
        'Marketplace OAuth configuration or a legacy Partner Center connection is required for asset visibility'
      );
    }

    return this.clientFactory({ account: connection ?? undefined });
  }

  private toAppError(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof ProductIngestionError) {
      if (error.statusCode === 404) {
        return AppError.notFound('Partner Center product was not found');
      }

      if (error.statusCode === 429 || error.statusCode >= 500) {
        return AppError.serviceUnavailable('Partner Center asset visibility is temporarily unavailable');
      }

      return AppError.badRequest('Unable to retrieve asset visibility data from Partner Center');
    }

    return AppError.serviceUnavailable('Partner Center asset visibility is temporarily unavailable');
  }
}
