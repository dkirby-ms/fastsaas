import type { RequestHandler } from 'express';

import { AppError } from '../errors/app-error';
import type { ApiRequest } from '../http';
import type { RequestAuditContext } from '../services/audit-service';

export const RBAC_ROLES = ['Admin', 'Owner', 'Operator', 'Member', 'Viewer'] as const;
export const RBAC_RESOURCES = ['subscriptions', 'billing', 'users', 'metering', 'audit_logs', 'webhooks', 'operator'] as const;
export const RBAC_ACTIONS = ['view', 'write', 'manage', 'export'] as const;

export type RbacRole = (typeof RBAC_ROLES)[number];
export type RbacResource = (typeof RBAC_RESOURCES)[number];
export type RbacAction = (typeof RBAC_ACTIONS)[number];
export type RbacPermission = `${RbacResource}:${RbacAction}`;

export interface RbacPermissionDescriptor {
  label: string;
  resource: RbacResource;
  action: RbacAction;
}

export const RBAC_PERMISSION_DESCRIPTORS: readonly RbacPermissionDescriptor[] = [
  { label: 'View subscriptions', resource: 'subscriptions', action: 'view' },
  { label: 'Change plan or quantity', resource: 'subscriptions', action: 'manage' },
  { label: 'Manage billing settings', resource: 'billing', action: 'manage' },
  { label: 'View tenant members', resource: 'users', action: 'view' },
  { label: 'Invite or remove users', resource: 'users', action: 'manage' },
  { label: 'View metering analytics', resource: 'metering', action: 'view' },
  { label: 'Submit metering usage', resource: 'metering', action: 'write' },
  { label: 'Export usage and billing CSV', resource: 'billing', action: 'export' },
  { label: 'View audit logs (tenant-scoped)', resource: 'audit_logs', action: 'view' },
  { label: 'Configure webhooks', resource: 'webhooks', action: 'manage' },
  { label: 'View operator administration data', resource: 'operator', action: 'view' },
  { label: 'Manage operator administration data', resource: 'operator', action: 'manage' }
] as const;

type PermissionMatrix = Record<RbacRole, readonly RbacPermission[]>;

export function toPermission(resource: RbacResource, action: RbacAction): RbacPermission {
  return `${resource}:${action}`;
}

export const PERMISSIONS_MATRIX: PermissionMatrix = {
  Admin: RBAC_PERMISSION_DESCRIPTORS.map(({ resource, action }) => toPermission(resource, action)),
  Owner: RBAC_PERMISSION_DESCRIPTORS.map(({ resource, action }) => toPermission(resource, action)),
  Operator: RBAC_PERMISSION_DESCRIPTORS.filter(({ resource }) => resource === 'operator').map(({ resource, action }) => toPermission(resource, action)),
  Member: [toPermission('subscriptions', 'view'), toPermission('users', 'view'), toPermission('metering', 'view')],
  Viewer: [toPermission('subscriptions', 'view'), toPermission('users', 'view'), toPermission('metering', 'view')]
};

const RBAC_ROLE_SET = new Set<string>(RBAC_ROLES);
const RBAC_ROLE_LOOKUP = new Map<string, RbacRole>(RBAC_ROLES.map((role) => [role.toLowerCase(), role]));

export interface AuthorizeRouteOptions {
  resource: RbacResource;
  action: RbacAction;
  resourceId?: (req: ApiRequest) => string | undefined;
  metadata?: (req: ApiRequest) => Record<string, unknown>;
}

export function normalizeRbacRole(role: string): RbacRole | null {
  return RBAC_ROLE_LOOKUP.get(role.trim().toLowerCase()) ?? null;
}

export function isRbacRole(role: string): role is RbacRole {
  return RBAC_ROLE_SET.has(role) || normalizeRbacRole(role) !== null;
}

export function getGrantedPermissions(role: RbacRole): readonly RbacPermission[] {
  return PERMISSIONS_MATRIX[role];
}

export function getEffectiveRequestRoles(req: Pick<ApiRequest, 'context'>): readonly string[] {
  return req.context?.roles ?? [];
}

export function getNormalizedRequestRoles(req: Pick<ApiRequest, 'context'>): RbacRole[] {
  return getEffectiveRequestRoles(req)
    .map((role) => normalizeRbacRole(role))
    .filter((role): role is RbacRole => role !== null);
}

export function isActionAllowed(roles: readonly string[], resource: RbacResource, action: RbacAction): boolean {
  const permission = toPermission(resource, action);
  return roles
    .map((role) => normalizeRbacRole(role))
    .some((role): role is RbacRole => role !== null && getGrantedPermissions(role).includes(permission));
}

export function isRequestRoleAllowed(
  req: Pick<ApiRequest, 'context'>,
  allowedTenantRoles: readonly RbacRole[],
  allowedJwtRoles = allowedTenantRoles
): boolean {
  const normalizedRoles = getNormalizedRequestRoles(req);
  const allowedRoles = new Set((req.context?.roleSource === 'jwt' ? allowedJwtRoles : allowedTenantRoles).map((role) => role));
  return normalizedRoles.some((role) => allowedRoles.has(role));
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

    if (isActionAllowed(getEffectiveRequestRoles(req), options.resource, options.action)) {
      next();
      return;
    }

    next(
      AppError.forbidden('You do not have permission to perform this action', {
        resource: options.resource,
        action: options.action,
        roleSource: req.context.roleSource ?? 'none',
        roles: getNormalizedRequestRoles(req)
      })
    );
  };
}
