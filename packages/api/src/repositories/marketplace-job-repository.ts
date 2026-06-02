import { randomUUID } from 'node:crypto';

import type { Kysely, Selectable } from 'kysely';

import type {
  ProductIngestionConfigureDetail,
  ProductIngestionConfigureStatus,
  ProductIngestionResourceReference
} from '../lib/product-ingestion-types';
import type { Database } from '../db/database';
import { withDatabaseRlsContext } from '../db/execution-context';

export type MarketplaceJobStatus = 'submitted' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface MarketplaceJobErrorRecord {
  level: 'job' | 'detail';
  code: string;
  message?: string;
  resourceId?: ProductIngestionResourceReference;
}

export interface MarketplaceJobPollState {
  attemptCount: number;
  nextPollAt?: string;
  lastDelayMs?: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastErrorStatus?: number;
}

export interface MarketplaceJobResultRecord {
  latestStatus?: ProductIngestionConfigureStatus;
  detail?: ProductIngestionConfigureDetail;
  poll?: MarketplaceJobPollState;
}

export interface MarketplaceJobRecord {
  id: string;
  productId?: string;
  publisherTenantId: string;
  jobId: string;
  requestPayloadHash: string;
  status: MarketplaceJobStatus;
  result?: MarketplaceJobResultRecord;
  errors: MarketplaceJobErrorRecord[];
  createdAt: string;
  polledAt?: string;
  completedAt?: string;
}

export interface ListMarketplaceJobsOptions {
  limit: number;
  offset: number;
}

export interface CreateMarketplaceJobInput {
  productId?: string | null;
  publisherTenantId: string;
  jobId: string;
  requestPayloadHash: string;
  status: MarketplaceJobStatus;
  result?: MarketplaceJobResultRecord;
  errors?: MarketplaceJobErrorRecord[];
  createdAt?: string;
  polledAt?: string | null;
  completedAt?: string | null;
}

export interface UpdateMarketplaceJobInput {
  id: string;
  publisherTenantId: string;
  status?: MarketplaceJobStatus;
  result?: MarketplaceJobResultRecord | null;
  errors?: MarketplaceJobErrorRecord[] | null;
  polledAt?: string | null;
  completedAt?: string | null;
}

export interface MarketplaceJobRepository {
  createJob(input: CreateMarketplaceJobInput): Promise<MarketplaceJobRecord>;
  updateJob(input: UpdateMarketplaceJobInput, options?: { bypassRls?: boolean }): Promise<MarketplaceJobRecord>;
  findByJobId(publisherTenantId: string, jobId: string): Promise<MarketplaceJobRecord | null>;
  listByTenant(publisherTenantId: string, options: ListMarketplaceJobsOptions): Promise<MarketplaceJobRecord[]>;
  countByTenant(publisherTenantId: string): Promise<number>;
  listActiveForPolling(limit: number): Promise<MarketplaceJobRecord[]>;
}

type MarketplaceJobRow = Selectable<Database['marketplace_jobs']>;

function clone<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function toIsoString(value: string | Date | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return typeof value === 'string' ? value : value.toISOString();
}

function mapRow(row: MarketplaceJobRow): MarketplaceJobRecord {
  const resultRecord = asRecord(row.result) as MarketplaceJobResultRecord | undefined;
  const errorEnvelope = asRecord(row.errors);
  const items = Array.isArray(errorEnvelope?.items) ? (errorEnvelope.items as MarketplaceJobErrorRecord[]) : [];

  return {
    id: row.id,
    productId: row.product_id ?? undefined,
    publisherTenantId: row.publisher_tenant_id,
    jobId: row.job_id,
    requestPayloadHash: row.request_payload_hash,
    status: row.status,
    result: resultRecord ? clone(resultRecord) : undefined,
    errors: clone(items),
    createdAt: toIsoString(row.created_at) as string,
    polledAt: toIsoString(row.polled_at),
    completedAt: toIsoString(row.completed_at)
  };
}

function comparePollingPriority(left: MarketplaceJobRecord, right: MarketplaceJobRecord): number {
  return new Date(left.polledAt ?? left.createdAt).getTime() - new Date(right.polledAt ?? right.createdAt).getTime();
}

export class InMemoryMarketplaceJobRepository implements MarketplaceJobRepository {
  private readonly jobs = new Map<string, MarketplaceJobRecord>();

  async createJob(input: CreateMarketplaceJobInput): Promise<MarketplaceJobRecord> {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const record: MarketplaceJobRecord = {
      id: randomUUID(),
      productId: input.productId ?? undefined,
      publisherTenantId: input.publisherTenantId,
      jobId: input.jobId,
      requestPayloadHash: input.requestPayloadHash,
      status: input.status,
      result: input.result ? clone(input.result) : undefined,
      errors: clone(input.errors ?? []),
      createdAt,
      polledAt: input.polledAt ?? undefined,
      completedAt: input.completedAt ?? undefined
    };

    this.jobs.set(record.id, clone(record));
    return clone(record);
  }

  async updateJob(input: UpdateMarketplaceJobInput): Promise<MarketplaceJobRecord> {
    const existing = this.jobs.get(input.id);
    if (!existing || existing.publisherTenantId != input.publisherTenantId) {
      throw new Error(`Marketplace job ${input.id} was not found`);
    }

    const updated: MarketplaceJobRecord = {
      ...clone(existing),
      status: input.status ?? existing.status,
      result: input.result === undefined ? clone(existing.result) : input.result === null ? undefined : clone(input.result),
      errors: input.errors === undefined ? clone(existing.errors) : clone(input.errors ?? []),
      polledAt: input.polledAt === undefined ? existing.polledAt : input.polledAt ?? undefined,
      completedAt: input.completedAt === undefined ? existing.completedAt : input.completedAt ?? undefined
    };

    this.jobs.set(updated.id, clone(updated));
    return clone(updated);
  }

