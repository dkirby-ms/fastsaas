import type { DashboardData, PortalAction, Subscription } from '@fastsaas/shared';
import { Router, type Response } from 'express';

import type { ApiConfig } from '../config';
import type { ApiRequest } from '../http';
import { authenticateRequest, requireScopes } from '../middleware/auth';
import { injectTenantContext } from '../middleware/tenant-context';
import type { PublisherPlanRepository } from '../repositories/publisher-plan-repository';
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

  return router;
}
