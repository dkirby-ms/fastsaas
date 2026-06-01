import { randomUUID } from 'node:crypto';

import type { Kysely, Selectable } from 'kysely';

import type { Database } from '../db/database';
import { withDatabaseRlsContext } from '../db/execution-context';
import { RBAC_ROLES, type RbacRole } from '../middleware/rbac';

export interface TenantMember {
  id: string;
  tenantId: string;
  userId: string;
  email?: string;
  role: RbacRole;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTenantMemberInput {
  tenantId: string;
  userId: string;
  email?: string;
  role: RbacRole;
}

export interface UpdateTenantMemberInput {
  id: string;
  email?: string;
  role: RbacRole;
}

export interface UpsertTenantMemberInput {
  tenantId: string;
  userId: string;
  email?: string;
  role: RbacRole;
}

export interface TenantMemberRepository {
  listByTenant(tenantId: string): Promise<TenantMember[]>;
  findById(id: string): Promise<TenantMember | null>;
  findByTenantAndUserId(tenantId: string, userId: string): Promise<TenantMember | null>;
  countOwnersByTenant(tenantId: string): Promise<number>;
  create(input: CreateTenantMemberInput): Promise<TenantMember>;
  upsertByTenantAndUserId(input: UpsertTenantMemberInput): Promise<TenantMember>;
  update(input: UpdateTenantMemberInput): Promise<TenantMember>;
  delete(id: string): Promise<TenantMember | null>;
}

type TenantMemberRow = Selectable<Database['tenant_members']>;

const ROLE_ORDER = new Map<RbacRole, number>(RBAC_ROLES.map((role, index) => [role, index]));

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mapTenantMember(row: TenantMemberRow): TenantMember {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    email: row.email ?? undefined,
    role: row.role,
    createdAt: typeof row.created_at === 'string' ? row.created_at : row.created_at.toISOString(),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : row.updated_at.toISOString()
  };
}

function sortMembers(left: TenantMember, right: TenantMember): number {
  const roleDelta = (ROLE_ORDER.get(left.role) ?? Number.MAX_SAFE_INTEGER) - (ROLE_ORDER.get(right.role) ?? Number.MAX_SAFE_INTEGER);
  if (roleDelta !== 0) {
    return roleDelta;
  }

  const createdAtDelta = left.createdAt.localeCompare(right.createdAt);
  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return left.id.localeCompare(right.id);
}

export class InMemoryTenantMemberRepository implements TenantMemberRepository {
  private readonly members = new Map<string, TenantMember>();

  private readonly tenantUserIndex = new Map<string, string>();

  async listByTenant(tenantId: string): Promise<TenantMember[]> {
    return [...this.members.values()].filter((member) => member.tenantId === tenantId).sort(sortMembers).map((member) => clone(member));
  }

  async findById(id: string): Promise<TenantMember | null> {
    return clone(this.members.get(id) ?? null);
  }

  async findByTenantAndUserId(tenantId: string, userId: string): Promise<TenantMember | null> {
    const memberId = this.tenantUserIndex.get(`${tenantId}:${userId}`);
    return memberId ? this.findById(memberId) : null;
  }

  async countOwnersByTenant(tenantId: string): Promise<number> {
    return [...this.members.values()].filter((member) => member.tenantId === tenantId && member.role === 'Owner').length;
  }

  async create(input: CreateTenantMemberInput): Promise<TenantMember> {
    const key = `${input.tenantId}:${input.userId}`;
    if (this.tenantUserIndex.has(key)) {
      const error = new Error('tenant_members_tenant_id_user_id_key');
      Object.assign(error, { code: '23505' });
      throw error;
    }

    const now = new Date().toISOString();
    const member: TenantMember = {
      id: randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      email: input.email,
      role: input.role,
      createdAt: now,
      updatedAt: now
    };

    this.members.set(member.id, clone(member));
    this.tenantUserIndex.set(key, member.id);
    return clone(member);
  }

  async upsertByTenantAndUserId(input: UpsertTenantMemberInput): Promise<TenantMember> {
    const existing = await this.findByTenantAndUserId(input.tenantId, input.userId);
    if (!existing) {
      return this.create(input);
    }

    return this.update({
      id: existing.id,
      email: input.email ?? existing.email,
      role: input.role
    });
  }

