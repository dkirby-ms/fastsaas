import type {
  CreatePublisherPlanInput,
  DashboardData,
  MarketplacePlanSummary,
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
  Subscription,
} from '@fastsaas/shared';
import { getSession } from 'next-auth/react';
import { ApiError } from '@/lib/errors';
import type { PlanPricing } from '@fastsaas/shared';
import { hasPublisherAccess } from '@/lib/roles';
import { writeMockSubscriptionGateCookie } from '@/lib/subscription-gate-cookie';

interface PublisherMockState {
  plans: PublisherPlan[];
  tenants: PublisherTenantDetail[];
}

interface MockPortalState {
  dashboard: DashboardData;
  plans: PlansResponse;
  settings: SettingsData;
  subscriptions: Subscription[];
  publisher: PublisherMockState;
}

const storageKey = 'fastsaas.portal.mock-state';
const legacyPlaceholderNames = new Set(['Alex Customer']);
const legacyPlaceholderEmails = new Set(['alex.customer@fastsaas.dev']);
const legacyPlaceholderCompanies = new Set(['Northwind Traders']);
const legacyPlaceholderUserIds = new Set(['cust_001']);

const defaultActions = (state: NonNullable<DashboardData['subscription']>['state']): PortalAction[] => {
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
    { id: 'starter', name: 'Starter', description: 'Self-serve onboarding for early marketplace customers.', pricingSummary: null, status: 'active', activeSubscriptions: 1, features: ['10 seats included', 'Email support', 'Single environment'], marketplacePlanId: 'starter', seatLimit: 10 },
    { id: 'growth', name: 'Growth', description: 'Balanced controls for growing portfolio tenants.', pricingSummary: null, status: 'active', activeSubscriptions: 2, features: ['25 seats included', 'Priority support', 'Usage analytics'], marketplacePlanId: 'growth', seatLimit: 25 },
    { id: 'scale', name: 'Scale', description: 'Enterprise controls and publisher-ready governance.', pricingSummary: null, status: 'draft', activeSubscriptions: 0, features: ['Unlimited seats', 'Dedicated support', 'Custom exports'], marketplacePlanId: null, seatLimit: null },
  ];
}

function defaultPublisherTenants(): PublisherTenantDetail[] {
  return [
    {
      id: 'tenant-contoso', displayName: 'Contoso Ltd', primaryDomain: 'contoso.example', planId: 'growth', planName: 'Growth', status: 'active', monthlyRecurringRevenue: null, seats: 24, subscriptionId: 'sub-contoso', lastUpdated: '2026-05-28T15:00:00.000Z', purchaserTenantId: 'purchaser-contoso', beneficiaryTenantId: 'beneficiary-contoso',
      usage: { activeUsers: 21, apiRequestsThisMonth: 188420, storageGb: 11.8 },
      audit: [
        { id: 'audit-contoso-1', label: 'Subscribed → Active', timestamp: '2026-05-01T10:00:00.000Z' },
        { id: 'audit-contoso-2', label: 'Seat expansion approved', timestamp: '2026-05-20T16:00:00.000Z' },
      ],
    },
    {
      id: 'tenant-fabrikam', displayName: 'Fabrikam Retail', primaryDomain: 'fabrikam.example', planId: 'starter', planName: 'Starter', status: 'trialing', monthlyRecurringRevenue: null, seats: 8, subscriptionId: 'sub-fabrikam', lastUpdated: '2026-05-29T12:30:00.000Z', purchaserTenantId: 'purchaser-fabrikam', beneficiaryTenantId: 'beneficiary-fabrikam',
      usage: { activeUsers: 5, apiRequestsThisMonth: 32410, storageGb: 2.4 },
      audit: [{ id: 'audit-fabrikam-1', label: 'Provisioning in progress', timestamp: '2026-05-29T12:30:00.000Z' }],
    },
    {
      id: 'tenant-adatum', displayName: 'Adatum Ventures', primaryDomain: 'adatum.example', planId: 'growth', planName: 'Growth', status: 'suspended', monthlyRecurringRevenue: null, seats: 18, subscriptionId: 'sub-adatum', lastUpdated: '2026-05-30T09:45:00.000Z', purchaserTenantId: 'purchaser-adatum', beneficiaryTenantId: 'beneficiary-adatum',
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
    user: { id: 'customer-user', name: '', email: '', company: '' },
    subscription: null,
    usage: null,
    actions: [],
  },
  plans: defaultCustomerPlans(),
  settings: defaultCustomerSettings(),
  subscriptions: [],
  publisher: { plans: defaultPublisherPlans(), tenants: defaultPublisherTenants() },
});

