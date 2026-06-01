import { sql, type Kysely } from 'kysely';

import { buildDisableTenantRlsStatements, buildEnableTenantRlsStatements } from './20260531T213532_tenant_rls';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
    CREATE TABLE IF NOT EXISTS tenant_members (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT NULL,
      role TEXT NOT NULL CHECK (role IN ('Owner', 'Admin', 'Member', 'Viewer')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT tenant_members_tenant_id_user_id_key UNIQUE (tenant_id, user_id)
    )
  `).execute(db);
  await sql.raw('CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_id ON tenant_members (tenant_id)').execute(db);

  for (const statement of buildEnableTenantRlsStatements('tenant_members', 'tenant_id')) {
    await sql.raw(statement).execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const statement of buildDisableTenantRlsStatements('tenant_members')) {
    await sql.raw(statement).execute(db);
  }

  await sql.raw('DROP INDEX IF EXISTS idx_tenant_members_tenant_id').execute(db);
  await sql.raw('DROP TABLE IF EXISTS tenant_members').execute(db);
}
