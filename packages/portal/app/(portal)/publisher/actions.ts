'use server';

import type {
  CreatePublisherPlanInput,
  MarketplacePlanSummary,
  PublisherDashboardData,
  PublisherPlan,
  PublisherPlanUpdateInput,
  PublisherPlansResponse,
  PublisherTenantDetail,
  PublisherTenantSummary,
  PublisherTenantUpsertInput,
  PublisherTenantsResponse,
} from '@fastsaas/shared';
import { auth } from '@/auth';
import { ApiError } from '@/lib/errors';
import { hasPublisherAccess } from '@/lib/roles';
import { getServerConfig } from '@/lib/server-config';
import { publisherAdminPaths } from '@/lib/api-paths';

// ---- Result types --------------------------------------------------------

export type ActionSuccess<T> = { ok: true; data: T };
export type ActionFailure = { ok: false; status: number; code?: string; message: string };
export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

// ---- Auth helper ---------------------------------------------------------

async function requirePublisherAccessToken(): Promise<string> {
  const session = await auth();

  if (!session?.accessToken) {
    throw new ApiError('Sign in to access publisher workflows.', 401, 'AUTH_REQUIRED');
  }

  if (!hasPublisherAccess(session.roles)) {
    throw new ApiError('Publisher role is required.', 403, 'AUTH_FORBIDDEN', 'Your account does not have access to the publisher portal.');
  }

  return session.accessToken;
}

// ---- Live API helper -----------------------------------------------------

function normalizeBaseUrl(url: string) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

