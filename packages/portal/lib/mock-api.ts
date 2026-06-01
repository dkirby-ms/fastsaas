import type {
  DashboardData,
  PlansResponse,
  PortalAction,
  PublisherDashboardData,
  PublisherPlan,
  PublisherPlanUpdateInput,
  PublisherPlansResponse,
  PublisherTenantDetail,
  PublisherTenantStatus,
  PublisherTenantUpsertInput,
  PublisherTenantsResponse,
  SettingsData,
} from '@fastsaas/shared';
import { getSession } from 'next-auth/react';
import { ApiError } from '@/lib/errors';
import { hasPublisherAccess } from '@/lib/roles';

interface PublisherMockState {
  plans: PublisherPlan[];
  tenants: PublisherTenantDetail[];
}

interface MockPortalState {
  dashboard: DashboardData;
  plans: PlansResponse;
  settings: SettingsData;
  publisher: PublisherMockState;
}

const storageKey = 'fastsaas.portal.mock-state';

const defaultActions = (state: DashboardData['subscription']['state']): PortalAction[] => {
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
};

function defaultPublisherPlans(): PublisherPlan[] {
  return [
    { id: 'starter', name: 'Starter', description: 'Self-serve onboarding for early marketplace customers.', priceMonthly: '$79', status: 'active', activeSubscriptions: 1, features: ['10 seats included', 'Email support', 'Single environment'] },
    { id: 'growth', name: 'Growth', description: 'Balanced controls for growing portfolio tenants.', priceMonthly: '$249', status: 'active', activeSubscriptions: 2, features: ['25 seats included', 'Priority support', 'Usage analytics'] },
    { id: 'scale', name: 'Scale', description: 'Enterprise controls and publisher-ready governance.', priceMonthly: '$499', status: 'draft', activeSubscriptions: 0, features: ['Unlimited seats', 'Dedicated support', 'Custom exports'] },
  ];
}

function defaultPublisherTenants(): PublisherTenantDetail[] {
  return [
    {
      id: 'tenant-contoso', displayName: 'Contoso Ltd', primaryDomain: 'contoso.example', planId: 'growth', planName: 'Growth', status: 'active', monthlyRecurringRevenue: '$249', seats: 24, subscriptionId: 'sub-contoso', lastUpdated: '2026-05-28T15:00:00.000Z', purchaserTenantId: 'purchaser-contoso', beneficiaryTenantId: 'beneficiary-contoso',
      usage: { activeUsers: 21, apiRequestsThisMonth: 188420, storageGb: 11.8 },
      audit: [
        { id: 'audit-contoso-1', label: 'Subscribed → Active', timestamp: '2026-05-01T10:00:00.000Z' },
        { id: 'audit-contoso-2', label: 'Seat expansion approved', timestamp: '2026-05-20T16:00:00.000Z' },
      ],
    },
    {
      id: 'tenant-fabrikam', displayName: 'Fabrikam Retail', primaryDomain: 'fabrikam.example', planId: 'starter', planName: 'Starter', status: 'trialing', monthlyRecurringRevenue: '$79', seats: 8, subscriptionId: 'sub-fabrikam', lastUpdated: '2026-05-29T12:30:00.000Z', purchaserTenantId: 'purchaser-fabrikam', beneficiaryTenantId: 'beneficiary-fabrikam',
      usage: { activeUsers: 5, apiRequestsThisMonth: 32410, storageGb: 2.4 },
      audit: [{ id: 'audit-fabrikam-1', label: 'Provisioning in progress', timestamp: '2026-05-29T12:30:00.000Z' }],
    },
    {
      id: 'tenant-adatum', displayName: 'Adatum Ventures', primaryDomain: 'adatum.example', planId: 'growth', planName: 'Growth', status: 'suspended', monthlyRecurringRevenue: '$249', seats: 18, subscriptionId: 'sub-adatum', lastUpdated: '2026-05-30T09:45:00.000Z', purchaserTenantId: 'purchaser-adatum', beneficiaryTenantId: 'beneficiary-adatum',
      usage: { activeUsers: 9, apiRequestsThisMonth: 72110, storageGb: 6.1 },
      audit: [
        { id: 'audit-adatum-1', label: 'Billing hold applied', timestamp: '2026-05-30T09:45:00.000Z' },
        { id: 'audit-adatum-2', label: 'Support escalated', timestamp: '2026-05-30T10:00:00.000Z' },
      ],
    },
  ];
}

