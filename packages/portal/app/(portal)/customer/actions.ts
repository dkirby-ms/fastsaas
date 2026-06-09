'use server';

import type { DashboardData, MeteringDashboardSummary, PlansResponse, SettingsData } from '@fastsaas/shared';
import { auth } from '@/auth';
import { customerApiPaths } from '@/lib/api-paths';
import { ApiError } from '@/lib/errors';
import { getDefaultPortalRoute, hasOperatorAccess } from '@/lib/roles';
import { getServerConfig } from '@/lib/server-config';

export type ActionSuccess<T> = { ok: true; data: T };
export type ActionFailure = { ok: false; status: number; code?: string; message: string };
export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

type CustomerSubscriptionState = NonNullable<DashboardData['subscription']>['state'];
type MockPlan = PlansResponse['availablePlans'][number] & { seatLimit: number | null; seatsPurchased: number };

export interface ProcessRecordsResponse {
  recordsProcessed: number;
  meteringEvent: {
    eventId: string;
    dimensionId: string;
    quantity: number;
    status: string;
    deduplicated: boolean;
  };
}

const mockPlans: MockPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Core workflow automation for small teams.',
    pricingSummary: '$79/mo',
    features: [
      { label: 'Up to 10 team members', included: true },
      { label: 'Email support', included: true },
      { label: 'Single environment', included: true },
    ],
    seatLimit: 10,
    seatsPurchased: 10,
  },
  {
    id: 'growth',
    name: 'Growth',
    description: 'Balanced controls for scaling product teams.',
    pricingSummary: '$249/mo',
    recommended: true,
    features: [
      { label: 'Up to 25 team members', included: true },
      { label: 'Priority support', included: true },
      { label: 'Advanced analytics', included: true },
    ],
    seatLimit: 25,
    seatsPurchased: 25,
  },
  {
    id: 'scale',
    name: 'Scale',
    description: 'Enterprise-ready governance and visibility.',
    pricingSummary: null,
    features: [
      { label: 'Unlimited team members', included: true },
      { label: 'Dedicated success manager', included: true },
      { label: 'Custom usage exports', included: true },
    ],
    seatLimit: null,
    seatsPurchased: 50,
  },
];

let mockCurrentPlanId: MockPlan['id'] = 'growth';
let mockSubscriptionState: CustomerSubscriptionState = 'active';
let mockSettingsOverrides: Partial<SettingsData> = {};
let mockMeteringSummary: MeteringDashboardSummary = {
  pendingCount: 3,
  retryScheduledCount: 1,
  submittedCount: 27,
  deadLetterCount: 0,
  overdueCount: 0,
  submittedWithinSlaPercent: 99.4,
  oldestPendingAgeMinutes: 4,
  lastSubmittedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
};

function normalizeBaseUrl(url: string) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function mockActions(state: CustomerSubscriptionState): DashboardData['actions'] {
  if (state === 'canceled') {
    return [{ id: 'resume', label: 'Resume subscription', description: 'Reactivate the subscription and restore access right away.', tone: 'default' }];
  }

  if (state === 'suspended') {
    return [
      { id: 'resume', label: 'Resume subscription', description: 'Restore active access for your team.', tone: 'default' },
      { id: 'cancel', label: 'Cancel subscription', description: 'Close the account at the end of the current period.', tone: 'danger' },
    ];
  }

  return [
    { id: 'suspend', label: 'Pause access', description: 'Temporarily suspend access while keeping your renewal data intact.', tone: 'warning' },
    { id: 'cancel', label: 'Cancel subscription', description: 'End the subscription after the current billing period.', tone: 'danger' },
  ];
}

async function getCustomerSession() {
  const session = await auth();

  if (session?.error === 'RefreshAccessTokenError') {
    throw new ApiError(
      'Access token refresh failed',
      401,
      'AUTH_REFRESH_FAILED',
      'Your sign-in session expired. Sign in again to continue.',
    );
  }

  if (hasOperatorAccess(session?.roles)) {
    throw new ApiError(
      'Customer portal access is unavailable for operator users',
      403,
      'AUTH_FORBIDDEN',
      `Open ${getDefaultPortalRoute(session?.roles)} to manage operator workflows.`,
    );
  }

  return session;
}

async function requireCustomerAccessToken(): Promise<string> {
  const session = await getCustomerSession();

  if (!session?.accessToken) {
    throw new ApiError('Access token is missing from the session', 401, 'AUTH_REQUIRED', 'Sign in to continue.');
  }

  return session.accessToken;
}

