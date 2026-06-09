'use server';

import type {
  CreatePublisherPlanInput,
  MarketplacePlanSummary,
  PlanFeatureGate,
  PublisherDashboardData,
  PublisherPlan,
  PublisherPlanUpdateInput,
  PublisherPlansResponse,
  PublisherTenantDetail,
  PublisherTenantSummary,
  PublisherTenantUpsertInput,
  PublisherTenantsResponse,
  SetFeatureGatesRequest,
} from '@fastsaas/shared';
import { auth } from '@/auth';
import { ApiError } from '@/lib/errors';
import { hasOperatorAccess } from '@/lib/roles';
import { getServerConfig } from '@/lib/server-config';
import { operatorAdminPaths } from '@/lib/api-paths';

// ---- Result types --------------------------------------------------------

export type ActionSuccess<T> = { ok: true; data: T };
export type ActionFailure = { ok: false; status: number; code?: string; message: string };
export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

// ---- Auth helper ---------------------------------------------------------

async function requireOperatorAccessToken(): Promise<string> {
  const session = await auth();

  if (!session?.accessToken) {
    throw new ApiError('Sign in to access operator workflows.', 401, 'AUTH_REQUIRED');
  }

  if (!hasOperatorAccess(session.roles)) {
    throw new ApiError('Operator role is required.', 403, 'AUTH_FORBIDDEN', 'Your account does not have access to the operator portal.');
  }

  return session.accessToken;
}

// ---- Live API helper -----------------------------------------------------

function normalizeBaseUrl(url: string) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

async function liveOperatorRequest<T>(operatorBaseUrl: string, path: string, accessToken: string, init?: Omit<RequestInit, 'headers'>): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  let response: Response;

  try {
    response = await fetch(`${normalizeBaseUrl(operatorBaseUrl)}${path}`, {
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

const mockPlanStatusOverrides = new Map<string, PublisherPlan['status']>();

function mockDashboard(): PublisherDashboardData {
  return {
    activeTenants: 1,
    churnedTenants: 0,
    totalSeats: 24,
    plans: [
      { planId: 'growth', planName: 'Growth', tenantCount: 2 },
      { planId: 'starter', planName: 'Starter', tenantCount: 1 },
    ],
  };
}

function mockPlans(): PublisherPlan[] {
  const plans: PublisherPlan[] = [
    { id: 'starter', name: 'Starter', description: 'Self-serve onboarding for early marketplace customers.', pricingSummary: null, status: 'active', activeSubscriptions: 1, features: ['10 seats included', 'Email support', 'Single environment'], marketplacePlanId: 'starter', seatLimit: 10 },
    { id: 'growth', name: 'Growth', description: 'Balanced controls for growing portfolio tenants.', pricingSummary: null, status: 'active', activeSubscriptions: 2, features: ['25 seats included', 'Priority support', 'Usage analytics'], marketplacePlanId: 'growth', seatLimit: 25 },
    { id: 'scale', name: 'Scale', description: 'Enterprise controls and operator-ready governance.', pricingSummary: null, status: 'archived', activeSubscriptions: 0, features: ['Unlimited seats', 'Dedicated support', 'Custom exports'], marketplacePlanId: null, seatLimit: null },
  ];

  return plans.map((plan) => ({
    ...plan,
    status: mockPlanStatusOverrides.get(plan.id) ?? plan.status,
  }));
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

export async function getOperatorDashboardAction(): Promise<ActionResult<PublisherDashboardData>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) return mockDashboard();

    const token = await requireOperatorAccessToken();

    return liveOperatorRequest<PublisherDashboardData>(config.publisherApiBaseUrl, operatorAdminPaths.dashboard, token);
  });
}

export async function getOperatorPlansAction(): Promise<ActionResult<PublisherPlansResponse>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) return { plans: mockPlans() };

    const token = await requireOperatorAccessToken();

    return liveOperatorRequest<PublisherPlansResponse>(config.publisherApiBaseUrl, `${operatorAdminPaths.plans}?includeArchived=true`, token);
  });
}

export async function getMarketplacePlansAction(): Promise<ActionResult<MarketplacePlanSummary[]>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) return mockMarketplacePlans();

    const token = await requireOperatorAccessToken();

    return liveOperatorRequest<MarketplacePlanSummary[]>(config.publisherApiBaseUrl, operatorAdminPaths.marketplacePlans, token);
  });
}

export async function createOperatorPlanAction(payload: CreatePublisherPlanInput): Promise<ActionResult<PublisherPlansResponse>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      const newPlan: PublisherPlan = {
        id: payload.id ?? payload.name.toLowerCase().replace(/\s+/g, '-'),
        name: payload.name,
        description: payload.description,
        pricingSummary: null,
        status: payload.status ?? 'active',
        activeSubscriptions: 0,
        features: payload.features ?? [],
        marketplacePlanId: payload.marketplacePlanId ?? null,
        seatLimit: payload.seatLimit ?? null,
      };

      return { plans: [...mockPlans(), newPlan] };
    }

    const token = await requireOperatorAccessToken();

    return liveOperatorRequest<PublisherPlansResponse>(config.publisherApiBaseUrl, operatorAdminPaths.plans, token, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  });
}

