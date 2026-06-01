export function encodePathSegment(value: string) {
  return encodeURIComponent(value);
}

function createCustomerApiPaths(prefix: string) {
  const subscription = (subscriptionId: string) => `${prefix}/subscriptions/${encodePathSegment(subscriptionId)}`;

  return {
    action: (actionId: string) => `/portal/actions/${encodePathSegment(actionId)}`,
    subscriptions: `${prefix}/subscriptions`,
    subscription,
    activateSubscription: (subscriptionId: string) => `${subscription(subscriptionId)}/activate`,
  } as const;
}

function createPublisherAdminPaths(prefix: string) {
  const plan = (planId: string) => `${prefix}/plans/${encodePathSegment(planId)}`;
  const tenant = (tenantId: string) => `${prefix}/tenants/${encodePathSegment(tenantId)}`;

  return {
    dashboard: `${prefix}/dashboard`,
    plans: `${prefix}/plans`,
    plan,
    tenants: `${prefix}/tenants`,
    tenant,
    tenantAction: (tenantId: string, action: 'activate' | 'suspend' | 'cancel') =>
      `${tenant(tenantId)}/${encodePathSegment(action)}`,
  } as const;
}

export const customerApiPaths = createCustomerApiPaths('/v1');
export const publisherAdminMockPaths = createPublisherAdminPaths('/publisher');
export const publisherAdminPaths = createPublisherAdminPaths('/v1/publisher');
