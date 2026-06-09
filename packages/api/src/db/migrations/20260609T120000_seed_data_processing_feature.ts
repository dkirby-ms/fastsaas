import { sql, type Kysely } from 'kysely';

/**
 * Seed migration: gates the `data-processing` feature to the `premium-1` plan.
 *
 * Uses the single-publisher ENTRA_TENANT_ID sentinel and idempotent inserts so
 * the migration can be re-run safely.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  const publisherTenantId = process.env.ENTRA_TENANT_ID?.trim() ?? 'publisher';

  await sql`SET LOCAL app.bypass_rls = 'true'`.execute(db);

  await sql`
    INSERT INTO publisher_plans (publisher_tenant_id, id, name, description, status, features)
    VALUES (
      ${publisherTenantId},
      'premium-1',
      'Premium',
      'Full-featured premium plan with exclusive features.',
      'active',
      '[]'::jsonb
    )
    ON CONFLICT DO NOTHING
  `.execute(db);

  await sql`
    INSERT INTO plan_feature_gates (publisher_tenant_id, plan_id, feature_key, enabled)
    VALUES (${publisherTenantId}, 'premium-1', 'data-processing', true)
    ON CONFLICT DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const publisherTenantId = process.env.ENTRA_TENANT_ID?.trim() ?? 'publisher';

  await sql`SET LOCAL app.bypass_rls = 'true'`.execute(db);

  await sql`
    DELETE FROM plan_feature_gates
    WHERE publisher_tenant_id = ${publisherTenantId}
      AND plan_id = 'premium-1'
      AND feature_key = 'data-processing'
  `.execute(db);
}
