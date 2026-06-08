import type {
  ApiResponse,
  ListingAsset,
  MarketplacePlanSummary,
  ListingTrailer,
  PlanPricing,
  PreviewAudience,
  PrivateAudience,
  PublisherDashboardData,
  PublisherPlan,
  PublisherPlansResponse,
  PlanFeatureGatesResponse,
  PublisherTenantDetail,
  PublisherTenantStatus,
  PublisherTenantUpsertInput,
  PublisherTenantsResponse,
  SetFeatureGatesRequest,
  Subscription
} from '@fastsaas/shared';
import { Router, type Response } from 'express';

import type { ApiConfig } from '../../config';
import { AppError } from '../../errors/app-error';
import type { ApiRequest } from '../../http';
import { PRODUCT_INGESTION_SCHEMAS, type ProductIngestionResource, type ProductIngestionResourceTreeResponse } from '../../lib/product-ingestion-types';
import { buildResponseMeta } from '../../lib/response';
import { authenticateRequest, requireScopes } from '../../middleware/auth';
import { authorizeRoute } from '../../middleware/rbac';
import { injectTenantContext } from '../../middleware/tenant-context';
import type {
  JobPollingService,
  PublisherMarketplaceJobDetail,
  PublisherMarketplaceJobListResponse
} from '../../services/job-polling-service';
import type {
  ProductCatalogImportInput,
  ProductCatalogProduct,
  ProductCatalogProductDetail,
  ProductCatalogService
} from '../../services/product-catalog-service';
import type { TenantMemberService } from '../../services/tenant-member-service';
import type {
  PublisherProductSubmissionDiffResponse,
  PublisherProductSubmissionsResponse,
  SubmissionMonitoringService
} from '../../services/submission-monitoring-service';
import type { CreatePublisherPlanInput, PublisherActorContext, PublisherService } from '../../services/publisher-service';
import type { AssetVisibilityService } from '../../services/asset-visibility-service';
import type { PlanFeatureGateService, SetFeatureGateInput } from '../../services/plan-feature-gate-service';