async function livePublisherRequest<T>(publisherBaseUrl: string, path: string, accessToken: string, init?: Omit<RequestInit, 'headers'>): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  let response: Response;

  try {
    response = await fetch(`${normalizeBaseUrl(publisherBaseUrl)}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    });
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? error.message : 'Request failed',
      500,
      'API_UNAVAILABLE',
      'We could not reach the FastSaaS API. Check your connection and try again.',
    );
  }

  const body = (await response.json().catch(() => null)) as {
    status?: string;
    data?: T;
    error?: { code?: string; message?: string };
    message?: string;
    code?: string;
  } | null;

  if (!response.ok) {
    throw new ApiError(
      body?.error?.message ?? body?.message ?? 'Request failed',
      response.status,
      body?.error?.code ?? body?.code,
      body?.error?.message ?? body?.message ?? 'Something went wrong while contacting the FastSaaS API.',
    );
  }

  // Unwrap ApiResponse<T> envelope if present
  if (body && typeof body === 'object' && 'status' in body) {
    if (body.status === 'success' && body.data !== undefined) {
      return body.data as T;
    }

    throw new ApiError(body.error?.message ?? 'Unexpected API response', 500, body.error?.code);
  }

  return body as T;
}

// ---- Action wrapper ------------------------------------------------------

async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, status: error.status, code: error.code, message: error.userMessage };
    }

    return {
      ok: false,
      status: 500,
      message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    };
  }
}

// ---- Static mock data ----------------------------------------------------

function mockDashboard(): PublisherDashboardData {
  return {
    subscriptionCount: 3,
    activeTenants: 1,
    monthlyRecurringRevenue: '$577',
    churnRiskCount: 1,
    plans: [
      { planId: 'growth', planName: 'Growth', tenantCount: 2 },
      { planId: 'starter', planName: 'Starter', tenantCount: 1 },
    ],
  };
}

function mockPlans(): PublisherPlan[] {
  return [
    { id: 'starter', name: 'Starter', description: 'Self-serve onboarding for early marketplace customers.', priceMonthly: '$79', status: 'active', activeSubscriptions: 1, features: ['10 seats included', 'Email support', 'Single environment'], marketplacePlanId: 'starter', seatLimit: 10 },
    { id: 'growth', name: 'Growth', description: 'Balanced controls for growing portfolio tenants.', priceMonthly: '$249', status: 'active', activeSubscriptions: 2, features: ['25 seats included', 'Priority support', 'Usage analytics'], marketplacePlanId: 'growth', seatLimit: 25 },
    { id: 'scale', name: 'Scale', description: 'Enterprise controls and publisher-ready governance.', priceMonthly: '$499', status: 'draft', activeSubscriptions: 0, features: ['Unlimited seats', 'Dedicated support', 'Custom exports'], marketplacePlanId: null, seatLimit: null },
  ];
}

function mockTenants(): PublisherTenantDetail[] {
  return [
    {
      id: 'tenant-contoso', displayName: 'Contoso Ltd', primaryDomain: 'contoso.example',
      planId: 'growth', planName: 'Growth', status: 'active', monthlyRecurringRevenue: '$249',
      seats: 24, subscriptionId: 'sub-contoso', lastUpdated: '2026-05-28T15:00:00.000Z',
      purchaserTenantId: 'purchaser-contoso', beneficiaryTenantId: 'beneficiary-contoso',
      usage: { activeUsers: 21, apiRequestsThisMonth: 188420, storageGb: 11.8 },
      audit: [
        { id: 'audit-contoso-1', label: 'Subscribed → Active', timestamp: '2026-05-01T10:00:00.000Z' },
        { id: 'audit-contoso-2', label: 'Seat expansion approved', timestamp: '2026-05-20T16:00:00.000Z' },
      ],
    },
    {
      id: 'tenant-fabrikam', displayName: 'Fabrikam Retail', primaryDomain: 'fabrikam.example',
      planId: 'starter', planName: 'Starter', status: 'trialing', monthlyRecurringRevenue: '$79',
      seats: 8, subscriptionId: 'sub-fabrikam', lastUpdated: '2026-05-29T12:30:00.000Z',
      purchaserTenantId: 'purchaser-fabrikam', beneficiaryTenantId: 'beneficiary-fabrikam',
      usage: { activeUsers: 5, apiRequestsThisMonth: 32410, storageGb: 2.4 },
      audit: [{ id: 'audit-fabrikam-1', label: 'Provisioning in progress', timestamp: '2026-05-29T12:30:00.000Z' }],
    },
    {
      id: 'tenant-adatum', displayName: 'Adatum Ventures', primaryDomain: 'adatum.example',
      planId: 'growth', planName: 'Growth', status: 'suspended', monthlyRecurringRevenue: '$249',
      seats: 18, subscriptionId: 'sub-adatum', lastUpdated: '2026-05-30T09:45:00.000Z',
      purchaserTenantId: 'purchaser-adatum', beneficiaryTenantId: 'beneficiary-adatum',
      usage: { activeUsers: 9, apiRequestsThisMonth: 72110, storageGb: 6.1 },
      audit: [
        { id: 'audit-adatum-1', label: 'Billing hold applied', timestamp: '2026-05-30T09:45:00.000Z' },
        { id: 'audit-adatum-2', label: 'Support escalated', timestamp: '2026-05-30T10:00:00.000Z' },
      ],
    },
  ];
}

function mockMarketplacePlans(): MarketplacePlanSummary[] {
  return [
    { id: 'mp-starter', externalPlanId: 'starter', productId: 'fastsaas', status: 'active', durablePlanId: 'plan-starter-durable' },
    { id: 'mp-growth', externalPlanId: 'growth', productId: 'fastsaas', status: 'active', durablePlanId: 'plan-growth-durable' },
    { id: 'mp-scale', externalPlanId: 'scale', productId: 'fastsaas', status: 'draft', durablePlanId: 'plan-scale-durable' },
  ];
}

// ---- Exported server actions ---------------------------------------------

export async function getPublisherDashboardAction(): Promise<ActionResult<PublisherDashboardData>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) return mockDashboard();

    const token = await requirePublisherAccessToken();

    return livePublisherRequest<PublisherDashboardData>(config.publisherApiBaseUrl, publisherAdminPaths.dashboard, token);
  });
}

export async function getPublisherPlansAction(): Promise<ActionResult<PublisherPlansResponse>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) return { plans: mockPlans() };

    const token = await requirePublisherAccessToken();

    return livePublisherRequest<PublisherPlansResponse>(config.publisherApiBaseUrl, publisherAdminPaths.plans, token);
  });
}

export async function getMarketplacePlansAction(): Promise<ActionResult<MarketplacePlanSummary[]>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) return mockMarketplacePlans();

    const token = await requirePublisherAccessToken();

    return livePublisherRequest<MarketplacePlanSummary[]>(config.publisherApiBaseUrl, publisherAdminPaths.marketplacePlans, token);
  });
}

export async function createPublisherPlanAction(payload: CreatePublisherPlanInput): Promise<ActionResult<PublisherPlansResponse>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      const newPlan: PublisherPlan = {
        id: payload.id ?? payload.name.toLowerCase().replace(/\s+/g, '-'),
        name: payload.name,
        description: payload.description,
        priceMonthly: payload.priceMonthly,
        status: payload.status ?? 'draft',
        activeSubscriptions: 0,
        features: payload.features ?? [],
        marketplacePlanId: payload.marketplacePlanId ?? null,
        seatLimit: payload.seatLimit ?? null,
      };

      return { plans: [...mockPlans(), newPlan] };
    }

    const token = await requirePublisherAccessToken();

    return livePublisherRequest<PublisherPlansResponse>(config.publisherApiBaseUrl, publisherAdminPaths.plans, token, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  });
}

export async function updatePublisherPlanAction(planId: string, payload: PublisherPlanUpdateInput): Promise<ActionResult<PublisherPlansResponse>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      const plans = mockPlans().map((plan) =>
        plan.id === planId ? { ...plan, ...payload, seatLimit: payload.seatLimit ?? null, marketplacePlanId: payload.marketplacePlanId ?? null } : plan,
      );

      return { plans };
    }

    const token = await requirePublisherAccessToken();

    return livePublisherRequest<PublisherPlansResponse>(config.publisherApiBaseUrl, publisherAdminPaths.plan(planId), token, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  });
}

export async function getPublisherTenantsAction(): Promise<ActionResult<PublisherTenantsResponse>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      const tenants: PublisherTenantSummary[] = mockTenants();

      return { tenants };
    }

    const token = await requirePublisherAccessToken();

    return livePublisherRequest<PublisherTenantsResponse>(config.publisherApiBaseUrl, publisherAdminPaths.tenants, token);
  });
}

export async function getPublisherTenantAction(tenantId: string): Promise<ActionResult<PublisherTenantDetail>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      const tenant = mockTenants().find((t) => t.id === tenantId);

      if (!tenant) throw new ApiError(`Tenant ${tenantId} not found`, 404, 'NOT_FOUND', 'The requested tenant was not found.');

      return tenant;
    }

    const token = await requirePublisherAccessToken();

    return livePublisherRequest<PublisherTenantDetail>(config.publisherApiBaseUrl, publisherAdminPaths.tenant(tenantId), token);
  });
}

export async function createPublisherTenantAction(payload: PublisherTenantUpsertInput): Promise<ActionResult<PublisherTenantDetail>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      const id = `tenant-${payload.displayName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

      return {
        id,
        displayName: payload.displayName,
        primaryDomain: payload.primaryDomain,
        planId: payload.planId,
        planName: payload.planId,
        status: payload.status,
        monthlyRecurringRevenue: '$0',
        seats: payload.seats,
        subscriptionId: `sub-${id}`,
        lastUpdated: new Date().toISOString(),
        purchaserTenantId: '',
        beneficiaryTenantId: '',
        usage: { activeUsers: 0, apiRequestsThisMonth: 0, storageGb: 0 },
        audit: [{ id: `audit-${id}-1`, label: 'Tenant created', timestamp: new Date().toISOString() }],
      };
    }

    const token = await requirePublisherAccessToken();

    return livePublisherRequest<PublisherTenantDetail>(config.publisherApiBaseUrl, publisherAdminPaths.tenants, token, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  });
}

