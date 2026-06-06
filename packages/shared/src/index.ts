export type SubscriptionState = 'active' | 'trialing' | 'past_due' | 'suspended' | 'canceled';

export interface PortalUser {
  id: string;
  name: string;
  email: string;
  company: string;
}

export interface UsageSummary {
  activeMembers: number;
  seatsPurchased: number;
  seatLimit?: number | null;
  apiRequestsThisMonth: number;
}

export interface SubscriptionSummary {
  tenantId: string;
  state: SubscriptionState;
  planId: string;
  planName: string;
  billingCycle: 'monthly' | 'annual';
  renewalDate: string;
  amount: string;
}

export interface PortalAction {
  id: 'resume' | 'suspend' | 'cancel';
  label: string;
  description: string;
  tone: 'default' | 'warning' | 'danger';
}

export interface DashboardData {
  user: PortalUser;
  subscription: SubscriptionSummary | null;
  usage: UsageSummary | null;
  actions: PortalAction[];
}

export interface PlanFeature {
  label: string;
  included: boolean;
}

export interface PlanOption {
  id: string;
  name: string;
  description: string;
  priceMonthly: string;
  recommended?: boolean;
  features: PlanFeature[];
}

export interface PlansResponse {
  currentPlanId: string | null;
  availablePlans: PlanOption[];
}

export interface SettingsData {
  displayName: string;
  email: string;
  company: string;
  timezone: string;
  notificationsEnabled: boolean;
}

export interface ApiErrorShape {
  message: string;
  code?: string;
  status?: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponseMeta {
  requestId: string;
  correlationId?: string;
  timestamp: string;
  version: string;
}

export interface ApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  error?: ApiError;
  meta: ApiResponseMeta;
}

export interface AuthClaims {
  sub: string;
  iss: string;
  aud: string | string[];
  tenant_id?: string;
  tid?: string;
  tenantId?: string;
  email?: string;
  oid?: string;
  roles?: string[] | string;
  scope?: string;
  scp?: string;
  [key: string]: unknown;
}

export interface RequestContext {
  requestId: string;
  tenantId: string;
  userId: string;
  scopes: string[];
  roles: string[];
}

export type UsageEventStatus = 'pending' | 'retry_scheduled' | 'submitted' | 'dead_letter';