const defaultState = (): MockPortalState => ({
  dashboard: {
    user: { id: 'cust_001', name: 'Alex Customer', email: 'alex.customer@fastsaas.dev', company: 'Northwind Traders' },
    subscription: { tenantId: 'tenant_northwind', state: 'active', planId: 'growth', planName: 'Growth', billingCycle: 'annual', renewalDate: '2026-07-15', amount: '$249' },
    usage: { activeMembers: 18, seatsPurchased: 25, apiRequestsThisMonth: 184203 },
    actions: defaultActions('active'),
  },
  plans: {
    currentPlanId: 'growth',
    availablePlans: [
      { id: 'starter', name: 'Starter', description: 'Core workflow automation for small teams.', priceMonthly: '$79', features: [{ label: 'Up to 10 team members', included: true }, { label: 'Email support', included: true }, { label: 'Single environment', included: true }] },
      { id: 'growth', name: 'Growth', description: 'Balanced controls for scaling product teams.', priceMonthly: '$249', recommended: true, features: [{ label: 'Up to 25 team members', included: true }, { label: 'Priority support', included: true }, { label: 'Advanced analytics', included: true }] },
      { id: 'scale', name: 'Scale', description: 'Enterprise-ready governance and visibility.', priceMonthly: '$499', features: [{ label: 'Unlimited team members', included: true }, { label: 'Dedicated success manager', included: true }, { label: 'Custom usage exports', included: true }] },
    ],
  },
  settings: { displayName: 'Alex Customer', email: 'alex.customer@fastsaas.dev', company: 'Northwind Traders', timezone: 'America/Chicago', notificationsEnabled: true },
  publisher: { plans: defaultPublisherPlans(), tenants: defaultPublisherTenants() },
});

const isBrowser = () => typeof window !== 'undefined';
const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

