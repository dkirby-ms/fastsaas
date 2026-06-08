import type { DashboardData, PlanOption, PlansResponse, PortalAction, SettingsData, Subscription } from '@fastsaas/shared';
import { Router, type Response } from 'express';

import type { ApiConfig } from '../config';
import { AppError } from '../errors/app-error';
import type { ApiRequest } from '../http';
import { authenticateRequest, requireScopes } from '../middleware/auth';
import { injectTenantContext } from '../middleware/tenant-context';
import type { PublisherPlanRepository, StoredPublisherPlan } from '../repositories/publisher-plan-repository';
import type { SubscriptionService } from '../services/subscription-service';
import type { TenantMemberService } from '../services/tenant-member-service';

const defaultActions = (state: NonNullable<DashboardData['subscription']>['state']): PortalAction[] => {
  if (state === 'canceled') {
    return [{ id: 'resume', label: 'Resume subscription', description: 'Reactivate the subscription and restore access right away.', tone: 'default' }];
  }

  if (state === 'suspended') {
    return [
      { id: 'resume', label: 'Resume subscription', description: 'Restore active access for your team.', tone: 'default' },
      { id: 'cancel', label: 'Cancel subscription', description: 'Close the account at the end of the current period.', tone: 'danger' }
    ];
  }

  return [
    { id: 'suspend', label: 'Pause access', description: 'Temporarily suspend access while keeping your renewal data intact.', tone: 'warning' },
    { id: 'cancel', label: 'Cancel subscription', description: 'End the subscription after the current billing period.', tone: 'danger' }
  ];
};

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function mapPortalSubscriptionState(status: Subscription['status']): NonNullable<DashboardData['subscription']>['state'] {
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

function formatRenewalDate(subscription: Subscription, state: NonNullable<DashboardData['subscription']>['state']) {
  if (state === 'canceled') {
    return 'Ended';
  }

  const renewal = new Date(subscription.updatedAt || subscription.createdAt);
  renewal.setUTCMonth(renewal.getUTCMonth() + 1);

  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(renewal);
}

function getCurrentSubscription(subscriptions: Subscription[]): Subscription | null {
  return [...subscriptions].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] ?? null;
}

function getFallbackActiveMembers(state: NonNullable<DashboardData['subscription']>['state'], seatsPurchased: number): number {
  return state === 'canceled' ? 0 : Math.max(1, Math.min(seatsPurchased, Math.round(seatsPurchased * 0.7)));
}

