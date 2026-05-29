import type { DashboardData, PlansResponse, PortalAction, SettingsData } from '@fastsaas/shared';
import { ApiError } from '@/lib/errors';

interface MockPortalState {
  dashboard: DashboardData;
  plans: PlansResponse;
  settings: SettingsData;
}

const storageKey = 'fastsaas.portal.mock-state';

const defaultActions = (state: DashboardData['subscription']['state']): PortalAction[] => {
  if (state === 'canceled') {
    return [
      { id: 'resume', label: 'Resume subscription', description: 'Reactivate the subscription and restore access right away.', tone: 'default' },
    ];
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

const defaultState = (): MockPortalState => ({
  dashboard: {
    user: {
      id: 'cust_001',
      name: 'Alex Customer',
      email: 'alex.customer@fastsaas.dev',
      company: 'Northwind Traders',
    },
    subscription: {
      tenantId: 'tenant_northwind',
      state: 'active',
      planId: 'growth',
      planName: 'Growth',
      billingCycle: 'annual',
      renewalDate: '2026-07-15',
      amount: '$249',
    },
    usage: {
      activeMembers: 18,
      seatsPurchased: 25,
      apiRequestsThisMonth: 184203,
    },
    actions: defaultActions('active'),
  },
  plans: {
    currentPlanId: 'growth',
    availablePlans: [
      {
        id: 'starter',
        name: 'Starter',
        description: 'Core workflow automation for small teams.',
        priceMonthly: '$79',
        features: [
          { label: 'Up to 10 team members', included: true },
          { label: 'Email support', included: true },
          { label: 'Single environment', included: true },
        ],
      },
      {
        id: 'growth',
        name: 'Growth',
        description: 'Balanced controls for scaling product teams.',
        priceMonthly: '$249',
        recommended: true,
        features: [
          { label: 'Up to 25 team members', included: true },
          { label: 'Priority support', included: true },
          { label: 'Advanced analytics', included: true },
        ],
      },
      {
        id: 'scale',
        name: 'Scale',
        description: 'Enterprise-ready governance and visibility.',
        priceMonthly: '$499',
        features: [
          { label: 'Unlimited team members', included: true },
          { label: 'Dedicated success manager', included: true },
          { label: 'Custom usage exports', included: true },
        ],
      },
    ],
  },
  settings: {
    displayName: 'Alex Customer',
    email: 'alex.customer@fastsaas.dev',
    company: 'Northwind Traders',
    timezone: 'America/Chicago',
    notificationsEnabled: true,
  },
});

const isBrowser = () => typeof window !== 'undefined';

const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

function readState(): MockPortalState {
  if (!isBrowser()) {
    return defaultState();
  }

  const saved = window.localStorage.getItem(storageKey);
  if (!saved) {
    const initialState = defaultState();
    writeState(initialState);
    return initialState;
  }

  return JSON.parse(saved) as MockPortalState;
}

function writeState(state: MockPortalState) {
  if (isBrowser()) {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }
}

export async function mockRequest<T>(path: string, init?: RequestInit): Promise<T> {
  await wait();
  const method = init?.method ?? 'GET';
  const state = readState();

  if (path === '/portal/dashboard' && method === 'GET') {
    return state.dashboard as T;
  }

  if (path === '/portal/plans' && method === 'GET') {
    return state.plans as T;
  }

  if (path === '/portal/plans' && method === 'POST') {
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as { planId?: string };
    const selectedPlan = state.plans.availablePlans.find((plan) => plan.id === body.planId);

    if (!selectedPlan) {
      throw new ApiError('The plan you selected is no longer available.', 404, 'plan_not_found');
    }

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

    if (!payload.email?.includes('@')) {
      throw new ApiError('Enter a valid billing email address.', 400, 'invalid_email');
    }

    state.settings = payload;
    state.dashboard.user.name = payload.displayName;
    state.dashboard.user.email = payload.email;
    state.dashboard.user.company = payload.company;
    writeState(state);
    return state.settings as T;
  }

  if (path.startsWith('/portal/actions/') && method === 'POST') {
    const actionId = path.split('/').pop();

    switch (actionId) {
      case 'resume':
        state.dashboard.subscription.state = 'active';
        break;
      case 'suspend':
        state.dashboard.subscription.state = 'suspended';
        break;
      case 'cancel':
        state.dashboard.subscription.state = 'canceled';
        break;
      default:
        throw new ApiError('That subscription action is not supported yet.', 400, 'invalid_action');
    }

    state.dashboard.actions = defaultActions(state.dashboard.subscription.state);
    writeState(state);
    return state.dashboard as T;
  }

  throw new ApiError('We could not complete that request in the portal mock API.', 500, 'unknown_mock_route');
}
