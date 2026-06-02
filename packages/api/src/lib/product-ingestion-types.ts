export const PRODUCT_INGESTION_BASE_URL = 'https://graph.microsoft.com/rp/product-ingestion';
export const PRODUCT_INGESTION_API_VERSION = '2022-03-01-preview5';

export const PRODUCT_INGESTION_SCHEMAS = {
  configure: 'https://schema.mp.microsoft.com/schema/configure/2022-03-01-preview2',
  configureDetail: 'https://schema.mp.microsoft.com/schema/configure-detail/2022-03-01-preview2',
  configureStatus: 'https://schema.mp.microsoft.com/schema/configure-status/2022-03-01-preview2',
  resourceTree: 'https://schema.mp.microsoft.com/schema/resource-tree/2022-03-01-preview2',
  product: 'https://schema.mp.microsoft.com/schema/product/2022-03-01-preview3',
  plan: 'https://schema.mp.microsoft.com/schema/plan/2022-03-01-preview2',
  submission: 'https://schema.mp.microsoft.com/schema/submission/2022-03-01-preview2',
  listing: 'https://schema.mp.microsoft.com/schema/listing/2022-03-01-preview5',
  property: 'https://schema.mp.microsoft.com/schema/property/2022-03-01-preview5',
  priceAndAvailabilityPlan: 'https://schema.mp.microsoft.com/schema/price-and-availability-plan/2022-03-01-preview4',
  softwareAsAServiceTechnicalConfiguration:
    'https://schema.mp.microsoft.com/schema/software-as-a-service-technical-configuration/2022-03-01-preview3'
} as const;

export type ProductIngestionEnvironment = 'draft' | 'preview' | 'live';
export type ProductIngestionJobStatus = 'notStarted' | 'running' | 'completed';
export type ProductIngestionJobResult = 'pending' | 'succeeded' | 'failed' | 'cancelled';
export type ProductIngestionLifecycleState =
  | 'notAvailable'
  | 'neverUsed'
  | 'test'
  | 'preview'
  | 'generallyAvailable'
  | 'deprecated'
  | 'decommissioned'
  | 'deleted';
export type ProductIngestionErrorCode =
  | 'badRequest'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'methodNotAllowed'
  | 'requestTimeout'
  | 'conflict'
  | 'locked'
  | 'internalServerError'
  | 'notImplemented'
  | 'serviceUnavailable';
export type ProductIngestionInnerErrorCode =
  | 'businessValidationError'
  | 'collectionLimitExceeded'
  | 'invalidId'
  | 'invalidEntityStatus'
  | 'invalidRequest'
  | 'invalidResource'
  | 'invalidState'
  | 'notDeployed'
  | 'notSupported'
  | 'operationCanceled'
  | 'productLocked'
  | 'resourceNotFound'
  | 'schemaValidationError';

export interface ProductIngestionResourceIdentity {
  externalId?: string;
  externalID?: string;
}

export interface ProductIngestionResourceByExternalIdReference {
  externalId?: string;
  externalID?: string;
}

export interface ProductIngestionResourceByNameReference {
  resourceName: string;
}

export type ProductIngestionResourceReference =
  | string
  | ProductIngestionResourceByExternalIdReference
  | ProductIngestionResourceByNameReference;

export interface ProductIngestionInnerError {
  resourceId?: ProductIngestionResourceReference;
  code: ProductIngestionInnerErrorCode | string;
  message?: string;
  details?: ProductIngestionInnerError[];
}

export interface ProductIngestionJobError {
  resourceId?: ProductIngestionResourceReference;
  code: ProductIngestionErrorCode | string;
  message?: string;
  details?: ProductIngestionInnerError[];
}

export interface ProductIngestionValidation extends ProductIngestionInnerError {
  level: 'informational' | 'warning';
}

export interface ProductIngestionBaseResource {
  $schema: string;
  id?: string;
  resourceName?: string;
  validations?: ProductIngestionValidation[];
  [key: string]: unknown;
}

export interface ProductResource extends ProductIngestionBaseResource {
  $schema: typeof PRODUCT_INGESTION_SCHEMAS.product | string;
  identity: ProductIngestionResourceIdentity;
  type: 'softwareAsAService' | string;
  alias: string;
  productGroup?: ProductIngestionResourceReference;
  lifecycleState?: ProductIngestionLifecycleState;
}

