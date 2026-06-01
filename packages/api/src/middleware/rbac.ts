import type { RequestHandler } from 'express';

import { AppError } from '../errors/app-error';
import type { ApiRequest } from '../http';
import type { RequestAuditContext } from '../services/audit-service';

export const RBAC_ROLES = ['admin', 'owner', 'member', 'viewer'] as const;
export const RBAC_PERMISSIONS = [
  'auth:read',
  'subscriptions:read',
  'subscriptions:manage',
  'billing:manage',
  'users:manage',
  'metering:read',
  'metering:manage',
  'metering:export',
  'audit_logs:read',
  'webhooks:manage'
] as const;
export const RBAC_RESOURCES = ['auth', 'subscriptions', 'billing', 'users', 'metering', 'audit_logs', 'webhooks'] as const;
export const RBAC_ACTIONS = ['read', 'manage', 'export'] as const;

export type RbacRole = (typeof RBAC_ROLES)[number];
export type RbacPermission = (typeof RBAC_PERMISSIONS)[number];
export type RbacResource = (typeof RBAC_RESOURCES)[number];
export type RbacAction = (typeof RBAC_ACTIONS)[number];

type PermissionMatrix = Record<RbacRole, readonly RbacPermission[]>;

export const PERMISSIONS_MATRIX: PermissionMatrix = {
  admin: RBAC_PERMISSIONS,
  owner: RBAC_PERMISSIONS,
  member: ['auth:read', 'subscriptions:read', 'metering:read', 'metering:manage'],
  viewer: ['auth:read', 'subscriptions:read', 'metering:read']
};

const RBAC_ROLE_SET = new Set<string>(RBAC_ROLES);

export interface AuthorizeRouteOptions {
  permission: RbacPermission;
  resource: RbacResource;
  action: RbacAction;
  resourceId?: (req: ApiRequest) => string | undefined;
  metadata?: (req: ApiRequest) => Record<string, unknown>;
}

export function isRbacRole(role: string): role is RbacRole {
  return RBAC_ROLE_SET.has(role);
}

export function getGrantedPermissions(role: RbacRole): readonly RbacPermission[] {
  return PERMISSIONS_MATRIX[role];
}

export function isPermissionAllowed(roles: readonly string[], permission: RbacPermission): boolean {
  return roles.filter(isRbacRole).some((role) => getGrantedPermissions(role).includes(permission));
}

function buildAuditContext(req: ApiRequest, options: AuthorizeRouteOptions): RequestAuditContext {
  return {
    action: options.action,
    resource: options.resource,
    resourceId: options.resourceId?.(req),
    metadata: options.metadata?.(req)
  };
}

export function authorizeRoute(options: AuthorizeRouteOptions): RequestHandler {
  return (req, _res, next) => {
    if (!req.context) {
      next(AppError.unauthorized());
      return;
    }

    req.audit = buildAuditContext(req, options);

    if (isPermissionAllowed(req.context.roles, options.permission)) {
      next();
      return;
    }

    next(
      AppError.forbidden('You do not have permission to perform this action', {
        permission: options.permission,
        roles: req.context.roles.filter(isRbacRole)
      })
    );
  };
}
