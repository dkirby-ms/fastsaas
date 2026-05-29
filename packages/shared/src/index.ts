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
