import type { Logger } from 'pino';

import { AppError } from '../errors/app-error';
import type { ApiRequest } from '../http';
import { getNormalizedRequestRoles, isRequestRoleAllowed, normalizeRbacRole, type RbacRole } from '../middleware/rbac';
import type { TenantMember, TenantMemberRepository } from '../repositories/tenant-member-repository';

export interface TenantMemberActorContext {
  tenantId: string;
  userId: string;
  requestId: string;
  correlationId: string;
}

export interface CreateTenantMemberRequest {
  userId: string;
  email?: string;
  role: RbacRole;
}

function normalizeEmail(email?: string): string | undefined {
  const normalized = email?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505');
}

const INVITABLE_ROLES_BY_ACTOR: Record<RbacRole, readonly RbacRole[]> = {
  Owner: ['Admin', 'Owner', 'Member', 'Viewer'],
  Admin: ['Admin', 'Member'],
  Operator: [],
  Member: [],
  Viewer: []
};

export class TenantMemberService {
  constructor(
    private readonly repository: TenantMemberRepository,
    private readonly logger: Logger
  ) {}

  async resolveMemberRole(tenantId: string, userId: string): Promise<TenantMember | null> {
    return this.repository.findByTenantAndUserId(tenantId, userId);
  }

  async listMembers(tenantId: string): Promise<TenantMember[]> {
    return this.repository.listByTenant(tenantId);
  }

  async inviteMember(actor: TenantMemberActorContext, input: CreateTenantMemberRequest): Promise<TenantMember> {
    try {
      return await this.repository.create({
        tenantId: actor.tenantId,
        userId: input.userId,
        email: normalizeEmail(input.email),
        role: input.role
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict('A tenant member already exists for this user', {
          tenantId: actor.tenantId,
          userId: input.userId
        });
      }

      throw error;
    }
  }

  async updateMemberRole(actor: TenantMemberActorContext, memberId: string, role: RbacRole): Promise<TenantMember> {
    const member = await this.getTenantMember(actor.tenantId, memberId);

    if (member.role === 'Owner' && role !== 'Owner' && (await this.repository.countOwnersByTenant(actor.tenantId)) <= 1) {
      throw AppError.conflict('At least one Owner must remain assigned to the tenant');
    }

    return this.repository.update({
      id: memberId,
      role,
      email: member.email
    });
  }

  async removeMember(actor: TenantMemberActorContext, memberId: string): Promise<TenantMember> {
    const member = await this.getTenantMember(actor.tenantId, memberId);

    if (member.role === 'Owner' && (await this.repository.countOwnersByTenant(actor.tenantId)) <= 1) {
      throw AppError.conflict('At least one Owner must remain assigned to the tenant');
    }

    const removedMember = await this.repository.delete(memberId);
    if (!removedMember) {
      throw AppError.notFound('Tenant member was not found');
    }

    return removedMember;
  }

  async bootstrapOwnerIfNeeded(input: { tenantId: string; userId: string; email?: string }): Promise<TenantMember | null> {
    if ((await this.repository.countOwnersByTenant(input.tenantId)) > 0) {
      return null;
    }

    try {
      const member = await this.repository.upsertByTenantAndUserId({
        tenantId: input.tenantId,
        userId: input.userId,
        email: normalizeEmail(input.email),
        role: 'Owner'
      });

      this.logger.info(
        {
          tenantId: input.tenantId,
          userId: input.userId,
          memberId: member.id
        },
        'Bootstrapped subscription caller as tenant owner'
      );

      return member;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return this.repository.findByTenantAndUserId(input.tenantId, input.userId);
      }

      throw error;
    }
  }

  assertRequestRole(req: ApiRequest, allowedTenantRoles: readonly RbacRole[], allowedJwtRoles = allowedTenantRoles): void {
    if (isRequestRoleAllowed(req, allowedTenantRoles, allowedJwtRoles)) {
      return;
    }

    throw AppError.forbidden('You do not have permission to perform this action', {
      allowedTenantRoles,
      allowedJwtRoles,
      roleSource: req.context?.roleSource ?? 'none',
      roles: (req.context?.roles ?? []).map((role) => normalizeRbacRole(role)).filter((role): role is RbacRole => Boolean(role))
    });
  }

  assertAssignableInviteRole(req: ApiRequest, role: RbacRole): void {
    const actorRole = getNormalizedRequestRoles(req).find((candidate) => candidate === 'Owner' || candidate === 'Admin');
    const allowedInviteRoles = actorRole ? INVITABLE_ROLES_BY_ACTOR[actorRole] : [];

    if (actorRole && allowedInviteRoles.includes(role)) {
      return;
    }

    throw AppError.forbidden('You do not have permission to assign this member role', {
      requestedRole: role,
      allowedInviteRoles,
      actorRoles: getNormalizedRequestRoles(req),
      roleSource: req.context?.roleSource ?? 'none'
    });
  }

  private async getTenantMember(tenantId: string, memberId: string): Promise<TenantMember> {
    const member = await this.repository.findById(memberId);
    if (!member || member.tenantId !== tenantId) {
      throw AppError.notFound('Tenant member was not found');
    }

    return member;
  }
}
