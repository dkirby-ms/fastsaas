import type { RbacPermission, RbacRole } from '../middleware/rbac';

export const RBAC_MATRIX_FIXTURE: Record<RbacRole, Record<RbacPermission, boolean>> = {
  admin: {
    'auth:read': true,
    'subscriptions:read': true,
    'subscriptions:manage': true,
    'billing:manage': true,
    'users:manage': true,
    'metering:read': true,
    'metering:manage': true,
    'metering:export': true,
    'audit_logs:read': true,
    'webhooks:manage': true
  },
  owner: {
    'auth:read': true,
    'subscriptions:read': true,
    'subscriptions:manage': true,
    'billing:manage': true,
    'users:manage': true,
    'metering:read': true,
    'metering:manage': true,
    'metering:export': true,
    'audit_logs:read': true,
    'webhooks:manage': true
  },
  member: {
    'auth:read': true,
    'subscriptions:read': true,
    'subscriptions:manage': false,
    'billing:manage': false,
    'users:manage': false,
    'metering:read': true,
    'metering:manage': true,
    'metering:export': false,
    'audit_logs:read': false,
    'webhooks:manage': false
  },
  viewer: {
    'auth:read': true,
    'subscriptions:read': true,
    'subscriptions:manage': false,
    'billing:manage': false,
    'users:manage': false,
    'metering:read': true,
    'metering:manage': false,
    'metering:export': false,
    'audit_logs:read': false,
    'webhooks:manage': false
  }
};
