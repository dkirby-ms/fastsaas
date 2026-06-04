import { sql, type Kysely } from 'kysely';

async function tableExists(db: Kysely<unknown>, tableName: string): Promise<boolean> {
  const result = await sql<{ exists: boolean }>`SELECT to_regclass(${tableName}) IS NOT NULL AS exists`.execute(db);
  return result.rows[0]?.exists ?? false;
}

async function columnExists(db: Kysely<unknown>, tableName: string, columnName: string): Promise<boolean> {
  const result = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS exists
  `.execute(db);

  return result.rows[0]?.exists ?? false;
}

async function createIndexIfColumnExists(
  db: Kysely<unknown>,
  tableName: string,
  columnName: string,
  statement: string
): Promise<void> {
  if (!(await tableExists(db, tableName)) || !(await columnExists(db, tableName, columnName))) {
    return;
  }

  await sql.raw(statement).execute(db);
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL,
      marketplace_subscription_id TEXT NOT NULL UNIQUE,
      plan_id TEXT NOT NULL,
      seats INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL,
      offer_id TEXT,
      purchaser_tenant_id TEXT,
      beneficiary_tenant_id TEXT,
      correlation_id TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).execute(db);

  await sql.raw(`
    CREATE TABLE IF NOT EXISTS subscription_audit_logs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).execute(db);

  await sql.raw(`
    CREATE TABLE IF NOT EXISTS marketplace_webhook_events (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      idempotency_key TEXT NOT NULL UNIQUE,
      marketplace_subscription_id TEXT NOT NULL,
      tenant_id TEXT,
      action TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ
    )
  `).execute(db);

  await createIndexIfColumnExists(db, 'subscriptions', 'tenant_id', 'CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON subscriptions (tenant_id)');
  await createIndexIfColumnExists(
    db,
    'subscriptions',
    'marketplace_subscription_id',
    'CREATE INDEX IF NOT EXISTS idx_subscriptions_marketplace_subscription_id ON subscriptions (marketplace_subscription_id)'
  );
  await createIndexIfColumnExists(
    db,
    'subscription_audit_logs',
    'subscription_id',
    'CREATE INDEX IF NOT EXISTS idx_subscription_audit_logs_subscription_id ON subscription_audit_logs (subscription_id)'
  );
  await createIndexIfColumnExists(
    db,
    'subscription_audit_logs',
    'tenant_id',
    'CREATE INDEX IF NOT EXISTS idx_subscription_audit_logs_tenant_id ON subscription_audit_logs (tenant_id)'
  );
  await createIndexIfColumnExists(
    db,
    'marketplace_webhook_events',
    'marketplace_subscription_id',
    'CREATE INDEX IF NOT EXISTS idx_marketplace_webhook_events_marketplace_subscription_id ON marketplace_webhook_events (marketplace_subscription_id)'
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql.raw(
    'DROP INDEX IF EXISTS idx_marketplace_webhook_events_marketplace_subscription_id'
  ).execute(db);
  await sql.raw('DROP INDEX IF EXISTS idx_subscription_audit_logs_tenant_id').execute(db);
  await sql.raw('DROP INDEX IF EXISTS idx_subscription_audit_logs_subscription_id').execute(db);
  await sql.raw('DROP INDEX IF EXISTS idx_subscriptions_marketplace_subscription_id').execute(db);
  await sql.raw('DROP INDEX IF EXISTS idx_subscriptions_tenant_id').execute(db);

  await sql.raw('DROP TABLE IF EXISTS marketplace_webhook_events').execute(db);
  await sql.raw('DROP TABLE IF EXISTS subscription_audit_logs').execute(db);
  await sql.raw('DROP TABLE IF EXISTS subscriptions').execute(db);
}
