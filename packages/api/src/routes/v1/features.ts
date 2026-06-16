import type { ApiResponse, FeatureEnabledResponse, PlanFeatureGatesResponse } from '@fastsaas/shared';
import { Router, type Response } from 'express';

import type { ApiConfig } from '../../config';
import { AppError } from '../../errors/app-error';
import type { ApiRequest } from '../../http';
import { buildResponseMeta } from '../../lib/response';
import { authenticateRequest, requireScopes } from '../../middleware/auth';
import { apiLimiter } from '../../middleware/rate-limit';
import { injectTenantContext } from '../../middleware/tenant-context';
import type { TenantMemberService } from '../../services/tenant-member-service';
import type { PlanFeatureGateService } from '../../services/plan-feature-gate-service';

function getFeatureKey(req: ApiRequest): string {
  const { featureKey } = req.params;
  if (typeof featureKey !== 'string' || featureKey.length === 0) {
    throw AppError.badRequest('featureKey path parameter is required');
  }

  return featureKey;
}

export function createFeaturesRouter(
  config: ApiConfig,
  planFeatureGateService: PlanFeatureGateService,
  tenantMemberService?: TenantMemberService
) {
  const router = Router();
  router.use(
    apiLimiter,
    authenticateRequest(config),
    requireScopes([config.auth.requiredScope]),
    injectTenantContext(config, tenantMemberService, { authorizationModel: 'customer' })
  );

  /**
   * @swagger
   * /v1/features:
   *   get:
   *     summary: List all enabled feature keys for the current tenant's active subscription plan
   *     description: Returns the set of feature keys enabled for the authenticated tenant's active subscription plan. Returns an empty array if the tenant has no active subscription.
   *     tags:
   *       - Features
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of enabled feature keys
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope
   */
  router.get('/', async (req: ApiRequest, res: Response<ApiResponse<PlanFeatureGatesResponse>>, next) => {
    try {
      if (!req.context) {
        throw AppError.unauthorized();
      }

      const features = await planFeatureGateService.listFeaturesForTenant(req.context.tenantId);
      res.status(200).json({ status: 'success', data: { features }, meta: buildResponseMeta(req, config.apiVersion) });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /v1/features/{featureKey}:
   *   get:
   *     summary: Check if the current tenant's plan has a feature enabled
   *     description: Returns whether the authenticated tenant's active subscription plan has the specified feature gate enabled.
   *     tags:
   *       - Features
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: featureKey
   *         required: true
   *         schema:
   *           type: string
   *         description: The feature key to check.
   *     responses:
   *       200:
   *         description: Feature enabled status
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing required scope
   */
  router.get('/:featureKey', async (req: ApiRequest, res: Response<ApiResponse<FeatureEnabledResponse>>, next) => {
    try {
      if (!req.context) {
        throw AppError.unauthorized();
      }

      const featureKey = getFeatureKey(req);
      const enabled = await planFeatureGateService.hasFeature(req.context.tenantId, featureKey);
      res.status(200).json({ status: 'success', data: { enabled }, meta: buildResponseMeta(req, config.apiVersion) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
