import type { DashboardData, PlansResponse, SettingsData } from '@fastsaas/shared';
import { getSession } from 'next-auth/react';
import { ApiError } from '@/lib/errors';
import { mockRequest } from '@/lib/mock-api';

export { ApiError } from '@/lib/errors';

function shouldUseMockApi() {
  return process.env.NEXT_PUBLIC_USE_MOCK_API !== 'false' || !process.env.NEXT_PUBLIC_API_BASE_URL;
}

async function getAccessToken(): Promise<string> {
  const session = await getSession();

  if (session?.error === 'RefreshAccessTokenError') {
    throw new ApiError(
      'Access token refresh failed',
      401,
      'AUTH_REFRESH_FAILED',
      'Your sign-in session expired. Sign in again to continue.',
    );
  }

  if (!session?.accessToken) {
    throw new ApiError('Access token is missing from the session', 401, 'AUTH_REQUIRED', 'Sign in to continue.');
  }

  return session.accessToken;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (shouldUseMockApi()) {
    return mockRequest<T>(path, init);
  }

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

  const body = (await response.json().catch(() => null)) as { message?: string; code?: string } | null;

  if (!response.ok) {
    throw new ApiError(
      body?.message ?? 'Request failed',
      response.status,
      body?.code,
      body?.message ?? 'Something went wrong while contacting the FastSaaS API.',
    );
  }

  return body as T;
}

export const portalApi = {
  getDashboard: () => request<DashboardData>('/portal/dashboard'),
  getPlans: () => request<PlansResponse>('/portal/plans'),
  updatePlan: (planId: string) =>
    request<PlansResponse>('/portal/plans', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    }),
  getSettings: () => request<SettingsData>('/portal/settings'),
  updateSettings: (payload: SettingsData) =>
    request<SettingsData>('/portal/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  runAction: (actionId: string) =>
    request<DashboardData>(`/portal/actions/${actionId}`, {
      method: 'POST',
    }),
};
