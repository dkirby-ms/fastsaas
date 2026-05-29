import { randomUUID } from 'node:crypto';

import type { MeteringDashboardSummary, UsageEventDeadLetterRecord, UsageEventIngestRequest, UsageEventIngestResponse, UsageEventRecord, UsageEventStatus } from '@fastsaas/shared';

import type { Clock } from './clock';

export interface UsageEventRepository {
  ingest(tenantId: string, event: UsageEventIngestRequest, idempotencyKey: string, now: Date): Promise<UsageEventIngestResponse>;
  findDueBatch(now: Date, limit: number): Promise<UsageEventRecord[]>;
  markSubmitted(id: string, submittedAt: Date): Promise<UsageEventRecord>;
  scheduleRetry(id: string, retryCount: number, nextAttemptAt: Date, error: { code: string; message: string; httpStatus: number | null }): Promise<UsageEventRecord>;
  markDeadLetter(id: string, entry: Omit<UsageEventDeadLetterRecord, 'id' | 'failedAt'>, now: Date): Promise<UsageEventRecord>;
  listDeadLetters(tenantId?: string): Promise<UsageEventDeadLetterRecord[]>;
  getById(id: string): Promise<UsageEventRecord | null>;
  listByTenant(tenantId: string): Promise<UsageEventRecord[]>;
  getDashboardSummary(tenantId: string, now: Date, submissionSlaMs: number): Promise<MeteringDashboardSummary>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toIso(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }

  return typeof value === 'string' ? value : value.toISOString();
}

function updateRecord(record: UsageEventRecord, now: Date, patch: Partial<UsageEventRecord>): UsageEventRecord {
  return {
    ...record,
    ...patch,
    updatedAt: now.toISOString()
  };
}

export class InMemoryUsageEventRepository implements UsageEventRepository {
  private readonly records = new Map<string, UsageEventRecord>();
  private readonly dedupeIndex = new Map<string, string>();
  private readonly eventKeyIndex = new Map<string, string>();
  private readonly deadLetters = new Map<string, UsageEventDeadLetterRecord>();

  constructor(private readonly clock: Clock) {}

