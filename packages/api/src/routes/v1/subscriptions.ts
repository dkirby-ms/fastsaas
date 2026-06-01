import type { ApiResponse, CreateSubscriptionRequest, Subscription } from '@fastsaas/shared';
import { Router, type Response } from 'express';

import type { ApiConfig } from '../../config';
import { AppError } from '../../errors/app-error';
import type { ApiRequest } from '../../http';
import { buildResponseMeta } from '../../lib/response';
import { authenticateRequest, requireScopes } from '../../middleware/auth';
import { authorizeRoute } from '../../middleware/rbac';
import { injectTenantContext } from '../../middleware/tenant-context';
import type { SubscriptionService } from '../../services/subscription-service';

function parseCreateSubscriptionBody(body: unknown): CreateSubscriptionRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw AppError.badRequest('Request body must be a JSON object');
  }

  const candidate = body as Record<string, unknown>;
  if (typeof candidate.marketplaceToken !== 'string' || candidate.marketplaceToken.length === 0) {
    throw AppError.badRequest('marketplaceToken is required');
  }

  if (candidate.planId !== undefined && typeof candidate.planId !== 'string') {
    throw AppError.badRequest('planId must be a string when provided');
  }

  if (candidate.seats !== undefined && (!Number.isInteger(candidate.seats) || Number(candidate.seats) <= 0)) {
    throw AppError.badRequest('seats must be a positive integer when provided');
  }

  if (candidate.metadata !== undefined && (!candidate.metadata || typeof candidate.metadata !== 'object' || Array.isArray(candidate.metadata))) {
    throw AppError.badRequest('metadata must be an object when provided');
  }

  return {
    marketplaceToken: candidate.marketplaceToken,
    planId: typeof candidate.planId === 'string' ? candidate.planId : undefined,
    seats: typeof candidate.seats === 'number' ? candidate.seats : undefined,
    metadata: candidate.metadata as Record<string, unknown> | undefined
  };
}

function buildActorContext(req: ApiRequest) {
  if (!req.context) {
    throw AppError.unauthorized();
  }

  return {
    tenantId: req.context.tenantId,
    userId: req.context.userId,
    requestId: req.context.requestId,
    correlationId: req.correlationId ?? req.context.requestId,
    source: 'api' as const
  };
}

function getSubscriptionId(req: ApiRequest): string {
  return Array.isArray(req.params.subscriptionId) ? req.params.subscriptionId[0] ?? '' : req.params.subscriptionId;
}

export function createSubscriptionsRouter(config: ApiConfig, subscriptionService: SubscriptionService) {
  const router = Router();

  router.use(authenticateRequest(config), injectTenantContext(config), requireScopes([config.auth.requiredScope]));

  router.get(
    '/',
    authorizeRoute({ resource: 'subscriptions', action: 'view' }),
    async (req: ApiRequest, res: Response<ApiResponse<Subscription[]>>, next) => {
      try {
        const actor = buildActorContext(req);
        const subscriptions = await subscriptionService.listSubscriptions(actor.tenantId);
        res.status(200).json({
          status: 'success',
          data: subscriptions,
          meta: buildResponseMeta(req, config.apiVersion)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    '/:subscriptionId',
    authorizeRoute({ resource: 'subscriptions', action: 'view', resourceId: getSubscriptionId }),
    async (req: ApiRequest, res: Response<ApiResponse<Subscription>>, next) => {
      try {
        const actor = buildActorContext(req);
        const subscription = await subscriptionService.getSubscriptionForTenant(getSubscriptionId(req), actor.tenantId);
        res.status(200).json({
          status: 'success',
          data: subscription,
          meta: buildResponseMeta(req, config.apiVersion)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/',
    authorizeRoute({
      resource: 'subscriptions',
      action: 'manage',
      resourceId: (req) => (typeof req.body?.marketplaceToken === 'string' ? req.body.marketplaceToken : undefined),
      metadata: (req) => ({ planId: typeof req.body?.planId === 'string' ? req.body.planId : undefined })
    }),
    async (req: ApiRequest, res: Response<ApiResponse<Subscription>>, next) => {
      try {
        const actor = buildActorContext(req);
        const body = parseCreateSubscriptionBody(req.body);
        const subscription = await subscriptionService.subscribe({
          ...actor,
          marketplaceToken: body.marketplaceToken,
          planId: body.planId,
          seats: body.seats,
          metadata: body.metadata
        });

        res.status(201).json({
          status: 'success',
          data: subscription,
          meta: buildResponseMeta(req, config.apiVersion)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/:subscriptionId/activate',
    authorizeRoute({ resource: 'subscriptions', action: 'manage', resourceId: getSubscriptionId }),
    async (req: ApiRequest, res: Response<ApiResponse<Subscription>>, next) => {
      try {
        const actor = buildActorContext(req);
        const subscription = await subscriptionService.activateSubscription({
          subscriptionId: getSubscriptionId(req),
          tenantId: actor.tenantId,
          requestId: actor.requestId,
          correlationId: actor.correlationId,
          source: actor.source
        });

        res.status(200).json({
          status: 'success',
          data: subscription,
          meta: buildResponseMeta(req, config.apiVersion)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/:subscriptionId/suspend',
    authorizeRoute({ resource: 'subscriptions', action: 'manage', resourceId: getSubscriptionId }),
    async (req: ApiRequest, res: Response<ApiResponse<Subscription>>, next) => {
      try {
        const actor = buildActorContext(req);
        const subscription = await subscriptionService.suspendSubscription({
          subscriptionId: getSubscriptionId(req),
          tenantId: actor.tenantId,
          requestId: actor.requestId,
          correlationId: actor.correlationId,
          source: actor.source
        });

        res.status(200).json({
          status: 'success',
          data: subscription,
          meta: buildResponseMeta(req, config.apiVersion)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.delete(
    '/:subscriptionId',
    authorizeRoute({ resource: 'subscriptions', action: 'manage', resourceId: getSubscriptionId }),
    async (req: ApiRequest, res: Response<ApiResponse<Subscription>>, next) => {
      try {
        const actor = buildActorContext(req);
        const subscription = await subscriptionService.unsubscribeSubscription({
          subscriptionId: getSubscriptionId(req),
          tenantId: actor.tenantId,
          requestId: actor.requestId,
          correlationId: actor.correlationId,
          source: actor.source
        });

        res.status(200).json({
          status: 'success',
          data: subscription,
          meta: buildResponseMeta(req, config.apiVersion)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
