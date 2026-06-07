import type { PortalRole } from '@fastsaas/shared';

export function normalizeRoles(roles?: readonly string[] | string | null): string[] {
  const values = Array.isArray(roles)
    ? roles
    : typeof roles === 'string'
      ? roles.split(/[\s,]+/)
      : [];

  return [...new Set(values.map((role) => role.trim().toLowerCase()).filter(Boolean))];
}

export function hasPublisherAccess(roles?: readonly string[] | string | null): boolean {
  return normalizeRoles(roles).some((role) => role === 'publisher' || role.startsWith('publisher_') || role.endsWith(':publisher'));
}

export function getPortalRole(roles?: readonly string[] | string | null): PortalRole {
  return hasPublisherAccess(roles) ? 'publisher' : 'customer';
}

export function getDefaultPortalRoute(roles?: readonly string[] | string | null): string {
  return hasPublisherAccess(roles) ? '/publisher' : '/dashboard';
}

/** True when the user holds a publisher role — they may also hold customer
 *  (subscription) access, making them a dual-role user. */
export function isPublisher(roles?: readonly string[] | string | null): boolean {
  return hasPublisherAccess(roles);
}
