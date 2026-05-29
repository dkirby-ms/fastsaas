import { randomUUID } from 'node:crypto';

import type { MeteringDashboardSummary, UsageEventDeadLetterRecord, UsageEventIngestRequest, UsageEventIngestResponse, UsageEventRecord } from '@fastsaas/shared';

import { METERING_DEDUPE_WINDOW_MS, buildDashboardSummary, type ClaimedUsageEventRecord, type UsageEventRepository } from './repository';

interface QueryableSqlClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

export interface PostgresUsageEventSqlClient extends QueryableSqlClient {
  $transaction<T>(callback: (tx: QueryableSqlClient) => Promise<T>): Promise<T>;
}

interface UsageEventRow {
  id: string;
  tenantId: string;
  eventId: string;
  subscriptionId: string;
  planId: string;
  dimensionId: string;
  quantity: number | string;
  timestamp: Date | string;
  idempotencyKey: string;
  status: UsageEventRecord['status'];
  retryCount: number;
  nextAttemptAt: Date | string | null;
  submittedAt: Date | string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastHttpStatus: number | null;
  metadata: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
  claimToken?: string | null;
  leaseExpiresAt?: Date | string | null;
}

interface DeadLetterRow {
  id: string;
  usageEventId: string;
  tenantId: string;
  eventId: string;
  reason: string;
  httpStatus: number | null;
  retryCount: number;
  payload: unknown;
  failedAt: Date | string;
}

const USAGE_EVENT_COLUMNS = `
  id,
  tenant_id AS "tenantId",
  event_id AS "eventId",
  subscription_id AS "subscriptionId",
  plan_id AS "planId",
  dimension_id AS "dimensionId",
  quantity,
  event_timestamp AS timestamp,
  idempotency_key AS "idempotencyKey",
  status,
  retry_count AS "retryCount",
  next_attempt_at AS "nextAttemptAt",
  submitted_at AS "submittedAt",
  last_error_code AS "lastErrorCode",
  last_error_message AS "lastErrorMessage",
  last_http_status AS "lastHttpStatus",
  metadata,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const CLAIMED_USAGE_EVENT_COLUMNS = `
  ${USAGE_EVENT_COLUMNS},
  claim_token AS "claimToken",
  claim_expires_at AS "leaseExpiresAt"
`;

const DEAD_LETTER_COLUMNS = `
  id,
  usage_event_id AS "usageEventId",
  tenant_id AS "tenantId",
  event_id AS "eventId",
  reason,
  http_status AS "httpStatus",
  retry_count AS "retryCount",
  payload,
  failed_at AS "failedAt"
