import type { ApiResponse } from '@fastsaas/shared';
import { Router, type Response } from 'express';

import type { ApiConfig } from '../../config';
import type { ApiRequest } from '../../http';
import { authenticateRequest, getRoles, getScopes, getUserId, requireScopes } from '../../middleware/auth';
import { injectTenantContext } from '../../middleware/tenant-context';
import type { TenantMemberService } from '../../services/tenant-member-service';

export function createAuthRouter(config: ApiConfig, tenantMemberService?: TenantMemberService) {
  const router = Router();

  /**
   * @openapi
   * /v1/auth/debug:
   *   get:
   *     summary: Inspect decoded token claims for auth diagnostics
   *     description: >
   *       Only available when AUTH_DEBUG=true or auth bypass is enabled.
   *       Returns the parsed claims the API sees in the bearer token — does NOT expose the raw token.
   *     tags:
   *       - Auth
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Decoded token claims
   *       401:
   *         description: Missing or invalid bearer token
   *       404:
   *         description: Endpoint not enabled
   */
  router.get('/debug', authenticateRequest(config), (req: ApiRequest, res: Response) => {
    if (!config.auth.bypassEnabled && process.env.AUTH_DEBUG !== 'true') {
      res.status(404).json({ status: 'error', error: { code: 'NOT_FOUND', message: 'Not found' } });
      return;
    }

    const claims = req.auth;
    const tenantId = (typeof claims?.tid === 'string' ? claims.tid : undefined)
      ?? (typeof claims?.tenant_id === 'string' ? claims.tenant_id : undefined);

    res.status(200).json({
      status: 'success',
      data: {
        userId: getUserId(claims),
        tenantId,
        roles: getRoles(claims),
        scopes: getScopes(claims),
        issuer: typeof claims?.iss === 'string' ? claims.iss : undefined,
        audience: claims?.aud
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: 'v1'
      }
    });
  });

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
    injectTenantContext(config, tenantMemberService, { authorizationModel: 'customer' }),
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
