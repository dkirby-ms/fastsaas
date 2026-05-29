import type { UsageEventDeadLetterRecord, UsageEventIngestRequest, UsageEventRecord } from '@fastsaas/shared';
import { describe, expect, it } from 'vitest';

import { createConfig } from '../config';
import type { MarketplaceMeteringClient, MarketplaceSubmitUsageEvent } from './client';
import type { Clock } from './clock';
import { MeteringOutboxWorker } from './worker';
import { PostgresUsageEventRepository, type PostgresUsageEventSqlClient } from './postgres-repository';
import { InMemoryUsageEventRepository } from './repository';

class FakeClock implements Clock {
  private current: Date;

  constructor(seed = '2026-05-29T14:30:29.387Z') {
    this.current = new Date(seed);
  }

  now(): Date {
    return new Date(this.current);
  }

  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

const usageEventPayload: UsageEventIngestRequest = {
  eventId: 'evt_001',
  subscriptionId: 'sub_001',
  planId: 'plan-growth',
  dimensionId: 'dim_api_requests',
  quantity: 42,
  timestamp: '2026-05-29T14:00:00.000Z'
};

interface StoredUsageEvent extends UsageEventRecord {
  claimToken: string | null;
  leaseExpiresAt: string | null;
}

class FakePostgresStore {
  readonly usageEvents = new Map<string, StoredUsageEvent>();
  readonly deadLetters = new Map<string, UsageEventDeadLetterRecord>();
}

class FakePostgresClient implements PostgresUsageEventSqlClient {
  constructor(private readonly store: FakePostgresStore) {}

  async $transaction<T>(callback: (tx: FakePostgresClient) => Promise<T>): Promise<T> {
    return callback(this);
  }

  async $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number> {
    const normalized = normalize(query);

    if (normalized.includes('INSERT INTO usage_event_dead_letters')) {
      const [id, usageEventId, tenantId, eventId, reason, httpStatus, retryCount, payload, failedAt] = values;
      const existing = [...this.store.deadLetters.values()].find((entry) => entry.usageEventId === usageEventId);
      const record: UsageEventDeadLetterRecord = {
        id: existing?.id ?? String(id),
        usageEventId: String(usageEventId),
        tenantId: String(tenantId),
        eventId: String(eventId),
        reason: String(reason),
        httpStatus: httpStatus === null ? null : Number(httpStatus),
        retryCount: Number(retryCount),
        payload: JSON.parse(String(payload)) as Record<string, unknown>,
        failedAt: toIso(failedAt)!
      };
      this.store.deadLetters.set(record.id, record);
      return 1;
    }

    if (normalized.startsWith('CREATE TABLE') || normalized.startsWith('CREATE INDEX') || normalized.startsWith('ALTER TABLE') || normalized.startsWith('DROP INDEX')) {
      return 0;
    }

    throw new Error(`Unhandled execute query: ${normalized}`);
  }

  async $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T> {
    const normalized = normalize(query);

    if (normalized.startsWith('SELECT') && normalized.includes('FROM usage_events') && normalized.includes('created_at >= $2::timestamptz')) {
      const [tenantId, createdAfter, idempotencyKey, eventId, eventTimestamp] = values;
      const row = [...this.store.usageEvents.values()]
        .filter((event) => event.tenantId === tenantId)
        .filter((event) => new Date(event.createdAt) >= new Date(String(createdAfter)))
        .filter((event) => event.idempotencyKey === idempotencyKey || (event.eventId === eventId && event.timestamp === toIso(eventTimestamp)))
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];

      return (row ? [clone(row)] : []) as T;
    }

    if (normalized.startsWith('INSERT INTO usage_events')) {
      const [id, tenantId, eventId, subscriptionId, planId, dimensionId, quantity, eventTimestamp, idempotencyKey, nextAttemptAt, metadataJson, createdAt] = values;
      const record: StoredUsageEvent = {
        id: String(id),
        tenantId: String(tenantId),
        eventId: String(eventId),
        subscriptionId: String(subscriptionId),
        planId: String(planId),
        dimensionId: String(dimensionId),
        quantity: Number(quantity),
        timestamp: toIso(eventTimestamp)!,
        idempotencyKey: String(idempotencyKey),
        status: 'pending',
        retryCount: 0,
        nextAttemptAt: toIso(nextAttemptAt),
        submittedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastHttpStatus: null,
        metadata: JSON.parse(String(metadataJson)) as Record<string, unknown>,
        createdAt: toIso(createdAt)!,
        updatedAt: toIso(createdAt)!,
        claimToken: null,
        leaseExpiresAt: null
      };
      this.store.usageEvents.set(record.id, record);
      return [clone(record)] as T;
    }

