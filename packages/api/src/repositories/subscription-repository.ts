import { randomUUID } from 'node:crypto';

import type { Subscription, SubscriptionAuditEntry, SubscriptionStatus } from '@fastsaas/shared';
import type { Kysely, Selectable, Transaction } from 'kysely';

import type { Database } from '../db/database';

export interface CreateSubscriptionInput {
  tenantId: string;
  marketplaceSubscriptionId: string;
  planId: string;
  seats: number;
  offerId?: string;
  purchaserTenantId?: string;
  beneficiaryTenantId?: string;
  correlationId: string;
  metadata: Record<string, unknown>;
  auditEntry: SubscriptionAuditEntry;
}

export interface CreateManagedSubscriptionInput {
  tenantId: string;
  marketplaceSubscriptionId: string;
  planId: string;
  seats: number;
  status: SubscriptionStatus;
  offerId?: string;
  purchaserTenantId?: string;
  beneficiaryTenantId?: string;
  correlationId: string;
  metadata: Record<string, unknown>;
  auditEntry: SubscriptionAuditEntry;
}

export interface UpdateManagedSubscriptionInput {
  subscriptionId: string;
  planId: string;
  seats: number;
  status: SubscriptionStatus;
  offerId?: string;
  purchaserTenantId?: string;
  beneficiaryTenantId?: string;
  correlationId: string;
  metadata: Record<string, unknown>;
  auditEntry?: SubscriptionAuditEntry;
}

export interface TransitionSubscriptionInput {
  subscriptionId: string;
  toStatus: SubscriptionStatus;
  correlationId: string;
  auditEntry: SubscriptionAuditEntry;
}

export interface RecordedWebhookEvent {
  idempotencyKey: string;
  marketplaceSubscriptionId: string;
  action: string;
  correlationId: string;
  requestId: string;
  payload: Record<string, unknown>;
  status: 'processed' | 'failed';
  errorMessage?: string;
  processedAt?: string;
}

export interface SubscriptionRepository {
  createSubscription(input: CreateSubscriptionInput): Promise<Subscription>;
  createManagedSubscription(input: CreateManagedSubscriptionInput): Promise<Subscription>;
  updateManagedSubscription(input: UpdateManagedSubscriptionInput): Promise<Subscription>;
  findById(subscriptionId: string): Promise<Subscription | null>;
  findByMarketplaceSubscriptionId(marketplaceSubscriptionId: string): Promise<Subscription | null>;
  findWebhookEventByIdempotencyKey(idempotencyKey: string): Promise<RecordedWebhookEvent | null>;
  listByTenant(tenantId: string): Promise<Subscription[]>;
  listAll(): Promise<Subscription[]>;
  transitionSubscription(input: TransitionSubscriptionInput): Promise<Subscription>;
  recordWebhookEvent(event: RecordedWebhookEvent): Promise<void>;
  disconnect?(): Promise<void>;
}

type SubscriptionRow = Selectable<Database['subscriptions']>;
type AuditLogRow = Selectable<Database['subscription_audit_logs']>;
type DatabaseExecutor = Kysely<Database> | Transaction<Database>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function mapAuditEntry(entry: {
  id: string;
  subscriptionId: string;
  eventType: string;
  source: string;
  fromStatus: SubscriptionStatus | null;
  toStatus: SubscriptionStatus;
  correlationId: string;
  requestId: string;
  details: Record<string, unknown>;
  createdAt: string | Date;
}): SubscriptionAuditEntry {
  return {
    id: entry.id,
    subscriptionId: entry.subscriptionId,
    eventType: entry.eventType,
    source: entry.source,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    correlationId: entry.correlationId,
    requestId: entry.requestId,
    details: entry.details,
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : entry.createdAt.toISOString()
  };
}

function mapSubscription(record: {
  id: string;
  tenantId: string;
  marketplaceSubscriptionId: string;
  planId: string;
  seats: number;
  status: SubscriptionStatus;
  offerId: string | null | undefined;
  purchaserTenantId: string | null | undefined;
  beneficiaryTenantId: string | null | undefined;
  correlationId: string;
  metadata: unknown;
  createdAt: string | Date;
  updatedAt: string | Date;
  auditLogs: Array<{
    id: string;
    subscriptionId: string;
    eventType: string;
    source: string;
    fromStatus: SubscriptionStatus | null;
    toStatus: SubscriptionStatus;
    correlationId: string;
    requestId: string;
    details: unknown;
    createdAt: string | Date;
  }>;
}): Subscription {
  return {
    id: record.id,
    tenantId: record.tenantId,
    marketplaceSubscriptionId: record.marketplaceSubscriptionId,
    planId: record.planId,
    seats: record.seats,
    status: record.status,
    offerId: record.offerId ?? undefined,
    purchaserTenantId: record.purchaserTenantId ?? undefined,
    beneficiaryTenantId: record.beneficiaryTenantId ?? undefined,
    correlationId: record.correlationId,
    metadata: asRecord(record.metadata),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : record.createdAt.toISOString(),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : record.updatedAt.toISOString(),
    auditLog: record.auditLogs.map((entry) => mapAuditEntry({ ...entry, details: asRecord(entry.details) }))
  };
}

