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
    planId?: string;
    seats?: number;
    metadata?: Record<string, unknown>;
}
export interface MarketplaceWebhookPayload {
    action: 'Suspend' | 'Unsubscribe' | 'Reinstate';
    marketplaceSubscriptionId: string;
    requestId?: string;
    correlationId?: string;
    details?: Record<string, unknown>;
}
export * from './squad-places.js';
