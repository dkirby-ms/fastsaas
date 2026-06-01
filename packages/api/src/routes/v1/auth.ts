import type { ApiResponse } from '@fastsaas/shared';
import { Router, type Response } from 'express';

import type { ApiConfig } from '../../config';
import type { ApiRequest } from '../../http';
import { authenticateRequest, requireScopes } from '../../middleware/auth';
import { injectTenantContext } from '../../middleware/tenant-context';

export function createAuthRouter(config: ApiConfig) {
  const router = Router();

  /**
   * @openapi
   * /v1/auth/context:
   *   get:
   *     summary: Resolve the authenticated tenant context
   *     tags:
   *       - Auth
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Authenticated request context
   *       401:
   *         description: Missing or invalid bearer token
   *       403:
   *         description: Token missing tenant context or required scopes
   */
  router.get(
    '/context',
    authenticateRequest(config),
    injectTenantContext(config),
    requireScopes([config.auth.requiredScope]),
    (req: ApiRequest, res: Response<ApiResponse<{ tenantId: string; userId: string; scopes: string[]; roles: string[] }>>) => {
      const context = req.context!;

      res.status(200).json({
        status: 'success',
        data: {
          tenantId: context.tenantId,
          userId: context.userId,
          scopes: context.scopes,
          roles: context.roles
        },
        meta: {
          requestId: context.requestId,
          timestamp: new Date().toISOString(),
          version: 'v1'
        }
      });
    }
  );

  return router;
}
