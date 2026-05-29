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
    iss?: string;
    aud?: string | string[];
    tenantId?: string;
    tenant_id?: string;
    tid?: string;
    email?: string;
    oid?: string;
    scope?: string;
    scp?: string;
    roles?: string[] | string;
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
