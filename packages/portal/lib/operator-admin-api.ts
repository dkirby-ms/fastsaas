import { operatorAdminPaths } from '@/lib/api-paths';

export { operatorAdminPaths };

export const operatorAdminContracts = [
  { method: 'GET', path: operatorAdminPaths.dashboard, label: 'Overview metrics' },
  { method: 'GET', path: operatorAdminPaths.plans, label: 'Plan catalog' },
  { method: 'GET', path: operatorAdminPaths.marketplacePlans, label: 'Marketplace plan list' },
  { method: 'PUT', path: '/v1/operator/plans/:planId', label: 'Plan updates' },
  { method: 'GET', path: operatorAdminPaths.tenants, label: 'Tenant list' },
  { method: 'GET', path: '/v1/operator/tenants/:tenantId', label: 'Tenant detail' },
  { method: 'POST', path: '/v1/operator/tenants/:tenantId/:action', label: 'Tenant lifecycle actions' },
] as const;

export { getPublisherIntegrationMode as getOperatorIntegrationMode } from '@/lib/server-config';

export function getOperatorApiBaseUrl() {
  return process.env.PUBLISHER_API_BASE_URL ?? process.env.API_BASE_URL ?? '';
}