export async function updateOperatorPlanAction(planId: string, payload: PublisherPlanUpdateInput): Promise<ActionResult<PublisherPlansResponse>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      const plans = mockPlans().map((plan) =>
        plan.id === planId ? { ...plan, ...payload, seatLimit: payload.seatLimit ?? null, marketplacePlanId: payload.marketplacePlanId ?? null } : plan,
      );

      return { plans };
    }

    const token = await requireOperatorAccessToken();

    return liveOperatorRequest<PublisherPlansResponse>(config.publisherApiBaseUrl, operatorAdminPaths.plan(planId), token, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  });
}

async function updatePlanArchivedState(planId: string, status: PublisherPlan['status']): Promise<ActionResult<void>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      const plan = mockPlans().find((item) => item.id === planId);
      if (!plan) throw new ApiError(`Plan ${planId} not found`, 404, 'NOT_FOUND', 'The requested plan was not found.');
      mockPlanStatusOverrides.set(planId, status);
      return;
    }

    const token = await requireOperatorAccessToken();

    await liveOperatorRequest<unknown>(
      config.publisherApiBaseUrl,
      status === 'archived' ? operatorAdminPaths.planArchive(planId) : operatorAdminPaths.planUnarchive(planId),
      token,
      { method: 'PATCH' },
    );
  });
}

export async function archivePlan(planId: string): Promise<ActionResult<void>> {
  return updatePlanArchivedState(planId, 'archived');
}

export async function unarchivePlan(planId: string): Promise<ActionResult<void>> {
  return updatePlanArchivedState(planId, 'active');
}

export async function getOperatorTenantsAction(): Promise<ActionResult<PublisherTenantsResponse>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      const tenants: PublisherTenantSummary[] = mockTenants();

      return { tenants };
    }

    const token = await requireOperatorAccessToken();

    return liveOperatorRequest<PublisherTenantsResponse>(config.publisherApiBaseUrl, operatorAdminPaths.tenants, token);
  });
}

export async function getOperatorTenantAction(tenantId: string): Promise<ActionResult<PublisherTenantDetail>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      const tenant = mockTenants().find((t) => t.id === tenantId);

      if (!tenant) throw new ApiError(`Tenant ${tenantId} not found`, 404, 'NOT_FOUND', 'The requested tenant was not found.');

      return tenant;
    }

    const token = await requireOperatorAccessToken();

    return liveOperatorRequest<PublisherTenantDetail>(config.publisherApiBaseUrl, operatorAdminPaths.tenant(tenantId), token);
  });
}

export async function updateOperatorTenantAction(tenantId: string, payload: PublisherTenantUpsertInput): Promise<ActionResult<PublisherTenantDetail>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      const existing = mockTenants().find((t) => t.id === tenantId);

      if (!existing) throw new ApiError(`Tenant ${tenantId} not found`, 404, 'NOT_FOUND', 'The requested tenant was not found.');

      return { ...existing, ...payload, lastUpdated: new Date().toISOString() };
    }

    const token = await requireOperatorAccessToken();

    return liveOperatorRequest<PublisherTenantDetail>(config.publisherApiBaseUrl, operatorAdminPaths.tenant(tenantId), token, {
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

    const token = await requireOperatorAccessToken();

    return liveOperatorRequest<PublisherTenantDetail>(
      config.publisherApiBaseUrl,
      operatorAdminPaths.tenantAction(subscriptionId, action),
      token,
      { method: 'POST' },
    );
  });
}

export async function activateOperatorTenantAction(subscriptionId: string): Promise<ActionResult<PublisherTenantDetail>> {
  return tenantLifecycleAction(subscriptionId, 'activate');
}

export async function suspendOperatorTenantAction(subscriptionId: string): Promise<ActionResult<PublisherTenantDetail>> {
  return tenantLifecycleAction(subscriptionId, 'suspend');
}

export async function cancelOperatorTenantAction(subscriptionId: string): Promise<ActionResult<PublisherTenantDetail>> {
  return tenantLifecycleAction(subscriptionId, 'cancel');
}

// ---- Feature gate actions -------------------------------------------------

export async function getFeatureGatesAction(planId: string): Promise<ActionResult<{ features: PlanFeatureGate[] }>> {
  return runAction(async () => {
    const config = getServerConfig();
    const token = await requireOperatorAccessToken();

    return liveOperatorRequest<{ features: PlanFeatureGate[] }>(config.publisherApiBaseUrl, operatorAdminPaths.planFeatures(planId), token);
  });
}

export async function setFeatureGatesAction(planId: string, gates: SetFeatureGatesRequest['gates']): Promise<ActionResult<{ features: PlanFeatureGate[] }>> {
  return runAction(async () => {
    const config = getServerConfig();
    const token = await requireOperatorAccessToken();

    return liveOperatorRequest<{ features: PlanFeatureGate[] }>(config.publisherApiBaseUrl, operatorAdminPaths.planFeatures(planId), token, {
      method: 'PUT',
      body: JSON.stringify({ gates } satisfies SetFeatureGatesRequest),
    });
  });
}

export async function importProductAction(externalId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) return;

    const token = await requireOperatorAccessToken();

    await liveOperatorRequest<unknown>(config.publisherApiBaseUrl, operatorAdminPaths.importProduct, token, {
      method: 'POST',
      body: JSON.stringify({ externalId }),
    });
  });
}

export async function removeFeatureGateAction(planId: string, featureKey: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) return;

    const token = await requireOperatorAccessToken();

    await liveOperatorRequest<void>(config.publisherApiBaseUrl, operatorAdminPaths.planFeature(planId, featureKey), token, {
      method: 'DELETE',
    });
  });
}
