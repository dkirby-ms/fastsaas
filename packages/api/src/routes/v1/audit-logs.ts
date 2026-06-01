import type { ApiResponse } from '@fastsaas/shared';
import { Router, type Response } from 'express';

import type { ApiConfig } from '../../config';
import type { ApiRequest } from '../../http';
import { authenticateRequest, requireScopes } from '../../middleware/auth';
import { authorizeRoute } from '../../middleware/rbac';
import { injectTenantContext } from '../../middleware/tenant-context';
import type { AuditLogEntry } from '../../repositories/audit-log-repository';
import type { AuditService } from '../../services/audit-service';

export function createAuditLogsRouter(config: ApiConfig, auditService: AuditService) {
  const router = Router();

  router.get(
    '/',
    authenticateRequest(config),
    injectTenantContext(config),
    requireScopes([config.auth.requiredScope]),
    authorizeRoute({ permission: 'audit_logs:read', resource: 'audit_logs', action: 'read' }),
    async (req: ApiRequest, res: Response<ApiResponse<AuditLogEntry[]>>, next) => {
      try {
        const logs = await auditService.listByTenant(req.context!.tenantId);

        res.status(200).json({
          status: 'success',
          data: logs,
          meta: {
            requestId: req.context!.requestId,
            timestamp: new Date().toISOString(),
            version: config.apiVersion
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
