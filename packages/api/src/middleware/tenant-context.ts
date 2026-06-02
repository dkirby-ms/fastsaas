import type { NextFunction, Response } from 'express';

import type { ApiConfig } from '../config';
import { runWithTenantExecutionContext } from '../db/execution-context';
import { AppError } from '../errors/app-error';
import type { ApiRequest } from '../http';
import type { TenantMemberService } from '../services/tenant-member-service';
import { getRoles, getScopes, getUserId } from './auth';

export type AuthorizationModel = 'customer' | 'publisher';

export interface InjectTenantContextOptions {
  authorizationModel?: AuthorizationModel;
}

export function injectTenantContext(
  config: ApiConfig,
  tenantMemberService?: TenantMemberService,
  options: InjectTenantContextOptions = {}
) {
  const authorizationModel = options.authorizationModel ?? 'customer';

  return async function tenantContext(req: ApiRequest, _res: Response, next: NextFunction): Promise<void> {
    if (!req.auth) {
      next(AppError.unauthorized());
      return;
    }

    try {
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

      const jwtRoles = getRoles(req.auth);
      const member = authorizationModel === 'customer' && tenantMemberService
        ? await tenantMemberService.resolveMemberRole(tenantId, userId)
        : null;
      const roles =
        authorizationModel === 'publisher'
          ? jwtRoles
          : tenantMemberService
            ? member ? [member.role] : []
            : jwtRoles;
      const roleSource =
        authorizationModel === 'publisher'
          ? jwtRoles.length > 0 ? 'jwt' : 'none'
          : tenantMemberService
            ? member ? 'tenant_membership' : 'none'
            : jwtRoles.length > 0 ? 'jwt' : 'none';

      req.context = {
        requestId: String(req.id ?? 'unknown'),
        tenantId,
        userId,
        scopes: getScopes(req.auth),
        roles,
        jwtRoles,
        roleSource,
        memberId: member?.id
      };

      runWithTenantExecutionContext(tenantId, req.context.requestId, () => {
        next();
      });
    } catch (error) {
      next(error);
    }
  };
}
