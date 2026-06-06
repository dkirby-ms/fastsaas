import type {
  ApiResponse,
  AuthContextData,
  DashboardData,
  PlansResponse,
  SettingsData,
  Subscription,
} from '@fastsaas/shared';
import { getSession } from 'next-auth/react';
import { ApiError } from '@/lib/errors';
import { mockRequest } from '@/lib/mock-api';
import { customerApiPaths } from '@/lib/api-paths';
import { getDefaultPortalRoute, hasPublisherAccess } from '@/lib/roles';

export { ApiError } from '@/lib/errors';

function shouldUseMockApi() {
  return process.env.USE_MOCK_API?.toLowerCase() !== 'false' || !process.env.API_BASE_URL;
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

async function getPortalSession() {
  const session = await getSession();

  if (session?.error === 'RefreshAccessTokenError') {
    throw new ApiError(
      'Access token refresh failed',
      401,
      'AUTH_REFRESH_FAILED',
      'Your sign-in session expired. Sign in again to continue.',
    );
  }

  return session;
}

async function getAccessToken(): Promise<string> {
  const session = await getPortalSession();

  if (!session?.accessToken) {
    throw new ApiError('Access token is missing from the session', 401, 'AUTH_REQUIRED', 'Sign in to continue.');
  }

  return session.accessToken;
}

async function assertAreaAccess(area: 'customer' | 'publisher') {
  const session = await getPortalSession();
  const isPublisher = hasPublisherAccess(session?.roles);

  if (area === 'publisher' && !isPublisher) {
    throw new ApiError('Publisher role is required', 403, 'AUTH_FORBIDDEN', 'Your account does not have access to the publisher portal.');
  }

  if (area === 'customer' && isPublisher) {
    throw new ApiError(
      'Customer portal access is unavailable for publisher users',
      403,
      'AUTH_FORBIDDEN',
      `Open ${getDefaultPortalRoute(session?.roles)} to manage publisher workflows.`,
    );
  }
}

async function requestJsonWithBase<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${await getAccessToken()}`);

  let response: Response;

  try {
    response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
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
    message?: string;
    code?: string;
    error?: { code?: string; message?: string; details?: Record<string, unknown> };
  } | null;

  if (!response.ok) {
    throw new ApiError(
      body?.error?.message ?? body?.message ?? 'Request failed',
      response.status,
      body?.error?.code ?? body?.code,
      body?.error?.message ?? body?.message ?? 'Something went wrong while contacting the FastSaaS API.',
      body?.error?.details,
    );
  }

  return body as T;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = process.env.API_BASE_URL;

  if (!baseUrl) {
    throw new ApiError(
      'The FastSaaS API base URL is not configured.',
      500,
      'API_BASE_URL_MISSING',
      'Set API_BASE_URL to call the live customer portal API.',
    );
  }

  return requestJsonWithBase<T>(baseUrl, path, init);
}

async function requestApiResponseWithBase<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const body = await requestJsonWithBase<ApiResponse<T>>(baseUrl, path, init);

  if (body.status === 'success' && body.data !== undefined) {
    return body.data;
  }

  throw new ApiError(
    body.error?.message ?? 'Request failed',
    500,
    body.error?.code,
    body.error?.message ?? 'The API returned an unexpected response.',
  );
}

async function requestApiResponse<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = process.env.API_BASE_URL;

  if (!baseUrl) {
    throw new ApiError(
      'The FastSaaS API base URL is not configured.',
      500,
      'API_BASE_URL_MISSING',
      'Set API_BASE_URL to call the live customer portal API.',
    );
  }

  return requestApiResponseWithBase<T>(baseUrl, path, init);
}

async function requestPortal<T>(path: string, init?: RequestInit): Promise<T> {
  if (shouldUseMockApi()) {
    return mockRequest<T>(path, init);
  }

  return requestJson<T>(path, init);
}

export const portalApi = {
  getDashboard: async () => {
    await assertAreaAccess('customer');
    return requestPortal<DashboardData>('/portal/dashboard');
  },
  getPlans: async () => {
    await assertAreaAccess('customer');
    return requestPortal<PlansResponse>('/portal/plans');
  },
  updatePlan: async (planId: string) => {
    await assertAreaAccess('customer');
    return requestPortal<PlansResponse>('/portal/plans', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    });
  },
  getSettings: async () => {
    await assertAreaAccess('customer');
    return requestPortal<SettingsData>('/portal/settings');
  },
  updateSettings: async (payload: SettingsData) => {
    await assertAreaAccess('customer');
    return requestPortal<SettingsData>('/portal/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  runAction: async (actionId: string) => {
    await assertAreaAccess('customer');
    return requestPortal<DashboardData>(customerApiPaths.action(actionId), {
      method: 'POST',
    });
  },
  getAuthContext: async () => {
    if (shouldUseMockApi()) {
      const session = await getPortalSession();
      return {
        tenantId: session?.tenantId ?? 'mock-tenant',
        userId: session?.user?.email ?? 'mock-user',
        scopes: ['api://fastsaas/access_as_user'],
        roles: session?.roles ?? [],
      } satisfies AuthContextData;
    }

    return requestApiResponse<AuthContextData>('/v1/auth/context');
  },
  createMarketplaceSubscription: async (marketplaceToken: string) => {
    await assertAreaAccess('customer');

    if (shouldUseMockApi()) {
      return mockRequest<Subscription>('/v1/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ marketplaceToken }),
      });
    }

    return requestApiResponse<Subscription>('/v1/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ marketplaceToken }),
    });
  },
  getSubscription: async (subscriptionId: string) => {
    await assertAreaAccess('customer');
    const subscriptionPath = customerApiPaths.subscription(subscriptionId);

    if (shouldUseMockApi()) {
      return mockRequest<Subscription>(subscriptionPath);
    }

    return requestApiResponse<Subscription>(subscriptionPath);
  },
  activateSubscription: async (subscriptionId: string) => {
    await assertAreaAccess('customer');
    const subscriptionActivatePath = customerApiPaths.activateSubscription(subscriptionId);

    if (shouldUseMockApi()) {
      return mockRequest<Subscription>(subscriptionActivatePath, {
        method: 'POST',
      });
    }

    return requestApiResponse<Subscription>(subscriptionActivatePath, {
      method: 'POST',
    });
  },
};