export class InMemorySubscriptionRepository implements SubscriptionRepository {
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly marketplaceIndex = new Map<string, string>();
  private readonly webhookEvents = new Map<string, RecordedWebhookEvent>();

  async createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    return this.createManagedSubscription({ ...input, status: 'PendingActivation' });
  }

  async createManagedSubscription(input: CreateManagedSubscriptionInput): Promise<Subscription> {
    const createdAt = input.auditEntry.createdAt;
    const subscription: Subscription = {
      id: randomUUID(),
      tenantId: input.tenantId,
      marketplaceSubscriptionId: input.marketplaceSubscriptionId,
      planId: input.planId,
      seats: input.seats,
      status: input.status,
      offerId: input.offerId,
      purchaserTenantId: input.purchaserTenantId,
      beneficiaryTenantId: input.beneficiaryTenantId,
      correlationId: input.correlationId,
      metadata: clone(input.metadata),
      createdAt,
      updatedAt: createdAt,
      auditLog: []
    };

    const auditEntry = { ...input.auditEntry, subscriptionId: subscription.id };
    subscription.auditLog.push(auditEntry);
    this.subscriptions.set(subscription.id, clone(subscription));
    this.marketplaceIndex.set(subscription.marketplaceSubscriptionId, subscription.id);

    return clone(subscription);
  }

  async updateManagedSubscription(input: UpdateManagedSubscriptionInput): Promise<Subscription> {
    const existing = this.subscriptions.get(input.subscriptionId);
    if (!existing) {
      throw new Error(`Subscription ${input.subscriptionId} not found`);
    }

    const updatedAt = input.auditEntry?.createdAt ?? new Date().toISOString();
    const updatedAuditLog = input.auditEntry
      ? [...existing.auditLog, { ...input.auditEntry, subscriptionId: existing.id }]
      : [...existing.auditLog];
    const updated: Subscription = {
      ...clone(existing),
      planId: input.planId,
      seats: input.seats,
      status: input.status,
      offerId: input.offerId,
      purchaserTenantId: input.purchaserTenantId,
      beneficiaryTenantId: input.beneficiaryTenantId,
      correlationId: input.correlationId,
      metadata: clone(input.metadata),
      updatedAt,
      auditLog: updatedAuditLog
    };

    this.subscriptions.set(updated.id, clone(updated));
    return clone(updated);
  }

  async findById(subscriptionId: string): Promise<Subscription | null> {
    return clone(this.subscriptions.get(subscriptionId) ?? null);
  }

  async findByMarketplaceSubscriptionId(marketplaceSubscriptionId: string): Promise<Subscription | null> {
    const subscriptionId = this.marketplaceIndex.get(marketplaceSubscriptionId);
    if (!subscriptionId) {
      return null;
    }

    return this.findById(subscriptionId);
  }

  async listByTenant(tenantId: string): Promise<Subscription[]> {
    return [...this.subscriptions.values()]
      .filter((subscription) => subscription.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((subscription) => clone(subscription));
  }

  async listAll(): Promise<Subscription[]> {
    return [...this.subscriptions.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((subscription) => clone(subscription));
  }

  async findWebhookEventByIdempotencyKey(idempotencyKey: string): Promise<RecordedWebhookEvent | null> {
    return clone(this.webhookEvents.get(idempotencyKey) ?? null);
  }

  async transitionSubscription(input: TransitionSubscriptionInput): Promise<Subscription> {
    const existing = this.subscriptions.get(input.subscriptionId);
    if (!existing) {
      throw new Error(`Subscription ${input.subscriptionId} not found`);
    }

    const updated: Subscription = {
      ...clone(existing),
      status: input.toStatus,
      correlationId: input.correlationId,
      updatedAt: input.auditEntry.createdAt,
      auditLog: [...existing.auditLog, { ...input.auditEntry, subscriptionId: existing.id }]
    };

    this.subscriptions.set(updated.id, clone(updated));
    return clone(updated);
  }

  async recordWebhookEvent(event: RecordedWebhookEvent): Promise<void> {
    this.webhookEvents.set(event.idempotencyKey, clone(event));
  }
}

export class KyselySubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    return this.createManagedSubscription({ ...input, status: 'PendingActivation' });
  }

  async createManagedSubscription(input: CreateManagedSubscriptionInput): Promise<Subscription> {
    return this.db.transaction().execute(async (trx) => {
      const createdAt = new Date(input.auditEntry.createdAt);
      const created = await trx
        .insertInto('subscriptions')
        .values({
          tenant_id: input.tenantId,
          marketplace_subscription_id: input.marketplaceSubscriptionId,
          plan_id: input.planId,
          seats: input.seats,
          status: input.status,
          offer_id: input.offerId ?? null,
          purchaser_tenant_id: input.purchaserTenantId ?? null,
          beneficiary_tenant_id: input.beneficiaryTenantId ?? null,
          correlation_id: input.correlationId,
          metadata: input.metadata,
          created_at: createdAt,
          updated_at: createdAt
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('subscription_audit_logs')
        .values({
          id: input.auditEntry.id,
          subscription_id: created.id,
          event_type: input.auditEntry.eventType,
          source: input.auditEntry.source,
          from_status: input.auditEntry.fromStatus,
          to_status: input.auditEntry.toStatus,
          correlation_id: input.auditEntry.correlationId,
          request_id: input.auditEntry.requestId,
          details: input.auditEntry.details,
          created_at: createdAt
        })
        .execute();

      return this.getSubscriptionOrThrow(trx, created.id);
    });
  }

  async updateManagedSubscription(input: UpdateManagedSubscriptionInput): Promise<Subscription> {
    return this.db.transaction().execute(async (trx) => {
      const updatedAt = new Date(input.auditEntry?.createdAt ?? new Date().toISOString());
      const updated = await trx
        .updateTable('subscriptions')
        .set({
          plan_id: input.planId,
          seats: input.seats,
          status: input.status,
          offer_id: input.offerId ?? null,
          purchaser_tenant_id: input.purchaserTenantId ?? null,
          beneficiary_tenant_id: input.beneficiaryTenantId ?? null,
          correlation_id: input.correlationId,
          metadata: input.metadata,
          updated_at: updatedAt
        })
        .where('id', '=', input.subscriptionId)
        .returning('id')
        .executeTakeFirst();

      if (!updated) {
        throw new Error(`Subscription ${input.subscriptionId} not found`);
      }

      if (input.auditEntry) {
        await trx
          .insertInto('subscription_audit_logs')
          .values({
            id: input.auditEntry.id,
            subscription_id: input.subscriptionId,
            event_type: input.auditEntry.eventType,
            source: input.auditEntry.source,
            from_status: input.auditEntry.fromStatus,
            to_status: input.auditEntry.toStatus,
            correlation_id: input.auditEntry.correlationId,
            request_id: input.auditEntry.requestId,
            details: input.auditEntry.details,
            created_at: updatedAt
          })
          .execute();
      }

      return this.getSubscriptionOrThrow(trx, input.subscriptionId);
    });
  }

  async findById(subscriptionId: string): Promise<Subscription | null> {
    return this.findSubscriptionBy('id', subscriptionId);
  }

  async findByMarketplaceSubscriptionId(marketplaceSubscriptionId: string): Promise<Subscription | null> {
    return this.findSubscriptionBy('marketplace_subscription_id', marketplaceSubscriptionId);
  }

  async listByTenant(tenantId: string): Promise<Subscription[]> {
    const rows = await this.db
      .selectFrom('subscriptions')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'desc')
      .execute();

    return this.hydrateSubscriptions(this.db, rows);
  }

  async listAll(): Promise<Subscription[]> {
    const rows = await this.db.selectFrom('subscriptions').selectAll().orderBy('created_at', 'desc').execute();
    return this.hydrateSubscriptions(this.db, rows);
  }

  async findWebhookEventByIdempotencyKey(idempotencyKey: string): Promise<RecordedWebhookEvent | null> {
    const event = await this.db
      .selectFrom('marketplace_webhook_events')
      .selectAll()
      .where('idempotency_key', '=', idempotencyKey)
      .executeTakeFirst();

    if (!event) {
      return null;
    }

    return {
      idempotencyKey: event.idempotency_key,
      marketplaceSubscriptionId: event.marketplace_subscription_id,
      action: event.action,
      correlationId: event.correlation_id,
      requestId: event.request_id,
      payload: asRecord(event.payload),
      status: event.status as RecordedWebhookEvent['status'],
      errorMessage: event.error_message ?? undefined,
      processedAt: event.processed_at?.toISOString()
    };
  }

  async transitionSubscription(input: TransitionSubscriptionInput): Promise<Subscription> {
    return this.db.transaction().execute(async (trx) => {
      const updatedAt = new Date(input.auditEntry.createdAt);
      const updated = await trx
        .updateTable('subscriptions')
        .set({
          status: input.toStatus,
          correlation_id: input.correlationId,
          updated_at: updatedAt
        })
        .where('id', '=', input.subscriptionId)
        .returning('id')
        .executeTakeFirst();

      if (!updated) {
        throw new Error(`Subscription ${input.subscriptionId} not found`);
      }

      await trx
        .insertInto('subscription_audit_logs')
        .values({
          id: input.auditEntry.id,
          subscription_id: input.subscriptionId,
          event_type: input.auditEntry.eventType,
          source: input.auditEntry.source,
          from_status: input.auditEntry.fromStatus,
          to_status: input.auditEntry.toStatus,
          correlation_id: input.auditEntry.correlationId,
          request_id: input.auditEntry.requestId,
          details: input.auditEntry.details,
          created_at: updatedAt
        })
        .execute();

      return this.getSubscriptionOrThrow(trx, input.subscriptionId);
    });
  }

  async recordWebhookEvent(event: RecordedWebhookEvent): Promise<void> {
    const processedAt = event.processedAt ? new Date(event.processedAt) : null;

    await this.db
      .insertInto('marketplace_webhook_events')
      .values({
        idempotency_key: event.idempotencyKey,
        marketplace_subscription_id: event.marketplaceSubscriptionId,
        action: event.action,
        correlation_id: event.correlationId,
        request_id: event.requestId,
        payload: event.payload,
        status: event.status,
        error_message: event.errorMessage ?? null,
        processed_at: processedAt
      })
      .onConflict((oc) =>
        oc.column('idempotency_key').doUpdateSet({
          marketplace_subscription_id: event.marketplaceSubscriptionId,
          action: event.action,
          correlation_id: event.correlationId,
          request_id: event.requestId,
          payload: event.payload,
          status: event.status,
          error_message: event.errorMessage ?? null,
          processed_at: processedAt
        })
      )
      .execute();
  }

  private async findSubscriptionBy(
    column: 'id' | 'marketplace_subscription_id',
    value: string
  ): Promise<Subscription | null> {
    const row = await this.db.selectFrom('subscriptions').selectAll().where(column, '=', value).executeTakeFirst();

    if (!row) {
      return null;
    }

    const [subscription] = await this.hydrateSubscriptions(this.db, [row]);
    return subscription ?? null;
  }

  private async getSubscriptionOrThrow(executor: DatabaseExecutor, subscriptionId: string): Promise<Subscription> {
    const row = await executor.selectFrom('subscriptions').selectAll().where('id', '=', subscriptionId).executeTakeFirst();

    if (!row) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    const [subscription] = await this.hydrateSubscriptions(executor, [row]);

    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    return subscription;
  }

  private async hydrateSubscriptions(executor: DatabaseExecutor, rows: readonly SubscriptionRow[]): Promise<Subscription[]> {
    if (rows.length === 0) {
      return [];
    }

    const auditLogs = await this.loadAuditLogs(executor, rows.map((row) => row.id));

    return rows.map((row) =>
      mapSubscription({
        id: row.id,
        tenantId: row.tenant_id,
        marketplaceSubscriptionId: row.marketplace_subscription_id,
        planId: row.plan_id,
        seats: row.seats,
        status: row.status,
        offerId: row.offer_id,
        purchaserTenantId: row.purchaser_tenant_id,
        beneficiaryTenantId: row.beneficiary_tenant_id,
        correlationId: row.correlation_id,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        auditLogs: (auditLogs.get(row.id) ?? []).map((entry) => ({
          id: entry.id,
          subscriptionId: entry.subscription_id,
          eventType: entry.event_type,
          source: entry.source,
          fromStatus: entry.from_status,
          toStatus: entry.to_status,
          correlationId: entry.correlation_id,
          requestId: entry.request_id,
          details: entry.details,
          createdAt: entry.created_at
        }))
      })
    );
  }

  private async loadAuditLogs(
    executor: DatabaseExecutor,
    subscriptionIds: readonly string[]
  ): Promise<Map<string, AuditLogRow[]>> {
    const auditLogsBySubscriptionId = new Map<string, AuditLogRow[]>();

    if (subscriptionIds.length === 0) {
      return auditLogsBySubscriptionId;
    }

    const auditLogs = await executor
      .selectFrom('subscription_audit_logs')
      .selectAll()
      .where('subscription_id', 'in', subscriptionIds)
      .orderBy('created_at', 'asc')
      .execute();

    for (const auditLog of auditLogs) {
      const subscriptionAuditLogs = auditLogsBySubscriptionId.get(auditLog.subscription_id) ?? [];
      subscriptionAuditLogs.push(auditLog);
      auditLogsBySubscriptionId.set(auditLog.subscription_id, subscriptionAuditLogs);
    }

    return auditLogsBySubscriptionId;
  }
}
