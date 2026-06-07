import type { RequestHandler } from 'express';

import { AppError } from '../errors/app-error';
import type { ApiRequest } from '../http';
import type { PlanFeatureGateService } from '../services/plan-feature-gate-service';

export function createRequireFeature(planFeatureGateService: PlanFeatureGateService) {
  return function requireFeature(featureKey: string): RequestHandler {
    return async (req: ApiRequest, _res, next) => {
      if (!req.context) {
        next(AppError.unauthorized());
        return;
      }
      const { tenantId } = req.context;
      const allowed = await planFeatureGateService.hasFeature(tenantId, featureKey);
      if (!allowed) {
        next(
          AppError.forbidden('Your plan does not include this feature', {
            feature: featureKey,
            upgradeRequired: true
          })
        );
        return;
      }
      next();
    };
  };
}