const isBrowser = () => typeof window !== 'undefined';
const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

function decodePathSegment(value: string | undefined) {
  return value ? decodeURIComponent(value) : value;
}


type PortalSession = Awaited<ReturnType<typeof getSession>>;

const DEFAULT_SEAT_COUNT = 10;

function defaultCustomerPlans(): PlansResponse {
  return {
    currentPlanId: null,
    availablePlans: [
      { id: 'starter', name: 'Starter', description: 'Core workflow automation for small teams.', priceMonthly: '$79', features: [{ label: 'Up to 10 team members', included: true }, { label: 'Email support', included: true }, { label: 'Single environment', included: true }] },
      { id: 'growth', name: 'Growth', description: 'Balanced controls for scaling product teams.', priceMonthly: '$249', recommended: true, features: [{ label: 'Up to 25 team members', included: true }, { label: 'Priority support', included: true }, { label: 'Advanced analytics', included: true }] },
      { id: 'scale', name: 'Scale', description: 'Enterprise-ready governance and visibility.', priceMonthly: '$499', features: [{ label: 'Unlimited team members', included: true }, { label: 'Dedicated success manager', included: true }, { label: 'Custom usage exports', included: true }] },
    ],
  };
}

function defaultCustomerSettings(): SettingsData {
  return {
    displayName: '',
    email: '',
    company: '',
    timezone: 'America/Chicago',
    notificationsEnabled: true,
  };
}

function isLegacyPlaceholder(value: string, placeholders: Set<string>) {
  return placeholders.has(value.trim());
}

function clearLegacyCustomerProfile(state: MockPortalState): MockPortalState {
  const shouldClearName = isLegacyPlaceholder(state.dashboard.user.name, legacyPlaceholderNames)
    || isLegacyPlaceholder(state.settings.displayName, legacyPlaceholderNames);
  const shouldClearEmail = isLegacyPlaceholder(state.dashboard.user.email, legacyPlaceholderEmails)
    || isLegacyPlaceholder(state.settings.email, legacyPlaceholderEmails);
  const shouldClearCompany = isLegacyPlaceholder(state.dashboard.user.company, legacyPlaceholderCompanies)
    || isLegacyPlaceholder(state.settings.company, legacyPlaceholderCompanies);
  const shouldClearUserId = shouldClearEmail && legacyPlaceholderUserIds.has(state.dashboard.user.id);

  if (!shouldClearName && !shouldClearEmail && !shouldClearCompany && !shouldClearUserId) {
    return state;
  }

  return {
    ...state,
    dashboard: {
      ...state.dashboard,
      user: {
        ...state.dashboard.user,
        id: shouldClearUserId ? '' : state.dashboard.user.id,
        name: shouldClearName ? '' : state.dashboard.user.name,
        email: shouldClearEmail ? '' : state.dashboard.user.email,
        company: shouldClearCompany ? '' : state.dashboard.user.company,
      },
    },
    settings: {
      ...state.settings,
      displayName: shouldClearName ? '' : state.settings.displayName,
      email: shouldClearEmail ? '' : state.settings.email,
      company: shouldClearCompany ? '' : state.settings.company,
    },
  };
}

