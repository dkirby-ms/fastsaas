import type { PortalRole } from '@fastsaas/shared';

export function normalizeRoles(roles?: readonly string[] | string | null): string[] {
  const values = Array.isArray(roles)
    ? roles
    : typeof roles === 'string'
      ? roles.split(/[\s,]+/)
      : [];

  return [...new Set(values.map((role) => role.trim().toLowerCase()).filter(Boolean))];
}

export function hasOperatorAccess(roles?: readonly string[] | string | null): boolean {
  return normalizeRoles(roles).some((role) => role === 'operator' || role.startsWith('operator_') || role.endsWith(':operator'));
}

export function getPortalRole(roles?: readonly string[] | string | null): PortalRole {
  return hasOperatorAccess(roles) ? 'operator' : 'customer';
}

export function getDefaultPortalRoute(roles?: readonly string[] | string | null): string {
  return hasOperatorAccess(roles) ? '/operator' : '/dashboard';
}

/** True when the user holds a operator role — they may also hold customer
 *  (subscription) access, making them a dual-role user. */
export function isOperator(roles?: readonly string[] | string | null): boolean {
  return hasOperatorAccess(roles);
}
