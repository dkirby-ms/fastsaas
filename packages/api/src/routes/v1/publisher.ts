import type {
  ApiResponse,
  PublisherDashboardData,
  PublisherPlan,
  PublisherPlansResponse,
  PublisherTenantDetail,
  PublisherTenantStatus,
  PublisherTenantUpsertInput,
  PublisherTenantsResponse,
  Subscription
} from '@fastsaas/shared';
import { Router, type Response } from 'express';

import type { ApiConfig } from '../../config';
import { AppError } from '../../errors/app-error';
import type { ApiRequest } from '../../http';
import { buildResponseMeta } from '../../lib/response';
import { authenticateRequest, requireScopes } from '../../middleware/auth';
import { authorizeRoute } from '../../middleware/rbac';
import { injectTenantContext } from '../../middleware/tenant-context';
import type { CreatePublisherPlanInput, PublisherActorContext, PublisherService } from '../../services/publisher-service';

function parsePlanBody(body: unknown): CreatePublisherPlanInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw AppError.badRequest('Request body must be a JSON object');
  }

  const candidate = body as Record<string, unknown>;
  const { id, name, description, priceMonthly, status, features } = candidate;

  if (id !== undefined && typeof id !== 'string') {
    throw AppError.badRequest('id must be a string when provided');
  }

  if (typeof name !== 'string') {
    throw AppError.badRequest('name is required');
  }

  if (typeof description !== 'string') {
    throw AppError.badRequest('description is required');
  }

  if (typeof priceMonthly !== 'string') {
    throw AppError.badRequest('priceMonthly is required');
  }

  if (status !== 'active' && status !== 'draft') {
    throw AppError.badRequest('status must be active or draft');
  }

  if (features !== undefined && (!Array.isArray(features) || features.some((entry) => typeof entry !== 'string'))) {
    throw AppError.badRequest('features must be an array of strings when provided');
  }

  return {
    id,
    name,
    description,
    priceMonthly,
    status,
    features: features as string[] | undefined
  };
}

function parseTenantBody(body: unknown): PublisherTenantUpsertInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw AppError.badRequest('Request body must be a JSON object');
  }

  const candidate = body as Record<string, unknown>;
  const validStatuses: PublisherTenantStatus[] = ['active', 'trialing', 'past_due', 'suspended', 'canceled'];

  if (typeof candidate.displayName !== 'string') {
    throw AppError.badRequest('displayName is required');
  }

  if (typeof candidate.primaryDomain !== 'string') {
    throw AppError.badRequest('primaryDomain is required');
  }

  if (typeof candidate.planId !== 'string') {
    throw AppError.badRequest('planId is required');
  }

  if (!Number.isInteger(candidate.seats) || Number(candidate.seats) <= 0) {
    throw AppError.badRequest('seats must be a positive integer');
  }

  if (!validStatuses.includes(candidate.status as PublisherTenantStatus)) {
    throw AppError.badRequest('status must be active, trialing, past_due, suspended, or canceled');
  }

  return {
    displayName: candidate.displayName,
    primaryDomain: candidate.primaryDomain,
    planId: candidate.planId,
    seats: Number(candidate.seats),
    status: candidate.status as PublisherTenantStatus
  };
}

function buildActorContext(req: ApiRequest): PublisherActorContext {
  if (!req.context) {
    throw AppError.unauthorized();
  }

  return {
    tenantId: req.context.tenantId,
    userId: req.context.userId,
    requestId: req.context.requestId,
    correlationId: req.correlationId ?? req.context.requestId
  };
}

function getPlanId(req: ApiRequest): string {
  const { planId } = req.params;
  if (typeof planId !== 'string' || planId.length === 0) {
    throw AppError.badRequest('planId path parameter is required');
  }

  return planId;
}

function getTenantId(req: ApiRequest): string {
  const { tenantId } = req.params;
  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    throw AppError.badRequest('tenantId path parameter is required');
  }

  return tenantId;
}

function getTenantAction(req: ApiRequest): 'activate' | 'suspend' | 'cancel' {
  const { action } = req.params;
  if (action === 'activate' || action === 'suspend' || action === 'cancel') {
    return action;
  }

  throw AppError.badRequest('Publisher tenant action is not supported');
}