async function liveCustomerRequest<T>(
  apiBaseUrl: string,
  path: string,
  accessToken: string,
  init?: Omit<RequestInit, 'headers'>,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  let response: Response;

  try {
    response = await fetch(`${normalizeBaseUrl(apiBaseUrl)}${path}`, {
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
    message?: string;
    code?: string;
    error?: { code?: string; message?: string; details?: Record<string, unknown> };
  } | T | null;

  if (!response.ok) {
    const errorBody = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as {
          message?: string;
          code?: string;
          error?: { code?: string; message?: string; details?: Record<string, unknown> };
        })
      : null;

    throw new ApiError(
      errorBody?.error?.message ?? errorBody?.message ?? 'Request failed',
      response.status,
      errorBody?.error?.code ?? errorBody?.code,
      errorBody?.error?.message ?? errorBody?.message ?? 'Something went wrong while contacting the FastSaaS API.',
      errorBody?.error?.details,
    );
  }

  if (body && typeof body === 'object' && !Array.isArray(body) && 'status' in body) {
    if (body.status === 'success' && body.data !== undefined) {
      return body.data as T;
    }

    throw new ApiError(body.error?.message ?? 'Unexpected API response', 500, body.error?.code);
  }

  return body as T;
}

async function executeAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
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

async function getMockSettings(): Promise<SettingsData> {
  const session = await getCustomerSession();

  return {
    displayName: mockSettingsOverrides.displayName ?? session?.user?.name?.trim() ?? '',
    email: mockSettingsOverrides.email ?? session?.user?.email?.trim() ?? '',
    company: mockSettingsOverrides.company ?? '',
    timezone: mockSettingsOverrides.timezone ?? 'America/Chicago',
    notificationsEnabled: mockSettingsOverrides.notificationsEnabled ?? true,
  };
}

async function getMockDashboard(): Promise<DashboardData> {
  const session = await getCustomerSession();
  const settings = await getMockSettings();
  const plan = mockPlans.find((option) => option.id === mockCurrentPlanId) ?? mockPlans[0];
  const seatsPurchased = plan.seatsPurchased;
  const activeMembers = mockSubscriptionState === 'canceled'
    ? 0
    : Math.max(1, Math.min(seatsPurchased, Math.round(seatsPurchased * 0.7)));

  return {
    user: {
      id: session?.user?.email ?? session?.tenantId ?? 'mock-customer',
      name: settings.displayName,
      email: settings.email,
      company: settings.company,
    },
    subscription: {
      id: 'mock-subscription',
      tenantId: session?.tenantId ?? 'mock-tenant',
      state: mockSubscriptionState,
      planId: plan.id,
      planName: plan.name,
      billingCycle: 'monthly',
      renewalDate: mockSubscriptionState === 'canceled' ? 'Ended' : 'Jul 8, 2026',
      amount: plan.pricingSummary ?? '$0',
    },
    usage: {
      activeMembers,
      seatsPurchased,
      seatLimit: plan.seatLimit,
      apiRequestsThisMonth: mockSubscriptionState === 'canceled' ? 0 : seatsPurchased * 5200,
    },
    actions: mockSubscriptionState === 'trialing' ? [] : mockActions(mockSubscriptionState),
  };
}

async function getMockMeteringDashboard(): Promise<MeteringDashboardSummary> {
  await getCustomerSession();
  return { ...mockMeteringSummary };
}

function unwrapActionBody<T>(body: unknown): T {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'status' in body) {
    const wrapped = body as {
      status?: string;
      data?: T;
      message?: string;
      code?: string;
      error?: { code?: string; message?: string };
    };

    if (wrapped.status === 'success' && wrapped.data !== undefined) {
      return wrapped.data;
    }

    throw new ApiError(
      wrapped.error?.message ?? wrapped.message ?? 'Unexpected API response',
      500,
      wrapped.error?.code ?? wrapped.code,
    );
  }

  return body as T;
}

function getMockPlans(): PlansResponse {
  return {
    currentPlanId: mockSubscriptionState === 'canceled' ? null : mockCurrentPlanId,
    availablePlans: mockPlans.map(({ seatLimit: _seatLimit, seatsPurchased: _seatsPurchased, ...plan }) => plan),
  };
}

export async function getDashboard(): Promise<ActionResult<DashboardData>> {
  return executeAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      return getMockDashboard();
    }

    const token = await requireCustomerAccessToken();

    return liveCustomerRequest<DashboardData>(config.apiBaseUrl, '/portal/dashboard', token);
  });
}

export async function getPlans(): Promise<ActionResult<PlansResponse>> {
  return executeAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      await getCustomerSession();
      return getMockPlans();
    }

    const token = await requireCustomerAccessToken();

    return liveCustomerRequest<PlansResponse>(config.apiBaseUrl, '/portal/plans', token);
  });
}

