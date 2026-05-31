import type { RequestHandler } from 'express';

import { AppError } from '../errors/app-error';
import type { ApiRequest } from '../http';
import type { RequestAuditContext } from '../services/audit-service';

export const RBAC_ROLES = ['publisher_admin', 'publisher_user', 'customer_admin', 'customer_user'] as const;
export const RBAC_RESOURCES = ['subscriptions', 'plans', 'tenants', 'metering', 'users'] as const;
export const RBAC_ACTIONS = ['create', 'read', 'update', 'delete', 'manage'] as const;

export type RbacRole = (typeof RBAC_ROLES)[number];
export type RbacResource = (typeof RBAC_RESOURCES)[number];
export type RbacAction = (typeof RBAC_ACTIONS)[number];

type PermissionMatrix = Record<RbacRole, Record<RbacResource, readonly RbacAction[]>>;

export const PERMISSIONS_MATRIX: PermissionMatrix = {
  publisher_admin: {
    subscriptions: ['create', 'read', 'update', 'delete', 'manage'],
    plans: ['create', 'read', 'update', 'delete', 'manage'],
    tenants: ['create', 'read', 'update', 'delete', 'manage'],
    metering: ['create', 'read', 'update', 'delete', 'manage'],
    users: ['create', 'read', 'update', 'delete', 'manage']
  },
  publisher_user: {
    subscriptions: ['create', 'read', 'update', 'manage'],
    plans: ['read'],
    tenants: ['read'],
    metering: ['read', 'manage'],
    users: ['read']
  },
  customer_admin: {
    subscriptions: ['read', 'manage'],
    plans: ['read'],
    tenants: ['read', 'update'],
    metering: ['read', 'create'],
    users: ['create', 'read', 'update', 'delete', 'manage']
  },
  customer_user: {
    subscriptions: ['read'],
    plans: ['read'],
    tenants: ['read'],
    metering: ['read'],
    users: ['read', 'update']
  }
};

const RBAC_ROLE_SET = new Set<string>(RBAC_ROLES);

export interface AuthorizeRouteOptions {
  resource: RbacResource;
  action: RbacAction;
  resourceId?: (req: ApiRequest) => string | undefined;
  metadata?: (req: ApiRequest) => Record<string, unknown>;
}

export function isRbacRole(role: string): role is RbacRole {
  return RBAC_ROLE_SET.has(role);
}

export function getGrantedActions(role: RbacRole, resource: RbacResource): readonly RbacAction[] {
  return PERMISSIONS_MATRIX[role][resource];
}

export function isActionAllowed(roles: readonly string[], resource: RbacResource, action: RbacAction): boolean {
  return roles.filter(isRbacRole).some((role) => getGrantedActions(role, resource).includes(action));
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

    if (isActionAllowed(req.context.roles, options.resource, options.action)) {
      next();
      return;
    }

    next(
      AppError.forbidden('You do not have permission to perform this action', {
        resource: options.resource,
        action: options.action,
        roles: req.context.roles.filter(isRbacRole)
      })
    );
  };
}
