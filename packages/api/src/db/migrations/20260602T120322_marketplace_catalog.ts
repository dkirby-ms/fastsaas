import { sql, type Kysely } from 'kysely';

import { buildDisableTenantRlsStatements, buildEnableTenantRlsStatements } from '../rls';

const TABLES = ['marketplace_products', 'marketplace_plans', 'marketplace_submissions', 'marketplace_resources'] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
    CREATE TABLE IF NOT EXISTS marketplace_products (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      publisher_tenant_id TEXT NOT NULL,
      external_offer_id TEXT NOT NULL,
      durable_product_id TEXT NOT NULL,
      product_type TEXT NOT NULL,
      alias TEXT NOT NULL,
      lifecycle_state TEXT NULL,
      last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT marketplace_products_tenant_external_offer_key UNIQUE (publisher_tenant_id, external_offer_id),
      CONSTRAINT marketplace_products_tenant_durable_product_key UNIQUE (publisher_tenant_id, durable_product_id)
    )
  `).execute(db);

  await sql.raw(`
    CREATE TABLE IF NOT EXISTS marketplace_plans (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      publisher_tenant_id TEXT NOT NULL,
      product_id TEXT NOT NULL REFERENCES marketplace_products(id) ON DELETE CASCADE,
      external_plan_id TEXT NOT NULL,
      durable_plan_id TEXT NOT NULL,
      status TEXT NOT NULL,
      pricing_summary JSONB NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT marketplace_plans_tenant_product_external_key UNIQUE (publisher_tenant_id, product_id, external_plan_id),
      CONSTRAINT marketplace_plans_tenant_product_durable_key UNIQUE (publisher_tenant_id, product_id, durable_plan_id)
    )
  `).execute(db);

  await sql.raw(`
    CREATE TABLE IF NOT EXISTS marketplace_submissions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      publisher_tenant_id TEXT NOT NULL,
      product_id TEXT NOT NULL REFERENCES marketplace_products(id) ON DELETE CASCADE,
      durable_submission_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT marketplace_submissions_tenant_product_submission_key UNIQUE (publisher_tenant_id, product_id, durable_submission_id)
    )
  `).execute(db);

  await sql.raw(`
    CREATE TABLE IF NOT EXISTS marketplace_resources (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      publisher_tenant_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      durable_id TEXT NOT NULL,
      product_id TEXT NOT NULL REFERENCES marketplace_products(id) ON DELETE CASCADE,
      json_snapshot JSONB NOT NULL,
      schema_version TEXT NOT NULL,
      environment TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT marketplace_resources_tenant_product_resource_key UNIQUE (publisher_tenant_id, product_id, resource_type, durable_id, environment)
    )
  `).execute(db);

  await sql.raw(
    'CREATE INDEX IF NOT EXISTS idx_marketplace_products_tenant_updated ON marketplace_products (publisher_tenant_id, updated_at DESC)'
  ).execute(db);
  await sql.raw(
    'CREATE INDEX IF NOT EXISTS idx_marketplace_plans_tenant_product ON marketplace_plans (publisher_tenant_id, product_id, updated_at DESC)'
  ).execute(db);
  await sql.raw(
    'CREATE INDEX IF NOT EXISTS idx_marketplace_submissions_tenant_product ON marketplace_submissions (publisher_tenant_id, product_id, updated_at DESC)'
  ).execute(db);
  await sql.raw(
    'CREATE INDEX IF NOT EXISTS idx_marketplace_resources_tenant_product ON marketplace_resources (publisher_tenant_id, product_id, updated_at DESC)'
  ).execute(db);

  for (const tableName of TABLES) {
    for (const statement of buildEnableTenantRlsStatements(tableName, 'publisher_tenant_id')) {
      await sql.raw(statement).execute(db);
    }
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const tableName of [...TABLES].reverse()) {
    for (const statement of buildDisableTenantRlsStatements(tableName)) {
      await sql.raw(statement).execute(db);
    }
  }

  await sql.raw('DROP INDEX IF EXISTS idx_marketplace_resources_tenant_product').execute(db);
  await sql.raw('DROP INDEX IF EXISTS idx_marketplace_submissions_tenant_product').execute(db);
  await sql.raw('DROP INDEX IF EXISTS idx_marketplace_plans_tenant_product').execute(db);
  await sql.raw('DROP INDEX IF EXISTS idx_marketplace_products_tenant_updated').execute(db);
  await sql.raw('DROP TABLE IF EXISTS marketplace_resources').execute(db);
  await sql.raw('DROP TABLE IF EXISTS marketplace_submissions').execute(db);
  await sql.raw('DROP TABLE IF EXISTS marketplace_plans').execute(db);
  await sql.raw('DROP TABLE IF EXISTS marketplace_products').execute(db);
}
