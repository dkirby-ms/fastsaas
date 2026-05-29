import { randomUUID } from 'node:crypto';

import type { MeteringDashboardSummary, UsageEventDeadLetterRecord, UsageEventIngestRequest, UsageEventIngestResponse, UsageEventRecord } from '@fastsaas/shared';

import type { Clock } from './clock';

export const METERING_DEDUPE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface ClaimedUsageEventRecord extends UsageEventRecord {
  claimToken: string;
  leaseExpiresAt: string;
}

export interface UsageEventRepository {
  ingest(tenantId: string, event: UsageEventIngestRequest, idempotencyKey: string, now: Date): Promise<UsageEventIngestResponse>;
  claimDueBatch(now: Date, limit: number, leaseMs: number): Promise<ClaimedUsageEventRecord[]>;
  markSubmitted(event: ClaimedUsageEventRecord, submittedAt: Date): Promise<UsageEventRecord>;
  scheduleRetry(event: ClaimedUsageEventRecord, retryCount: number, nextAttemptAt: Date, error: { code: string; message: string; httpStatus: number | null }): Promise<UsageEventRecord>;
  markDeadLetter(event: ClaimedUsageEventRecord, entry: Omit<UsageEventDeadLetterRecord, 'id' | 'failedAt'>, now: Date): Promise<UsageEventRecord>;
  listDeadLetters(tenantId?: string): Promise<UsageEventDeadLetterRecord[]>;
  getById(id: string): Promise<UsageEventRecord | null>;
  listByTenant(tenantId: string): Promise<UsageEventRecord[]>;
  getDashboardSummary(tenantId: string, now: Date, submissionSlaMs: number): Promise<MeteringDashboardSummary>;
}

interface UsageEventClaim {
  claimToken: string;
  leaseExpiresAt: string;
}

export class InMemoryUsageEventStore {
  readonly records = new Map<string, UsageEventRecord>();
  readonly deadLetters = new Map<string, UsageEventDeadLetterRecord>();
  readonly claims = new Map<string, UsageEventClaim>();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function updateRecord(record: UsageEventRecord, now: Date, patch: Partial<UsageEventRecord>): UsageEventRecord {
  return {
    ...record,
    ...patch,
    updatedAt: now.toISOString()
  };
}

function isDue(record: UsageEventRecord, now: Date): boolean {
  return (record.status === 'pending' || record.status === 'retry_scheduled')
    && (!record.nextAttemptAt || new Date(record.nextAttemptAt) <= now);
}

function buildDashboardSummary(records: UsageEventRecord[], now: Date, submissionSlaMs: number): MeteringDashboardSummary {
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

function isClaimAvailable(claim: UsageEventClaim | undefined, now: Date): boolean {
  return !claim || new Date(claim.leaseExpiresAt) <= now;
}

export class InMemoryUsageEventRepository implements UsageEventRepository {
  constructor(
    private readonly clock: Clock,
    private readonly store: InMemoryUsageEventStore = new InMemoryUsageEventStore()
  ) {}

  async ingest(tenantId: string, event: UsageEventIngestRequest, idempotencyKey: string, now: Date): Promise<UsageEventIngestResponse> {
    const eventTimestamp = new Date(event.timestamp).toISOString();
    const cutoff = now.getTime() - METERING_DEDUPE_WINDOW_MS;
    const existing = [...this.store.records.values()]
      .filter((record) => record.tenantId === tenantId)
      .filter((record) => new Date(record.createdAt).getTime() >= cutoff)
      .find((record) => record.idempotencyKey === idempotencyKey || (record.eventId === event.eventId && record.timestamp === eventTimestamp));

    if (existing) {
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
      planId: event.planId,
      dimensionId: event.dimensionId,
      quantity: event.quantity,
      timestamp: eventTimestamp,
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

    this.store.records.set(record.id, record);

    return {
      event: clone(record),
      deduplicated: false
    };
  }

  async claimDueBatch(now: Date, limit: number, leaseMs: number): Promise<ClaimedUsageEventRecord[]> {
    const claimToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();

    return [...this.store.records.values()]
      .filter((record) => isDue(record, now))
      .filter((record) => isClaimAvailable(this.store.claims.get(record.id), now))
      .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
      .slice(0, limit)
      .map((record) => {
        this.store.claims.set(record.id, { claimToken, leaseExpiresAt });
        return clone({
          ...record,
          claimToken,
          leaseExpiresAt
        });
      });
  }

  async markSubmitted(event: ClaimedUsageEventRecord, submittedAt: Date): Promise<UsageEventRecord> {
    const record = this.mustGetClaimedRecord(event);
    const updated = updateRecord(record, submittedAt, {
      status: 'submitted',
      submittedAt: submittedAt.toISOString(),
      nextAttemptAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastHttpStatus: null
    });

    this.store.claims.delete(event.id);
    this.store.records.set(event.id, updated);
    return clone(updated);
  }

  async scheduleRetry(event: ClaimedUsageEventRecord, retryCount: number, nextAttemptAt: Date, error: { code: string; message: string; httpStatus: number | null }): Promise<UsageEventRecord> {
    const record = this.mustGetClaimedRecord(event);
    const updated = updateRecord(record, this.clock.now(), {
      status: 'retry_scheduled',
      retryCount,
      nextAttemptAt: nextAttemptAt.toISOString(),
      lastErrorCode: error.code,
      lastErrorMessage: error.message,
      lastHttpStatus: error.httpStatus
    });

    this.store.claims.delete(event.id);
    this.store.records.set(event.id, updated);
    return clone(updated);
  }

  async markDeadLetter(event: ClaimedUsageEventRecord, entry: Omit<UsageEventDeadLetterRecord, 'id' | 'failedAt'>, now: Date): Promise<UsageEventRecord> {
    const record = this.mustGetClaimedRecord(event);
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

    this.store.claims.delete(event.id);
    this.store.deadLetters.set(deadLetter.id, deadLetter);
    this.store.records.set(event.id, updated);
    return clone(updated);
  }

  async listDeadLetters(tenantId?: string): Promise<UsageEventDeadLetterRecord[]> {
    return [...this.store.deadLetters.values()]
      .filter((entry) => !tenantId || entry.tenantId === tenantId)
      .sort((left, right) => new Date(right.failedAt).getTime() - new Date(left.failedAt).getTime())
      .map((entry) => clone(entry));
  }

  async getById(id: string): Promise<UsageEventRecord | null> {
    const record = this.store.records.get(id);
    return record ? clone(record) : null;
  }

  async listByTenant(tenantId: string): Promise<UsageEventRecord[]> {
    return [...this.store.records.values()]
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .map((record) => clone(record));
  }

  async getDashboardSummary(tenantId: string, now: Date, submissionSlaMs: number): Promise<MeteringDashboardSummary> {
    const records = [...this.store.records.values()].filter((record) => record.tenantId === tenantId);
    return buildDashboardSummary(records, now, submissionSlaMs);
  }

  private mustGetClaimedRecord(event: ClaimedUsageEventRecord): UsageEventRecord {
    const record = this.store.records.get(event.id);
    if (!record) {
      throw new Error(`Usage event ${event.id} was not found`);
    }

    const claim = this.store.claims.get(event.id);
    if (!claim || claim.claimToken !== event.claimToken) {
      throw new Error(`Usage event ${event.id} is not claimed by this worker`);
    }

    return record;
  }
}

export { buildDashboardSummary };
