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

function createOperatorAdminPaths(prefix: string) {
  const plan = (planId: string) => `${prefix}/plans/${encodePathSegment(planId)}`;
  const tenant = (tenantId: string) => `${prefix}/tenants/${encodePathSegment(tenantId)}`;

  return {
    dashboard: `${prefix}/dashboard`,
    plans: `${prefix}/plans`,
    marketplacePlans: `${prefix}/marketplace-plans`,
    plan,
    planArchive: (planId: string) => `${plan(planId)}/archive`,
    planUnarchive: (planId: string) => `${plan(planId)}/unarchive`,
    planFeatures: (planId: string) => `${plan(planId)}/features`,
    planFeature: (planId: string, featureKey: string) => `${plan(planId)}/features/${encodePathSegment(featureKey)}`,
    tenants: `${prefix}/tenants`,
    tenant,
    tenantAction: (tenantId: string, action: 'activate' | 'suspend' | 'cancel') =>
      `${tenant(tenantId)}/${encodePathSegment(action)}`,
    importProduct: `${prefix}/products/import`,
  } as const;
}

export const customerApiPaths = createCustomerApiPaths('/v1');
export const operatorAdminMockPaths = createOperatorAdminPaths('/operator');
export const operatorAdminPaths = createOperatorAdminPaths('/v1/operator');