function syncCustomerProfile(state: MockPortalState, session: PortalSession): MockPortalState {
  const sanitizedState = clearLegacyCustomerProfile(state);
  const sessionName = session?.user?.name?.trim() ?? '';
  const sessionEmail = session?.user?.email?.trim() ?? '';
  const hasSubscriptionProfile = getCurrentCustomerSubscription(sanitizedState) !== null;
  const displayName = hasSubscriptionProfile
    ? sessionName || sanitizedState.settings.displayName || sanitizedState.dashboard.user.name
    : sessionName;
  const email = hasSubscriptionProfile
    ? sessionEmail || sanitizedState.settings.email || sanitizedState.dashboard.user.email
    : sessionEmail;
  const company = hasSubscriptionProfile
    ? sanitizedState.settings.company || sanitizedState.dashboard.user.company
    : '';

  return {
    ...sanitizedState,
    dashboard: {
      ...sanitizedState.dashboard,
      user: {
        id: email || session?.tenantId || sanitizedState.dashboard.user.id || 'customer-user',
        name: displayName,
        email,
        company,
      },
    },
    settings: {
      ...sanitizedState.settings,
      displayName,
      email,
      company,
    },
  };
}

function getCurrentCustomerSubscription(state: MockPortalState): Subscription | null {
  return [...state.subscriptions].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] ?? null;
}

function mapCustomerSubscriptionState(status: Subscription['status']): NonNullable<DashboardData['subscription']>['state'] {
  switch (status) {
    case 'PendingActivation':
      return 'trialing';
    case 'Suspended':
      return 'suspended';
    case 'Unsubscribed':
      return 'canceled';
    default:
      return 'active';
  }
}

function formatRenewalDate(subscription: Subscription, dashboardState: NonNullable<DashboardData['subscription']>['state']) {
  if (dashboardState === 'canceled') {
    return 'Ended';
  }

  const renewal = new Date(subscription.updatedAt || subscription.createdAt);
  renewal.setUTCMonth(renewal.getUTCMonth() + 1);

  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(renewal);
}

function buildCustomerDashboard(state: MockPortalState): DashboardData {
  const currentSubscription = getCurrentCustomerSubscription(state);

  if (!currentSubscription) {
    return {
      user: state.dashboard.user,
      subscription: null,
      usage: null,
      actions: [],
    };
  }

  const plan = state.plans.availablePlans.find((option) => option.id === currentSubscription.planId);
  const dashboardState = mapCustomerSubscriptionState(currentSubscription.status);
  const seatsPurchased = currentSubscription.seats;

  return {
    user: state.dashboard.user,
    subscription: {
      tenantId: currentSubscription.tenantId,
      state: dashboardState,
      planId: currentSubscription.planId,
      planName:
        typeof currentSubscription.metadata.planName === 'string'
          ? currentSubscription.metadata.planName
          : plan?.name ?? currentSubscription.planId,
      billingCycle:
        currentSubscription.metadata.billingCycle === 'annual'
          ? 'annual'
          : 'monthly',
      renewalDate: formatRenewalDate(currentSubscription, dashboardState),
      amount: plan?.priceMonthly ?? '$0',
    },
    usage: {
      activeMembers: dashboardState === 'canceled' ? 0 : Math.max(1, Math.min(seatsPurchased, Math.round(seatsPurchased * 0.7))),
      seatsPurchased,
      seatLimit: seatsPurchased,
      apiRequestsThisMonth: dashboardState === 'canceled' ? 0 : seatsPurchased * 5200,
    },
    actions: dashboardState === 'trialing' ? [] : defaultActions(dashboardState),
  };
}

