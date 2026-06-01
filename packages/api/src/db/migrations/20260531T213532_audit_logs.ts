import { sql, type Kysely } from 'kysely';

import { buildDisableTenantRlsStatements, buildEnableTenantRlsStatements } from '../rls';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      resource_id TEXT,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      outcome TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `).execute(db);

  await sql.raw('CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_timestamp ON audit_logs (tenant_id, timestamp DESC)').execute(db);
  await sql.raw('CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_action ON audit_logs (resource, action, timestamp DESC)').execute(db);

  await sql.raw(`
    CREATE OR REPLACE FUNCTION audit_logs_reject_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'audit_logs is append-only';
    END;
    $$
  `).execute(db);
  await sql.raw('DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs').execute(db);
  await sql.raw(`
    CREATE TRIGGER audit_logs_append_only
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION audit_logs_reject_mutation()
  `).execute(db);

  for (const statement of buildEnableTenantRlsStatements('audit_logs', 'tenant_id')) {
    await sql.raw(statement).execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const statement of buildDisableTenantRlsStatements('audit_logs')) {
    await sql.raw(statement).execute(db);
  }

  await sql.raw('DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs').execute(db);
  await sql.raw('DROP FUNCTION IF EXISTS audit_logs_reject_mutation').execute(db);
  await sql.raw('DROP INDEX IF EXISTS idx_audit_logs_resource_action').execute(db);
  await sql.raw('DROP INDEX IF EXISTS idx_audit_logs_tenant_timestamp').execute(db);
  await sql.raw('DROP TABLE IF EXISTS audit_logs').execute(db);
}
