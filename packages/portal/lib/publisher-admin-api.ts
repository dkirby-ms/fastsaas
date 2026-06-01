export const publisherAdminPaths = {
  dashboard: '/v1/publisher/dashboard',
  plans: '/v1/publisher/plans',
  plan: (planId: string) => `/v1/publisher/plans/${planId}`,
  tenants: '/v1/publisher/tenants',
  tenant: (tenantId: string) => `/v1/publisher/tenants/${tenantId}`,
  tenantAction: (tenantId: string, action: 'activate' | 'suspend' | 'cancel') => `/v1/publisher/tenants/${tenantId}/${action}`,
} as const;

export const publisherAdminContracts = [
  { method: 'GET', path: publisherAdminPaths.dashboard, label: 'Overview metrics' },
  { method: 'GET', path: publisherAdminPaths.plans, label: 'Plan catalog' },
  { method: 'PUT', path: '/v1/publisher/plans/:planId', label: 'Plan updates' },
  { method: 'GET', path: publisherAdminPaths.tenants, label: 'Tenant list' },
  { method: 'GET', path: '/v1/publisher/tenants/:tenantId', label: 'Tenant detail' },
  { method: 'POST', path: '/v1/publisher/tenants/:tenantId/:action', label: 'Tenant lifecycle actions' },
] as const;

export function getPublisherApiBaseUrl() {
  return process.env.PUBLISHER_API_BASE_URL ?? process.env.API_BASE_URL ?? '';
}

export function isPublisherAdminApiEnabled() {
  return process.env.ENABLE_PUBLISHER_ADMIN_API === 'true' && getPublisherApiBaseUrl().length > 0;
}

export function getPublisherIntegrationMode(): 'mock' | 'live' {
  if (process.env.USE_MOCK_API !== 'false') {
    return 'mock';
  }

  return isPublisherAdminApiEnabled() ? 'live' : 'mock';
}
