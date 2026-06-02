import type {
  ApiResponse,
  PartnerCenterConnectRequest,
  PartnerCenterConnection,
  PartnerCenterDisconnectResponse,
  PartnerCenterStatusResponse,
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
import type { ProductIngestionResource, ProductIngestionResourceTreeResponse } from '../../lib/product-ingestion-types';
import { buildResponseMeta } from '../../lib/response';
import { authenticateRequest, requireScopes } from '../../middleware/auth';
import { authorizeRoute } from '../../middleware/rbac';
import { injectTenantContext } from '../../middleware/tenant-context';
import type { PartnerCenterService } from '../../services/partner-center-service';
import type {
  ProductCatalogImportInput,
  ProductCatalogProduct,
  ProductCatalogProductDetail,
  ProductCatalogService
} from '../../services/product-catalog-service';
import type { TenantMemberService } from '../../services/tenant-member-service';
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

function parsePartnerCenterConnectBody(body: unknown): PartnerCenterConnectRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw AppError.badRequest('Request body must be a JSON object');
  }

  const candidate = body as Record<string, unknown>;

  if (typeof candidate.pcTenantId !== 'string') {
    throw AppError.badRequest('pcTenantId is required');
  }

  if (typeof candidate.clientId !== 'string') {
    throw AppError.badRequest('clientId is required');
  }

  if (candidate.authMode !== 'CLIENT_SECRET' && candidate.authMode !== 'CLIENT_CERTIFICATE') {
    throw AppError.badRequest('authMode must be CLIENT_SECRET or CLIENT_CERTIFICATE');
  }

  if (typeof candidate.secretReference !== 'string') {
    throw AppError.badRequest('secretReference is required');
  }

  if (
    candidate.rotationMetadata !== undefined &&
    (!candidate.rotationMetadata || typeof candidate.rotationMetadata !== 'object' || Array.isArray(candidate.rotationMetadata))
  ) {
    throw AppError.badRequest('rotationMetadata must be a JSON object when provided');
  }

  if (candidate.expiresAt !== undefined && typeof candidate.expiresAt !== 'string') {
    throw AppError.badRequest('expiresAt must be a string when provided');
  }

  return {
    pcTenantId: candidate.pcTenantId,
    clientId: candidate.clientId,
    authMode: candidate.authMode,
    secretReference: candidate.secretReference,
    rotationMetadata: candidate.rotationMetadata as Record<string, unknown> | undefined,
    expiresAt: candidate.expiresAt
  };
}

