import type { RbacPermission, RbacRole } from '../middleware/rbac';

export const RBAC_MATRIX_FIXTURE: Record<RbacRole, Record<RbacPermission, boolean>> = {
  Admin: {
    'subscriptions:view': true,
    'subscriptions:manage': true,
    'billing:manage': true,
    'users:view': true,
    'users:manage': true,
    'metering:view': true,
    'metering:write': true,
    'billing:export': true,
    'audit_logs:view': true,
    'webhooks:manage': true,
    'operator:view': true,
    'operator:manage': true
  },
  Owner: {
    'subscriptions:view': true,
    'subscriptions:manage': true,
    'billing:manage': true,
    'users:view': true,
    'users:manage': true,
    'metering:view': true,
    'metering:write': true,
    'billing:export': true,
    'audit_logs:view': true,
    'webhooks:manage': true,
    'operator:view': true,
    'operator:manage': true
  },
  Operator: {
    'subscriptions:view': false,
    'subscriptions:manage': false,
    'billing:manage': false,
    'users:view': false,
    'users:manage': false,
    'metering:view': false,
    'metering:write': false,
    'billing:export': false,
    'audit_logs:view': false,
    'webhooks:manage': false,
    'operator:view': true,
    'operator:manage': true
  },
  Member: {
    'subscriptions:view': true,
    'subscriptions:manage': false,
    'billing:manage': false,
    'users:view': true,
    'users:manage': false,
    'metering:view': true,
    'metering:write': false,
    'billing:export': false,
    'audit_logs:view': false,
    'webhooks:manage': false,
    'operator:view': false,
    'operator:manage': false
  },
  Viewer: {
    'subscriptions:view': true,
    'subscriptions:manage': false,
    'billing:manage': false,
    'users:view': true,
    'users:manage': false,
    'metering:view': true,
    'metering:write': false,
    'billing:export': false,
    'audit_logs:view': false,
    'webhooks:manage': false,
    'operator:view': false,
    'operator:manage': false
  }
};
