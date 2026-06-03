import type {
  Availability,
  BillingTerm,
  ListingAsset,
  ListingTrailer,
  Market,
  PlanPricing,
  PreviewAudience,
  PrivateAudience,
} from '@fastsaas/shared';

export type {
  Availability,
  BillingTerm,
  ListingAsset,
  ListingTrailer,
  Market,
  PlanPricing,
  PreviewAudience,
  PrivateAudience,
} from '@fastsaas/shared';

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
