import type { ApiResponse } from '@fastsaas/shared';
import { Router, type Response } from 'express';

import type { ApiConfig } from '../../config';
import type { ApiRequest } from '../../http';
import { buildResponseMeta } from '../../lib/response';
import { authenticateRequest, requireScopes } from '../../middleware/auth';
import { apiLimiter } from '../../middleware/rate-limit';
import { authorizeRoute } from '../../middleware/rbac';
import { injectTenantContext } from '../../middleware/tenant-context';
import type { TenantMemberService } from '../../services/tenant-member-service';
import type { AuditLogEntry } from '../../repositories/audit-log-repository';
import type { AuditService } from '../../services/audit-service';

export function createAuditLogsRouter(config: ApiConfig, auditService: AuditService, tenantMemberService?: TenantMemberService) {
  const router = Router();

  router.use(
    apiLimiter,
    authenticateRequest(config),
    injectTenantContext(config, tenantMemberService, { authorizationModel: 'customer' }),
    requireScopes([config.auth.requiredScope])
  );

  router.get(
    '/',
    authorizeRoute({ resource: 'audit_logs', action: 'view' }),
    async (req: ApiRequest, res: Response<ApiResponse<AuditLogEntry[]>>, next) => {
      try {
        const logs = await auditService.listByTenant(req.context!.tenantId);
        res.status(200).json({
          status: 'success',
          data: logs,
          meta: buildResponseMeta(req, config.apiVersion)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