`;

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseObject(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === 'string') {
    return JSON.parse(value) as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function mapUsageEventRow(row: UsageEventRow): UsageEventRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    eventId: row.eventId,
    subscriptionId: row.subscriptionId,
    planId: row.planId,
    dimensionId: row.dimensionId,
    quantity: Number(row.quantity),
    timestamp: toIsoString(row.timestamp)!,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    retryCount: Number(row.retryCount),
    nextAttemptAt: toIsoString(row.nextAttemptAt),
    submittedAt: toIsoString(row.submittedAt),
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    lastHttpStatus: row.lastHttpStatus,
    metadata: parseObject(row.metadata),
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!
  };
}

function mapClaimedUsageEventRow(row: UsageEventRow): ClaimedUsageEventRecord {
  if (!row.claimToken || !row.leaseExpiresAt) {
    throw new Error(`Usage event ${row.id} is missing an active claim`);
  }

  return {
    ...mapUsageEventRow(row),
    claimToken: row.claimToken,
    leaseExpiresAt: toIsoString(row.leaseExpiresAt)!
  };
}

function mapDeadLetterRow(row: DeadLetterRow): UsageEventDeadLetterRecord {
  return {
    id: row.id,
    usageEventId: row.usageEventId,
    tenantId: row.tenantId,
    eventId: row.eventId,
    reason: row.reason,
    httpStatus: row.httpStatus,
    retryCount: Number(row.retryCount),
    payload: parseObject(row.payload),
    failedAt: toIsoString(row.failedAt)!
  };
}

export class PostgresUsageEventRepository implements UsageEventRepository {
  private schemaReady: Promise<void> | null = null;

  constructor(private readonly db: PostgresUsageEventSqlClient) {}

  async ingest(tenantId: string, event: UsageEventIngestRequest, idempotencyKey: string, now: Date): Promise<UsageEventIngestResponse> {
    await this.ensureSchema();

    return this.db.$transaction(async (tx) => {
      const eventTimestamp = new Date(event.timestamp).toISOString();
      const dedupeCutoff = new Date(now.getTime() - METERING_DEDUPE_WINDOW_MS).toISOString();
      const existing = await tx.$queryRawUnsafe<UsageEventRow[]>(`
        SELECT ${USAGE_EVENT_COLUMNS}
        FROM usage_events
        WHERE tenant_id = $1
          AND created_at >= $2::timestamptz
          AND (
            idempotency_key = $3
            OR (event_id = $4 AND event_timestamp = $5::timestamptz)
          )
        ORDER BY created_at DESC
        LIMIT 1
      `, tenantId, dedupeCutoff, idempotencyKey, event.eventId, eventTimestamp);

      if (existing[0]) {
        return {
          event: mapUsageEventRow(existing[0]),
          deduplicated: true
        };
      }

      const createdAt = now.toISOString();
      const rows = await tx.$queryRawUnsafe<UsageEventRow[]>(`
        INSERT INTO usage_events (
          id,
          tenant_id,
          event_id,
          subscription_id,
          plan_id,
          dimension_id,
          quantity,
          event_timestamp,
          idempotency_key,
          status,
          retry_count,
          next_attempt_at,
          submitted_at,
          last_error_code,
          last_error_message,
          last_http_status,
          metadata,
          claim_token,
          claimed_at,
          claim_expires_at,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8::timestamptz,
          $9,
          'pending',
          0,
          $10::timestamptz,
          NULL,
          NULL,
          NULL,
          NULL,
          $11::jsonb,
          NULL,
          NULL,
          NULL,
          $12::timestamptz,
          $12::timestamptz
        )
        RETURNING ${USAGE_EVENT_COLUMNS}
      `,
      randomUUID(),
      tenantId,
      event.eventId,
      event.subscriptionId,
      event.planId,
      event.dimensionId,
      event.quantity,
      eventTimestamp,
      idempotencyKey,
      createdAt,
      JSON.stringify(event.metadata ?? {}),
      createdAt);

      return {
        event: mapUsageEventRow(rows[0]),
        deduplicated: false
      };
    });
  }

  async claimDueBatch(now: Date, limit: number, leaseMs: number): Promise<ClaimedUsageEventRecord[]> {
    await this.ensureSchema();

    const claimToken = randomUUID();
    const nowIso = now.toISOString();
    const leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
    const rows = await this.db.$transaction((tx) => tx.$queryRawUnsafe<UsageEventRow[]>(`
      WITH candidate AS (
        SELECT id
        FROM usage_events
        WHERE status IN ('pending', 'retry_scheduled')
          AND (next_attempt_at IS NULL OR next_attempt_at <= $1::timestamptz)
          AND (claim_expires_at IS NULL OR claim_expires_at <= $1::timestamptz)
        ORDER BY event_timestamp ASC, created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE usage_events AS usage_events
      SET claim_token = $3,
          claimed_at = $1::timestamptz,
          claim_expires_at = $4::timestamptz,
          updated_at = $1::timestamptz
      FROM candidate
      WHERE usage_events.id = candidate.id
      RETURNING ${CLAIMED_USAGE_EVENT_COLUMNS}
    `, nowIso, limit, claimToken, leaseExpiresAt));

    return rows.map((row) => mapClaimedUsageEventRow(row));
  }

  async markSubmitted(event: ClaimedUsageEventRecord, submittedAt: Date): Promise<UsageEventRecord> {
    await this.ensureSchema();

    const rows = await this.db.$queryRawUnsafe<UsageEventRow[]>(`
      UPDATE usage_events
      SET status = 'submitted',
          submitted_at = $3::timestamptz,
          next_attempt_at = NULL,
          last_error_code = NULL,
          last_error_message = NULL,
          last_http_status = NULL,
          claim_token = NULL,
          claimed_at = NULL,
          claim_expires_at = NULL,
          updated_at = $3::timestamptz
      WHERE id = $1
        AND claim_token = $2
      RETURNING ${USAGE_EVENT_COLUMNS}
    `, event.id, event.claimToken, submittedAt.toISOString());

    if (!rows[0]) {
      throw new Error(`Usage event ${event.id} is no longer claimed by this worker`);
    }

    return mapUsageEventRow(rows[0]);
  }

  async scheduleRetry(event: ClaimedUsageEventRecord, retryCount: number, nextAttemptAt: Date, error: { code: string; message: string; httpStatus: number | null }): Promise<UsageEventRecord> {
    await this.ensureSchema();

    const nowIso = new Date().toISOString();
    const rows = await this.db.$queryRawUnsafe<UsageEventRow[]>(`
      UPDATE usage_events
      SET status = 'retry_scheduled',
          retry_count = $3,
          next_attempt_at = $4::timestamptz,
          last_error_code = $5,
          last_error_message = $6,
          last_http_status = $7,
          claim_token = NULL,
          claimed_at = NULL,
          claim_expires_at = NULL,
          updated_at = $8::timestamptz
      WHERE id = $1
        AND claim_token = $2
      RETURNING ${USAGE_EVENT_COLUMNS}
    `, event.id, event.claimToken, retryCount, nextAttemptAt.toISOString(), error.code, error.message, error.httpStatus, nowIso);

    if (!rows[0]) {
      throw new Error(`Usage event ${event.id} is no longer claimed by this worker`);
    }

    return mapUsageEventRow(rows[0]);
  }

  async markDeadLetter(event: ClaimedUsageEventRecord, entry: Omit<UsageEventDeadLetterRecord, 'id' | 'failedAt'>, now: Date): Promise<UsageEventRecord> {
    await this.ensureSchema();

    return this.db.$transaction(async (tx) => {
      const nowIso = now.toISOString();
      const rows = await tx.$queryRawUnsafe<UsageEventRow[]>(`
        UPDATE usage_events
        SET status = 'dead_letter',
            next_attempt_at = NULL,
            last_error_code = $3,
            last_error_message = $4,
            last_http_status = $5,
            claim_token = NULL,
            claimed_at = NULL,
            claim_expires_at = NULL,
            updated_at = $6::timestamptz
        WHERE id = $1
          AND claim_token = $2
        RETURNING ${USAGE_EVENT_COLUMNS}
      `, event.id, event.claimToken, entry.reason, entry.reason, entry.httpStatus, nowIso);

      if (!rows[0]) {
        throw new Error(`Usage event ${event.id} is no longer claimed by this worker`);
      }

      await tx.$executeRawUnsafe(`
        INSERT INTO usage_event_dead_letters (
          id,
          usage_event_id,
          tenant_id,
          event_id,
          reason,
          http_status,
          retry_count,
          payload,
          failed_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8::jsonb,
          $9::timestamptz
        )
        ON CONFLICT (usage_event_id)
        DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          event_id = EXCLUDED.event_id,
          reason = EXCLUDED.reason,
          http_status = EXCLUDED.http_status,
          retry_count = EXCLUDED.retry_count,
          payload = EXCLUDED.payload,
          failed_at = EXCLUDED.failed_at
      `, randomUUID(), event.id, entry.tenantId, entry.eventId, entry.reason, entry.httpStatus, entry.retryCount, JSON.stringify(entry.payload), nowIso);

      return mapUsageEventRow(rows[0]);
    });
  }

  async listDeadLetters(tenantId?: string): Promise<UsageEventDeadLetterRecord[]> {
    await this.ensureSchema();

    const rows = tenantId
      ? await this.db.$queryRawUnsafe<DeadLetterRow[]>(`
          SELECT ${DEAD_LETTER_COLUMNS}
          FROM usage_event_dead_letters
          WHERE tenant_id = $1
          ORDER BY failed_at DESC
        `, tenantId)
      : await this.db.$queryRawUnsafe<DeadLetterRow[]>(`
          SELECT ${DEAD_LETTER_COLUMNS}
          FROM usage_event_dead_letters
          ORDER BY failed_at DESC
        `);

    return rows.map((row) => mapDeadLetterRow(row));
  }

  async getById(id: string): Promise<UsageEventRecord | null> {
    await this.ensureSchema();

    const rows = await this.db.$queryRawUnsafe<UsageEventRow[]>(`
      SELECT ${USAGE_EVENT_COLUMNS}
      FROM usage_events
      WHERE id = $1
      LIMIT 1
    `, id);

    return rows[0] ? mapUsageEventRow(rows[0]) : null;
  }

  async listByTenant(tenantId: string): Promise<UsageEventRecord[]> {
    await this.ensureSchema();

    const rows = await this.db.$queryRawUnsafe<UsageEventRow[]>(`
      SELECT ${USAGE_EVENT_COLUMNS}
      FROM usage_events
      WHERE tenant_id = $1
      ORDER BY created_at DESC
    `, tenantId);

    return rows.map((row) => mapUsageEventRow(row));
  }

  async getDashboardSummary(tenantId: string, now: Date, submissionSlaMs: number): Promise<MeteringDashboardSummary> {
    const records = await this.listByTenant(tenantId);
    return buildDashboardSummary(records, now, submissionSlaMs);
  }

  private async ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = this.initializeSchema().catch((error) => {
        this.schemaReady = null;
        throw error;
      });
    }

    await this.schemaReady;
  }

  private async initializeSchema(): Promise<void> {
    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS usage_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        subscription_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        dimension_id TEXT NOT NULL,
        quantity NUMERIC(18, 6) NOT NULL,
        event_timestamp TIMESTAMPTZ NOT NULL,
        idempotency_key TEXT NOT NULL,
        status TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NULL,
        submitted_at TIMESTAMPTZ NULL,
        last_error_code TEXT NULL,
        last_error_message TEXT NULL,
        last_http_status INTEGER NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        claim_token TEXT NULL,
        claimed_at TIMESTAMPTZ NULL,
        claim_expires_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.db.$executeRawUnsafe(`
      ALTER TABLE usage_events
      ALTER COLUMN id TYPE TEXT USING id::text,
      ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text,
      ALTER COLUMN subscription_id TYPE TEXT USING subscription_id::text,
      ALTER COLUMN dimension_id TYPE TEXT USING dimension_id::text,
      ALTER COLUMN idempotency_key TYPE TEXT USING idempotency_key::text
    `);
    await this.db.$executeRawUnsafe('ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS plan_id TEXT');
    await this.db.$executeRawUnsafe('ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS claim_token TEXT');
    await this.db.$executeRawUnsafe('ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ NULL');
    await this.db.$executeRawUnsafe('ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ NULL');
    await this.db.$executeRawUnsafe('ALTER TABLE usage_events DROP CONSTRAINT IF EXISTS usage_events_idempotency_key_key');
    await this.db.$executeRawUnsafe('ALTER TABLE usage_events DROP CONSTRAINT IF EXISTS usage_events_tenant_event_ts_key');
    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS usage_event_dead_letters (
        id TEXT PRIMARY KEY,
        usage_event_id TEXT NOT NULL UNIQUE REFERENCES usage_events(id) ON DELETE CASCADE,
        tenant_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        http_status INTEGER NULL,
        retry_count INTEGER NOT NULL,
        payload JSONB NOT NULL,
        failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.db.$executeRawUnsafe(`
      ALTER TABLE usage_event_dead_letters
      ALTER COLUMN id TYPE TEXT USING id::text,
      ALTER COLUMN usage_event_id TYPE TEXT USING usage_event_id::text,
      ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text
    `);
    await this.db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_usage_events_due ON usage_events (status, next_attempt_at, claim_expires_at, event_timestamp, created_at)');
    await this.db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_created_at ON usage_events (tenant_id, created_at DESC)');
    await this.db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_usage_events_dedupe_lookup ON usage_events (tenant_id, idempotency_key, created_at DESC)');
    await this.db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_usage_events_event_lookup ON usage_events (tenant_id, event_id, event_timestamp, created_at DESC)');
    await this.db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_usage_event_dead_letters_tenant_failed_at ON usage_event_dead_letters (tenant_id, failed_at DESC)');
  }
}