export interface PlanResource extends ProductIngestionBaseResource {
  $schema: typeof PRODUCT_INGESTION_SCHEMAS.plan | string;
  product: ProductIngestionResourceReference;
  identity?: ProductIngestionResourceIdentity;
  alias: string;
  azureRegions?: string[];
  lifecycleState?: ProductIngestionLifecycleState;
}

export interface SubmissionResource extends ProductIngestionBaseResource {
  $schema: typeof PRODUCT_INGESTION_SCHEMAS.submission | string;
  product: ProductIngestionResourceReference;
  target: {
    targetType: ProductIngestionEnvironment;
  };
  status?: string;
  result?: string;
  created?: string;
  lifecycleState?: ProductIngestionLifecycleState;
}

export interface ListingResource extends ProductIngestionBaseResource {
  $schema: typeof PRODUCT_INGESTION_SCHEMAS.listing | string;
  product: ProductIngestionResourceReference;
  plan?: ProductIngestionResourceReference;
  listingType?: string;
  language?: string;
  market?: string;
  title?: string;
  description?: string;
}

export interface PropertyResource extends ProductIngestionBaseResource {
  $schema: typeof PRODUCT_INGESTION_SCHEMAS.property | string;
  product: ProductIngestionResourceReference;
  kind?: string;
  categories?: Record<string, string[]>;
  industries?: Record<string, string[]>;
  termsConditions?: boolean | string;
  privacyPolicyLink?: string;
}

export interface PriceAndAvailabilityPlanResource extends ProductIngestionBaseResource {
  $schema: typeof PRODUCT_INGESTION_SCHEMAS.priceAndAvailabilityPlan | string;
  product: ProductIngestionResourceReference;
  plan: ProductIngestionResourceReference;
  markets?: string[];
  pricing?: Record<string, unknown>;
  availability?: Record<string, unknown>;
  privateAudiences?: Array<Record<string, unknown>>;
}

export interface SoftwareAsAServiceTechnicalConfigurationResource extends ProductIngestionBaseResource {
  $schema: typeof PRODUCT_INGESTION_SCHEMAS.softwareAsAServiceTechnicalConfiguration | string;
  product: ProductIngestionResourceReference;
  plan?: ProductIngestionResourceReference;
  allowedCustomerOperations?: string[];
  landingPageUrl?: string;
  connectionWebhook?: string;
  aadApplicationId?: string;
  tenantId?: string;
}

export interface UnknownProductIngestionResource extends ProductIngestionBaseResource {
  $schema: string;
}

export type ProductIngestionResource =
  | ProductResource
  | PlanResource
  | SubmissionResource
  | ListingResource
  | PropertyResource
  | PriceAndAvailabilityPlanResource
  | SoftwareAsAServiceTechnicalConfigurationResource
  | UnknownProductIngestionResource;

export interface ProductIngestionResourceTreeResponse<TResource extends ProductIngestionResource = ProductIngestionResource> {
  $schema?: string;
  root: string;
  target?: {
    targetType?: ProductIngestionEnvironment | string;
  };
  resources: TResource[];
}

export interface ProductIngestionConfigureRequest<TResource extends ProductIngestionResource = ProductIngestionResource> {
  $schema: typeof PRODUCT_INGESTION_SCHEMAS.configure | string;
  resources: TResource[];
}

export interface ProductIngestionConfigureStatus {
  $schema?: string;
  jobId: string;
  jobStatus: ProductIngestionJobStatus | string;
  jobResult: ProductIngestionJobResult | string;
  jobStart?: string;
  jobEnd?: string;
  resourceUri?: string;
  errors: ProductIngestionJobError[];
}

export interface ProductIngestionConfigureDetail<TResource extends ProductIngestionResource = ProductIngestionResource> {
  $schema?: string;
  resources: TResource[];
}

export interface ProductIngestionJobFailureDetail {
  level: 'job' | 'detail';
  code: string;
  message?: string;
  resourceId?: ProductIngestionResourceReference;
}
