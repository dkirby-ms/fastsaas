import type { NextFunction, Response } from 'express';

import type { ApiConfig } from '../config';
import { AppError } from '../errors/app-error';
import type { ApiRequest } from '../http';
import { getRoles, getScopes, getUserId } from './auth';

export function injectTenantContext(config: ApiConfig) {
  return function tenantContext(req: ApiRequest, _res: Response, next: NextFunction): void {
    if (!req.auth) {
      next(AppError.unauthorized());
      return;
    }

    const userId = config.auth.userClaimKeys
      .map((key) => req.auth?.[key])
      .find((value): value is string => typeof value === 'string' && value.length > 0) ?? getUserId(req.auth);

    if (!userId) {
      next(AppError.unauthorized('Token subject claim is required'));
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
      userId,
      scopes: getScopes(req.auth),
      roles: getRoles(req.auth)
    };

    next();
  };
}