export async function updatePublisherTenantAction(tenantId: string, payload: PublisherTenantUpsertInput): Promise<ActionResult<PublisherTenantDetail>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      const existing = mockTenants().find((t) => t.id === tenantId);

      if (!existing) throw new ApiError(`Tenant ${tenantId} not found`, 404, 'NOT_FOUND', 'The requested tenant was not found.');

      return { ...existing, ...payload, lastUpdated: new Date().toISOString() };
    }

    const token = await requirePublisherAccessToken();

    return livePublisherRequest<PublisherTenantDetail>(config.publisherApiBaseUrl, publisherAdminPaths.tenant(tenantId), token, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  });
}

async function tenantLifecycleAction(subscriptionId: string, action: 'activate' | 'suspend' | 'cancel'): Promise<ActionResult<PublisherTenantDetail>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      const statusMap = { activate: 'active', suspend: 'suspended', cancel: 'canceled' } as const;
      const existing = mockTenants().find((t) => t.subscriptionId === subscriptionId) ?? mockTenants()[0];

      return {
        ...existing,
        status: statusMap[action],
        lastUpdated: new Date().toISOString(),
        audit: [
          ...existing.audit,
          { id: `audit-action-${Date.now()}`, label: `Tenant ${action}d`, timestamp: new Date().toISOString() },
        ],
      };
    }

    const token = await requirePublisherAccessToken();

    return livePublisherRequest<PublisherTenantDetail>(
      config.publisherApiBaseUrl,
      publisherAdminPaths.tenantAction(subscriptionId, action),
      token,
      { method: 'POST' },
    );
  });
}

export async function activatePublisherTenantAction(subscriptionId: string): Promise<ActionResult<PublisherTenantDetail>> {
  return tenantLifecycleAction(subscriptionId, 'activate');
}

export async function suspendPublisherTenantAction(subscriptionId: string): Promise<ActionResult<PublisherTenantDetail>> {
  return tenantLifecycleAction(subscriptionId, 'suspend');
}

export async function cancelPublisherTenantAction(subscriptionId: string): Promise<ActionResult<PublisherTenantDetail>> {
  return tenantLifecycleAction(subscriptionId, 'cancel');
}