function buildPortalUser(req: ApiRequest, subscription: Subscription | null): DashboardData['user'] {
  const email = readString(req.auth?.email) ?? readString(req.auth?.preferred_username) ?? '';
  const fallbackName = email ? email.split('@')[0] : req.context?.userId ?? '';

  return {
    id: req.context?.userId ?? '',
    name: readString(req.auth?.name) ?? fallbackName,
    email,
    company: subscription ? readString(subscription.metadata.company) ?? '' : ''
  };
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildSettings(req: ApiRequest, subscription: Subscription | null, override: Partial<SettingsData> = {}): SettingsData {
  const user = buildPortalUser(req, subscription);
  const metadataName =
    readString(subscription?.metadata.displayName) ??
    readString(subscription?.metadata.name) ??
    readString(subscription?.metadata.company);

  return {
    displayName: readString(override.displayName) ?? readString(req.auth?.name) ?? metadataName ?? user.name,
    email: readString(override.email) ?? user.email,
    company: readString(override.company) ?? readString(subscription?.metadata.company) ?? user.company,
    timezone: readString(override.timezone) ?? 'America/Chicago',
    notificationsEnabled: readBoolean(override.notificationsEnabled) ?? true
  };
}

function parseSettingsBody(body: unknown): SettingsData {
  if (!isRecord(body)) {
    throw AppError.badRequest('Request body must be a JSON object');
  }

  if (typeof body.displayName !== 'string') {
    throw AppError.badRequest('displayName is required');
  }

  if (typeof body.email !== 'string') {
    throw AppError.badRequest('email is required');
  }

  if (typeof body.company !== 'string') {
    throw AppError.badRequest('company is required');
  }

  if (typeof body.timezone !== 'string') {
    throw AppError.badRequest('timezone is required');
  }

  if (typeof body.notificationsEnabled !== 'boolean') {
    throw AppError.badRequest('notificationsEnabled must be a boolean');
  }

  return {
    displayName: body.displayName,
    email: body.email,
    company: body.company,
    timezone: body.timezone,
    notificationsEnabled: body.notificationsEnabled
  };
}

function parsePlanChangeBody(body: unknown): { planId: string } {
  if (!isRecord(body)) {
    throw AppError.badRequest('Request body must be a JSON object');
  }

  if (typeof body.planId !== 'string' || body.planId.trim().length === 0) {
    throw AppError.badRequest('planId is required');
  }

  return { planId: body.planId.trim() };
}

function readPricingSummary(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const directSummary =
    readString(value.summary) ??
    readString(value.displayPrice) ??
    readString(value.display) ??
    readString(value.pricingSummary);
  if (directSummary) {
    return directSummary;
  }

  const nestedPricing = isRecord(value.pricing) ? value.pricing : isRecord(value.price) ? value.price : null;
  if (!nestedPricing) {
    return null;
  }

  return (
    readString(nestedPricing.summary) ??
    readString(nestedPricing.displayPrice) ??
    readString(nestedPricing.display) ??
    null
  );
}

function getSeatSortValue(plan: StoredPublisherPlan): number {
  return plan.seatLimit ?? Number.MAX_SAFE_INTEGER;
}

function getRecommendedPlanId(plans: readonly StoredPublisherPlan[]): string | null {
  if (plans.length === 0) {
    return null;
  }

  const ranked = [...plans].sort((left, right) => {
    const seatDifference = getSeatSortValue(left) - getSeatSortValue(right);
    if (seatDifference !== 0) {
      return seatDifference;
    }

    return left.name.localeCompare(right.name);
  });

  return ranked[Math.floor(ranked.length / 2)]?.id ?? null;
}

function buildPlanOptions(plans: readonly StoredPublisherPlan[]): PlanOption[] {
  const activePlans = plans.filter((plan) => plan.status === 'active');
  const recommendedPlanId = getRecommendedPlanId(activePlans);

  return [...activePlans]
    .sort((left, right) => {
      const seatDifference = getSeatSortValue(left) - getSeatSortValue(right);
      if (seatDifference !== 0) {
        return seatDifference;
      }

      return left.name.localeCompare(right.name);
    })
    .map((plan) => ({
      id: plan.marketplacePlanId ?? plan.id,
      name: plan.name,
      description: plan.description,
      pricingSummary: readPricingSummary(plan.pricingSummary),
      ...(plan.id === recommendedPlanId ? { recommended: true } : {}),
      features: plan.features.map((feature) => ({ label: feature, included: true }))
    }));
}

async function buildPlansResponse(
  publisherPlanRepository: PublisherPlanRepository,
  currentPlanId: string | null
): Promise<PlansResponse> {
  const plans = await publisherPlanRepository.listAll();

  return {
    currentPlanId,
    availablePlans: buildPlanOptions(plans)
  };
}

function buildDashboard(
  req: ApiRequest,
  subscription: Subscription | null,
  options: { activeMembers?: number; plan?: { name: string; seatLimit: number | null } | null } = {}
): DashboardData {
  const user = buildPortalUser(req, subscription);

  if (!subscription) {
    return {
      user,
      subscription: null,
      usage: null,
      actions: []
    };
  }

  const state = mapPortalSubscriptionState(subscription.status);
  const seatsPurchased = subscription.seats;
  const planName = options.plan?.name ?? readString(subscription.metadata.planName) ?? subscription.planId;

  return {
    user,
    subscription: {
      tenantId: subscription.tenantId,
      state,
      planId: subscription.planId,
      planName,
      billingCycle: subscription.metadata.billingCycle === 'annual' ? 'annual' : 'monthly',
      renewalDate: formatRenewalDate(subscription, state),
      amount: readString(subscription.metadata.amount) ?? readString(subscription.metadata.priceMonthly) ?? '$0'
    },
    usage: {
      activeMembers: options.activeMembers ?? getFallbackActiveMembers(state, seatsPurchased),
      seatsPurchased,
      seatLimit: options.plan ? options.plan.seatLimit : seatsPurchased,
      apiRequestsThisMonth: state === 'canceled' ? 0 : seatsPurchased * 5200
    },
    actions: state === 'trialing' ? [] : defaultActions(state)
  };
}

export function createPortalRouter(
  config: ApiConfig,
  subscriptionService: SubscriptionService,
  publisherPlanRepository: PublisherPlanRepository,
  tenantMemberService?: TenantMemberService
) {
  const router = Router();

  router.use(
    authenticateRequest(config),
    requireScopes([config.auth.requiredScope]),
    injectTenantContext(config, tenantMemberService, { authorizationModel: 'customer' })
  );

  router.get('/dashboard', async (req: ApiRequest, res: Response<DashboardData>, next) => {
    try {
      const subscriptions = await subscriptionService.listSubscriptions(req.context!.tenantId);
      const subscription = getCurrentSubscription(subscriptions);
      const [plan, activeMembers] = subscription
        ? await Promise.all([
            publisherPlanRepository.findByMarketplacePlanId(subscription.planId),
            tenantMemberService?.listMembers(req.context!.tenantId).then((members) => members.length)
          ])
        : [null, undefined];

      res.status(200).json(
        buildDashboard(req, subscription, {
          plan: plan ? { name: plan.name, seatLimit: plan.seatLimit } : null,
          activeMembers
        })
      );
    } catch (error) {
      next(error);
    }
  });

  router.get('/settings', async (req: ApiRequest, res: Response<SettingsData>, next) => {
    try {
      const subscriptions = await subscriptionService.listSubscriptions(req.context!.tenantId);
      const subscription = getCurrentSubscription(subscriptions);

      res.status(200).json(buildSettings(req, subscription));
    } catch (error) {
      next(error);
    }
  });

  router.put('/settings', async (req: ApiRequest, res: Response<SettingsData>, next) => {
    try {
      const payload = parseSettingsBody(req.body);
      const subscriptions = await subscriptionService.listSubscriptions(req.context!.tenantId);
      const subscription = getCurrentSubscription(subscriptions);

      res.status(200).json(buildSettings(req, subscription, payload));
    } catch (error) {
      next(error);
    }
  });

  router.get('/plans', async (req: ApiRequest, res: Response<PlansResponse>, next) => {
    try {
      const subscriptions = await subscriptionService.listSubscriptions(req.context!.tenantId);
      const subscription = getCurrentSubscription(subscriptions);

      res.status(200).json(await buildPlansResponse(publisherPlanRepository, subscription?.planId ?? null));
    } catch (error) {
      next(error);
    }
  });

  router.post('/plans', async (req: ApiRequest, res: Response<PlansResponse>, next) => {
    try {
      const { planId } = parsePlanChangeBody(req.body);

      res.status(200).json(await buildPlansResponse(publisherPlanRepository, planId));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