export interface UsageEventIngestRequest {
  eventId: string;
  subscriptionId: string;
  planId: string;
  dimensionId: string;
  quantity: number;
  timestamp: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface UsageEventRecord {
  id: string;
  tenantId: string;
  eventId: string;
  subscriptionId: string;
  planId: string;
  dimensionId: string;
  quantity: number;
  timestamp: string;
  idempotencyKey: string;
  status: UsageEventStatus;
  retryCount: number;
  nextAttemptAt: string | null;
  submittedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastHttpStatus: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UsageEventIngestResponse {
  event: UsageEventRecord;
  deduplicated: boolean;
}

export interface UsageEventDeadLetterRecord {
  id: string;
  usageEventId: string;
  tenantId: string;
  eventId: string;
  reason: string;
  httpStatus: number | null;
  retryCount: number;
  payload: Record<string, unknown>;
  failedAt: string;
}

export interface MeteringDashboardSummary {
  pendingCount: number;
  retryScheduledCount: number;
  submittedCount: number;
  deadLetterCount: number;
  overdueCount: number;
  submittedWithinSlaPercent: number;
  oldestPendingAgeMinutes: number | null;
  lastSubmittedAt: string | null;
}

export interface MeteringWorkerRunResult {
  attempted: number;
  submitted: number;
  retried: number;
  deadLettered: number;
}

export type SubscriptionStatus = 'PendingActivation' | 'Active' | 'Suspended' | 'Unsubscribed';

export interface SubscriptionAuditEntry {
  id: string;
  subscriptionId: string;
  eventType: string;
  source: string;
  fromStatus: SubscriptionStatus | null;
  toStatus: SubscriptionStatus;
  correlationId: string;
  requestId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface Subscription {
  id: string;
  tenantId: string;
  marketplaceSubscriptionId: string;
  planId: string;
  seats: number;
  status: SubscriptionStatus;
  offerId?: string;
  purchaserTenantId?: string;
  beneficiaryTenantId?: string;
  correlationId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  auditLog: SubscriptionAuditEntry[];
}

export interface CreateSubscriptionRequest {
  marketplaceToken: string;
  metadata?: Record<string, unknown>;
}

export type MarketplaceWebhookAction =
  | 'Subscribe'
  | 'Renew'
  | 'Suspend'
  | 'Unsubscribe'
  | 'Reinstate'
  | 'ChangePlan'
  | 'ChangeQuantity'
  | 'Transfer';

export interface MarketplaceWebhookIdentity {
  emailId?: string;
  objectId?: string;
  tenantId?: string;
}

export interface MarketplaceWebhookPayload {
  action: MarketplaceWebhookAction;
  marketplaceSubscriptionId: string;
  operationId?: string;
  offerId?: string;
  planId?: string;
  quantity?: number;
  beneficiary?: MarketplaceWebhookIdentity;
  purchaser?: MarketplaceWebhookIdentity;
  beneficiaryTenantId?: string;
  requestId?: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}

export type PortalRole = 'customer' | 'publisher';

export interface AuthContextData {
  tenantId: string;
  userId: string;
  scopes: string[];
  roles: string[];
}

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = Exclude<Theme, 'system'>;
export type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

export type PublisherPlanStatus = 'active' | 'draft';

export interface PublisherDashboardPlanSummary {
  planId: string;
  planName: string;
  tenantCount: number;
}

export interface PublisherDashboardData {
  subscriptionCount: number;
  activeTenants: number;
  monthlyRecurringRevenue: string;
  churnRiskCount: number;
  plans: PublisherDashboardPlanSummary[];
}

export interface PublisherPlan {
  id: string;
  name: string;
  description: string;
  priceMonthly: string;
  status: PublisherPlanStatus;
  activeSubscriptions: number;
  features: string[];
  marketplacePlanId?: string | null;
  seatLimit?: number | null;
}

export interface PublisherPlansResponse {
  plans: PublisherPlan[];
}

export interface MarketplacePlanSummary {
  id: string;
  externalPlanId: string;
  durablePlanId: string;
  productId: string;
  status: string;
  pricingSummary?: Record<string, unknown> | null;
}

export type PublisherTenantStatus = SubscriptionState;

export interface PublisherTenantSummary {
  id: string;
  displayName: string;
  primaryDomain: string;
  planId: string;
  planName: string;
  status: PublisherTenantStatus;
  monthlyRecurringRevenue: string;
  seats: number;
  subscriptionId?: string;
  lastUpdated: string;
}

export interface PublisherTenantUsageSummary {
  activeUsers: number;
  apiRequestsThisMonth: number;
  storageGb: number;
}

export interface PublisherTenantAuditEntry {
  id: string;
  label: string;
  timestamp: string;
}

export interface PublisherTenantDetail extends PublisherTenantSummary {
  purchaserTenantId?: string;
  beneficiaryTenantId?: string;
  usage: PublisherTenantUsageSummary;
  audit: PublisherTenantAuditEntry[];
}

export interface PublisherTenantsResponse {
  tenants: PublisherTenantSummary[];
}

export interface PublisherPlanUpdateInput {
  name: string;
  description: string;
  priceMonthly: string;
  status: PublisherPlanStatus;
  marketplacePlanId?: string | null;
  seatLimit?: number | null;
}

export interface CreatePublisherPlanInput extends PublisherPlanUpdateInput {
  id?: string;
  features?: string[];
}

export interface PublisherTenantUpsertInput {
  displayName: string;
  primaryDomain: string;
  planId: string;
  seats: number;
  status: PublisherTenantStatus;
}

export interface PublisherSubmissionValidationIssue {
  level: 'error' | 'warning' | 'informational';
  message: string;
  resourceName: string;
  code?: string;
  resourceType?: string;
  fieldPath?: string;
}

export interface PublisherSubmissionResourceSummary {
  resourceKey: string;
  resourceType: string;
  resourceName: string;
  durableId: string;
  externalId?: string;
  lifecycleState?: string;
}

export interface PublisherSubmissionHistoryEntry {
  submissionId: string;
  environment: 'draft' | 'preview' | 'live';
  status: string;
  result?: string;
  createdAt?: string;
  updatedAt?: string;
  validationIssues: PublisherSubmissionValidationIssue[];
}

export interface PublisherSubmissionEnvironmentState {
  environment: 'draft' | 'preview' | 'live';
  currentSubmission?: PublisherSubmissionHistoryEntry;
  submissions: PublisherSubmissionHistoryEntry[];
  validationIssues: PublisherSubmissionValidationIssue[];
  resources: PublisherSubmissionResourceSummary[];
  lastUpdatedAt?: string;
}

export interface PublisherProductSubmissionsResponse {
  productId: string;
  externalOfferId: string;
  durableProductId: string;
  lastSyncedAt: string;
  fetchedAt: string;
  environments: {
    draft: PublisherSubmissionEnvironmentState;
    preview: PublisherSubmissionEnvironmentState;
    live: PublisherSubmissionEnvironmentState;
  };
  history: PublisherSubmissionHistoryEntry[];
}

export interface PublisherSubmissionDiffEntry {
  resourceKey: string;
  resourceType: string;
  resourceName: string;
  changeType: 'added' | 'removed' | 'modified';
  fieldPaths: string[];
  draftResource?: Record<string, unknown>;
  liveResource?: Record<string, unknown>;
}

export interface PublisherProductSubmissionDiffResponse {
  productId: string;
  externalOfferId: string;
  durableProductId: string;
  comparedAt: string;
  sourceEnvironment: 'draft';
  targetEnvironment: 'live';
  hasChanges: boolean;
  changes: PublisherSubmissionDiffEntry[];
}


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

export interface PlanPricing {
  planId: string;
  planName: string;
  markets: Market[];
  billingTerms: BillingTerm[];
  availability: Availability;
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

export * from './squad-places.js';
