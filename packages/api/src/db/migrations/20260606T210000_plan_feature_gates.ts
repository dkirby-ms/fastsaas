import { sql, type Kysely } from 'kysely';

import { buildDisableTenantRlsStatements, buildEnableTenantRlsStatements } from '../rls';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
    CREATE TABLE IF NOT EXISTS plan_feature_gates (
      publisher_tenant_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      feature_key TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      metadata JSONB NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (publisher_tenant_id, plan_id, feature_key),
      FOREIGN KEY (publisher_tenant_id, plan_id)
        REFERENCES publisher_plans (publisher_tenant_id, id) ON DELETE CASCADE
    )
  `).execute(db);

  await sql.raw(`
    CREATE INDEX IF NOT EXISTS idx_plan_feature_gates_plan
    ON plan_feature_gates (publisher_tenant_id, plan_id)
  `).execute(db);

  for (const statement of buildEnableTenantRlsStatements('plan_feature_gates', 'publisher_tenant_id')) {
    await sql.raw(statement).execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const statement of buildDisableTenantRlsStatements('plan_feature_gates')) {
    await sql.raw(statement).execute(db);
  }

  await sql.raw('DROP INDEX IF EXISTS idx_plan_feature_gates_plan').execute(db);
  await sql.raw('DROP TABLE IF EXISTS plan_feature_gates').execute(db);
}
