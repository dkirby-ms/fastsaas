import { sql, type Kysely } from 'kysely';

import { buildDisableTenantRlsStatements, buildEnableTenantRlsStatements } from '../rls';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
    CREATE TABLE IF NOT EXISTS marketplace_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id TEXT NULL,
      publisher_tenant_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      request_payload_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('submitted', 'running', 'completed', 'failed', 'cancelled')),
      result JSONB NULL,
      errors JSONB NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      polled_at TIMESTAMPTZ NULL,
      completed_at TIMESTAMPTZ NULL,
      CONSTRAINT marketplace_jobs_tenant_job_key UNIQUE (publisher_tenant_id, job_id)
    )
  `).execute(db);

  await sql.raw(
    'CREATE INDEX IF NOT EXISTS idx_marketplace_jobs_tenant_created_at ON marketplace_jobs (publisher_tenant_id, created_at DESC)'
  ).execute(db);
  await sql.raw(
    'CREATE INDEX IF NOT EXISTS idx_marketplace_jobs_polling ON marketplace_jobs (status, polled_at ASC NULLS FIRST, created_at ASC)'
  ).execute(db);

  for (const statement of buildEnableTenantRlsStatements('marketplace_jobs', 'publisher_tenant_id')) {
    await sql.raw(statement).execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const statement of buildDisableTenantRlsStatements('marketplace_jobs')) {
    await sql.raw(statement).execute(db);
  }

  await sql.raw('DROP INDEX IF EXISTS idx_marketplace_jobs_polling').execute(db);
  await sql.raw('DROP INDEX IF EXISTS idx_marketplace_jobs_tenant_created_at').execute(db);
  await sql.raw('DROP TABLE IF EXISTS marketplace_jobs').execute(db);
}
