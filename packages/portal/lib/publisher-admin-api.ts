import { publisherAdminPaths } from '@/lib/api-paths';

export { publisherAdminPaths };

export const publisherAdminContracts = [
  { method: 'GET', path: publisherAdminPaths.dashboard, label: 'Overview metrics' },
  { method: 'GET', path: publisherAdminPaths.plans, label: 'Plan catalog' },
  { method: 'GET', path: publisherAdminPaths.marketplacePlans, label: 'Marketplace plan list' },
  { method: 'PUT', path: '/v1/publisher/plans/:planId', label: 'Plan updates' },
  { method: 'GET', path: publisherAdminPaths.tenants, label: 'Tenant list' },
  { method: 'GET', path: '/v1/publisher/tenants/:tenantId', label: 'Tenant detail' },
  { method: 'POST', path: '/v1/publisher/tenants/:tenantId/:action', label: 'Tenant lifecycle actions' },
] as const;

export { getPublisherIntegrationMode } from '@/lib/server-config';

export function getPublisherApiBaseUrl() {
  return process.env.PUBLISHER_API_BASE_URL ?? process.env.API_BASE_URL ?? '';
}