export function createPublisherRouter(config: ApiConfig, publisherService: PublisherService) {
  const router = Router();
  router.use(authenticateRequest(config), requireScopes([config.auth.requiredScope]), injectTenantContext(config));

  /**
   * @swagger
   * /v1/publisher/dashboard:
   *   get:
   *     summary: Get publisher dashboard metrics
   *     description: Returns aggregate subscription, revenue, churn risk, and plan mix metrics for the authenticated publisher tenant.
   *     tags:
   *       - Publisher
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Publisher dashboard metrics
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or publisher view permission
   */
  router.get(
    '/dashboard',
    authorizeRoute({ resource: 'publisher', action: 'view' }),
    async (req: ApiRequest, res: Response<ApiResponse<PublisherDashboardData>>, next) => {
      try {
        const actor = buildActorContext(req);
        const dashboard = await publisherService.getDashboard(actor.tenantId);
        res.status(200).json({ status: 'success', data: dashboard, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /v1/publisher/plans:
   *   get:
   *     summary: List publisher plans
   *     description: Returns the publisher plan catalog, including built-in defaults and saved plan overrides.
   *     tags:
   *       - Publisher
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Publisher plan catalog
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or publisher view permission
   */
  router.get(
    '/plans',
    authorizeRoute({ resource: 'publisher', action: 'view' }),
    async (req: ApiRequest, res: Response<ApiResponse<PublisherPlansResponse>>, next) => {
      try {
        const actor = buildActorContext(req);
        const plans = await publisherService.listPlans(actor.tenantId);
        res.status(200).json({ status: 'success', data: plans, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /v1/publisher/plans:
   *   post:
   *     summary: Create a publisher plan
   *     description: Creates a publisher plan definition for the authenticated publisher tenant.
   *     tags:
   *       - Publisher
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, description, priceMonthly, status]
   *             properties:
   *               id:
   *                 type: string
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *               priceMonthly:
   *                 type: string
   *               status:
   *                 type: string
   *                 enum: [active, draft]
   *               features:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       201:
   *         description: Publisher plan created
   *       400:
   *         description: Request body is invalid
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or publisher management permission
   *       409:
   *         description: A plan with the derived identifier already exists
   */
  router.post(
    '/plans',
    authorizeRoute({ resource: 'publisher', action: 'manage' }),
    async (req: ApiRequest, res: Response<ApiResponse<PublisherPlan>>, next) => {
      try {
        const actor = buildActorContext(req);
        const plan = await publisherService.createPlan(actor, parsePlanBody(req.body));
        res.status(201).json({ status: 'success', data: plan, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /v1/publisher/plans/{planId}:
   *   put:
   *     summary: Update a publisher plan
   *     description: Updates a publisher plan definition and returns the refreshed plan catalog.
   *     tags:
   *       - Publisher
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: planId
   *         required: true
   *         schema:
   *           type: string
   *         description: Publisher plan identifier.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, description, priceMonthly, status]
   *             properties:
   *               id:
   *                 type: string
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *               priceMonthly:
   *                 type: string
   *               status:
   *                 type: string
   *                 enum: [active, draft]
   *               features:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: Publisher plan catalog updated
   *       400:
   *         description: Request body is invalid
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or publisher management permission
   *       404:
   *         description: Plan not found
   */
  router.put(
    '/plans/:planId',
    authorizeRoute({ resource: 'publisher', action: 'manage', resourceId: getPlanId }),
    async (req: ApiRequest, res: Response<ApiResponse<PublisherPlansResponse>>, next) => {
      try {
        const actor = buildActorContext(req);
        const plans = await publisherService.updatePlan(actor, getPlanId(req), parsePlanBody(req.body));
        res.status(200).json({ status: 'success', data: plans, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /v1/publisher/subscriptions:
   *   get:
   *     summary: List publisher-visible subscriptions
   *     description: Returns subscriptions visible to the publisher tenant for operational reporting.
   *     tags:
   *       - Publisher
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Publisher subscription list
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or publisher view permission
   */
  router.get(
    '/subscriptions',
    authorizeRoute({ resource: 'publisher', action: 'view' }),
    async (req: ApiRequest, res: Response<ApiResponse<Subscription[]>>, next) => {
      try {
        const actor = buildActorContext(req);
        const subscriptions = await publisherService.listSubscriptions(actor.tenantId);
        res.status(200).json({ status: 'success', data: subscriptions, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /v1/publisher/tenants:
   *   get:
   *     summary: List managed publisher tenants
   *     description: Returns summarized tenant records derived from the publisher-managed subscription catalog.
   *     tags:
   *       - Publisher
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Publisher tenant summaries
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or publisher view permission
   */
  router.get(
    '/tenants',
    authorizeRoute({ resource: 'publisher', action: 'view' }),
    async (req: ApiRequest, res: Response<ApiResponse<PublisherTenantsResponse>>, next) => {
      try {
        const actor = buildActorContext(req);
        const tenants = await publisherService.listTenants(actor.tenantId);
        res.status(200).json({ status: 'success', data: tenants, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /v1/publisher/tenants:
   *   post:
   *     summary: Create a managed tenant subscription
   *     description: Creates a managed tenant record backed by a publisher-owned subscription.
   *     tags:
   *       - Publisher
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [displayName, primaryDomain, planId, seats, status]
   *             properties:
   *               displayName:
   *                 type: string
   *               primaryDomain:
   *                 type: string
   *               planId:
   *                 type: string
   *               seats:
   *                 type: integer
   *                 minimum: 1
   *               status:
   *                 type: string
   *                 enum: [active, trialing, past_due, suspended, canceled]
   *     responses:
   *       201:
   *         description: Publisher tenant created
   *       400:
   *         description: Request body is invalid
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or publisher management permission
   *       404:
   *         description: Referenced plan not found
   */
  router.post(
    '/tenants',
    authorizeRoute({ resource: 'publisher', action: 'manage' }),
    async (req: ApiRequest, res: Response<ApiResponse<PublisherTenantDetail>>, next) => {
      try {
        const actor = buildActorContext(req);
        const tenant = await publisherService.createTenant(actor, parseTenantBody(req.body));
        res.status(201).json({ status: 'success', data: tenant, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /v1/publisher/tenants/{tenantId}:
   *   get:
   *     summary: Get publisher tenant detail
   *     description: Returns a detailed managed tenant view including usage and audit history.
   *     tags:
   *       - Publisher
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: tenantId
   *         required: true
   *         schema:
   *           type: string
   *         description: Managed tenant identifier or associated subscription id.
   *     responses:
   *       200:
   *         description: Publisher tenant detail
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or publisher view permission
   *       404:
   *         description: Tenant not found
   */
  router.get(
    '/tenants/:tenantId',
    authorizeRoute({ resource: 'publisher', action: 'view', resourceId: getTenantId }),
    async (req: ApiRequest, res: Response<ApiResponse<PublisherTenantDetail>>, next) => {
      try {
        const actor = buildActorContext(req);
        const tenant = await publisherService.getTenant(actor.tenantId, getTenantId(req));
        res.status(200).json({ status: 'success', data: tenant, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /v1/publisher/tenants/{tenantId}:
   *   put:
   *     summary: Update publisher tenant settings
   *     description: Updates the managed tenant's plan, commercial, and status metadata.
   *     tags:
   *       - Publisher
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: tenantId
   *         required: true
   *         schema:
   *           type: string
   *         description: Managed tenant identifier or associated subscription id.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [displayName, primaryDomain, planId, seats, status]
   *             properties:
   *               displayName:
   *                 type: string
   *               primaryDomain:
   *                 type: string
   *               planId:
   *                 type: string
   *               seats:
   *                 type: integer
   *                 minimum: 1
   *               status:
   *                 type: string
   *                 enum: [active, trialing, past_due, suspended, canceled]
   *     responses:
   *       200:
   *         description: Publisher tenant updated
   *       400:
   *         description: Request body is invalid
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or publisher management permission
   *       404:
   *         description: Tenant or plan not found
   */
  router.put(
    '/tenants/:tenantId',
    authorizeRoute({ resource: 'publisher', action: 'manage', resourceId: getTenantId }),
    async (req: ApiRequest, res: Response<ApiResponse<PublisherTenantDetail>>, next) => {
      try {
        const actor = buildActorContext(req);
        const tenant = await publisherService.updateTenant(actor, getTenantId(req), parseTenantBody(req.body));
        res.status(200).json({ status: 'success', data: tenant, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /v1/publisher/tenants/{tenantId}/{action}:
   *   post:
   *     summary: Transition publisher tenant lifecycle state
   *     description: Applies activate, suspend, or cancel lifecycle actions to a managed tenant subscription.
   *     tags:
   *       - Publisher
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: tenantId
   *         required: true
   *         schema:
   *           type: string
   *         description: Managed tenant identifier or associated subscription id.
   *       - in: path
   *         name: action
   *         required: true
   *         schema:
   *           type: string
   *           enum: [activate, suspend, cancel]
   *         description: Lifecycle action to apply to the managed tenant.
   *     responses:
   *       200:
   *         description: Publisher tenant transitioned
   *       400:
   *         description: Tenant action is not supported
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or publisher management permission
   *       404:
   *         description: Tenant not found
   *       409:
   *         description: Tenant subscription cannot transition to the requested status
   */
  router.post(
    '/tenants/:tenantId/:action',
    authorizeRoute({ resource: 'publisher', action: 'manage', resourceId: getTenantId }),
    async (req: ApiRequest, res: Response<ApiResponse<PublisherTenantDetail>>, next) => {
      try {
        const actor = buildActorContext(req);
        const tenant = await publisherService.transitionTenant(actor, getTenantId(req), getTenantAction(req));
        res.status(200).json({ status: 'success', data: tenant, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
