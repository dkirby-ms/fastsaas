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
  subscription: SubscriptionSummary;
  usage: UsageSummary;
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
  currentPlanId: string;
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
  | 'Suspend'
  | 'Unsubscribe'
  | 'Reinstate'
  | 'ChangePlan'
  | 'ChangeQuantity'
  | 'Transfer';

export interface MarketplaceWebhookPayload {
  action: MarketplaceWebhookAction;
  marketplaceSubscriptionId: string;
  operationId?: string;
  planId?: string;
  quantity?: number;
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
}

export interface PublisherPlansResponse {
  plans: PublisherPlan[];
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
}

export interface PublisherTenantUpsertInput {
  displayName: string;
  primaryDomain: string;
  planId: string;
  seats: number;
  status: PublisherTenantStatus;
}

export type PartnerCenterAuthMode = 'CLIENT_SECRET' | 'CLIENT_CERTIFICATE';

export type PartnerCenterConnectionStatus = 'PENDING' | 'CONNECTED' | 'FAILED' | 'EXPIRED';

export interface PartnerCenterConnectRequest {
  pcTenantId: string;
  clientId: string;
  authMode: PartnerCenterAuthMode;
  secretReference: string;
  rotationMetadata?: Record<string, unknown>;
  expiresAt?: string;
}

export interface PartnerCenterConnection {
  id: string;
  pcTenantId: string;
  clientId: string;
  authMode: PartnerCenterAuthMode;
  connectionStatus: PartnerCenterConnectionStatus;
  lastValidatedAt?: string;
  credentialId: string;
  rotationMetadata?: Record<string, unknown>;
  lastRotatedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerCenterStatusResponse {
  connected: boolean;
  connection?: PartnerCenterConnection;
}

export interface PartnerCenterDisconnectResponse {
  disconnected: boolean;
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

export * from './squad-places.js';