    if (normalized.startsWith('WITH candidate AS')) {
      const [now, limit, claimToken, leaseExpiresAt] = values;
      const selected = [...this.store.usageEvents.values()]
        .filter((event) => (event.status === 'pending' || event.status === 'retry_scheduled') && (!event.nextAttemptAt || new Date(event.nextAttemptAt) <= new Date(String(now))))
        .filter((event) => !event.leaseExpiresAt || new Date(event.leaseExpiresAt) <= new Date(String(now)))
        .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime() || new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
        .slice(0, Number(limit))
        .map((event) => {
          const updated: StoredUsageEvent = {
            ...event,
            claimToken: String(claimToken),
            leaseExpiresAt: toIso(leaseExpiresAt),
            updatedAt: toIso(now)!
          };
          this.store.usageEvents.set(event.id, updated);
          return clone(updated);
        });

      return selected as T;
    }

    if (normalized.startsWith("UPDATE usage_events SET status = 'submitted'")) {
      const [id, claimToken, submittedAt] = values;
      return this.updateEvent(id, claimToken, (event) => ({
        ...event,
        status: 'submitted',
        submittedAt: toIso(submittedAt),
        nextAttemptAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastHttpStatus: null,
        claimToken: null,
        leaseExpiresAt: null,
        updatedAt: toIso(submittedAt)!
      })) as T;
    }

    if (normalized.startsWith("UPDATE usage_events SET status = 'retry_scheduled'")) {
      const [id, claimToken, retryCount, nextAttemptAt, code, message, httpStatus, updatedAt] = values;
      return this.updateEvent(id, claimToken, (event) => ({
        ...event,
        status: 'retry_scheduled',
        retryCount: Number(retryCount),
        nextAttemptAt: toIso(nextAttemptAt),
        lastErrorCode: String(code),
        lastErrorMessage: String(message),
        lastHttpStatus: httpStatus === null ? null : Number(httpStatus),
        claimToken: null,
        leaseExpiresAt: null,
        updatedAt: toIso(updatedAt)!
      })) as T;
    }

    if (normalized.startsWith("UPDATE usage_events SET status = 'dead_letter'")) {
      const [id, claimToken, reason, _message, httpStatus, updatedAt] = values;
      return this.updateEvent(id, claimToken, (event) => ({
        ...event,
        status: 'dead_letter',
        nextAttemptAt: null,
        lastErrorCode: String(reason),
        lastErrorMessage: String(reason),
        lastHttpStatus: httpStatus === null ? null : Number(httpStatus),
        claimToken: null,
        leaseExpiresAt: null,
        updatedAt: toIso(updatedAt)!
      })) as T;
    }

    if (normalized.startsWith('SELECT') && normalized.includes('FROM usage_event_dead_letters') && normalized.includes('WHERE tenant_id = $1')) {
      const [tenantId] = values;
      return [...this.store.deadLetters.values()]
        .filter((entry) => entry.tenantId === tenantId)
        .sort((left, right) => new Date(right.failedAt).getTime() - new Date(left.failedAt).getTime())
        .map((entry) => clone(entry)) as T;
    }

    if (normalized.startsWith('SELECT') && normalized.includes('FROM usage_event_dead_letters')) {
      return [...this.store.deadLetters.values()]
        .sort((left, right) => new Date(right.failedAt).getTime() - new Date(left.failedAt).getTime())
        .map((entry) => clone(entry)) as T;
    }

    if (normalized.startsWith('SELECT') && normalized.includes('FROM usage_events') && normalized.includes('WHERE id = $1')) {
      const [id] = values;
      const record = this.store.usageEvents.get(String(id));
      return (record ? [clone(record)] : []) as T;
    }

    if (normalized.startsWith('SELECT') && normalized.includes('FROM usage_events') && normalized.includes('WHERE tenant_id = $1')) {
      const [tenantId] = values;
      return [...this.store.usageEvents.values()]
        .filter((event) => event.tenantId === tenantId)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .map((event) => clone(event)) as T;
    }

    throw new Error(`Unhandled query: ${normalized}`);
  }

  private updateEvent(id: unknown, claimToken: unknown, updater: (event: StoredUsageEvent) => StoredUsageEvent): StoredUsageEvent[] {
    const record = this.store.usageEvents.get(String(id));
    if (!record || record.claimToken !== String(claimToken)) {
      return [];
    }

    const updated = updater(record);
    this.store.usageEvents.set(updated.id, updated);
    return [clone(updated)];
  }
}

class BlockingMarketplaceClient implements MarketplaceMeteringClient {
  readonly submittedEvents: MarketplaceSubmitUsageEvent[] = [];
  private readonly releasePromise: Promise<void>;
  private release!: () => void;
  private readonly firstCallPromise: Promise<void>;
  private resolveFirstCall!: () => void;

