import { sql, type Kysely } from 'kysely';

import {
  TENANT_SCOPED_TABLE_POLICIES,
  buildDisableTenantRlsStatements,
  buildEnableTenantRlsStatements
} from '../rls';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw('ALTER TABLE subscription_audit_logs ADD COLUMN IF NOT EXISTS tenant_id TEXT').execute(db);
  await sql.raw(`
    UPDATE subscription_audit_logs AS audit_logs
    SET tenant_id = subscriptions.tenant_id
    FROM subscriptions
    WHERE audit_logs.subscription_id = subscriptions.id
      AND audit_logs.tenant_id IS NULL
  `).execute(db);
  await sql.raw('ALTER TABLE subscription_audit_logs ALTER COLUMN tenant_id SET NOT NULL').execute(db);
  await sql.raw(
    'CREATE INDEX IF NOT EXISTS idx_subscription_audit_logs_tenant_created_at ON subscription_audit_logs (tenant_id, created_at DESC)'
  ).execute(db);

  await sql.raw('ALTER TABLE marketplace_webhook_events ADD COLUMN IF NOT EXISTS tenant_id TEXT').execute(db);
  await sql.raw(`
    UPDATE marketplace_webhook_events AS webhook_events
    SET tenant_id = subscriptions.tenant_id
    FROM subscriptions
    WHERE webhook_events.marketplace_subscription_id = subscriptions.marketplace_subscription_id
      AND webhook_events.tenant_id IS NULL
  `).execute(db);
  await sql.raw(
    'CREATE INDEX IF NOT EXISTS idx_marketplace_webhook_events_tenant_created_at ON marketplace_webhook_events (tenant_id, created_at DESC)'
  ).execute(db);

  for (const policy of TENANT_SCOPED_TABLE_POLICIES) {
    for (const statement of buildEnableTenantRlsStatements(policy.tableName, policy.tenantColumn)) {
      await sql.raw(statement).execute(db);
    }
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const policy of [...TENANT_SCOPED_TABLE_POLICIES].reverse()) {
    for (const statement of buildDisableTenantRlsStatements(policy.tableName)) {
      await sql.raw(statement).execute(db);
    }
  }

  await sql.raw('DROP INDEX IF EXISTS idx_marketplace_webhook_events_tenant_created_at').execute(db);
  await sql.raw('ALTER TABLE marketplace_webhook_events DROP COLUMN IF EXISTS tenant_id').execute(db);
  await sql.raw('DROP INDEX IF EXISTS idx_subscription_audit_logs_tenant_created_at').execute(db);
  await sql.raw('ALTER TABLE subscription_audit_logs DROP COLUMN IF EXISTS tenant_id').execute(db);
}
