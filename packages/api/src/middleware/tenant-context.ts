import type { NextFunction, Response } from 'express';

import type { ApiConfig } from '../config';
import type { ApiRequest } from '../http';
import { AppError } from '../errors/app-error';
import { getRoles, getScopes } from './auth';

export function injectTenantContext(config: ApiConfig) {
  return function tenantContext(req: ApiRequest, _res: Response, next: NextFunction): void {
    if (!req.auth || typeof req.auth.sub !== 'string') {
      next(AppError.unauthorized());
      return;
    }

    const tenantId = config.auth.tenantClaimKeys
      .map((key) => req.auth?.[key])
      .find((value): value is string => typeof value === 'string' && value.length > 0);

    if (!tenantId) {
      next(AppError.forbidden('Tenant context is missing from the access token'));
      return;
    }

    req.context = {
      requestId: String(req.id ?? 'unknown'),
      tenantId,
      userId: req.auth.sub,
      scopes: getScopes(req.auth),
      roles: getRoles(req.auth)
    };

    next();
  };
}
