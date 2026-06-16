import type { ApiResponse } from '@fastsaas/shared';
import { Router, type Response } from 'express';

import type { ApiConfig } from '../../config';
import { AppError } from '../../errors/app-error';
import type { ApiRequest } from '../../http';
import { buildResponseMeta } from '../../lib/response';
import { authenticateRequest, requireScopes } from '../../middleware/auth';
import { apiLimiter } from '../../middleware/rate-limit';
import { authorizeRoute, normalizeRbacRole, type RbacRole } from '../../middleware/rbac';
import { injectTenantContext } from '../../middleware/tenant-context';
import type { TenantMember } from '../../repositories/tenant-member-repository';
import type { TenantMemberService } from '../../services/tenant-member-service';

function buildActorContext(req: ApiRequest) {
  if (!req.context) {
    throw AppError.unauthorized();
  }

  return {
    tenantId: req.context.tenantId,
    userId: req.context.userId,
    requestId: req.context.requestId,
    correlationId: req.correlationId ?? req.context.requestId
  };
}

function getMemberId(req: ApiRequest): string {
  const { id } = req.params;
  if (typeof id !== 'string' || id.length === 0) {
    throw AppError.badRequest('id path parameter is required');
  }

  return id;
}

function parseRole(value: unknown, fieldName = 'role'): RbacRole {
  if (typeof value !== 'string') {
    throw AppError.badRequest(`${fieldName} is required`);
  }

  const role = normalizeRbacRole(value);
  if (!role) {
    throw AppError.badRequest(`${fieldName} must be Admin, Owner, Member, or Viewer`);
  }

  return role;
}

function parseInviteBody(body: unknown): { userId: string; email?: string; role: RbacRole } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw AppError.badRequest('Request body must be a JSON object');
  }

  const candidate = body as Record<string, unknown>;
  if (typeof candidate.userId !== 'string' || candidate.userId.trim().length === 0) {
    throw AppError.badRequest('userId is required');
  }

  if (candidate.email !== undefined && typeof candidate.email !== 'string') {
    throw AppError.badRequest('email must be a string when provided');
  }

  return {
    userId: candidate.userId.trim(),
    email: typeof candidate.email === 'string' ? candidate.email : undefined,
    role: parseRole(candidate.role)
  };
}

function parseRoleBody(body: unknown): { role: RbacRole } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw AppError.badRequest('Request body must be a JSON object');
  }

  return {
    role: parseRole((body as Record<string, unknown>).role)
  };
}

export function createMembersRouter(config: ApiConfig, tenantMemberService: TenantMemberService) {
  const router = Router();

  router.use(
    apiLimiter,
    authenticateRequest(config),
    requireScopes([config.auth.requiredScope]),
    injectTenantContext(config, tenantMemberService, { authorizationModel: 'customer' })
  );

  /**
   * @openapi
   * /v1/members:
   *   get:
   *     summary: List tenant members for the authenticated tenant
   *     tags:
   *       - Members
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Tenant member list
   */
  router.get(
    '/',
    authorizeRoute({ resource: 'users', action: 'view' }),
    async (req: ApiRequest, res: Response<ApiResponse<TenantMember[]>>, next) => {
      try {
        const members = await tenantMemberService.listMembers(buildActorContext(req).tenantId);
        res.status(200).json({
          status: 'success',
          data: members,
          meta: buildResponseMeta(req, config.apiVersion)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @openapi
   * /v1/members/invite:
   *   post:
   *     summary: Add a tenant member
   *     tags:
   *       - Members
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       201:
   *         description: Tenant member created
   */
  router.post(
    '/invite',
    authorizeRoute({ resource: 'users', action: 'manage' }),
    async (req: ApiRequest, res: Response<ApiResponse<TenantMember>>, next) => {
      try {
        const invite = parseInviteBody(req.body);
        tenantMemberService.assertRequestRole(req, ['Owner', 'Admin'], ['Admin', 'Owner']);
        tenantMemberService.assertAssignableInviteRole(req, invite.role);
        req.audit = { action: 'manage', resource: 'users' };
        const member = await tenantMemberService.inviteMember(buildActorContext(req), invite);
        res.status(201).json({
          status: 'success',
          data: member,
          meta: buildResponseMeta(req, config.apiVersion)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.patch(
    '/:id/role',
    authorizeRoute({ resource: 'users', action: 'manage', resourceId: getMemberId }),
    async (req: ApiRequest, res: Response<ApiResponse<TenantMember>>, next) => {
      try {
        tenantMemberService.assertRequestRole(req, ['Owner'], ['Admin', 'Owner']);
        const memberId = getMemberId(req);
        req.audit = { action: 'manage', resource: 'users', resourceId: memberId };
        const member = await tenantMemberService.updateMemberRole(buildActorContext(req), memberId, parseRoleBody(req.body).role);
        res.status(200).json({
          status: 'success',
          data: member,
          meta: buildResponseMeta(req, config.apiVersion)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.delete(
    '/:id',
    authorizeRoute({ resource: 'users', action: 'manage', resourceId: getMemberId }),
    async (req: ApiRequest, res: Response<ApiResponse<TenantMember>>, next) => {
      try {
        tenantMemberService.assertRequestRole(req, ['Owner'], ['Admin', 'Owner']);
        const memberId = getMemberId(req);
        req.audit = { action: 'manage', resource: 'users', resourceId: memberId };
        const member = await tenantMemberService.removeMember(buildActorContext(req), memberId);
        res.status(200).json({
          status: 'success',
          data: member,
          meta: buildResponseMeta(req, config.apiVersion)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
