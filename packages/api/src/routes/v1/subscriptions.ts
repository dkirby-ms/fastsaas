import type { ApiResponse, CreateSubscriptionRequest, Subscription } from '@fastsaas/shared';
import { Router, type Response } from 'express';

import type { ApiConfig } from '../../config';
import { AppError } from '../../errors/app-error';
import type { ApiRequest } from '../../http';
import { buildResponseMeta } from '../../lib/response';
import { authenticateRequest, getRoles, requireScopes } from '../../middleware/auth';
import { authorizeRoute, isRequestRoleAllowed } from '../../middleware/rbac';
import { injectTenantContext } from '../../middleware/tenant-context';
import type { TenantMemberService } from '../../services/tenant-member-service';
import type { SubscriptionService } from '../../services/subscription-service';

function parseCreateSubscriptionBody(body: unknown): CreateSubscriptionRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw AppError.badRequest('Request body must be a JSON object');
  }

  const candidate = body as Record<string, unknown>;
  if (typeof candidate.marketplaceToken !== 'string' || candidate.marketplaceToken.length === 0) {
    throw AppError.badRequest('marketplaceToken is required');
  }

  if (
    candidate.metadata !== undefined &&
    (!candidate.metadata || typeof candidate.metadata !== 'object' || Array.isArray(candidate.metadata))
  ) {
    throw AppError.badRequest('metadata must be an object when provided');
  }

  return {
    marketplaceToken: candidate.marketplaceToken,
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
    source: 'api' as const,
    userEmail: typeof req.auth?.email === 'string' ? req.auth.email : undefined
  };
}

function getSubscriptionId(req: ApiRequest): string {
  const { subscriptionId } = req.params;

  if (typeof subscriptionId !== 'string' || subscriptionId.length === 0) {
    throw AppError.badRequest('subscriptionId path parameter is required');
  }

  return subscriptionId;
}

function setLifecycleAuditContext(req: ApiRequest, subscriptionId: string): void {
  req.audit = {
    action: 'manage',
    resource: 'subscriptions',
    resourceId: subscriptionId
  };
}

function assertLifecycleAccess(req: ApiRequest): void {
  const tokenRoles = req.context?.roles ?? getRoles(req.auth);

  if (isRequestRoleAllowed(req, ['Admin', 'Owner'], ['Admin', 'Owner'])) {
    return;
  }

  throw AppError.forbidden('The access token does not grant the required role', {
    requiredRoles: ['Admin', 'Owner'],
    tokenRoles,
    roleSource: req.context?.roleSource ?? 'none'
  });
}

