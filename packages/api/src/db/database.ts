import type { SubscriptionStatus, UsageEventRecord } from '@fastsaas/shared';
import { Kysely, PostgresDialect, type ColumnType } from 'kysely';
import { Pool } from 'pg';

type JsonRecord = Record<string, unknown>;
type GeneratedUuid = ColumnType<string, string | undefined, never>;
type Numeric = ColumnType<string, number | string, number | string>;
type Timestamp = ColumnType<Date, Date | string, Date | string>;
type GeneratedTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
type JsonColumn = ColumnType<JsonRecord, JsonRecord | string | undefined, JsonRecord | string>;
type NullableJsonColumn = ColumnType<JsonRecord | null, JsonRecord | string | null | undefined, JsonRecord | string | null>;

export interface UsageEventsTable {
  id: string;
  tenant_id: string;
  event_id: string;
  subscription_id: string;
  plan_id: string;
  dimension_id: string;
  quantity: Numeric;
  event_timestamp: Timestamp;
  idempotency_key: string;
  status: UsageEventRecord['status'];
  retry_count: ColumnType<number, number | undefined, number>;
  next_attempt_at: NullableTimestamp;
  submitted_at: NullableTimestamp;
  last_error_code: string | null;
  last_error_message: string | null;
  last_http_status: number | null;
  metadata: JsonColumn;
  claim_token: string | null;
  claimed_at: NullableTimestamp;
  claim_expires_at: NullableTimestamp;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface UsageEventDeadLettersTable {
  id: string;
  usage_event_id: string;
  tenant_id: string;
  event_id: string;
  reason: string;
  http_status: number | null;
  retry_count: number;
  payload: JsonColumn;
  failed_at: Timestamp;
}

export interface SubscriptionsTable {
  id: GeneratedUuid;
  tenant_id: string;
  marketplace_subscription_id: string;
  plan_id: string;
  seats: ColumnType<number, number | undefined, number>;
  status: SubscriptionStatus;
  offer_id: string | null;
  purchaser_tenant_id: string | null;
  beneficiary_tenant_id: string | null;
  correlation_id: string;
  metadata: NullableJsonColumn;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface SubscriptionAuditLogsTable {
  id: GeneratedUuid;
  subscription_id: string;
  tenant_id: string;
  event_type: string;
  source: string;
  from_status: SubscriptionStatus | null;
  to_status: SubscriptionStatus;
  correlation_id: string;
  request_id: string;
  details: NullableJsonColumn;
  created_at: GeneratedTimestamp;
}

export interface MarketplaceWebhookEventsTable {
  id: GeneratedUuid;
  idempotency_key: string;
  marketplace_subscription_id: string;
  tenant_id: string | null;
  action: string;
  correlation_id: string;
  request_id: string;
  payload: JsonColumn;
  status: string;
  error_message: string | null;
  created_at: GeneratedTimestamp;
  processed_at: NullableTimestamp;
}

export interface AuditLogsTable {
  id: string;
  tenant_id: string;
  actor_id: string;
  action: 'view' | 'manage' | 'export';
  resource: 'subscriptions' | 'billing' | 'users' | 'metering' | 'audit_logs' | 'webhooks';
  resource_id: string | null;
  timestamp: GeneratedTimestamp;
  outcome: 'success' | 'denied' | 'failure';
  metadata: JsonColumn;
}

export interface Database {
  usage_events: UsageEventsTable;
  usage_event_dead_letters: UsageEventDeadLettersTable;
  subscriptions: SubscriptionsTable;
  subscription_audit_logs: SubscriptionAuditLogsTable;
  marketplace_webhook_events: MarketplaceWebhookEventsTable;
  audit_logs: AuditLogsTable;
}

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString });
}

export function createDatabase(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: createPool(connectionString)
    })
  });
}
