import type {
  ApiResponse,
  AuthContextData,
  DashboardData,
  PlansResponse,
  PublisherDashboardData,
  PublisherPlanUpdateInput,
  PublisherPlansResponse,
  PublisherTenantDetail,
  PublisherTenantUpsertInput,
  PublisherTenantsResponse,
  SettingsData,
  Subscription,
} from '@fastsaas/shared';
import { getSession } from 'next-auth/react';
import { buildPublisherDashboard, buildPublisherPlans, buildPublisherTenantDetail, buildPublisherTenants } from '@/lib/publisher-mappers';
import { ApiError } from '@/lib/errors';
import { mockRequest } from '@/lib/mock-api';
import { getDefaultPortalRoute, hasPublisherAccess } from '@/lib/roles';

export { ApiError } from '@/lib/errors';

function shouldUseMockApi() {
  return process.env.NEXT_PUBLIC_USE_MOCK_API !== 'false' || !process.env.NEXT_PUBLIC_API_BASE_URL;
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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${await getAccessToken()}`);

  let response: Response;

  try {
    response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}${path}`, {
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
    error?: { code?: string; message?: string };
  } | null;

  if (!response.ok) {
    throw new ApiError(
      body?.error?.message ?? body?.message ?? 'Request failed',
      response.status,
      body?.error?.code ?? body?.code,
      body?.error?.message ?? body?.message ?? 'Something went wrong while contacting the FastSaaS API.',
    );
  }

  return body as T;
}

async function requestApiResponse<T>(path: string, init?: RequestInit): Promise<T> {
  const body = await requestJson<ApiResponse<T>>(path, init);

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

async function requestPortal<T>(path: string, init?: RequestInit): Promise<T> {
  if (shouldUseMockApi()) {
    return mockRequest<T>(path, init);
  }

  return requestJson<T>(path, init);
}

function mutationUnavailable(message: string): never {
  throw new ApiError(message, 501, 'PUBLISHER_API_PENDING', message);
}

async function getLiveSubscriptions() {
  await assertAreaAccess('publisher');
  return requestApiResponse<Subscription[]>('/v1/subscriptions');
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
    return requestPortal<DashboardData>(`/portal/actions/${actionId}`, {
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
  getPublisherDashboard: async () => {
    if (shouldUseMockApi()) {
      return mockRequest<PublisherDashboardData>('/publisher/dashboard');
    }

    return buildPublisherDashboard(await getLiveSubscriptions());
  },
  getPublisherPlans: async () => {
    if (shouldUseMockApi()) {
      return mockRequest<PublisherPlansResponse>('/publisher/plans');
    }

    return buildPublisherPlans(await getLiveSubscriptions());
  },
  updatePublisherPlan: async (planId: string, payload: PublisherPlanUpdateInput) => {
    await assertAreaAccess('publisher');

    if (shouldUseMockApi()) {
      return mockRequest<PublisherPlansResponse>(`/publisher/plans/${planId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    }

    mutationUnavailable('Publisher plan editing is scaffolded in the portal, but a dedicated API route is still required.');
  },
  getPublisherTenants: async () => {
    if (shouldUseMockApi()) {
      return mockRequest<PublisherTenantsResponse>('/publisher/tenants');
    }

    return buildPublisherTenants(await getLiveSubscriptions());
  },
  getPublisherTenant: async (tenantId: string) => {
    if (shouldUseMockApi()) {
      return mockRequest<PublisherTenantDetail>(`/publisher/tenants/${tenantId}`);
    }

    await assertAreaAccess('publisher');
    return buildPublisherTenantDetail(await requestApiResponse<Subscription>(`/v1/subscriptions/${tenantId}`));
  },
  createPublisherTenant: async (payload: PublisherTenantUpsertInput) => {
    await assertAreaAccess('publisher');

    if (shouldUseMockApi()) {
      return mockRequest<PublisherTenantDetail>('/publisher/tenants', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }

    mutationUnavailable('Publisher tenant creation is scaffolded in the portal, but a dedicated API route is still required.');
  },
  updatePublisherTenant: async (tenantId: string, payload: PublisherTenantUpsertInput) => {
    await assertAreaAccess('publisher');

    if (shouldUseMockApi()) {
      return mockRequest<PublisherTenantDetail>(`/publisher/tenants/${tenantId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    }

    mutationUnavailable('Publisher tenant editing is scaffolded in the portal, but a dedicated API route is still required.');
  },
  activatePublisherTenant: async (subscriptionId: string) => {
    await assertAreaAccess('publisher');

    if (shouldUseMockApi()) {
      return mockRequest<PublisherTenantDetail>(`/publisher/tenants/${subscriptionId}/activate`, {
        method: 'POST',
      });
    }

    await requestApiResponse<Subscription>(`/v1/subscriptions/${subscriptionId}/activate`, {
      method: 'POST',
    });

    return buildPublisherTenantDetail(await requestApiResponse<Subscription>(`/v1/subscriptions/${subscriptionId}`));
  },
  suspendPublisherTenant: async (subscriptionId: string) => {
    await assertAreaAccess('publisher');

    if (shouldUseMockApi()) {
      return mockRequest<PublisherTenantDetail>(`/publisher/tenants/${subscriptionId}/suspend`, {
        method: 'POST',
      });
    }

    await requestApiResponse<Subscription>(`/v1/subscriptions/${subscriptionId}/suspend`, {
      method: 'POST',
    });

    return buildPublisherTenantDetail(await requestApiResponse<Subscription>(`/v1/subscriptions/${subscriptionId}`));
  },
  cancelPublisherTenant: async (subscriptionId: string) => {
    await assertAreaAccess('publisher');

    if (shouldUseMockApi()) {
      return mockRequest<PublisherTenantDetail>(`/publisher/tenants/${subscriptionId}/cancel`, {
        method: 'POST',
      });
    }

    await requestApiResponse<Subscription>(`/v1/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
    });

    return buildPublisherTenantDetail(await requestApiResponse<Subscription>(`/v1/subscriptions/${subscriptionId}`));
  },
};