export function createSubscriptionsRouter(config: ApiConfig, subscriptionService: SubscriptionService, tenantMemberService?: TenantMemberService) {
  const router = Router();

  router.use(
    authenticateRequest(config),
    requireScopes([config.auth.requiredScope]),
    injectTenantContext(config, tenantMemberService, { authorizationModel: 'customer' })
  );

  /**
   * @swagger
   * /v1/subscriptions:
   *   get:
   *     summary: List subscriptions for the authenticated tenant
   *     description: Returns the marketplace subscriptions that belong to the tenant resolved from the bearer token.
   *     tags:
   *       - Subscriptions
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Tenant subscription list
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               required: [status, data, meta]
   *               properties:
   *                 status:
   *                   type: string
   *                   enum: [success]
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                     required:
   *                       - id
   *                       - tenantId
   *                       - marketplaceSubscriptionId
   *                       - planId
   *                       - seats
   *                       - status
   *                       - correlationId
   *                       - metadata
   *                       - createdAt
   *                       - updatedAt
   *                       - auditLog
   *                     properties:
   *                       id:
   *                         type: string
   *                       tenantId:
   *                         type: string
   *                       marketplaceSubscriptionId:
   *                         type: string
   *                       planId:
   *                         type: string
   *                       seats:
   *                         type: integer
   *                         minimum: 1
   *                       status:
   *                         type: string
   *                         enum: [PendingActivation, Active, Suspended, Unsubscribed]
   *                       offerId:
   *                         type: string
   *                       purchaserTenantId:
   *                         type: string
   *                       beneficiaryTenantId:
   *                         type: string
   *                       correlationId:
   *                         type: string
   *                       metadata:
   *                         type: object
   *                         additionalProperties: true
   *                       createdAt:
   *                         type: string
   *                         format: date-time
   *                       updatedAt:
   *                         type: string
   *                         format: date-time
   *                       auditLog:
   *                         type: array
   *                         items:
   *                           type: object
   *                           required:
   *                             - id
   *                             - subscriptionId
   *                             - eventType
   *                             - source
   *                             - toStatus
   *                             - correlationId
   *                             - requestId
   *                             - details
   *                             - createdAt
   *                           properties:
   *                             id:
   *                               type: string
   *                             subscriptionId:
   *                               type: string
   *                             eventType:
   *                               type: string
   *                             source:
   *                               type: string
   *                             fromStatus:
   *                               type: string
   *                               nullable: true
   *                               enum: [PendingActivation, Active, Suspended, Unsubscribed, null]
   *                             toStatus:
   *                               type: string
   *                               enum: [PendingActivation, Active, Suspended, Unsubscribed]
   *                             correlationId:
   *                               type: string
   *                             requestId:
   *                               type: string
   *                             details:
   *                               type: object
   *                               additionalProperties: true
   *                             createdAt:
   *                               type: string
   *                               format: date-time
   *                 meta:
   *                   type: object
   *                   required: [requestId, timestamp, version]
   *                   properties:
   *                     requestId:
   *                       type: string
   *                     correlationId:
   *                       type: string
   *                     timestamp:
   *                       type: string
   *                       format: date-time
   *                     version:
   *                       type: string
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or tenant view permission
   */
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

  /**
   * @swagger
   * /v1/subscriptions/{subscriptionId}:
   *   get:
   *     summary: Get a subscription for the authenticated tenant
   *     description: Returns one subscription when the authenticated tenant owns it.
   *     tags:
   *       - Subscriptions
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: subscriptionId
   *         required: true
   *         schema:
   *           type: string
   *         description: Internal FastSaaS subscription identifier.
   *     responses:
   *       200:
   *         description: Subscription detail
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               required: [status, data, meta]
   *               properties:
   *                 status:
   *                   type: string
   *                   enum: [success]
   *                 data:
   *                   type: object
   *                   required:
   *                     - id
   *                     - tenantId
   *                     - marketplaceSubscriptionId
   *                     - planId
   *                     - seats
   *                     - status
   *                     - correlationId
   *                     - metadata
   *                     - createdAt
   *                     - updatedAt
   *                     - auditLog
   *                   properties:
   *                     id:
   *                       type: string
   *                     tenantId:
   *                       type: string
   *                     marketplaceSubscriptionId:
   *                       type: string
   *                     planId:
   *                       type: string
   *                     seats:
   *                       type: integer
   *                       minimum: 1
   *                     status:
   *                       type: string
   *                       enum: [PendingActivation, Active, Suspended, Unsubscribed]
   *                     offerId:
   *                       type: string
   *                     purchaserTenantId:
   *                       type: string
   *                     beneficiaryTenantId:
   *                       type: string
   *                     correlationId:
   *                       type: string
   *                     metadata:
   *                       type: object
   *                       additionalProperties: true
   *                     createdAt:
   *                       type: string
   *                       format: date-time
   *                     updatedAt:
   *                       type: string
   *                       format: date-time
   *                     auditLog:
   *                       type: array
   *                       items:
   *                         type: object
   *                         required:
   *                           - id
   *                           - subscriptionId
   *                           - eventType
   *                           - source
   *                           - toStatus
   *                           - correlationId
   *                           - requestId
   *                           - details
   *                           - createdAt
   *                         properties:
   *                           id:
   *                             type: string
   *                           subscriptionId:
   *                             type: string
   *                           eventType:
   *                             type: string
   *                           source:
   *                             type: string
   *                           fromStatus:
   *                             type: string
   *                             nullable: true
   *                             enum: [PendingActivation, Active, Suspended, Unsubscribed, null]
   *                           toStatus:
   *                             type: string
   *                             enum: [PendingActivation, Active, Suspended, Unsubscribed]
   *                           correlationId:
   *                             type: string
   *                           requestId:
   *                             type: string
   *                           details:
   *                             type: object
   *                             additionalProperties: true
   *                           createdAt:
   *                             type: string
   *                             format: date-time
   *                 meta:
   *                   type: object
   *                   required: [requestId, timestamp, version]
   *                   properties:
   *                     requestId:
   *                       type: string
   *                     correlationId:
   *                       type: string
   *                     timestamp:
   *                       type: string
   *                       format: date-time
   *                     version:
   *                       type: string
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or tenant view permission
   *       404:
   *         description: Subscription not found for the authenticated tenant
   */
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

  /**
   * @swagger
   * /v1/subscriptions:
   *   post:
   *     summary: Create a marketplace-backed subscription
   *     description: Resolves a marketplace purchase token, creates the tenant subscription, and stores the initial PendingActivation record.
   *     tags:
   *       - Subscriptions
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - marketplaceToken
   *             properties:
   *               marketplaceToken:
   *                 type: string
   *               metadata:
   *                 type: object
   *                 additionalProperties: true
   *     responses:
   *       201:
   *         description: Subscription created in pending activation state
   *       400:
   *         description: Request body is invalid
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or tenant management permission
   *       409:
   *         description: A subscription already exists for the marketplace purchase or the requested state conflicts
   *       503:
   *         description: Marketplace fulfillment dependency is unavailable
   */
  router.post(
    '/',
    authorizeRoute({
      resource: 'subscriptions',
      action: 'manage'
    }),
    async (req: ApiRequest, res: Response<ApiResponse<Subscription>>, next) => {
      try {
        const actor = buildActorContext(req);
        const body = parseCreateSubscriptionBody(req.body);
        const subscription = await subscriptionService.subscribe({
          ...actor,
          marketplaceToken: body.marketplaceToken,
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

  /**
   * @swagger
   * /v1/subscriptions/{subscriptionId}/activate:
   *   post:
   *     summary: Activate a subscription
   *     description: Activates a tenant-owned subscription. Only Admin and Owner roles may perform the lifecycle transition.
   *     tags:
   *       - Subscriptions
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: subscriptionId
   *         required: true
   *         schema:
   *           type: string
   *         description: Internal FastSaaS subscription identifier.
   *     responses:
   *       200:
   *         description: Subscription activated
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or lifecycle role permissions
   *       404:
   *         description: Subscription not found for the authenticated tenant
   *       409:
   *         description: Subscription cannot transition to Active from its current status
   *       503:
   *         description: Marketplace fulfillment dependency is unavailable
   */
  router.post('/:subscriptionId/activate', async (req: ApiRequest, res: Response<ApiResponse<Subscription>>, next) => {
    try {
      const actor = buildActorContext(req);
      const subscriptionId = getSubscriptionId(req);
      setLifecycleAuditContext(req, subscriptionId);
      await subscriptionService.getSubscriptionForTenant(subscriptionId, actor.tenantId);
      assertLifecycleAccess(req);
      const subscription = await subscriptionService.activateSubscription({
        subscriptionId,
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
  });

  /**
   * @swagger
   * /v1/subscriptions/{subscriptionId}/suspend:
   *   post:
   *     summary: Suspend a subscription
   *     description: Suspends a tenant-owned subscription. Only Admin and Owner roles may perform the lifecycle transition.
   *     tags:
   *       - Subscriptions
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: subscriptionId
   *         required: true
   *         schema:
   *           type: string
   *         description: Internal FastSaaS subscription identifier.
   *     responses:
   *       200:
   *         description: Subscription suspended
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or lifecycle role permissions
   *       404:
   *         description: Subscription not found for the authenticated tenant
   *       409:
   *         description: Subscription cannot transition to Suspended from its current status
   *       503:
   *         description: Marketplace fulfillment dependency is unavailable
   */
  router.post('/:subscriptionId/suspend', async (req: ApiRequest, res: Response<ApiResponse<Subscription>>, next) => {
    try {
      const actor = buildActorContext(req);
      const subscriptionId = getSubscriptionId(req);
      setLifecycleAuditContext(req, subscriptionId);
      await subscriptionService.getSubscriptionForTenant(subscriptionId, actor.tenantId);
      assertLifecycleAccess(req);
      const subscription = await subscriptionService.suspendSubscription({
        subscriptionId,
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
  });

  /**
   * @swagger
   * /v1/subscriptions/{subscriptionId}:
   *   delete:
   *     summary: Unsubscribe a tenant subscription
   *     description: Unsubscribes a tenant-owned subscription. Only Admin and Owner roles may perform the lifecycle transition.
   *     tags:
   *       - Subscriptions
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: subscriptionId
   *         required: true
   *         schema:
   *           type: string
   *         description: Internal FastSaaS subscription identifier.
   *     responses:
   *       200:
   *         description: Subscription unsubscribed
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or lifecycle role permissions
   *       404:
   *         description: Subscription not found for the authenticated tenant
   *       409:
   *         description: Subscription cannot transition to Unsubscribed from its current status
   *       503:
   *         description: Marketplace fulfillment dependency is unavailable
   */
  router.delete('/:subscriptionId', async (req: ApiRequest, res: Response<ApiResponse<Subscription>>, next) => {
    try {
      const actor = buildActorContext(req);
      const subscriptionId = getSubscriptionId(req);
      setLifecycleAuditContext(req, subscriptionId);
      await subscriptionService.getSubscriptionForTenant(subscriptionId, actor.tenantId);
      assertLifecycleAccess(req);
      const subscription = await subscriptionService.unsubscribeSubscription({
        subscriptionId,
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
  });

  return router;
}
