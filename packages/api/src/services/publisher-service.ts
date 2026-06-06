import { randomUUID } from 'node:crypto';

import type {
  PublisherDashboardData,
  PublisherPlan,
  PublisherPlanStatus,
  PublisherPlanUpdateInput,
  PublisherPlansResponse,
  PublisherTenantAuditEntry,
  PublisherTenantDetail,
  PublisherTenantStatus,
  PublisherTenantSummary,
  PublisherTenantUpsertInput,
  PublisherTenantsResponse,
  Subscription,
  SubscriptionAuditEntry,
  SubscriptionStatus
} from '@fastsaas/shared';
import type { Logger } from 'pino';

import { AppError } from '../errors/app-error';
import type { PublisherPlanRepository, SavePublisherPlanInput, StoredPublisherPlan } from '../repositories/publisher-plan-repository';
import type {
  CreateManagedSubscriptionInput,
  SubscriptionRepository,
  UpdateManagedSubscriptionInput
} from '../repositories/subscription-repository';

export interface PublisherActorContext {
  tenantId: string;
  userId: string;
  requestId: string;
  correlationId: string;
}

export interface CreatePublisherPlanInput extends PublisherPlanUpdateInput {
  id?: string;
  features?: string[];
}


function parseMoney(value: string): number {
  const parsed = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(amount);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function titleize(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

function normalizeFeatures(features: readonly string[] | undefined, fallback: readonly string[] = []): string[] {
  const normalized = (features ?? fallback)
    .filter((feature): feature is string => typeof feature === 'string')
    .map((feature) => feature.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : [...fallback];
}

function normalizePlanStatus(status: string): PublisherPlanStatus {
  return status === 'draft' ? 'draft' : 'active';
}

function mapPublisherStatus(status: SubscriptionStatus, metadata: Record<string, unknown>): PublisherTenantStatus {
  if (metadata.publisherStatusOverride === 'past_due') {
    return 'past_due';
  }

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

function toSubscriptionStatus(status: PublisherTenantStatus): SubscriptionStatus {
  switch (status) {
    case 'active':
      return 'Active';
    case 'trialing':
      return 'PendingActivation';
    case 'past_due':
    case 'suspended':
      return 'Suspended';
    case 'canceled':
      return 'Unsubscribed';
    default: {
      const unsupportedStatus: never = status;
      return unsupportedStatus;
    }
  }
}

function buildTenantAuditEntry(entry: SubscriptionAuditEntry): PublisherTenantAuditEntry {
  const label = entry.eventType.replace(/([a-z])([A-Z])/g, '$1 $2');
  return {
    id: entry.id,
    label: `${label} → ${entry.toStatus}`,
    timestamp: entry.createdAt
  };
}

function mergePlanDefinitions(plans: readonly StoredPublisherPlan[]): Map<string, Omit<PublisherPlan, 'activeSubscriptions'>> {
  const merged = new Map<string, Omit<PublisherPlan, 'activeSubscriptions'>>();

  for (const plan of plans) {
    merged.set(plan.id, {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      priceMonthly: plan.priceMonthly,
      status: plan.status,
      features: [...plan.features]
    });
  }

  return merged;
}

function resolvePlanDefinition(
  planId: string,
  definitions: Map<string, Omit<PublisherPlan, 'activeSubscriptions'>>
): Omit<PublisherPlan, 'activeSubscriptions'> {
  return (
    definitions.get(planId) ?? {
      id: planId,
      name: titleize(planId),
      description: 'Marketplace plan imported from live subscription data.',
      priceMonthly: '$0',
      status: 'draft',
      features: ['Imported from live subscription data']
    }
  );
}

function mapSubscriptionToTenantSummary(
  subscription: Subscription,
  definitions: Map<string, Omit<PublisherPlan, 'activeSubscriptions'>>
): PublisherTenantSummary {
  const plan = resolvePlanDefinition(subscription.planId, definitions);

  return {
    id: subscription.id,
    displayName:
      getMetadataValue(subscription.metadata, 'displayName', 'tenantName', 'company') ??
      getMetadataValue(subscription.metadata, 'managedTenantId') ??
      subscription.beneficiaryTenantId ??
      subscription.tenantId,
    primaryDomain:
      getMetadataValue(subscription.metadata, 'primaryDomain', 'domain', 'website') ??
      subscription.purchaserTenantId ??
      'marketplace.local',
    planId: subscription.planId,
    planName: plan.name,
    status: mapPublisherStatus(subscription.status, subscription.metadata),
    monthlyRecurringRevenue: plan.priceMonthly,
    seats: subscription.seats,
    subscriptionId: subscription.id,
    lastUpdated: subscription.updatedAt
  };
}

function mapSubscriptionToTenantDetail(
  subscription: Subscription,
  definitions: Map<string, Omit<PublisherPlan, 'activeSubscriptions'>>
): PublisherTenantDetail {
  const summary = mapSubscriptionToTenantSummary(subscription, definitions);
  const usageMultiplier = summary.status === 'active' ? 1 : summary.status === 'trialing' ? 0.7 : 0.45;

  return {
    ...summary,
    purchaserTenantId: subscription.purchaserTenantId,
    beneficiaryTenantId: subscription.beneficiaryTenantId,
    usage: {
      activeUsers: Math.max(1, Math.min(subscription.seats, Math.round(subscription.seats * 0.72 * usageMultiplier))),
      apiRequestsThisMonth: Math.round(subscription.seats * 8600 * usageMultiplier),
      storageGb: Number((subscription.seats * 0.35 * usageMultiplier).toFixed(1))
    },
    audit: subscription.auditLog.map(buildTenantAuditEntry)
  };
}

export class PublisherService {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly publisherPlanRepository: PublisherPlanRepository,
    private readonly logger: Logger
  ) {}

  async getDashboard(publisherTenantId: string): Promise<PublisherDashboardData> {
    const [subscriptions, definitions] = await this.loadPublisherState(publisherTenantId);
    const tenants = subscriptions.map((subscription) => mapSubscriptionToTenantSummary(subscription, definitions));
    const planCounts = new Map<string, number>();

    for (const tenant of tenants) {
      planCounts.set(tenant.planId, (planCounts.get(tenant.planId) ?? 0) + 1);
    }

    return {
      subscriptionCount: subscriptions.length,
      activeTenants: tenants.filter((tenant) => tenant.status === 'active').length,
      monthlyRecurringRevenue: formatMoney(
        tenants.reduce((total, tenant) => total + parseMoney(tenant.monthlyRecurringRevenue), 0)
      ),
      churnRiskCount: tenants.filter((tenant) => tenant.status === 'past_due' || tenant.status === 'suspended').length,
      plans: [...planCounts.entries()].map(([planId, tenantCount]) => ({
        planId,
        planName: resolvePlanDefinition(planId, definitions).name,
        tenantCount
      }))
    };
  }

  async listPlans(publisherTenantId: string): Promise<PublisherPlansResponse> {
    const [subscriptions, definitions] = await this.loadPublisherState(publisherTenantId);
    const counts = subscriptions.reduce<Record<string, number>>((result, subscription) => {
      result[subscription.planId] = (result[subscription.planId] ?? 0) + 1;
      return result;
    }, {});
    const planIds = [...new Set([...definitions.keys(), ...Object.keys(counts)])].sort((left, right) => left.localeCompare(right));

    return {
      plans: planIds.map((planId) => ({
        ...resolvePlanDefinition(planId, definitions),
        activeSubscriptions: counts[planId] ?? 0
      }))
    };
  }

  async createPlan(actor: PublisherActorContext, input: CreatePublisherPlanInput): Promise<PublisherPlan> {
    const planId = slugify(input.id ?? input.name);
    if (!planId) {
      throw AppError.badRequest('Plan id could not be derived from the provided input');
    }

    const existingPlans = await this.listPlans(actor.tenantId);
    if (existingPlans.plans.some((plan) => plan.id === planId)) {
      throw AppError.conflict('A publisher plan with this id already exists', { planId });
    }

    await this.publisherPlanRepository.savePlan({
      publisherTenantId: actor.tenantId,
      id: planId,
      ...this.normalizePlanInput(input)
    });

    const createdPlan = await this.getPlan(actor.tenantId, planId);
    this.logger.info({ planId, actorTenantId: actor.tenantId, requestId: actor.requestId }, 'Publisher plan created');
    return createdPlan;
  }

  async updatePlan(actor: PublisherActorContext, planId: string, input: PublisherPlanUpdateInput): Promise<PublisherPlansResponse> {
    const existingPlan = await this.getPlan(actor.tenantId, planId);

    await this.publisherPlanRepository.savePlan({
      publisherTenantId: actor.tenantId,
      id: planId,
      ...this.normalizePlanInput({ ...input, features: existingPlan.features })
    });

    this.logger.info({ planId, actorTenantId: actor.tenantId, requestId: actor.requestId }, 'Publisher plan updated');
    return this.listPlans(actor.tenantId);
  }

  async listSubscriptions(publisherTenantId: string): Promise<Subscription[]> {
    return this.subscriptionRepository.listByTenant(publisherTenantId);
  }

  async listTenants(publisherTenantId: string): Promise<PublisherTenantsResponse> {
    const [subscriptions, definitions] = await this.loadPublisherState(publisherTenantId);
    return {
      tenants: subscriptions.map((subscription) => mapSubscriptionToTenantSummary(subscription, definitions))
    };
  }

  async getTenant(publisherTenantId: string, tenantKey: string): Promise<PublisherTenantDetail> {
    const [subscription, definitions] = await this.findTenantRecord(publisherTenantId, tenantKey);
    return mapSubscriptionToTenantDetail(subscription, definitions);
  }

  async createTenant(actor: PublisherActorContext, input: PublisherTenantUpsertInput): Promise<PublisherTenantDetail> {
    const normalized = this.normalizeTenantInput(input);
    await this.getPlan(actor.tenantId, normalized.planId);

    const subscriptionStatus = toSubscriptionStatus(normalized.status);
    const managedTenantId = `tenant-${slugify(normalized.primaryDomain) || randomUUID()}`;
    const auditEntry = this.buildSubscriptionAuditEntry('TenantCreated', null, subscriptionStatus, actor);
    const metadata = this.buildTenantMetadata(normalized, normalized.status, managedTenantId);

    const created = await this.subscriptionRepository.createManagedSubscription({
      tenantId: actor.tenantId,
      marketplaceSubscriptionId: `publisher-${randomUUID()}`,
      planId: normalized.planId,
      seats: normalized.seats,
      status: subscriptionStatus,
      correlationId: actor.correlationId,
      purchaserTenantId: `purchaser-${randomUUID()}`,
      beneficiaryTenantId: managedTenantId,
      metadata,
      auditEntry
    } satisfies CreateManagedSubscriptionInput);

    this.logger.info(
      { subscriptionId: created.id, managedTenantId, actorTenantId: actor.tenantId, requestId: actor.requestId },
      'Publisher tenant created'
    );

    return this.getTenant(actor.tenantId, created.id);
  }

  async updateTenant(
    actor: PublisherActorContext,
    tenantKey: string,
    input: PublisherTenantUpsertInput
  ): Promise<PublisherTenantDetail> {
    const [subscription] = await this.findTenantRecord(actor.tenantId, tenantKey);
    const normalized = this.normalizeTenantInput(input);
    await this.getPlan(actor.tenantId, normalized.planId);

    const nextStatus = toSubscriptionStatus(normalized.status);
    const auditEntry = this.buildSubscriptionAuditEntry('TenantUpdated', subscription.status, nextStatus, actor, {
      previousPlanId: subscription.planId,
      previousSeats: subscription.seats
    });

    await this.subscriptionRepository.updateManagedSubscription({
      subscriptionId: subscription.id,
      planId: normalized.planId,
      seats: normalized.seats,
      status: nextStatus,
      offerId: subscription.offerId,
      purchaserTenantId: subscription.purchaserTenantId,
      beneficiaryTenantId: subscription.beneficiaryTenantId,
      correlationId: actor.correlationId,
      metadata: {
        ...subscription.metadata,
        ...this.buildTenantMetadata(
          normalized,
          normalized.status,
          getMetadataValue(subscription.metadata, 'managedTenantId') ?? subscription.beneficiaryTenantId
        )
      },
      auditEntry
    } satisfies UpdateManagedSubscriptionInput);

    this.logger.info(
      { subscriptionId: subscription.id, actorTenantId: actor.tenantId, requestId: actor.requestId },
      'Publisher tenant updated'
    );

    return this.getTenant(actor.tenantId, subscription.id);
  }

  async transitionTenant(
    actor: PublisherActorContext,
    tenantKey: string,
    action: 'activate' | 'suspend' | 'cancel'
  ): Promise<PublisherTenantDetail> {
    const [subscription] = await this.findTenantRecord(actor.tenantId, tenantKey);
    const transition =
      action === 'activate'
        ? { status: 'Active' as const, eventType: 'Activate' }
        : action === 'suspend'
          ? { status: 'Suspended' as const, eventType: 'Suspend' }
          : { status: 'Unsubscribed' as const, eventType: 'Unsubscribe' };

    await this.subscriptionRepository.updateManagedSubscription({
      subscriptionId: subscription.id,
      planId: subscription.planId,
      seats: subscription.seats,
      status: transition.status,
      offerId: subscription.offerId,
      purchaserTenantId: subscription.purchaserTenantId,
      beneficiaryTenantId: subscription.beneficiaryTenantId,
      correlationId: actor.correlationId,
      metadata: {
        ...subscription.metadata,
        publisherStatusOverride: undefined
      },
      auditEntry: this.buildSubscriptionAuditEntry(transition.eventType, subscription.status, transition.status, actor)
    } satisfies UpdateManagedSubscriptionInput);

    this.logger.info(
      { subscriptionId: subscription.id, action, actorTenantId: actor.tenantId, requestId: actor.requestId },
      'Publisher tenant transitioned'
    );

    return this.getTenant(actor.tenantId, subscription.id);
  }

  private async loadPublisherState(
    publisherTenantId: string
  ): Promise<[Subscription[], Map<string, Omit<PublisherPlan, 'activeSubscriptions'>>]> {
    const [subscriptions, storedPlans] = await Promise.all([
      this.subscriptionRepository.listByTenant(publisherTenantId),
      this.publisherPlanRepository.listByTenant(publisherTenantId)
    ]);

    return [subscriptions, mergePlanDefinitions(storedPlans)];
  }

  private async getPlan(publisherTenantId: string, planId: string): Promise<PublisherPlan> {
    const plans = await this.listPlans(publisherTenantId);
    const plan = plans.plans.find((entry) => entry.id === planId);
    if (!plan) {
      throw AppError.notFound('The selected plan could not be found', { planId });
    }

    return plan;
  }

  private async findTenantRecord(
    publisherTenantId: string,
    tenantKey: string
  ): Promise<[Subscription, Map<string, Omit<PublisherPlan, 'activeSubscriptions'>>]> {
    const [subscriptions, definitions] = await this.loadPublisherState(publisherTenantId);
    const subscription = subscriptions.find(
      (entry) =>
        entry.id === tenantKey ||
        entry.beneficiaryTenantId === tenantKey ||
        getMetadataValue(entry.metadata, 'managedTenantId') === tenantKey
    );

    if (!subscription) {
      throw AppError.notFound('The selected tenant could not be found', { tenantKey });
    }

    return [subscription, definitions];
  }

  private normalizePlanInput(input: CreatePublisherPlanInput): Omit<SavePublisherPlanInput, 'publisherTenantId' | 'id'> {
    const name = input.name?.trim();
    const description = input.description?.trim();
    const priceMonthly = input.priceMonthly?.trim();

    if (!name) {
      throw AppError.badRequest('name is required');
    }

    if (!description) {
      throw AppError.badRequest('description is required');
    }

    if (!priceMonthly) {
      throw AppError.badRequest('priceMonthly is required');
    }

    return {
      name,
      description,
      priceMonthly,
      status: normalizePlanStatus(input.status),
      features: normalizeFeatures(input.features, ['Publisher managed plan'])
    };
  }

  private normalizeTenantInput(input: PublisherTenantUpsertInput): PublisherTenantUpsertInput {
    const displayName = input.displayName?.trim();
    const primaryDomain = input.primaryDomain?.trim().toLowerCase();
    const planId = input.planId?.trim();

    if (!displayName) {
      throw AppError.badRequest('displayName is required');
    }

    if (!primaryDomain) {
      throw AppError.badRequest('primaryDomain is required');
    }

    if (!planId) {
      throw AppError.badRequest('planId is required');
    }

    if (!Number.isInteger(input.seats) || input.seats <= 0) {
      throw AppError.badRequest('seats must be a positive integer');
    }

    return {
      ...input,
      displayName,
      primaryDomain,
      planId
    };
  }

  private buildTenantMetadata(
    input: PublisherTenantUpsertInput,
    status: PublisherTenantStatus,
    managedTenantId?: string
  ): Record<string, unknown> {
    return {
      managedByPublisher: true,
      managedTenantId,
      displayName: input.displayName,
      primaryDomain: input.primaryDomain,
      publisherStatusOverride: status === 'past_due' ? 'past_due' : undefined
    };
  }

  private buildSubscriptionAuditEntry(
    eventType: string,
    fromStatus: SubscriptionStatus | null,
    toStatus: SubscriptionStatus,
    actor: PublisherActorContext,
    details: Record<string, unknown> = {}
  ): SubscriptionAuditEntry {
    return {
      id: randomUUID(),
      subscriptionId: 'pending',
      eventType,
      source: 'publisher-api',
      fromStatus,
      toStatus,
      correlationId: actor.correlationId,
      requestId: actor.requestId,
      details,
      createdAt: new Date().toISOString()
    };
  }
}
