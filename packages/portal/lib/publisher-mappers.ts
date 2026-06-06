import type {
  PublisherDashboardData,
  PublisherPlan,
  PublisherPlansResponse,
  PublisherTenantAuditEntry,
  PublisherTenantDetail,
  PublisherTenantStatus,
  PublisherTenantSummary,
  PublisherTenantsResponse,
  Subscription,
  SubscriptionAuditEntry,
  SubscriptionStatus,
} from '@fastsaas/shared';

const publisherPlanCatalog: Record<string, Omit<PublisherPlan, 'activeSubscriptions'>> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Self-serve onboarding for early marketplace customers.',
    pricingSummary: null,
    status: 'active',
    features: ['10 seats included', 'Email support', 'Single environment'],
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    description: 'Balanced controls for growing portfolio tenants.',
    pricingSummary: null,
    status: 'active',
    features: ['25 seats included', 'Priority support', 'Usage analytics'],
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    description: 'Enterprise controls and publisher-ready governance.',
    pricingSummary: null,
    status: 'active',
    features: ['Unlimited seats', 'Dedicated support', 'Custom exports'],
  },
};

function titleize(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getPlanTemplate(planId: string): Omit<PublisherPlan, 'activeSubscriptions'> {
  return (
    publisherPlanCatalog[planId] ?? {
      id: planId,
      name: titleize(planId),
      description: 'Marketplace plan imported from the fulfillment API subscription record.',
      pricingSummary: null,
      status: 'draft',
      features: ['Imported from live subscription data'],
    }
  );
}


function getMetadataValue(metadata: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function mapSubscriptionStatus(status: SubscriptionStatus): PublisherTenantStatus {
  switch (status) {
    case 'PendingActivation':
      return 'trialing';
    case 'Active':
      return 'active';
    case 'Suspended':
      return 'suspended';
    case 'Unsubscribed':
      return 'canceled';
    default:
      return 'past_due';
  }
}

function buildAuditEntry(entry: SubscriptionAuditEntry): PublisherTenantAuditEntry {
  const verb = entry.eventType.replace(/([a-z])([A-Z])/g, '$1 $2');

  return {
    id: entry.id,
    label: `${verb} → ${entry.toStatus}`,
    timestamp: entry.createdAt,
  };
}

export function mapSubscriptionToPublisherTenant(subscription: Subscription): PublisherTenantSummary {
  const template = getPlanTemplate(subscription.planId);
  const displayName =
    getMetadataValue(subscription.metadata, 'tenantName', 'company', 'displayName') ??
    subscription.beneficiaryTenantId ??
    subscription.tenantId;

  return {
    id: subscription.id,
    displayName,
    primaryDomain:
      getMetadataValue(subscription.metadata, 'primaryDomain', 'domain', 'website') ??
      subscription.purchaserTenantId ??
      'marketplace.local',
    planId: subscription.planId,
    planName: template.name,
    status: mapSubscriptionStatus(subscription.status),
    monthlyRecurringRevenue: null,
    seats: subscription.seats,
    subscriptionId: subscription.id,
    lastUpdated: subscription.updatedAt,
  };
}

export function buildPublisherDashboard(subscriptions: Subscription[]): PublisherDashboardData {
  const tenants = subscriptions.map(mapSubscriptionToPublisherTenant);
  const planCounts = new Map<string, number>();

  for (const tenant of tenants) {
    planCounts.set(tenant.planId, (planCounts.get(tenant.planId) ?? 0) + 1);
  }

  return {
    subscriptionCount: subscriptions.length,
    activeTenants: tenants.filter((tenant) => tenant.status === 'active').length,
    monthlyRecurringRevenue: null,
    churnRiskCount: tenants.filter((tenant) => tenant.status === 'past_due' || tenant.status === 'suspended').length,
    plans: [...planCounts.entries()].map(([planId, tenantCount]) => ({
      planId,
      planName: getPlanTemplate(planId).name,
      tenantCount,
    })),
  };
}

export function buildPublisherPlans(subscriptions: Subscription[]): PublisherPlansResponse {
  const planCounts = subscriptions.reduce<Record<string, number>>((counts, subscription) => {
    counts[subscription.planId] = (counts[subscription.planId] ?? 0) + 1;
    return counts;
  }, {});

  const planIds = [...new Set([...Object.keys(publisherPlanCatalog), ...Object.keys(planCounts)])];

  return {
    plans: planIds.map((planId) => ({
      ...getPlanTemplate(planId),
      activeSubscriptions: planCounts[planId] ?? 0,
    })),
  };
}

export function buildPublisherTenants(subscriptions: Subscription[]): PublisherTenantsResponse {
  return {
    tenants: subscriptions.map(mapSubscriptionToPublisherTenant),
  };
}

export function buildPublisherTenantDetail(subscription: Subscription): PublisherTenantDetail {
  const tenant = mapSubscriptionToPublisherTenant(subscription);
  const usageMultiplier = subscription.status === 'Active' ? 1 : 0.45;

  return {
    ...tenant,
    purchaserTenantId: subscription.purchaserTenantId,
    beneficiaryTenantId: subscription.beneficiaryTenantId,
    usage: {
      activeUsers: Math.max(1, Math.min(subscription.seats, Math.round(subscription.seats * 0.72 * usageMultiplier))),
      apiRequestsThisMonth: Math.round(subscription.seats * 8600 * usageMultiplier),
      storageGb: Number((subscription.seats * 0.35 * usageMultiplier).toFixed(1)),
    },
    audit: subscription.auditLog.map(buildAuditEntry),
  };
}