function buildCustomerPlans(state: MockPortalState): PlansResponse {
  const currentSubscription = getCurrentCustomerSubscription(state);

  return {
    ...state.plans,
    currentPlanId: currentSubscription && currentSubscription.status !== 'Unsubscribed' ? currentSubscription.planId : null,
  };
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

    return clearLegacyCustomerProfile(withPublisherCounts({
      dashboard: parsed.dashboard ?? base.dashboard,
      plans: parsed.plans ?? base.plans,
      settings: parsed.settings ?? base.settings,
      subscriptions: parsed.subscriptions ?? base.subscriptions,
      publisher: {
        plans: parsed.publisher?.plans ?? base.publisher.plans,
        tenants: parsed.publisher?.tenants ?? base.publisher.tenants,
      },
    }));
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
    const nextState = withPublisherCounts(state);
    window.localStorage.setItem(storageKey, JSON.stringify(nextState));
    writeMockSubscriptionGateCookie(getCurrentCustomerSubscription(nextState));
  }
}

function getPublisherPlan(state: MockPortalState, planId: string) {
  return state.publisher.plans.find((plan) => plan.id === planId);
}

function normalizeMarketplacePlanId(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeSeatLimit(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(1, Math.trunc(value));
}

function createPublisherPlanId(state: MockPortalState, requestedId: string | undefined, name: string) {
  const baseId = (requestedId?.trim() || name.trim())
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `plan-${Date.now()}`;
  let candidate = baseId;
  let suffix = 2;

  while (state.publisher.plans.some((plan) => plan.id === candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function toMarketplacePricingSummary(pricing: PlanPricing | undefined): Record<string, unknown> | null {
  return pricing ? JSON.parse(JSON.stringify(pricing)) as Record<string, unknown> : null;
}

function listMarketplacePlans(state: MockPortalState): MarketplacePlanSummary[] {
  const defaultProductId = 'default-product';
  return state.publisher.plans.map((plan) => ({
    id: plan.id,
    externalPlanId: plan.id,
    durablePlanId: `durable-${plan.id}`,
    productId: defaultProductId,
    status: plan.status,
    pricingSummary: null,
  }));
}

function buildPublisherDashboard(state: MockPortalState): PublisherDashboardData {
  return {
    subscriptionCount: state.publisher.tenants.length,
    activeTenants: state.publisher.tenants.filter((tenant) => tenant.status === 'active').length,
    monthlyRecurringRevenue: null,
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

function resolveMockPlanId(marketplaceToken: string, state: MockPortalState): string {
  const normalizedToken = marketplaceToken.toLowerCase();

  if (normalizedToken.includes('starter')) {
    return 'starter';
  }

  if (normalizedToken.includes('scale')) {
    return 'scale';
  }

  return state.plans.availablePlans.find((plan) => plan.recommended)?.id ?? state.plans.availablePlans[0]?.id ?? 'starter';
}

function buildMockSubscription(state: MockPortalState, marketplaceToken: string, session: PortalSession): Subscription {
  if (marketplaceToken.toLowerCase().includes('invalid')) {
    throw new ApiError('The Marketplace token is invalid or expired.', 400, 'MARKETPLACE_TOKEN_INVALID');
  }

  const existingSubscription = state.subscriptions.find(
    (subscription) => subscription.metadata.marketplaceToken === marketplaceToken,
  );

  if (existingSubscription) {
    throw new ApiError(
      'A subscription already exists for the marketplace purchase',
      409,
      'CONFLICT',
      'This Marketplace purchase was already resolved. Continue with the existing subscription.',
      { subscriptionId: existingSubscription.id },
    );
  }

  const now = new Date().toISOString();
  const uniqueId = Date.now().toString(36);
  const planId = resolveMockPlanId(marketplaceToken, state);
  const selectedPlan = state.plans.availablePlans.find((plan) => plan.id === planId);
  const seats = marketplaceToken.includes('10') ? 10 : marketplaceToken.includes('50') ? 50 : getCurrentCustomerSubscription(state)?.seats ?? DEFAULT_SEAT_COUNT;
  const tenantId = session?.tenantId ?? 'mock-tenant';

  return {
    id: `sub-${uniqueId}`,
    tenantId,
    marketplaceSubscriptionId: `mp-${uniqueId}`,
    planId,
    seats,
    status: 'PendingActivation',
    offerId: `offer-${planId}`,
    purchaserTenantId: `purchaser-${uniqueId}`,
    beneficiaryTenantId: tenantId,
    correlationId: `mock-correlation-${uniqueId}`,
    metadata: {
      marketplaceToken,
      planName: selectedPlan?.name ?? planId,
      company: state.settings.company,
      billingCycle: 'monthly',
    },
    createdAt: now,
    updatedAt: now,
    auditLog: [
      {
        id: `audit-${uniqueId}`,
        subscriptionId: `sub-${uniqueId}`,
        eventType: 'Subscribe',
        source: 'mock',
        fromStatus: null,
        toStatus: 'PendingActivation',
        correlationId: `mock-correlation-${uniqueId}`,
        requestId: `mock-request-${uniqueId}`,
        details: { marketplaceToken, planId, seats },
        createdAt: now,
      },
    ],
  };
}

export async function mockRequest<T>(path: string, init?: RequestInit): Promise<T> {
  await wait();
  const method = init?.method ?? 'GET';
  const session = await getSession();
  const state = syncCustomerProfile(readState(), session);
  writeState(state);

  if (path.startsWith('/publisher')) {
    await assertPublisherAccess();
  }

  if (path === '/portal/dashboard' && method === 'GET') {
    return buildCustomerDashboard(state) as T;
  }

  if (path === '/portal/plans' && method === 'GET') {
    return buildCustomerPlans(state) as T;
  }

  if (path === '/portal/plans' && method === 'POST') {
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as { planId?: string };
    const selectedPlan = state.plans.availablePlans.find((plan) => plan.id === body.planId);
    const currentSubscription = getCurrentCustomerSubscription(state);

    if (!selectedPlan) throw new ApiError('The plan you selected is no longer available.', 404, 'plan_not_found');
    if (!currentSubscription || currentSubscription.status === 'Unsubscribed') {
      throw new ApiError('No active subscription is available to change plans.', 409, 'subscription_required', 'Subscribe in Azure Marketplace before changing plans.');
    }

    const subscriptionIndex = state.subscriptions.findIndex((entry) => entry.id === currentSubscription.id);
    if (subscriptionIndex == -1) {
      throw new ApiError('The requested subscription could not be found.', 404, 'NOT_FOUND');
    }

    state.plans.currentPlanId = selectedPlan.id;
    state.subscriptions[subscriptionIndex] = {
      ...currentSubscription,
      planId: selectedPlan.id,
      offerId: `offer-${selectedPlan.id}`,
      updatedAt: new Date().toISOString(),
      metadata: {
        ...currentSubscription.metadata,
        planName: selectedPlan.name,
      },
    };
    writeState(state);
    return buildCustomerPlans(state) as T;
  }

  if (path === '/portal/settings' && method === 'GET') {
    return state.settings as T;
  }

  if (path === '/portal/settings' && method === 'PUT') {
    const payload = JSON.parse((init?.body as string | undefined) ?? '{}') as SettingsData;
    const hasSubscriptionProfile = getCurrentCustomerSubscription(state) !== null;
    const nextSettings: SettingsData = hasSubscriptionProfile
      ? payload
      : {
          ...payload,
          displayName: state.settings.displayName,
          email: state.settings.email,
          company: state.settings.company,
        };

    if (hasSubscriptionProfile && !nextSettings.email?.includes('@')) {
      throw new ApiError('Enter a valid billing email address.', 400, 'invalid_email');
    }

    state.settings = nextSettings;
    state.dashboard.user.name = nextSettings.displayName;
    state.dashboard.user.email = nextSettings.email;
    state.dashboard.user.company = nextSettings.company;
    writeState(state);
    return state.settings as T;
  }

  if (path.startsWith('/portal/actions/') && method === 'POST') {
    const actionId = decodePathSegment(path.split('/').pop());
    const currentSubscription = getCurrentCustomerSubscription(state);

    if (!currentSubscription) {
      throw new ApiError('No subscription is available for lifecycle actions.', 409, 'subscription_required', 'Subscribe in Azure Marketplace before managing lifecycle actions.');
    }

    const subscriptionIndex = state.subscriptions.findIndex((entry) => entry.id === currentSubscription.id);
    if (subscriptionIndex == -1) {
      throw new ApiError('The requested subscription could not be found.', 404, 'NOT_FOUND');
    }

    if (actionId === 'resume') state.subscriptions[subscriptionIndex] = { ...currentSubscription, status: 'Active', updatedAt: new Date().toISOString() };
    else if (actionId === 'suspend') state.subscriptions[subscriptionIndex] = { ...currentSubscription, status: 'Suspended', updatedAt: new Date().toISOString() };
    else if (actionId === 'cancel') state.subscriptions[subscriptionIndex] = { ...currentSubscription, status: 'Unsubscribed', updatedAt: new Date().toISOString() };
    else throw new ApiError('That subscription action is not supported yet.', 400, 'invalid_action');

    writeState(state);
    return buildCustomerDashboard(state) as T;
  }

  if (path === '/v1/subscriptions' && method === 'POST') {
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as { marketplaceToken?: string };

    if (!body.marketplaceToken?.trim()) {
      throw new ApiError('marketplaceToken is required', 400, 'BAD_REQUEST', 'The Marketplace redirect is missing its token.');
    }

    const subscription = buildMockSubscription(state, body.marketplaceToken.trim(), session);
    state.subscriptions = [subscription, ...state.subscriptions];
    writeState(state);
    return subscription as T;
  }

  if (path.startsWith('/v1/subscriptions/') && method === 'GET') {
    const subscriptionId = decodePathSegment(path.split('/')[3]);
    const subscription = state.subscriptions.find((entry) => entry.id === subscriptionId);

    if (!subscription) {
      throw new ApiError('The requested subscription could not be found.', 404, 'NOT_FOUND');
    }

    return subscription as T;
  }

  if (path.startsWith('/v1/subscriptions/') && method === 'POST' && isTenantAction(path, 'activate')) {
    const subscriptionId = decodePathSegment(path.split('/')[3]);
    const subscriptionIndex = state.subscriptions.findIndex((entry) => entry.id === subscriptionId);

    if (subscriptionIndex === -1) {
      throw new ApiError('The requested subscription could not be found.', 404, 'NOT_FOUND');
    }

    const current = state.subscriptions[subscriptionIndex];
    if (current.status === 'Active') {
      throw new ApiError('Subscription is already active.', 409, 'CONFLICT', 'This subscription has already been activated.');
    }

    if (current.status !== 'PendingActivation') {
      throw new ApiError('Subscription cannot be activated from its current status.', 409, 'CONFLICT');
    }

    const now = new Date().toISOString();
    const next = {
      ...current,
      status: 'Active' as const,
      updatedAt: now,
      auditLog: [
        {
          id: `audit-${Date.now().toString(36)}`,
          subscriptionId: current.id,
          eventType: 'Activate',
          source: 'mock',
          fromStatus: current.status,
          toStatus: 'Active' as const,
          correlationId: current.correlationId,
          requestId: `mock-request-${Date.now().toString(36)}`,
          details: {},
          createdAt: now,
        },
        ...current.auditLog,
      ],
    };

    state.subscriptions[subscriptionIndex] = next;
    state.plans.currentPlanId = next.planId;
    writeState(state);
    return next as T;
  }

  if (path === '/publisher/dashboard' && method === 'GET') {
    return buildPublisherDashboard(state) as T;
  }

  if (path === '/publisher/plans' && method === 'GET') {
    return { plans: state.publisher.plans } as T;
  }

  if (path === '/publisher/marketplace-plans' && method === 'GET') {
    return listMarketplacePlans(state) as T;
  }

  if (path === '/publisher/plans' && method === 'POST') {
    const payload = JSON.parse((init?.body as string | undefined) ?? '{}') as CreatePublisherPlanInput;
    const name = payload.name?.trim();
    const description = payload.description?.trim();
    if (!name || !description) {
      throw new ApiError('Name and description are required.', 400, 'publisher_plan_invalid');
    }
    const plan: PublisherPlan = {
      id: createPublisherPlanId(state, payload.id, name),
      name,
      description,
      pricingSummary: null,
      status: payload.status ?? 'draft',
      activeSubscriptions: 0,
      features: payload.features ?? [],
      marketplacePlanId: normalizeMarketplacePlanId(payload.marketplacePlanId),
      seatLimit: normalizeSeatLimit(payload.seatLimit),
    };
    state.publisher.plans = [plan, ...state.publisher.plans];
    writeState(state);
    return plan as T;
  }

  if (path.startsWith('/publisher/plans/') && method === 'PUT') {
    const planId = decodePathSegment(path.split('/').pop());
    const payload = JSON.parse((init?.body as string | undefined) ?? '{}') as Partial<PublisherPlanUpdateInput>;
    const planIndex = state.publisher.plans.findIndex((plan) => plan.id === planId);
    if (planIndex === -1 || !planId) throw new ApiError('The selected plan could not be found.', 404, 'publisher_plan_not_found');
    const current = state.publisher.plans[planIndex];
    const nextPlan: PublisherPlan = {
      ...current,
      name: payload.name?.trim() || current.name,
      description: payload.description?.trim() || current.description,
      status: payload.status ?? current.status,
      marketplacePlanId: normalizeMarketplacePlanId(payload.marketplacePlanId) ?? null,
      seatLimit: normalizeSeatLimit(payload.seatLimit),
    };
    state.publisher.plans[planIndex] = nextPlan;
    state.publisher.tenants = state.publisher.tenants.map((tenant) => tenant.planId === planId ? { ...tenant, planName: nextPlan.name, monthlyRecurringRevenue: null } : tenant);
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
      monthlyRecurringRevenue: null,
      seats: payload.seats,
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
    const tenantId = decodePathSegment(path.split('/')[3]);
    const tenant = state.publisher.tenants.find((item) => item.id === tenantId || item.subscriptionId === tenantId);
    if (!tenant) throw new ApiError('The selected tenant could not be found.', 404, 'publisher_tenant_not_found');
    return tenant as T;
  }

  if (path.startsWith('/publisher/tenants/') && method === 'PUT') {
    const tenantId = decodePathSegment(path.split('/')[3]);
    const payload = JSON.parse((init?.body as string | undefined) ?? '{}') as PublisherTenantUpsertInput;
    const tenantIndex = state.publisher.tenants.findIndex((item) => item.id === tenantId || item.subscriptionId === tenantId);
    if (tenantIndex === -1) throw new ApiError('The selected tenant could not be found.', 404, 'publisher_tenant_not_found');
    const selectedPlan = getPublisherPlan(state, payload.planId);
    if (!selectedPlan) throw new ApiError('Select a valid plan before saving the tenant.', 400, 'publisher_plan_required');
    const current = state.publisher.tenants[tenantIndex];
    state.publisher.tenants[tenantIndex] = appendAudit({ ...current, displayName: payload.displayName, primaryDomain: payload.primaryDomain, planId: payload.planId, planName: selectedPlan.name, status: payload.status, monthlyRecurringRevenue: null, seats: payload.seats, usage: { ...current.usage, activeUsers: Math.max(1, Math.min(payload.seats, Math.round(payload.seats * 0.7))), storageGb: Number((payload.seats * 0.3).toFixed(1)) } }, 'Tenant updated');
    writeState(state);
    return state.publisher.tenants[tenantIndex] as T;
  }

  if (path.startsWith('/publisher/tenants/') && method === 'POST') {
    const tenantKey = decodePathSegment(path.split('/')[3]);
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