function parsePlanBody(body: unknown): CreatePublisherPlanInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw AppError.badRequest('Request body must be a JSON object');
  }

  const candidate = body as Record<string, unknown>;
  const { id, name, description, status, features, marketplacePlanId, seatLimit } = candidate;

  if (id !== undefined && typeof id !== 'string') {
    throw AppError.badRequest('id must be a string when provided');
  }

  if (typeof name !== 'string') {
    throw AppError.badRequest('name is required');
  }

  if (typeof description !== 'string') {
    throw AppError.badRequest('description is required');
  }

  if (status !== 'active' && status !== 'archived') {
    throw AppError.badRequest('status must be active or archived');
  }

  if (features !== undefined && (!Array.isArray(features) || features.some((entry) => typeof entry !== 'string'))) {
    throw AppError.badRequest('features must be an array of strings when provided');
  }

  if (marketplacePlanId !== undefined && marketplacePlanId !== null && typeof marketplacePlanId !== 'string') {
    throw AppError.badRequest('marketplacePlanId must be a string or null when provided');
  }

  if (seatLimit !== undefined && seatLimit !== null && (!Number.isInteger(seatLimit) || Number(seatLimit) <= 0)) {
    throw AppError.badRequest('seatLimit must be a positive integer or null when provided');
  }

  return {
    id,
    name,
    description,
    status,
    features: features as string[] | undefined,
    ...(marketplacePlanId !== undefined ? { marketplacePlanId: marketplacePlanId as string | null } : {}),
    ...(seatLimit !== undefined ? { seatLimit: seatLimit as number | null } : {})
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

function parseSubmissionBody(body: unknown): { resources: ProductIngestionResource[] } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw AppError.badRequest('Request body must be a JSON object');
  }

  const candidate = body as Record<string, unknown>;
  const { resources } = candidate;
  if (!Array.isArray(resources) || resources.length === 0) {
    throw AppError.badRequest('resources must be a non-empty array');
  }

  if (resources.some((resource) => !resource || typeof resource !== 'object' || Array.isArray(resource))) {
    throw AppError.badRequest('Each resource must be a JSON object');
  }

  return {
    resources: resources as ProductIngestionResource[]
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

function parseIncludeArchivedQuery(req: ApiRequest): boolean {
  const { includeArchived } = req.query;

  if (includeArchived === undefined) {
    return false;
  }

  if (includeArchived === 'true') {
    return true;
  }

  if (includeArchived === 'false') {
    return false;
  }

  throw AppError.badRequest('includeArchived must be true or false when provided');
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

function getOfferId(req: ApiRequest): string {
  const { offerId } = req.params;
  if (typeof offerId !== 'string' || offerId.length === 0) {
    throw AppError.badRequest('offerId path parameter is required');
  }

  return offerId;
}

function getJobId(req: ApiRequest): string {
  const { jobId } = req.params;
  if (typeof jobId !== 'string' || jobId.length === 0) {
    throw AppError.badRequest('jobId path parameter is required');
  }

  return jobId;
}

function parseJobListQuery(req: ApiRequest): { page?: number; pageSize?: number } {
  const pageRaw = typeof req.query.page === 'string' ? Number(req.query.page) : undefined;
  const pageSizeRaw = typeof req.query.pageSize === 'string' ? Number(req.query.pageSize) : undefined;

  if (pageRaw !== undefined && (!Number.isInteger(pageRaw) || pageRaw <= 0)) {
    throw AppError.badRequest('page must be a positive integer when provided');
  }

  if (pageSizeRaw !== undefined && (!Number.isInteger(pageSizeRaw) || pageSizeRaw <= 0)) {
    throw AppError.badRequest('pageSize must be a positive integer when provided');
  }

  return {
    page: pageRaw,
    pageSize: pageSizeRaw
  };
}

function getTenantAction(req: ApiRequest): 'activate' | 'suspend' | 'cancel' {
  const { action } = req.params;
  if (action === 'activate' || action === 'suspend' || action === 'cancel') {
    return action;
  }

  throw AppError.badRequest('Publisher tenant action is not supported');
}

function getFeatureKey(req: ApiRequest): string {
  const { featureKey } = req.params;
  if (typeof featureKey !== 'string' || featureKey.length === 0) {
    throw AppError.badRequest('featureKey path parameter is required');
  }

  return featureKey;
}

function parseFeatureGatesBody(body: unknown): SetFeatureGateInput[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw AppError.badRequest('Request body must be a JSON object');
  }

  const candidate = body as Record<string, unknown>;
  const { gates } = candidate;

  if (!Array.isArray(gates)) {
    throw AppError.badRequest('gates must be an array');
  }

  return gates.map((gate, index) => {
    if (!gate || typeof gate !== 'object' || Array.isArray(gate)) {
      throw AppError.badRequest(`gates[${index}] must be an object`);
    }

    const g = gate as Record<string, unknown>;

    if (typeof g.featureKey !== 'string' || g.featureKey.length === 0) {
      throw AppError.badRequest(`gates[${index}].featureKey must be a non-empty string`);
    }

    if (typeof g.enabled !== 'boolean') {
      throw AppError.badRequest(`gates[${index}].enabled must be a boolean`);
    }

    return {
      featureKey: g.featureKey,
      enabled: g.enabled,
      ...(g.metadata !== undefined ? { metadata: g.metadata } : {})
    };
  });
}

export function createPublisherRouter(
  config: ApiConfig,
  publisherService: PublisherService,
  jobPollingService: JobPollingService,
  productCatalogService?: ProductCatalogService,
  submissionMonitoringService?: SubmissionMonitoringService,
  assetVisibilityService?: AssetVisibilityService,
  tenantMemberService?: TenantMemberService,
  planFeatureGateService?: PlanFeatureGateService
) {
  const router = Router();
  router.use(
    authenticateRequest(config),
    requireScopes([config.auth.requiredScope]),
    injectTenantContext(config, tenantMemberService, { authorizationModel: 'publisher' })
  );

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
   * /v1/publisher/jobs:
   *   get:
   *     summary: List Product Ingestion jobs
   *     description: Returns recent Product Ingestion configure jobs for the authenticated publisher tenant.
   *     tags:
   *       - Publisher
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           minimum: 1
   *       - in: query
   *         name: pageSize
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *     responses:
   *       200:
   *         description: Publisher Product Ingestion jobs
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or publisher view permission
   */
  router.get(
    '/jobs',
    authorizeRoute({ resource: 'publisher', action: 'view' }),
    async (req: ApiRequest, res: Response<ApiResponse<PublisherMarketplaceJobListResponse>>, next) => {
      try {
        const actor = buildActorContext(req);
        const jobs = await jobPollingService.listJobs(actor.tenantId, parseJobListQuery(req));
        res.status(200).json({ status: 'success', data: jobs, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /v1/publisher/jobs/{jobId}:
   *   get:
   *     summary: Get Product Ingestion job detail
   *     description: Returns Product Ingestion job detail, including resource-level validation errors.
   *     tags:
   *       - Publisher
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Product Ingestion job detail
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or publisher view permission
   *       404:
   *         description: Job not found
   */
  router.get(
    '/jobs/:jobId',
    authorizeRoute({ resource: 'publisher', action: 'view', resourceId: getJobId }),
    async (req: ApiRequest, res: Response<ApiResponse<PublisherMarketplaceJobDetail>>, next) => {
      try {
        const actor = buildActorContext(req);
        const job = await jobPollingService.getJob(actor.tenantId, getJobId(req));
        res.status(200).json({ status: 'success', data: job, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /v1/publisher/jobs/{jobId}/cancel:
   *   post:
   *     summary: Cancel a Product Ingestion job
   *     description: Attempts to cancel a running Product Ingestion configure job.
   *     tags:
   *       - Publisher
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Product Ingestion job cancellation requested
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or publisher management permission
   *       404:
   *         description: Job not found
   *       409:
   *         description: Job already completed
   */
  router.post(
    '/jobs/:jobId/cancel',
    authorizeRoute({ resource: 'publisher', action: 'manage', resourceId: getJobId }),
    async (req: ApiRequest, res: Response<ApiResponse<PublisherMarketplaceJobDetail>>, next) => {
      try {
        const actor = buildActorContext(req);
        const job = await jobPollingService.cancelJob(actor, getJobId(req));
        res.status(200).json({ status: 'success', data: job, meta: buildResponseMeta(req, config.apiVersion) });
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
   *     description: Returns active publisher plans by default. Set includeArchived=true to also include archived plans.
   *     tags:
   *       - Publisher
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: includeArchived
   *         required: false
   *         schema:
   *           type: boolean
   *         description: Include archived plans in the response.
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
        const plans = await publisherService.listPlans(actor.tenantId, {
          includeArchived: parseIncludeArchivedQuery(req)
        });
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
   *             required: [name, description, status]
   *             properties:
   *               id:
   *                 type: string
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *               status:
   *                 type: string
   *                 enum: [active, archived]
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
   *             required: [name, description, status]
   *             properties:
   *               id:
   *                 type: string
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *               status:
   *                 type: string
   *                 enum: [active, archived]
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
   * /v1/publisher/plans/{planId}/archive:
   *   patch:
   *     summary: Archive a publisher plan
   *     description: Marks a publisher plan as archived so it is hidden from default plan listings.
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
   *     responses:
   *       200:
   *         description: Publisher plan archived
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or publisher management permission
   *       404:
   *         description: Plan not found
   */
  router.patch(
    '/plans/:planId/archive',
    authorizeRoute({ resource: 'publisher', action: 'manage', resourceId: getPlanId }),
    async (req: ApiRequest, res: Response<ApiResponse<PublisherPlan>>, next) => {
      try {
        const actor = buildActorContext(req);
        const plan = await publisherService.archivePlan(actor, getPlanId(req));
        res.status(200).json({ status: 'success', data: plan, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /v1/publisher/plans/{planId}/unarchive:
   *   patch:
   *     summary: Unarchive a publisher plan
   *     description: Restores a publisher plan to active status so it appears in default plan listings.
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
   *     responses:
   *       200:
   *         description: Publisher plan unarchived
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope or publisher management permission
   *       404:
   *         description: Plan not found
   */
  router.patch(
    '/plans/:planId/unarchive',
    authorizeRoute({ resource: 'publisher', action: 'manage', resourceId: getPlanId }),
    async (req: ApiRequest, res: Response<ApiResponse<PublisherPlan>>, next) => {
      try {
        const actor = buildActorContext(req);
        const plan = await publisherService.unarchivePlan(actor, getPlanId(req));
        res.status(200).json({ status: 'success', data: plan, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    }
  );

  if (planFeatureGateService) {
    /**
     * @swagger
     * /v1/publisher/plans/{planId}/features:
     *   get:
     *     summary: List enabled features for a plan
     *     description: Returns the list of enabled feature keys for the specified publisher plan.
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
     *     responses:
     *       200:
     *         description: Enabled feature keys for the plan
     *       401:
     *         description: Missing or invalid bearer token
     *       403:
     *         description: Token missing required scope or publisher view permission
     */
    router.get(
      '/plans/:planId/features',
      authorizeRoute({ resource: 'publisher', action: 'view', resourceId: getPlanId }),
      async (req: ApiRequest, res: Response<ApiResponse<PlanFeatureGatesResponse>>, next) => {
        try {
          const actor = buildActorContext(req);
          const features = await planFeatureGateService.listFeatures(getPlanId(req), actor.tenantId);
          res.status(200).json({ status: 'success', data: { features }, meta: buildResponseMeta(req, config.apiVersion) });
        } catch (error) {
          next(error);
        }
      }
    );

    /**
     * @swagger
     * /v1/publisher/plans/{planId}/features:
     *   put:
     *     summary: Bulk set feature gates for a plan
     *     description: Upserts feature gate entries for the specified publisher plan.
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
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [gates]
     *             properties:
     *               gates:
     *                 type: array
     *                 items:
     *                   type: object
     *                   required: [featureKey, enabled]
     *                   properties:
     *                     featureKey:
     *                       type: string
     *                     enabled:
     *                       type: boolean
     *                     metadata:
     *                       type: object
     *     responses:
     *       204:
     *         description: Feature gates updated
     *       400:
     *         description: Request body is invalid
     *       401:
     *         description: Missing or invalid bearer token
     *       403:
     *         description: Token missing required scope or publisher management permission
     */
    router.put(
      '/plans/:planId/features',
      authorizeRoute({ resource: 'publisher', action: 'manage', resourceId: getPlanId }),
      async (req: ApiRequest, res: Response<ApiResponse<never>>, next) => {
        try {
          const actor = buildActorContext(req);
          const gates = parseFeatureGatesBody(req.body);
          await planFeatureGateService.setFeatureGates(actor.tenantId, getPlanId(req), gates);
          res.status(204).send();
        } catch (error) {
          next(error);
        }
      }
    );

    /**
     * @swagger
     * /v1/publisher/plans/{planId}/features/{featureKey}:
     *   delete:
     *     summary: Remove a feature gate from a plan
     *     description: Deletes a single feature gate entry for the specified publisher plan.
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
     *       - in: path
     *         name: featureKey
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       204:
     *         description: Feature gate removed
     *       401:
     *         description: Missing or invalid bearer token
     *       403:
     *         description: Token missing required scope or publisher management permission
     */
    router.delete(
      '/plans/:planId/features/:featureKey',
      authorizeRoute({ resource: 'publisher', action: 'manage', resourceId: getPlanId }),
      async (req: ApiRequest, res: Response<ApiResponse<never>>, next) => {
        try {
          const actor = buildActorContext(req);
          const featureKey = getFeatureKey(req);
          await planFeatureGateService.removeFeatureGate(actor.tenantId, getPlanId(req), featureKey);
          res.status(204).send();
        } catch (error) {
          next(error);
        }
      }
    );
  }

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

  if (productCatalogService && submissionMonitoringService && assetVisibilityService) {
    const listProducts = async (req: ApiRequest, res: Response<ApiResponse<ProductCatalogProduct[]>>, next: (error?: unknown) => void) => {
      try {
        const actor = buildActorContext(req);
        const products = await productCatalogService.listProducts(actor.tenantId);
        res.status(200).json({ status: 'success', data: products, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    };

    const listMarketplacePlans = async (
      req: ApiRequest,
      res: Response<ApiResponse<MarketplacePlanSummary[]>>,
      next: (error?: unknown) => void
    ) => {
      try {
        const actor = buildActorContext(req);
        const plans = await productCatalogService.listMarketplacePlans(actor.tenantId);
        res.status(200).json({ status: 'success', data: plans, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    };

    const importProduct = async (req: ApiRequest, res: Response<ApiResponse<ProductCatalogProductDetail>>, next: (error?: unknown) => void) => {
      try {
        const actor = buildActorContext(req);
        const product = await productCatalogService.importProduct(actor, parseProductImportBody(req.body));
        res.status(201).json({ status: 'success', data: product, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    };

    const getProduct = async (req: ApiRequest, res: Response<ApiResponse<ProductCatalogProductDetail>>, next: (error?: unknown) => void) => {
      try {
        const actor = buildActorContext(req);
        const product = await productCatalogService.getProduct(actor.tenantId, getProductId(req));
        res.status(200).json({ status: 'success', data: product, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    };

    const getOffer = async (req: ApiRequest, res: Response<ApiResponse<ProductCatalogProductDetail>>, next: (error?: unknown) => void) => {
      try {
        const actor = buildActorContext(req);
        const product = await productCatalogService.getProduct(actor.tenantId, getOfferId(req));
        res.status(200).json({ status: 'success', data: product, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    };

    const getProductResourceTree = async (
      req: ApiRequest,
      res: Response<ApiResponse<ProductIngestionResourceTreeResponse<ProductIngestionResource>>>,
      next: (error?: unknown) => void
    ) => {
      try {
        const actor = buildActorContext(req);
        const resourceTree = await productCatalogService.getResourceTree(actor.tenantId, getProductId(req));
        res.status(200).json({ status: 'success', data: resourceTree, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    };

    const getOfferResourceTree = async (
      req: ApiRequest,
      res: Response<ApiResponse<ProductIngestionResourceTreeResponse<ProductIngestionResource>>>,
      next: (error?: unknown) => void
    ) => {
      try {
        const actor = buildActorContext(req);
        const resourceTree = await productCatalogService.getResourceTree(actor.tenantId, getOfferId(req));
        res.status(200).json({ status: 'success', data: resourceTree, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    };

    const syncProduct = async (req: ApiRequest, res: Response<ApiResponse<ProductCatalogProductDetail>>, next: (error?: unknown) => void) => {
      try {
        const actor = buildActorContext(req);
        const product = await productCatalogService.syncProduct(actor, getProductId(req));
        res.status(200).json({ status: 'success', data: product, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    };

    const syncOffer = async (req: ApiRequest, res: Response<ApiResponse<ProductCatalogProductDetail>>, next: (error?: unknown) => void) => {
      try {
        const actor = buildActorContext(req);
        const product = await productCatalogService.syncProduct(actor, getOfferId(req));
        res.status(200).json({ status: 'success', data: product, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    };

    const listProductSubmissions = async (
      req: ApiRequest,
      res: Response<ApiResponse<PublisherProductSubmissionsResponse>>,
      next: (error?: unknown) => void
    ) => {
      try {
        const actor = buildActorContext(req);
        const submissions = await submissionMonitoringService.getProductSubmissions(actor.tenantId, getProductId(req));
        res.status(200).json({ status: 'success', data: submissions, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    };

    const getProductDiff = async (
      req: ApiRequest,
      res: Response<ApiResponse<PublisherProductSubmissionDiffResponse>>,
      next: (error?: unknown) => void
    ) => {
      try {
        const actor = buildActorContext(req);
        const diff = await submissionMonitoringService.getProductDiff(actor.tenantId, getProductId(req));
        res.status(200).json({ status: 'success', data: diff, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    };

    const getProductAssets = async (
      req: ApiRequest,
      res: Response<ApiResponse<{ assets: ListingAsset[]; trailers: ListingTrailer[] }>>,
      next: (error?: unknown) => void
    ) => {
      try {
        const actor = buildActorContext(req);
        const [assets, trailers] = await Promise.all([
          assetVisibilityService.getListingAssets(actor.tenantId, getProductId(req)),
          assetVisibilityService.getListingTrailers(actor.tenantId, getProductId(req))
        ]);
        res.status(200).json({ status: 'success', data: { assets, trailers }, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    };

    const getProductAudiences = async (
      req: ApiRequest,
      res: Response<ApiResponse<{ preview: PreviewAudience[]; private: PrivateAudience[] }>>,
      next: (error?: unknown) => void
    ) => {
      try {
        const actor = buildActorContext(req);
        const audiences = await assetVisibilityService.getAudiences(actor.tenantId, getProductId(req));
        res.status(200).json({ status: 'success', data: audiences, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    };

    const getProductPlanPricing = async (
      req: ApiRequest,
      res: Response<ApiResponse<PlanPricing>>,
      next: (error?: unknown) => void
    ) => {
      try {
        const actor = buildActorContext(req);
        const pricing = await assetVisibilityService.getPlanPricing(actor.tenantId, getProductId(req), getPlanId(req));
        res.status(200).json({ status: 'success', data: pricing, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    };

    const submitOfferSubmission = async (
      req: ApiRequest,
      res: Response<ApiResponse<PublisherMarketplaceJobDetail>>,
      next: (error?: unknown) => void
    ) => {
      try {
        const actor = buildActorContext(req);
        const submission = parseSubmissionBody(req.body);
        const job = await jobPollingService.submitConfigureJob(actor, {
          productId: getOfferId(req),
          request: {
            $schema: PRODUCT_INGESTION_SCHEMAS.configure,
            resources: submission.resources
          }
        });
        res.status(201).json({ status: 'success', data: job, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    };

    const listOfferSubmissions = async (
      req: ApiRequest,
      res: Response<ApiResponse<PublisherMarketplaceJobListResponse>>,
      next: (error?: unknown) => void
    ) => {
      try {
        const actor = buildActorContext(req);
        const jobs = await jobPollingService.listJobs(actor.tenantId, { ...parseJobListQuery(req), productId: getOfferId(req) });
        res.status(200).json({ status: 'success', data: jobs, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    };

    const getOfferSubmission = async (
      req: ApiRequest,
      res: Response<ApiResponse<PublisherMarketplaceJobDetail>>,
      next: (error?: unknown) => void
    ) => {
      try {
        const actor = buildActorContext(req);
        const job = await jobPollingService.getJob(actor.tenantId, getJobId(req), getOfferId(req));
        res.status(200).json({ status: 'success', data: job, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    };

    const cancelOfferSubmission = async (
      req: ApiRequest,
      res: Response<ApiResponse<PublisherMarketplaceJobDetail>>,
      next: (error?: unknown) => void
    ) => {
      try {
        const actor = buildActorContext(req);
        const job = await jobPollingService.cancelJob(actor, getJobId(req), getOfferId(req));
        res.status(200).json({ status: 'success', data: job, meta: buildResponseMeta(req, config.apiVersion) });
      } catch (error) {
        next(error);
      }
    };

    router.get('/marketplace-plans', authorizeRoute({ resource: 'publisher', action: 'view' }), listMarketplacePlans);
    router.get('/products', authorizeRoute({ resource: 'publisher', action: 'view' }), listProducts);
    router.get('/offers', authorizeRoute({ resource: 'publisher', action: 'view' }), listProducts);

    router.post('/products/import', authorizeRoute({ resource: 'publisher', action: 'manage' }), importProduct);
    router.post('/offers/import', authorizeRoute({ resource: 'publisher', action: 'manage' }), importProduct);

    router.get('/products/:productId', authorizeRoute({ resource: 'publisher', action: 'view', resourceId: getProductId }), getProduct);
    router.get('/offers/:offerId', authorizeRoute({ resource: 'publisher', action: 'view', resourceId: getOfferId }), getOffer);

    router.get(
      '/products/:productId/resource-tree',
      authorizeRoute({ resource: 'publisher', action: 'view', resourceId: getProductId }),
      getProductResourceTree
    );
    router.get(
      '/products/:productId/assets',
      authorizeRoute({ resource: 'publisher', action: 'view', resourceId: getProductId }),
      getProductAssets
    );
    router.get(
      '/products/:productId/audiences',
      authorizeRoute({ resource: 'publisher', action: 'view', resourceId: getProductId }),
      getProductAudiences
    );
    router.get(
      '/products/:productId/plans/:planId/pricing',
      authorizeRoute({ resource: 'publisher', action: 'view', resourceId: getProductId }),
      getProductPlanPricing
    );
    router.get(
      '/offers/:offerId/resource-tree',
      authorizeRoute({ resource: 'publisher', action: 'view', resourceId: getOfferId }),
      getOfferResourceTree
    );

    /**
     * @swagger
     * /v1/publisher/products/{productId}/submissions:
     *   get:
     *     summary: Get submission status by environment
     *     description: Returns draft, preview, and live submission state, validation issues, and submission history for a marketplace product.
     *     tags:
     *       - Publisher
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: productId
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: Submission monitoring summary
     *       401:
     *         description: Missing or invalid bearer token
     *       403:
     *         description: Token missing required scope or publisher view permission
     *       404:
     *         description: Product not found
     */
    router.get(
      '/products/:productId/submissions',
      authorizeRoute({ resource: 'publisher', action: 'view', resourceId: getProductId }),
      listProductSubmissions
    );
    /**
     * @swagger
     * /v1/publisher/products/{productId}/diff:
     *   get:
     *     summary: Compare draft and live product state
     *     description: Returns a resource-level diff between the draft and live Product Ingestion resource trees for a marketplace product.
     *     tags:
     *       - Publisher
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: productId
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: Draft versus live diff
     *       401:
     *         description: Missing or invalid bearer token
     *       403:
     *         description: Token missing required scope or publisher view permission
     *       404:
     *         description: Product not found
     */
    router.get(
      '/products/:productId/diff',
      authorizeRoute({ resource: 'publisher', action: 'view', resourceId: getProductId }),
      getProductDiff
    );

    router.post(
      '/products/:productId/sync',
      authorizeRoute({ resource: 'publisher', action: 'manage', resourceId: getProductId }),
      syncProduct
    );
    router.post('/offers/:offerId/sync', authorizeRoute({ resource: 'publisher', action: 'manage', resourceId: getOfferId }), syncOffer);

    router.post(
      '/offers/:offerId/submissions',
      authorizeRoute({ resource: 'publisher', action: 'manage', resourceId: getOfferId }),
      submitOfferSubmission
    );
    router.get(
      '/offers/:offerId/submissions',
      authorizeRoute({ resource: 'publisher', action: 'view', resourceId: getOfferId }),
      listOfferSubmissions
    );
    router.get(
      '/offers/:offerId/submissions/:jobId',
      authorizeRoute({ resource: 'publisher', action: 'view', resourceId: getOfferId }),
      getOfferSubmission
    );
    router.post(
      '/offers/:offerId/submissions/:jobId/cancel',
      authorizeRoute({ resource: 'publisher', action: 'manage', resourceId: getOfferId }),
      cancelOfferSubmission
    );
  }

  return router;
}
