import type { DashboardData, PlansResponse, SettingsData } from '@fastsaas/shared';
import { ApiError } from '@/lib/errors';
import { mockRequest } from '@/lib/mock-api';

export { ApiError } from '@/lib/errors';

function shouldUseMockApi() {
  return process.env.NEXT_PUBLIC_USE_MOCK_API !== 'false' || !process.env.NEXT_PUBLIC_API_BASE_URL;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (shouldUseMockApi()) {
    return mockRequest<T>(path, init);
  }

  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

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
