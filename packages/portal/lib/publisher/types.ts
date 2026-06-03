export interface ListingAsset {
  id: string;
  resourceName: string;
  assetType: 'screenshot' | 'logo' | 'thumbnail' | string;
  url: string;
  description?: string;
  displayOrder?: number;
}

export interface ListingTrailer {
  id: string;
  resourceName: string;
  trailerType: 'video' | 'demo' | string;
  url: string;
  thumbnailUrl?: string;
  duration?: number;
}

export interface PreviewAudience {
  id: string;
  resourceName: string;
  audienceType: 'preview' | string;
  count?: number;
  description?: string;
}

export interface PrivateAudience {
  id: string;
  resourceName: string;
  audienceType: 'private' | string;
  segmentDescription?: string;
}

export interface Market {
  region: string;
  currency: string;
  price: number;
  marketAvailability: 'available' | 'notAvailable' | 'preview' | string;
}

export interface BillingTerm {
  billingTermType: 'monthly' | 'annual' | 'one-time' | string;
  duration: number;
  durationUnit: 'month' | 'year' | 'one-time' | string;
}

export interface Availability {
  lifecycleState: 'notAvailable' | 'test' | 'preview' | 'generallyAvailable' | string;
  availableForPurchase: boolean;
}

export interface PlanPricing {
  planId: string;
  planName: string;
  markets: Market[];
  billingTerms: BillingTerm[];
  availability: Availability;
}

export interface ProductAssetsResponse {
  assets: ListingAsset[];
  trailers: ListingTrailer[];
}

export interface ProductAudiencesResponse {
  preview: PreviewAudience[];
  private: PrivateAudience[];
}

export interface PublisherProductPlan {
  id: string;
  externalPlanId: string;
  durablePlanId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublisherProductSubmissionSummary {
  id: string;
  durableSubmissionId: string;
  targetType: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublisherProductSummary {
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

export interface PublisherProductDetail extends PublisherProductSummary {
  plans: PublisherProductPlan[];
  submissions: PublisherProductSubmissionSummary[];
}