  async ingest(tenantId: string, event: UsageEventIngestRequest, idempotencyKey: string, now: Date): Promise<UsageEventIngestResponse> {
    const eventKey = `${tenantId}:${event.eventId}:${new Date(event.timestamp).toISOString()}`;
    const existingId = this.dedupeIndex.get(idempotencyKey) ?? this.eventKeyIndex.get(eventKey);

    if (existingId) {
      const existing = this.records.get(existingId);
      if (!existing) {
        throw new Error(`Usage event ${existingId} is missing from the repository`);
      }

      return {
        event: clone(existing),
        deduplicated: true
      };
    }

    const record: UsageEventRecord = {
      id: randomUUID(),
      tenantId,
      eventId: event.eventId,
      subscriptionId: event.subscriptionId,
      dimensionId: event.dimensionId,
      quantity: event.quantity,
      timestamp: new Date(event.timestamp).toISOString(),
      idempotencyKey,
      status: 'pending',
      retryCount: 0,
      nextAttemptAt: now.toISOString(),
      submittedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastHttpStatus: null,
      metadata: event.metadata ?? {},
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    this.records.set(record.id, record);
    this.dedupeIndex.set(idempotencyKey, record.id);
    this.eventKeyIndex.set(eventKey, record.id);

    return {
      event: clone(record),
      deduplicated: false
    };
  }

  async findDueBatch(now: Date, limit: number): Promise<UsageEventRecord[]> {
    return [...this.records.values()]
      .filter((record) => (record.status === 'pending' || record.status === 'retry_scheduled') && (!record.nextAttemptAt || new Date(record.nextAttemptAt) <= now))
      .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
      .slice(0, limit)
      .map((record) => clone(record));
  }

  async markSubmitted(id: string, submittedAt: Date): Promise<UsageEventRecord> {
    const record = this.mustGet(id);
    const updated = updateRecord(record, submittedAt, {
      status: 'submitted',
      submittedAt: submittedAt.toISOString(),
      nextAttemptAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastHttpStatus: null
    });

    this.records.set(id, updated);
    return clone(updated);
  }

  async scheduleRetry(id: string, retryCount: number, nextAttemptAt: Date, error: { code: string; message: string; httpStatus: number | null }): Promise<UsageEventRecord> {
    const record = this.mustGet(id);
    const updated = updateRecord(record, this.clock.now(), {
      status: 'retry_scheduled',
      retryCount,
      nextAttemptAt: nextAttemptAt.toISOString(),
      lastErrorCode: error.code,
      lastErrorMessage: error.message,
      lastHttpStatus: error.httpStatus
    });

    this.records.set(id, updated);
    return clone(updated);
  }

  async markDeadLetter(id: string, entry: Omit<UsageEventDeadLetterRecord, 'id' | 'failedAt'>, now: Date): Promise<UsageEventRecord> {
    const record = this.mustGet(id);
    const deadLetter: UsageEventDeadLetterRecord = {
      ...entry,
      id: randomUUID(),
      failedAt: now.toISOString()
    };
    const updated = updateRecord(record, now, {
      status: 'dead_letter',
      nextAttemptAt: null,
      lastErrorCode: entry.reason,
      lastErrorMessage: entry.reason,
      lastHttpStatus: entry.httpStatus
    });

    this.deadLetters.set(deadLetter.id, deadLetter);
    this.records.set(id, updated);
    return clone(updated);
  }

  async listDeadLetters(tenantId?: string): Promise<UsageEventDeadLetterRecord[]> {
    return [...this.deadLetters.values()]
      .filter((entry) => !tenantId || entry.tenantId === tenantId)
      .sort((left, right) => new Date(right.failedAt).getTime() - new Date(left.failedAt).getTime())
      .map((entry) => clone(entry));
  }

  async getById(id: string): Promise<UsageEventRecord | null> {
    const record = this.records.get(id);
    return record ? clone(record) : null;
  }

  async listByTenant(tenantId: string): Promise<UsageEventRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .map((record) => clone(record));
  }

  async getDashboardSummary(tenantId: string, now: Date, submissionSlaMs: number): Promise<MeteringDashboardSummary> {
    const records = [...this.records.values()].filter((record) => record.tenantId === tenantId);
    const submitted = records.filter((record) => record.status === 'submitted');
    const pending = records.filter((record) => record.status === 'pending');
    const retryScheduled = records.filter((record) => record.status === 'retry_scheduled');
    const deadLetter = records.filter((record) => record.status === 'dead_letter');
    const overdue = records.filter((record) => record.status !== 'submitted' && now.getTime() - new Date(record.timestamp).getTime() > submissionSlaMs);
    const submittedWithinSla = submitted.filter((record) => record.submittedAt && new Date(record.submittedAt).getTime() - new Date(record.timestamp).getTime() <= submissionSlaMs);
    const oldestPending = [...pending, ...retryScheduled]
      .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())[0];

    return {
      pendingCount: pending.length,
      retryScheduledCount: retryScheduled.length,
      submittedCount: submitted.length,
      deadLetterCount: deadLetter.length,
      overdueCount: overdue.length,
      submittedWithinSlaPercent: submitted.length === 0 ? 100 : Math.round((submittedWithinSla.length / submitted.length) * 10000) / 100,
      oldestPendingAgeMinutes: oldestPending ? Math.round((now.getTime() - new Date(oldestPending.timestamp).getTime()) / 60000) : null,
      lastSubmittedAt: submitted.sort((left, right) => new Date(right.submittedAt ?? 0).getTime() - new Date(left.submittedAt ?? 0).getTime())[0]?.submittedAt ?? null
    };
  }

  private mustGet(id: string): UsageEventRecord {
    const record = this.records.get(id);
    if (!record) {
      throw new Error(`Usage event ${id} was not found`);
    }

    return record;
  }
}