export async function updatePlan(planId: string): Promise<ActionResult<PlansResponse>> {
  return executeAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      await getCustomerSession();

      if (mockSubscriptionState === 'canceled') {
        throw new ApiError(
          'No active subscription is available to change plans.',
          409,
          'subscription_required',
          'Subscribe in Azure Marketplace before changing plans.',
        );
      }

      const plan = mockPlans.find((option) => option.id === planId);

      if (!plan) {
        throw new ApiError('The plan you selected is no longer available.', 404, 'plan_not_found');
      }

      mockCurrentPlanId = plan.id;
      return getMockPlans();
    }

    const token = await requireCustomerAccessToken();

    return liveCustomerRequest<PlansResponse>(config.apiBaseUrl, '/portal/plans', token, {
      method: 'POST',
      body: JSON.stringify({ planId }),
    });
  });
}

export async function getSettings(): Promise<ActionResult<SettingsData>> {
  return executeAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      return getMockSettings();
    }

    const token = await requireCustomerAccessToken();

    return liveCustomerRequest<SettingsData>(config.apiBaseUrl, '/portal/settings', token);
  });
}

export async function updateSettings(payload: SettingsData): Promise<ActionResult<SettingsData>> {
  return executeAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      await getCustomerSession();

      if (!payload.email?.includes('@')) {
        throw new ApiError('Enter a valid billing email address.', 400, 'invalid_email');
      }

      mockSettingsOverrides = payload;
      return getMockSettings();
    }

    const token = await requireCustomerAccessToken();

    return liveCustomerRequest<SettingsData>(config.apiBaseUrl, '/portal/settings', token, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  });
}

export async function runAction(actionId: string): Promise<ActionResult<DashboardData>> {
  return executeAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      await getCustomerSession();

      if (actionId === 'resume') mockSubscriptionState = 'active';
      else if (actionId === 'suspend') mockSubscriptionState = 'suspended';
      else if (actionId === 'cancel') mockSubscriptionState = 'canceled';
      else throw new ApiError('That subscription action is not supported yet.', 400, 'invalid_action');

      return getMockDashboard();
    }

    const token = await requireCustomerAccessToken();

    return liveCustomerRequest<DashboardData>(config.apiBaseUrl, customerApiPaths.action(actionId), token, {
      method: 'POST',
    });
  });
}

export async function getMeteringDashboard(): Promise<ActionResult<MeteringDashboardSummary>> {
  return executeAction(async () => {
    const config = getServerConfig();

    if (config.isMockMode) {
      return getMockMeteringDashboard();
    }

    const token = await requireCustomerAccessToken();

    return liveCustomerRequest<MeteringDashboardSummary>(config.apiBaseUrl, '/v1/metering/dashboard', token);
  });
}

export async function processRecords(records: object[]): Promise<ActionResult<ProcessRecordsResponse>> {
  const demoFunctionUrl = process.env.DEMO_FUNCTION_URL?.trim();

  if (!demoFunctionUrl) {
    return {
      ok: false,
      status: 503,
      message: 'Data processing function is not configured. Set DEMO_FUNCTION_URL environment variable.',
    };
  }

  return executeAction(async () => {
    const config = getServerConfig();
    const token = await requireCustomerAccessToken();
    const dashboard = config.isMockMode
      ? await getMockDashboard()
      : await liveCustomerRequest<DashboardData>(config.apiBaseUrl, '/portal/dashboard', token);
    const subscription = dashboard.subscription;

    if (!subscription) {
      throw new ApiError(
        'No active subscription is available for this account.',
        409,
        'subscription_required',
        'You need an active subscription before processing data.',
      );
    }

    let response: Response;

    try {
      response = await fetch(demoFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subscriptionId: subscription.id,
          planId: subscription.planId,
          records,
        }),
        cache: 'no-store',
      });
    } catch (error) {
      throw new ApiError(
        error instanceof Error ? error.message : 'Request failed',
        500,
        'FUNCTION_UNAVAILABLE',
        'We could not reach the data processing function. Try again in a moment.',
      );
    }

    const body = (await response.json().catch(() => null)) as
      | {
          status?: string;
          data?: ProcessRecordsResponse;
          message?: string;
          code?: string;
          error?: { code?: string; message?: string };
        }
      | ProcessRecordsResponse
      | null;

    if (!response.ok) {
      const errorBody = body && typeof body === 'object' && !Array.isArray(body)
        ? (body as {
            message?: string;
            code?: string;
            error?: { code?: string; message?: string };
          })
        : null;

      throw new ApiError(
        errorBody?.error?.message ?? errorBody?.message ?? 'Data processing failed.',
        response.status,
        errorBody?.error?.code ?? errorBody?.code,
        errorBody?.error?.message ?? errorBody?.message ?? 'We could not process those records.',
      );
    }

    const result = unwrapActionBody<ProcessRecordsResponse>(body);

    if (config.isMockMode) {
      mockMeteringSummary = {
        ...mockMeteringSummary,
        pendingCount: Math.max(0, mockMeteringSummary.pendingCount - 1),
        submittedCount: mockMeteringSummary.submittedCount + 1,
        lastSubmittedAt: new Date().toISOString(),
      };
    }

    return result;
  });
}
