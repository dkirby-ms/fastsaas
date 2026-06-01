import type { RbacPermission, RbacRole } from '../middleware/rbac';

export const RBAC_MATRIX_FIXTURE: Record<RbacRole, Record<RbacPermission, boolean>> = {
  Admin: {
    'subscriptions:view': true,
    'subscriptions:manage': true,
    'billing:manage': true,
    'users:manage': true,
    'metering:view': true,
    'billing:export': true,
    'audit_logs:view': true,
    'webhooks:manage': true,
    'publisher:view': true,
    'publisher:manage': true
  },
  Owner: {
    'subscriptions:view': true,
    'subscriptions:manage': true,
    'billing:manage': true,
    'users:manage': true,
    'metering:view': true,
    'billing:export': true,
    'audit_logs:view': true,
    'webhooks:manage': true,
    'publisher:view': true,
    'publisher:manage': true
  },
  Member: {
    'subscriptions:view': true,
    'subscriptions:manage': false,
    'billing:manage': false,
    'users:manage': false,
    'metering:view': true,
    'billing:export': false,
    'audit_logs:view': false,
    'webhooks:manage': false,
    'publisher:view': false,
    'publisher:manage': false
  },
  Viewer: {
    'subscriptions:view': true,
    'subscriptions:manage': false,
    'billing:manage': false,
    'users:manage': false,
    'metering:view': true,
    'billing:export': false,
    'audit_logs:view': false,
    'webhooks:manage': false,
    'publisher:view': false,
    'publisher:manage': false
  }
};
