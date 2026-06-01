import { sql, type Kysely } from 'kysely';

import { buildDisableTenantRlsStatements, buildEnableTenantRlsStatements } from '../rls';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
    CREATE TABLE IF NOT EXISTS publisher_plans (
      publisher_tenant_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price_monthly TEXT NOT NULL,
      status TEXT NOT NULL,
      features JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (publisher_tenant_id, id)
    )
  `).execute(db);

  await sql.raw(`
    CREATE INDEX IF NOT EXISTS idx_publisher_plans_tenant_updated
    ON publisher_plans (publisher_tenant_id, updated_at DESC)
  `).execute(db);

  for (const statement of buildEnableTenantRlsStatements('publisher_plans', 'publisher_tenant_id')) {
    await sql.raw(statement).execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const statement of buildDisableTenantRlsStatements('publisher_plans')) {
    await sql.raw(statement).execute(db);
  }

  await sql.raw('DROP INDEX IF EXISTS idx_publisher_plans_tenant_updated').execute(db);
  await sql.raw('DROP TABLE IF EXISTS publisher_plans').execute(db);
}