  constructor() {
    this.releasePromise = new Promise<void>((resolve) => {
      this.release = resolve;
    });
    this.firstCallPromise = new Promise<void>((resolve) => {
      this.resolveFirstCall = resolve;
    });
  }

  async submitUsageEvent(event: MarketplaceSubmitUsageEvent): Promise<void> {
    this.submittedEvents.push(event);
    this.resolveFirstCall();
    await this.releasePromise;
  }

  async waitForFirstCall(): Promise<void> {
    await this.firstCallPromise;
  }

  unblock(): void {
    this.release();
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function normalize(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

function createWorkerConfig() {
  return createConfig({
    AUTH_BYPASS_ENABLED: 'true',
    METERING_BATCH_SIZE: '10',
    METERING_CLAIM_LEASE_MS: '60000',
    METERING_MAX_RETRIES: '2',
    METERING_RETRY_BASE_DELAY_MS: '1000',
    METERING_RETRY_MAX_DELAY_MS: '30000',
    METERING_RETRY_JITTER_RATIO: '0',
    METERING_SUBMISSION_SLA_MS: '14400000'
  });
}

describe('metering durability and worker safety', () => {
  it('persists usage events across repository restarts and only deduplicates for 30 days', async () => {
    const store = new FakePostgresStore();
    const repository = new PostgresUsageEventRepository(new FakePostgresClient(store));
    const firstIngestedAt = new Date('2026-05-29T14:30:29.387Z');

    const first = await repository.ingest('tenant-123', usageEventPayload, 'tenant-123:evt_001:2026-05-29T14:00:00.000Z', firstIngestedAt);
    const restartedRepository = new PostgresUsageEventRepository(new FakePostgresClient(store));
    const deduplicated = await restartedRepository.ingest('tenant-123', usageEventPayload, 'tenant-123:evt_001:2026-05-29T14:00:00.000Z', new Date('2026-06-10T14:30:29.387Z'));
    const afterWindow = await restartedRepository.ingest('tenant-123', usageEventPayload, 'tenant-123:evt_001:2026-05-29T14:00:00.000Z', new Date('2026-06-30T14:30:29.387Z'));

    expect(first.deduplicated).toBe(false);
    expect(deduplicated).toMatchObject({
      deduplicated: true,
      event: { id: first.event.id }
    });
    expect(afterWindow.deduplicated).toBe(false);
    expect(afterWindow.event.id).not.toBe(first.event.id);
    expect(await restartedRepository.listByTenant('tenant-123')).toHaveLength(2);
  });

  it('claims due rows atomically so concurrent consumers never process the same event twice', async () => {
    const store = new FakePostgresStore();
    const repositoryA = new PostgresUsageEventRepository(new FakePostgresClient(store));
    const repositoryB = new PostgresUsageEventRepository(new FakePostgresClient(store));
    const now = new Date('2026-05-29T14:30:29.387Z');

    await repositoryA.ingest('tenant-123', usageEventPayload, 'tenant-123:evt_001:2026-05-29T14:00:00.000Z', now);

    const [claimedByA, claimedByB] = await Promise.all([
      repositoryA.claimDueBatch(now, 10, 60000),
      repositoryB.claimDueBatch(now, 10, 60000)
    ]);

    expect(claimedByA.length + claimedByB.length).toBe(1);
    expect([claimedByA.length, claimedByB.length].sort()).toEqual([0, 1]);
  });

  it('maps Azure Marketplace payloads correctly and resists overlapping worker ticks', async () => {
    const clock = new FakeClock();
    const repository = new InMemoryUsageEventRepository(clock);
    const client = new BlockingMarketplaceClient();
    const worker = new MeteringOutboxWorker(createWorkerConfig(), repository, client, clock, () => 0);

    await repository.ingest('tenant-123', usageEventPayload, 'tenant-123:evt_001:2026-05-29T14:00:00.000Z', clock.now());

    const firstRun = worker.runNextBatch();
    await client.waitForFirstCall();
    const overlappingRun = worker.runNextBatch();
    client.unblock();

    const [firstResult, secondResult] = await Promise.all([firstRun, overlappingRun]);

    expect(firstResult.attempted + secondResult.attempted).toBe(1);
    expect(client.submittedEvents).toEqual([
      {
        tenantId: 'tenant-123',
        eventId: 'evt_001',
        idempotencyKey: 'tenant-123:evt_001:2026-05-29T14:00:00.000Z',
        payload: {
          resourceId: 'sub_001',
          quantity: 42,
          dimension: 'dim_api_requests',
          effectiveStartTime: '2026-05-29T14:00:00.000Z',
          planId: 'plan-growth'
        }
      }
    ]);
    expect((await repository.listByTenant('tenant-123'))[0].status).toBe('submitted');
  });
});
