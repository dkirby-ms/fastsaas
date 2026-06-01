import type { Kysely, Selectable } from 'kysely';

import type { Database } from '../db/database';
import { withDatabaseRlsContext } from '../db/execution-context';
import type { RbacAction, RbacResource } from '../middleware/rbac';

export type AuditLogOutcome = 'success' | 'denied' | 'failure';

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  actorId: string;
  action: RbacAction;
  resource: RbacResource;
  resourceId?: string;
  timestamp: string;
  outcome: AuditLogOutcome;
  metadata: Record<string, unknown>;
}

export interface AuditLogAppendInput {
  id: string;
  tenantId: string;
  actorId: string;
  action: RbacAction;
  resource: RbacResource;
  resourceId?: string;
  timestamp: string;
  outcome: AuditLogOutcome;
  metadata: Record<string, unknown>;
}

export class AuditLogImmutableError extends Error {
  constructor(message = 'Audit logs are append-only and cannot be modified or deleted') {
    super(message);
    this.name = 'AuditLogImmutableError';
  }
}

export interface AuditLogRepository {
  append(input: AuditLogAppendInput): Promise<AuditLogEntry>;
  listByTenant(tenantId: string): Promise<AuditLogEntry[]>;
  update(id: string, patch: Partial<Pick<AuditLogEntry, 'metadata' | 'outcome'>>): Promise<never>;
  delete(id: string): Promise<never>;
}

type AuditLogRow = Selectable<Database['audit_logs']>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function mapAuditLog(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    action: row.action,
    resource: row.resource,
    resourceId: row.resource_id ?? undefined,
    timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : new Date(row.timestamp).toISOString(),
    outcome: row.outcome,
    metadata: asRecord(row.metadata)
  };
}

export class InMemoryAuditLogRepository implements AuditLogRepository {
  private readonly logs = new Map<string, AuditLogEntry>();

  async append(input: AuditLogAppendInput): Promise<AuditLogEntry> {
    const entry: AuditLogEntry = clone({
      id: input.id,
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      timestamp: input.timestamp,
      outcome: input.outcome,
      metadata: input.metadata
    });

    this.logs.set(entry.id, entry);
    return clone(entry);
  }

  async listByTenant(tenantId: string): Promise<AuditLogEntry[]> {
    return [...this.logs.values()]
      .filter((entry) => entry.tenantId === tenantId)
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .map((entry) => clone(entry));
  }

  async update(_id: string, _patch: Partial<Pick<AuditLogEntry, 'metadata' | 'outcome'>>): Promise<never> {
    throw new AuditLogImmutableError();
  }

  async delete(_id: string): Promise<never> {
    throw new AuditLogImmutableError();
  }
}

export class KyselyAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async append(input: AuditLogAppendInput): Promise<AuditLogEntry> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const created = await trx
          .insertInto('audit_logs')
          .values({
            id: input.id,
            tenant_id: input.tenantId,
            actor_id: input.actorId,
            action: input.action,
            resource: input.resource,
            resource_id: input.resourceId ?? null,
            timestamp: new Date(input.timestamp),
            outcome: input.outcome,
            metadata: input.metadata
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        return mapAuditLog(created);
      },
      { tenantId: input.tenantId, bypassRls: false, scope: 'tenant' }
    );
  }

  async listByTenant(tenantId: string): Promise<AuditLogEntry[]> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const rows = await trx
          .selectFrom('audit_logs')
          .selectAll()
          .where('tenant_id', '=', tenantId)
          .orderBy('timestamp', 'desc')
          .execute();

        return rows.map((row) => mapAuditLog(row));
      },
      { tenantId, bypassRls: false, scope: 'tenant' }
    );
  }

  async update(_id: string, _patch: Partial<Pick<AuditLogEntry, 'metadata' | 'outcome'>>): Promise<never> {
    throw new AuditLogImmutableError();
  }

  async delete(_id: string): Promise<never> {
    throw new AuditLogImmutableError();
  }
}
