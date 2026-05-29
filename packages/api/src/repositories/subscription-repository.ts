import { randomUUID } from 'node:crypto';

import { PrismaClient, type Prisma, type Subscription as PrismaSubscription, type SubscriptionAuditLog as PrismaSubscriptionAuditLog } from '@prisma/client';
import type { Subscription, SubscriptionAuditEntry, SubscriptionStatus } from '@fastsaas/shared';

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
  findById(subscriptionId: string): Promise<Subscription | null>;
  findByMarketplaceSubscriptionId(marketplaceSubscriptionId: string): Promise<Subscription | null>;
  findWebhookEventByIdempotencyKey(idempotencyKey: string): Promise<RecordedWebhookEvent | null>;
  listByTenant(tenantId: string): Promise<Subscription[]>;
  transitionSubscription(input: TransitionSubscriptionInput): Promise<Subscription>;
  recordWebhookEvent(event: RecordedWebhookEvent): Promise<void>;
  disconnect?(): Promise<void>;
}

type SubscriptionWithAudit = PrismaSubscription & { auditLogs: PrismaSubscriptionAuditLog[] };

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
    const createdAt = input.auditEntry.createdAt;
    const subscription: Subscription = {
      id: randomUUID(),
      tenantId: input.tenantId,
      marketplaceSubscriptionId: input.marketplaceSubscriptionId,
      planId: input.planId,
      seats: input.seats,
      status: 'PendingActivation',
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

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly prisma = new PrismaClient()) {}

  async createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    const subscription = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.subscription.create({
        data: {
          tenantId: input.tenantId,
          marketplaceSubscriptionId: input.marketplaceSubscriptionId,
          planId: input.planId,
          seats: input.seats,
          status: 'PendingActivation',
          offerId: input.offerId,
          purchaserTenantId: input.purchaserTenantId,
          beneficiaryTenantId: input.beneficiaryTenantId,
          correlationId: input.correlationId,
          metadata: input.metadata as Prisma.InputJsonValue
        }
      });

      await transaction.subscriptionAuditLog.create({
        data: {
          id: input.auditEntry.id,
          subscriptionId: created.id,
          eventType: input.auditEntry.eventType,
          source: input.auditEntry.source,
          fromStatus: input.auditEntry.fromStatus,
          toStatus: input.auditEntry.toStatus,
          correlationId: input.auditEntry.correlationId,
          requestId: input.auditEntry.requestId,
          details: input.auditEntry.details as Prisma.InputJsonValue,
          createdAt: new Date(input.auditEntry.createdAt)
        }
      });

      return transaction.subscription.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          auditLogs: {
            orderBy: {
              createdAt: 'asc'
            }
          }
        }
      });
    });

    return mapSubscription(subscription);
  }

  async findById(subscriptionId: string): Promise<Subscription | null> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        auditLogs: {
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });

    return subscription ? mapSubscription(subscription) : null;
  }

  async findByMarketplaceSubscriptionId(marketplaceSubscriptionId: string): Promise<Subscription | null> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { marketplaceSubscriptionId },
      include: {
        auditLogs: {
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });

    return subscription ? mapSubscription(subscription) : null;
  }

  async listByTenant(tenantId: string): Promise<Subscription[]> {
    const subscriptions = await this.prisma.subscription.findMany({
      where: { tenantId },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        auditLogs: {
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });

    return subscriptions.map((subscription) => mapSubscription(subscription as SubscriptionWithAudit));
  }

  async findWebhookEventByIdempotencyKey(idempotencyKey: string): Promise<RecordedWebhookEvent | null> {
    const event = await this.prisma.marketplaceWebhookEvent.findUnique({
      where: { idempotencyKey }
    });

    if (!event) {
      return null;
    }

    return {
      idempotencyKey: event.idempotencyKey,
      marketplaceSubscriptionId: event.marketplaceSubscriptionId,
      action: event.action,
      correlationId: event.correlationId,
      requestId: event.requestId,
      payload: asRecord(event.payload),
      status: event.status as RecordedWebhookEvent['status'],
      errorMessage: event.errorMessage ?? undefined,
      processedAt: event.processedAt?.toISOString()
    };
  }

  async transitionSubscription(input: TransitionSubscriptionInput): Promise<Subscription> {
    const subscription = await this.prisma.$transaction(async (transaction) => {
      await transaction.subscription.update({
        where: { id: input.subscriptionId },
        data: {
          status: input.toStatus,
          correlationId: input.correlationId
        }
      });

      await transaction.subscriptionAuditLog.create({
        data: {
          id: input.auditEntry.id,
          subscriptionId: input.subscriptionId,
          eventType: input.auditEntry.eventType,
          source: input.auditEntry.source,
          fromStatus: input.auditEntry.fromStatus,
          toStatus: input.auditEntry.toStatus,
          correlationId: input.auditEntry.correlationId,
          requestId: input.auditEntry.requestId,
          details: input.auditEntry.details as Prisma.InputJsonValue,
          createdAt: new Date(input.auditEntry.createdAt)
        }
      });

      return transaction.subscription.findUniqueOrThrow({
        where: { id: input.subscriptionId },
        include: {
          auditLogs: {
            orderBy: {
              createdAt: 'asc'
            }
          }
        }
      });
    });

    return mapSubscription(subscription);
  }

  async recordWebhookEvent(event: RecordedWebhookEvent): Promise<void> {
    await this.prisma.marketplaceWebhookEvent.upsert({
      where: {
        idempotencyKey: event.idempotencyKey
      },
      create: {
        idempotencyKey: event.idempotencyKey,
        marketplaceSubscriptionId: event.marketplaceSubscriptionId,
        action: event.action,
        correlationId: event.correlationId,
        requestId: event.requestId,
        payload: event.payload as Prisma.InputJsonValue,
        status: event.status,
        errorMessage: event.errorMessage,
        processedAt: event.processedAt ? new Date(event.processedAt) : undefined
      },
      update: {
        marketplaceSubscriptionId: event.marketplaceSubscriptionId,
        action: event.action,
        correlationId: event.correlationId,
        requestId: event.requestId,
        payload: event.payload as Prisma.InputJsonValue,
        status: event.status,
        errorMessage: event.errorMessage,
        processedAt: event.processedAt ? new Date(event.processedAt) : null
      }
    });
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