function parseMoney(value: string): number {
  const parsed = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

function withPublisherCounts(state: MockPortalState): MockPortalState {
  const counts = state.publisher.tenants.reduce<Record<string, number>>((memo, tenant) => {
    memo[tenant.planId] = (memo[tenant.planId] ?? 0) + 1;
    return memo;
  }, {});

  return {
    ...state,
    publisher: {
      ...state.publisher,
      plans: state.publisher.plans.map((plan) => ({ ...plan, activeSubscriptions: counts[plan.id] ?? 0 })),
    },
  };
}

function hydrateState(saved: string | null): MockPortalState {
  if (!saved) {
    return defaultState();
  }

  try {
    const parsed = JSON.parse(saved) as Partial<MockPortalState>;
    const base = defaultState();

    return withPublisherCounts({
      dashboard: parsed.dashboard ?? base.dashboard,
      plans: parsed.plans ?? base.plans,
      settings: parsed.settings ?? base.settings,
      publisher: {
        plans: parsed.publisher?.plans ?? base.publisher.plans,
        tenants: parsed.publisher?.tenants ?? base.publisher.tenants,
      },
    });
  } catch {
    return defaultState();
  }
}

function readState(): MockPortalState {
  if (!isBrowser()) {
    return defaultState();
  }

  const state = hydrateState(window.localStorage.getItem(storageKey));
  writeState(state);
  return state;
}

function writeState(state: MockPortalState) {
  if (isBrowser()) {
    window.localStorage.setItem(storageKey, JSON.stringify(withPublisherCounts(state)));
  }
}

function getPublisherPlan(state: MockPortalState, planId: string) {
  return state.publisher.plans.find((plan) => plan.id === planId);
}

function buildPublisherDashboard(state: MockPortalState): PublisherDashboardData {
  return {
    subscriptionCount: state.publisher.tenants.length,
    activeTenants: state.publisher.tenants.filter((tenant) => tenant.status === 'active').length,
    monthlyRecurringRevenue: formatMoney(state.publisher.tenants.reduce((total, tenant) => total + parseMoney(tenant.monthlyRecurringRevenue), 0)),
    churnRiskCount: state.publisher.tenants.filter((tenant) => tenant.status === 'past_due' || tenant.status === 'suspended').length,
    plans: state.publisher.plans.map((plan) => ({ planId: plan.id, planName: plan.name, tenantCount: plan.activeSubscriptions })),
  };
}

function appendAudit(detail: PublisherTenantDetail, label: string): PublisherTenantDetail {
  const now = new Date().toISOString();
  return {
    ...detail,
    lastUpdated: now,
    audit: [{ id: `${detail.id}-${Date.now()}`, label, timestamp: now }, ...detail.audit],
  };
}

async function assertPublisherAccess() {
  const session = await getSession();
  if (!hasPublisherAccess(session?.roles)) {
    throw new ApiError('Publisher role is required', 403, 'AUTH_FORBIDDEN', 'Your account does not have access to the publisher portal.');
  }
}

function isTenantAction(path: string, action: string) {
  return path.endsWith(`/${action}`);
}

export async function mockRequest<T>(path: string, init?: RequestInit): Promise<T> {
  await wait();
  const method = init?.method ?? 'GET';
  const state = readState();

  if (path.startsWith('/publisher')) {
    await assertPublisherAccess();
  }

  if (path === '/portal/dashboard' && method === 'GET') {
    return state.dashboard as T;
  }

  if (path === '/portal/plans' && method === 'GET') {
    return state.plans as T;
  }

  if (path === '/portal/plans' && method === 'POST') {
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as { planId?: string };
    const selectedPlan = state.plans.availablePlans.find((plan) => plan.id === body.planId);
    if (!selectedPlan) throw new ApiError('The plan you selected is no longer available.', 404, 'plan_not_found');
    state.plans.currentPlanId = selectedPlan.id;
    state.dashboard.subscription.planId = selectedPlan.id;
    state.dashboard.subscription.planName = selectedPlan.name;
    state.dashboard.subscription.amount = selectedPlan.priceMonthly;
    state.dashboard.subscription.state = 'active';
    state.dashboard.actions = defaultActions('active');
    writeState(state);
    return state.plans as T;
  }

  if (path === '/portal/settings' && method === 'GET') {
    return state.settings as T;
  }

  if (path === '/portal/settings' && method === 'PUT') {
    const payload = JSON.parse((init?.body as string | undefined) ?? '{}') as SettingsData;
    if (!payload.email?.includes('@')) throw new ApiError('Enter a valid billing email address.', 400, 'invalid_email');
    state.settings = payload;
    state.dashboard.user.name = payload.displayName;
    state.dashboard.user.email = payload.email;
    state.dashboard.user.company = payload.company;
    writeState(state);
    return state.settings as T;
  }

  if (path.startsWith('/portal/actions/') && method === 'POST') {
    const actionId = path.split('/').pop();
    if (actionId === 'resume') state.dashboard.subscription.state = 'active';
    else if (actionId === 'suspend') state.dashboard.subscription.state = 'suspended';
    else if (actionId === 'cancel') state.dashboard.subscription.state = 'canceled';
    else throw new ApiError('That subscription action is not supported yet.', 400, 'invalid_action');
    state.dashboard.actions = defaultActions(state.dashboard.subscription.state);
    writeState(state);
    return state.dashboard as T;
  }

  if (path === '/publisher/dashboard' && method === 'GET') {
    return buildPublisherDashboard(state) as T;
  }

  if (path === '/publisher/plans' && method === 'GET') {
    return { plans: state.publisher.plans } as T;
  }

  if (path.startsWith('/publisher/plans/') && method === 'PUT') {
    const planId = path.split('/').pop();
    const payload = JSON.parse((init?.body as string | undefined) ?? '{}') as Partial<PublisherPlanUpdateInput>;
    const planIndex = state.publisher.plans.findIndex((plan) => plan.id === planId);
    if (planIndex === -1 || !planId) throw new ApiError('The selected plan could not be found.', 404, 'publisher_plan_not_found');
    const current = state.publisher.plans[planIndex];
    const nextPlan: PublisherPlan = { ...current, name: payload.name?.trim() || current.name, description: payload.description?.trim() || current.description, priceMonthly: payload.priceMonthly?.trim() || current.priceMonthly, status: payload.status ?? current.status };
    state.publisher.plans[planIndex] = nextPlan;
    state.publisher.tenants = state.publisher.tenants.map((tenant) => tenant.planId === planId ? { ...tenant, planName: nextPlan.name, monthlyRecurringRevenue: nextPlan.priceMonthly } : tenant);
    writeState(state);
    return { plans: state.publisher.plans } as T;
  }

  if (path === '/publisher/tenants' && method === 'GET') {
    return { tenants: state.publisher.tenants.map(({ usage, audit, purchaserTenantId, beneficiaryTenantId, ...tenant }) => tenant) } as T;
  }

  if (path === '/publisher/tenants' && method === 'POST') {
    const payload = JSON.parse((init?.body as string | undefined) ?? '{}') as PublisherTenantUpsertInput;
    const selectedPlan = getPublisherPlan(state, payload.planId);
    if (!selectedPlan) throw new ApiError('Select a valid plan before creating the tenant.', 400, 'publisher_plan_required');
    const now = Date.now();
    const tenant: PublisherTenantDetail = {
      id: `tenant-${payload.primaryDomain.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
      displayName: payload.displayName,
      primaryDomain: payload.primaryDomain,
      planId: payload.planId,
      planName: selectedPlan.name,
      status: payload.status,
      monthlyRecurringRevenue: selectedPlan.priceMonthly,
      seats: payload.seats,
      subscriptionId: `sub-${now}`,
      lastUpdated: new Date(now).toISOString(),
      purchaserTenantId: `purchaser-${now}`,
      beneficiaryTenantId: `beneficiary-${now}`,
      usage: { activeUsers: Math.max(1, Math.round(payload.seats * 0.6)), apiRequestsThisMonth: payload.seats * 5200, storageGb: Number((payload.seats * 0.3).toFixed(1)) },
      audit: [{ id: `audit-${now}`, label: 'Tenant created', timestamp: new Date(now).toISOString() }],
    };
    state.publisher.tenants = [tenant, ...state.publisher.tenants];
    writeState(state);
    return tenant as T;
  }

  if (path.startsWith('/publisher/tenants/') && method === 'GET') {
    const tenantId = path.split('/')[3];
    const tenant = state.publisher.tenants.find((item) => item.id === tenantId || item.subscriptionId === tenantId);
    if (!tenant) throw new ApiError('The selected tenant could not be found.', 404, 'publisher_tenant_not_found');
    return tenant as T;
  }

  if (path.startsWith('/publisher/tenants/') && method === 'PUT') {
    const tenantId = path.split('/')[3];
    const payload = JSON.parse((init?.body as string | undefined) ?? '{}') as PublisherTenantUpsertInput;
    const tenantIndex = state.publisher.tenants.findIndex((item) => item.id === tenantId || item.subscriptionId === tenantId);
    if (tenantIndex === -1) throw new ApiError('The selected tenant could not be found.', 404, 'publisher_tenant_not_found');
    const selectedPlan = getPublisherPlan(state, payload.planId);
    if (!selectedPlan) throw new ApiError('Select a valid plan before saving the tenant.', 400, 'publisher_plan_required');
    const current = state.publisher.tenants[tenantIndex];
    state.publisher.tenants[tenantIndex] = appendAudit({ ...current, displayName: payload.displayName, primaryDomain: payload.primaryDomain, planId: payload.planId, planName: selectedPlan.name, status: payload.status, monthlyRecurringRevenue: selectedPlan.priceMonthly, seats: payload.seats, usage: { ...current.usage, activeUsers: Math.max(1, Math.min(payload.seats, Math.round(payload.seats * 0.7))), storageGb: Number((payload.seats * 0.3).toFixed(1)) } }, 'Tenant updated');
    writeState(state);
    return state.publisher.tenants[tenantIndex] as T;
  }

  if (path.startsWith('/publisher/tenants/') && method === 'POST') {
    const tenantKey = path.split('/')[3];
    const tenantIndex = state.publisher.tenants.findIndex((item) => item.id === tenantKey || item.subscriptionId === tenantKey);
    if (tenantIndex === -1) throw new ApiError('The selected tenant could not be found.', 404, 'publisher_tenant_not_found');
    const current = state.publisher.tenants[tenantIndex];
    let nextStatus: PublisherTenantStatus;
    let auditLabel: string;
    if (isTenantAction(path, 'activate')) {
      nextStatus = 'active';
      auditLabel = 'Subscription activated';
    } else if (isTenantAction(path, 'suspend')) {
      nextStatus = 'suspended';
      auditLabel = 'Subscription suspended';
    } else if (isTenantAction(path, 'cancel')) {
      nextStatus = 'canceled';
      auditLabel = 'Subscription canceled';
    } else {
      throw new ApiError('That publisher action is not supported yet.', 400, 'publisher_action_invalid');
    }
    state.publisher.tenants[tenantIndex] = appendAudit({ ...current, status: nextStatus }, auditLabel);
    writeState(state);
    return state.publisher.tenants[tenantIndex] as T;
  }

  throw new ApiError('We could not complete that request in the portal mock API.', 500, 'unknown_mock_route');
}