  async findByJobId(publisherTenantId: string, jobId: string): Promise<MarketplaceJobRecord | null> {
    const record = [...this.jobs.values()].find((entry) => entry.publisherTenantId === publisherTenantId && entry.jobId === jobId);
    return record ? clone(record) : null;
  }

  async listByTenant(publisherTenantId: string, options: ListMarketplaceJobsOptions): Promise<MarketplaceJobRecord[]> {
    return [...this.jobs.values()]
      .filter((entry) => entry.publisherTenantId === publisherTenantId)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(options.offset, options.offset + options.limit)
      .map((entry) => clone(entry));
  }

  async countByTenant(publisherTenantId: string): Promise<number> {
    return [...this.jobs.values()].filter((entry) => entry.publisherTenantId === publisherTenantId).length;
  }

  async listActiveForPolling(limit: number): Promise<MarketplaceJobRecord[]> {
    return [...this.jobs.values()]
      .filter((entry) => entry.status === 'submitted' || entry.status === 'running')
      .sort(comparePollingPriority)
      .slice(0, limit)
      .map((entry) => clone(entry));
  }
}

export class KyselyMarketplaceJobRepository implements MarketplaceJobRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async createJob(input: CreateMarketplaceJobInput): Promise<MarketplaceJobRecord> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const now = input.createdAt ? new Date(input.createdAt) : new Date();
        const row = await trx
          .insertInto('marketplace_jobs')
          .values({
            id: randomUUID(),
            product_id: input.productId ?? null,
            publisher_tenant_id: input.publisherTenantId,
            job_id: input.jobId,
            request_payload_hash: input.requestPayloadHash,
            status: input.status,
            result: input.result ? clone(input.result) as Record<string, unknown> : null,
            errors: input.errors ? { items: clone(input.errors) } : null,
            created_at: now,
            polled_at: input.polledAt ? new Date(input.polledAt) : null,
            completed_at: input.completedAt ? new Date(input.completedAt) : null
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        return mapRow(row);
      },
      { tenantId: input.publisherTenantId, bypassRls: false, scope: 'tenant' }
    );
  }

  async updateJob(input: UpdateMarketplaceJobInput, options: { bypassRls?: boolean } = {}): Promise<MarketplaceJobRecord> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const updated = await trx
          .updateTable('marketplace_jobs')
          .set({
            status: input.status,
            result: input.result === undefined ? undefined : input.result === null ? null : clone(input.result) as Record<string, unknown>,
            errors: input.errors === undefined ? undefined : input.errors === null ? null : { items: clone(input.errors) },
            polled_at: input.polledAt === undefined ? undefined : input.polledAt ? new Date(input.polledAt) : null,
            completed_at: input.completedAt === undefined ? undefined : input.completedAt ? new Date(input.completedAt) : null
          })
          .where('id', '=', input.id)
          .returningAll()
          .executeTakeFirst();

        if (!updated) {
          throw new Error(`Marketplace job ${input.id} was not found`);
        }

        return mapRow(updated);
      },
      {
        tenantId: input.publisherTenantId,
        bypassRls: options.bypassRls ?? false,
        scope: options.bypassRls ? 'system' : 'tenant'
      }
    );
  }

  async findByJobId(publisherTenantId: string, jobId: string): Promise<MarketplaceJobRecord | null> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const row = await trx
          .selectFrom('marketplace_jobs')
          .selectAll()
          .where('publisher_tenant_id', '=', publisherTenantId)
          .where('job_id', '=', jobId)
          .executeTakeFirst();

        return row ? mapRow(row) : null;
      },
      { tenantId: publisherTenantId, bypassRls: false, scope: 'tenant' }
    );
  }

  async listByTenant(publisherTenantId: string, options: ListMarketplaceJobsOptions): Promise<MarketplaceJobRecord[]> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const rows = await trx
          .selectFrom('marketplace_jobs')
          .selectAll()
          .where('publisher_tenant_id', '=', publisherTenantId)
          .orderBy('created_at', 'desc')
          .limit(options.limit)
          .offset(options.offset)
          .execute();

        return rows.map((row) => mapRow(row));
      },
      { tenantId: publisherTenantId, bypassRls: false, scope: 'tenant' }
    );
  }

  async countByTenant(publisherTenantId: string): Promise<number> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const result = await trx
          .selectFrom('marketplace_jobs')
          .select((eb) => eb.fn.count<string>('id').as('count'))
          .where('publisher_tenant_id', '=', publisherTenantId)
          .executeTakeFirstOrThrow();

        return Number(result.count);
      },
      { tenantId: publisherTenantId, bypassRls: false, scope: 'tenant' }
    );
  }

  async listActiveForPolling(limit: number): Promise<MarketplaceJobRecord[]> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const rows = await trx
          .selectFrom('marketplace_jobs')
          .selectAll()
          .where('status', 'in', ['submitted', 'running'])
          .orderBy('polled_at', 'asc')
          .orderBy('created_at', 'asc')
          .limit(limit)
          .execute();

        return rows.map((row) => mapRow(row));
      },
      { bypassRls: true, scope: 'system' }
    );
  }
}