function parseProductImportBody(body: unknown): ProductCatalogImportInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw AppError.badRequest('Request body must be a JSON object');
  }

  const candidate = body as Record<string, unknown>;
  if (typeof candidate.externalId !== 'string') {
    throw AppError.badRequest('externalId is required');
  }

  return {
    externalId: candidate.externalId
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

function getProductId(req: ApiRequest): string {
  const { productId } = req.params;
  if (typeof productId !== 'string' || productId.length === 0) {
    throw AppError.badRequest('productId path parameter is required');
  }

  return productId;
}

function getTenantAction(req: ApiRequest): 'activate' | 'suspend' | 'cancel' {
  const { action } = req.params;
  if (action === 'activate' || action === 'suspend' || action === 'cancel') {
    return action;
  }

  throw AppError.badRequest('Publisher tenant action is not supported');
}

export function createPublisherRouter(
  config: ApiConfig,
  publisherService: PublisherService,
  partnerCenterService: PartnerCenterService,
  productCatalogService?: ProductCatalogService,
  tenantMemberService?: TenantMemberService
) {
  const router = Router();
  router.use(authenticateRequest(config), requireScopes([config.auth.requiredScope]), injectTenantContext(config, tenantMemberService));

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
   * /v1/publisher/partner-center/connect:
   *   post:
   *     summary: Connect a Partner Center account
   *     description: Stores tenant-scoped Partner Center app metadata and validates the configured Azure Key Vault or local development secret reference against the Partner Center Product Ingestion API.
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
   *             required: [pcTenantId, clientId, authMode, secretReference]
   *             properties:
   *               pcTenantId:
   *                 type: string
   *               clientId:
   *                 type: string
   *               authMode:
   *                 type: string
   *                 enum: [CLIENT_SECRET, CLIENT_CERTIFICATE]
   *               secretReference:
   *                 type: string
   *                 description: Azure Key Vault secret URI or keyvault:SECRET_NAME in deployed environments; env:VARIABLE_NAME is supported for local/test flows.
   *               rotationMetadata:
   *                 type: object
   *               expiresAt:
   *                 type: string
   *                 format: date-time
   *     responses:
   *       200:
   *         description: Partner Center connection validated
   *       400:
   *         description: Request body is invalid or credentials cannot be validated
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or publisher management permission
   *       503:
   *         description: Partner Center validation or secret resolution is unavailable
   */
  router.post(
    '/partner-center/connect',
    authorizeRoute({ resource: 'publisher', action: 'manage' }),
    async (req: ApiRequest, res: Response<ApiResponse<PartnerCenterConnection>>, next) => {
      try {
        const actor = buildActorContext(req);
        const connection = await partnerCenterService.connect(actor, parsePartnerCenterConnectBody(req.body));
        res.status(200).json({ status: 'success', data: connection, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /v1/publisher/partner-center/status:
   *   get:
   *     summary: Get Partner Center connection status
   *     description: Returns the current tenant-scoped Partner Center connection state and last validation timestamp.
   *     tags:
   *       - Publisher
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Partner Center connection status
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or publisher view permission
   */
  router.get(
    '/partner-center/status',
    authorizeRoute({ resource: 'publisher', action: 'view' }),
    async (req: ApiRequest, res: Response<ApiResponse<PartnerCenterStatusResponse>>, next) => {
      try {
        const actor = buildActorContext(req);
        const status = await partnerCenterService.getStatus(actor.tenantId);
        res.status(200).json({ status: 'success', data: status, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /v1/publisher/partner-center/disconnect:
   *   delete:
   *     summary: Remove the Partner Center connection
   *     description: Deletes the tenant-scoped Partner Center account and credential metadata.
   *     tags:
   *       - Publisher
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Partner Center connection removed
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or publisher management permission
   */
  router.delete(
    '/partner-center/disconnect',
    authorizeRoute({ resource: 'publisher', action: 'manage' }),
    async (req: ApiRequest, res: Response<ApiResponse<PartnerCenterDisconnectResponse>>, next) => {
      try {
        const actor = buildActorContext(req);
        const result = await partnerCenterService.disconnect(actor);
        res.status(200).json({ status: 'success', data: result, meta: buildResponseMeta(req, config.apiVersion) });
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

  if (productCatalogService) {
    router.get(
      '/products',
      authorizeRoute({ resource: 'publisher', action: 'view' }),
      async (req: ApiRequest, res: Response<ApiResponse<ProductCatalogProduct[]>>, next) => {
        try {
          const actor = buildActorContext(req);
          const products = await productCatalogService.listProducts(actor.tenantId);
          res.status(200).json({ status: 'success', data: products, meta: buildResponseMeta(req, config.apiVersion) });
        } catch (error) {
          next(error);
        }
      }
    );

    router.post(
      '/products/import',
      authorizeRoute({ resource: 'publisher', action: 'manage' }),
      async (req: ApiRequest, res: Response<ApiResponse<ProductCatalogProductDetail>>, next) => {
        try {
          const actor = buildActorContext(req);
          const product = await productCatalogService.importProduct(actor, parseProductImportBody(req.body));
          res.status(201).json({ status: 'success', data: product, meta: buildResponseMeta(req, config.apiVersion) });
        } catch (error) {
          next(error);
        }
      }
    );

    router.get(
      '/products/:productId',
      authorizeRoute({ resource: 'publisher', action: 'view', resourceId: getProductId }),
      async (req: ApiRequest, res: Response<ApiResponse<ProductCatalogProductDetail>>, next) => {
        try {
          const actor = buildActorContext(req);
          const product = await productCatalogService.getProduct(actor.tenantId, getProductId(req));
          res.status(200).json({ status: 'success', data: product, meta: buildResponseMeta(req, config.apiVersion) });
        } catch (error) {
          next(error);
        }
      }
    );

    router.get(
      '/products/:productId/resource-tree',
      authorizeRoute({ resource: 'publisher', action: 'view', resourceId: getProductId }),
      async (req: ApiRequest, res: Response<ApiResponse<ProductIngestionResourceTreeResponse<ProductIngestionResource>>>, next) => {
        try {
          const actor = buildActorContext(req);
          const resourceTree = await productCatalogService.getResourceTree(actor.tenantId, getProductId(req));
          res.status(200).json({ status: 'success', data: resourceTree, meta: buildResponseMeta(req, config.apiVersion) });
        } catch (error) {
          next(error);
        }
      }
    );

    router.post(
      '/products/:productId/sync',
      authorizeRoute({ resource: 'publisher', action: 'manage', resourceId: getProductId }),
      async (req: ApiRequest, res: Response<ApiResponse<ProductCatalogProductDetail>>, next) => {
        try {
          const actor = buildActorContext(req);
          const product = await productCatalogService.syncProduct(actor, getProductId(req));
          res.status(200).json({ status: 'success', data: product, meta: buildResponseMeta(req, config.apiVersion) });
        } catch (error) {
          next(error);
        }
      }
    );
  }

  return router;
}
