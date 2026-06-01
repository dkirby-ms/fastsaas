import { sql, type Kysely } from 'kysely';

const APP_CURRENT_TENANT_SETTING = 'app.current_tenant';
const APP_BYPASS_RLS_SETTING = 'app.bypass_rls';

interface TenantScopedTablePolicy {
  tableName: string;
  tenantColumn: string;
}

const TENANT_SCOPED_TABLE_POLICIES: readonly TenantScopedTablePolicy[] = [
  { tableName: 'subscriptions', tenantColumn: 'tenant_id' },
  { tableName: 'subscription_audit_logs', tenantColumn: 'tenant_id' },
  { tableName: 'usage_events', tenantColumn: 'tenant_id' },
  { tableName: 'usage_event_dead_letters', tenantColumn: 'tenant_id' },
  { tableName: 'marketplace_webhook_events', tenantColumn: 'tenant_id' }
] as const;

function buildTenantIsolationPredicate(tenantColumn: string): string {
  const tenantSetting = `NULLIF(current_setting('${APP_CURRENT_TENANT_SETTING}', true), '')`;
  const bypassSetting = `COALESCE(NULLIF(current_setting('${APP_BYPASS_RLS_SETTING}', true), ''), 'false') = 'true'`;

  return `(${bypassSetting} OR ${tenantColumn} = ${tenantSetting})`;
}

export function buildEnableTenantRlsStatements(tableName: string, tenantColumn = 'tenant_id'): string[] {
  const predicate = buildTenantIsolationPredicate(tenantColumn);
  const policyName = `${tableName}_tenant_isolation`;

  return [
    `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS ${policyName} ON ${tableName}`,
    `CREATE POLICY ${policyName} ON ${tableName} FOR ALL USING (${predicate}) WITH CHECK (${predicate})`
  ];
}

export function buildDisableTenantRlsStatements(tableName: string): string[] {
  const policyName = `${tableName}_tenant_isolation`;

  return [`DROP POLICY IF EXISTS ${policyName} ON ${tableName}`, `ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`];
}

const METERING_SCHEMA_STATEMENTS = [
  `
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
  `,
  `
    ALTER TABLE usage_events
    ALTER COLUMN id TYPE TEXT USING id::text,
    ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text,
    ALTER COLUMN subscription_id TYPE TEXT USING subscription_id::text,
    ALTER COLUMN dimension_id TYPE TEXT USING dimension_id::text,
    ALTER COLUMN idempotency_key TYPE TEXT USING idempotency_key::text
  `,
  'ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS plan_id TEXT',
  'ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS claim_token TEXT',
  'ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ NULL',
  'ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ NULL',
  'ALTER TABLE usage_events DROP CONSTRAINT IF EXISTS usage_events_idempotency_key_key',
  'ALTER TABLE usage_events DROP CONSTRAINT IF EXISTS usage_events_tenant_event_ts_key',
  `
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
  `,
  `
    ALTER TABLE usage_event_dead_letters
    ALTER COLUMN id TYPE TEXT USING id::text,
    ALTER COLUMN usage_event_id TYPE TEXT USING usage_event_id::text,
    ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text
  `,
  'CREATE INDEX IF NOT EXISTS idx_usage_events_due ON usage_events (status, next_attempt_at, claim_expires_at, event_timestamp, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_created_at ON usage_events (tenant_id, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_usage_events_dedupe_lookup ON usage_events (tenant_id, idempotency_key, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_usage_events_event_lookup ON usage_events (tenant_id, event_id, event_timestamp, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_usage_event_dead_letters_tenant_failed_at ON usage_event_dead_letters (tenant_id, failed_at DESC)'
] as const;

async function executeStatements(db: Kysely<unknown>, statements: readonly string[]): Promise<void> {
  for (const statement of statements) {
    await sql.raw(statement).execute(db);
  }
}

async function tableExists(db: Kysely<unknown>, tableName: string): Promise<boolean> {
  const result = await sql<{ exists: boolean }>`SELECT to_regclass(${tableName}) IS NOT NULL AS exists`.execute(db);
  return result.rows[0]?.exists ?? false;
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await executeStatements(db, METERING_SCHEMA_STATEMENTS);

  if (await tableExists(db, 'subscription_audit_logs')) {
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
  }

  if (await tableExists(db, 'marketplace_webhook_events')) {
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
  }

  for (const policy of TENANT_SCOPED_TABLE_POLICIES) {
    if (!(await tableExists(db, policy.tableName))) {
      continue;
    }

    for (const statement of buildEnableTenantRlsStatements(policy.tableName, policy.tenantColumn)) {
      await sql.raw(statement).execute(db);
    }
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const policy of [...TENANT_SCOPED_TABLE_POLICIES].reverse()) {
    if (!(await tableExists(db, policy.tableName))) {
      continue;
    }

    for (const statement of buildDisableTenantRlsStatements(policy.tableName)) {
      await sql.raw(statement).execute(db);
    }
  }

  if (await tableExists(db, 'marketplace_webhook_events')) {
    await sql.raw('DROP INDEX IF EXISTS idx_marketplace_webhook_events_tenant_created_at').execute(db);
    await sql.raw('ALTER TABLE marketplace_webhook_events DROP COLUMN IF EXISTS tenant_id').execute(db);
  }

  if (await tableExists(db, 'subscription_audit_logs')) {
    await sql.raw('DROP INDEX IF EXISTS idx_subscription_audit_logs_tenant_created_at').execute(db);
    await sql.raw('ALTER TABLE subscription_audit_logs DROP COLUMN IF EXISTS tenant_id').execute(db);
  }
}