  async update(input: UpdateTenantMemberInput): Promise<TenantMember> {
    const existing = this.members.get(input.id);
    if (!existing) {
      throw new Error(`Tenant member ${input.id} not found`);
    }

    const updated: TenantMember = {
      ...clone(existing),
      email: input.email,
      role: input.role,
      updatedAt: new Date().toISOString()
    };

    this.members.set(updated.id, clone(updated));
    return clone(updated);
  }

  async delete(id: string): Promise<TenantMember | null> {
    const existing = this.members.get(id);
    if (!existing) {
      return null;
    }

    this.members.delete(id);
    this.tenantUserIndex.delete(`${existing.tenantId}:${existing.userId}`);
    return clone(existing);
  }
}

export class KyselyTenantMemberRepository implements TenantMemberRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async listByTenant(tenantId: string): Promise<TenantMember[]> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const rows = await trx
          .selectFrom('tenant_members')
          .selectAll()
          .where('tenant_id', '=', tenantId)
          .orderBy('created_at', 'asc')
          .execute();

        return rows.map(mapTenantMember).sort(sortMembers);
      },
      { tenantId }
    );
  }

  async findById(id: string): Promise<TenantMember | null> {
    return withDatabaseRlsContext(this.db, async (trx) => {
      const row = await trx.selectFrom('tenant_members').selectAll().where('id', '=', id).executeTakeFirst();
      return row ? mapTenantMember(row) : null;
    });
  }

  async findByTenantAndUserId(tenantId: string, userId: string): Promise<TenantMember | null> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const row = await trx
          .selectFrom('tenant_members')
          .selectAll()
          .where('tenant_id', '=', tenantId)
          .where('user_id', '=', userId)
          .executeTakeFirst();

        return row ? mapTenantMember(row) : null;
      },
      { tenantId }
    );
  }

  async countOwnersByTenant(tenantId: string): Promise<number> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const result = await trx
          .selectFrom('tenant_members')
          .select((eb) => eb.fn.count<string>('id').as('owner_count'))
          .where('tenant_id', '=', tenantId)
          .where('role', '=', 'Owner')
          .executeTakeFirst();

        return Number(result?.owner_count ?? 0);
      },
      { tenantId }
    );
  }

  async create(input: CreateTenantMemberInput): Promise<TenantMember> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const now = new Date();
        const row = await trx
          .insertInto('tenant_members')
          .values({
            id: randomUUID(),
            tenant_id: input.tenantId,
            user_id: input.userId,
            email: input.email ?? null,
            role: input.role,
            created_at: now,
            updated_at: now
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        return mapTenantMember(row);
      },
      { tenantId: input.tenantId }
    );
  }

  async upsertByTenantAndUserId(input: UpsertTenantMemberInput): Promise<TenantMember> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const now = new Date();
        const row = await trx
          .insertInto('tenant_members')
          .values({
            id: randomUUID(),
            tenant_id: input.tenantId,
            user_id: input.userId,
            email: input.email ?? null,
            role: input.role,
            created_at: now,
            updated_at: now
          })
          .onConflict((oc) =>
            oc.columns(['tenant_id', 'user_id']).doUpdateSet({
              email: input.email ?? null,
              role: input.role,
              updated_at: now
            })
          )
          .returningAll()
          .executeTakeFirstOrThrow();

        return mapTenantMember(row);
      },
      { tenantId: input.tenantId }
    );
  }

  async update(input: UpdateTenantMemberInput): Promise<TenantMember> {
    return withDatabaseRlsContext(this.db, async (trx) => {
      const row = await trx
        .updateTable('tenant_members')
        .set({
          email: input.email ?? null,
          role: input.role,
          updated_at: new Date()
        })
        .where('id', '=', input.id)
        .returningAll()
        .executeTakeFirst();

      if (!row) {
        throw new Error(`Tenant member ${input.id} not found`);
      }

      return mapTenantMember(row);
    });
  }

  async delete(id: string): Promise<TenantMember | null> {
    return withDatabaseRlsContext(this.db, async (trx) => {
      const row = await trx.deleteFrom('tenant_members').where('id', '=', id).returningAll().executeTakeFirst();
      return row ? mapTenantMember(row) : null;
    });
  }
}
