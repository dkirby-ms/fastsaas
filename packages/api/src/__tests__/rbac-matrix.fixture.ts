import type { RbacAction, RbacResource, RbacRole } from '../middleware/rbac';

export const RBAC_MATRIX_FIXTURE: Record<RbacRole, Record<RbacResource, Record<RbacAction, boolean>>> = {
  publisher_admin: {
    subscriptions: { create: true, read: true, update: true, delete: true, manage: true },
    plans: { create: true, read: true, update: true, delete: true, manage: true },
    tenants: { create: true, read: true, update: true, delete: true, manage: true },
    metering: { create: true, read: true, update: true, delete: true, manage: true },
    users: { create: true, read: true, update: true, delete: true, manage: true }
  },
  publisher_user: {
    subscriptions: { create: true, read: true, update: true, delete: false, manage: true },
    plans: { create: false, read: true, update: false, delete: false, manage: false },
    tenants: { create: false, read: true, update: false, delete: false, manage: false },
    metering: { create: false, read: true, update: false, delete: false, manage: true },
    users: { create: false, read: true, update: false, delete: false, manage: false }
  },
  customer_admin: {
    subscriptions: { create: false, read: true, update: false, delete: false, manage: true },
    plans: { create: false, read: true, update: false, delete: false, manage: false },
    tenants: { create: false, read: true, update: true, delete: false, manage: false },
    metering: { create: true, read: true, update: false, delete: false, manage: false },
    users: { create: true, read: true, update: true, delete: true, manage: true }
  },
  customer_user: {
    subscriptions: { create: false, read: true, update: false, delete: false, manage: false },
    plans: { create: false, read: true, update: false, delete: false, manage: false },
    tenants: { create: false, read: true, update: false, delete: false, manage: false },
    metering: { create: false, read: true, update: false, delete: false, manage: false },
    users: { create: false, read: true, update: true, delete: false, manage: false }
  }
};
