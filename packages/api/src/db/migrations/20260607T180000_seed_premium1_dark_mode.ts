import { sql, type Kysely } from 'kysely';

/**
 * Seed migration: gates the `dark-mode` feature to the `premium-1` plan.
 *
 * Single-publisher deployment — uses ENTRA_TENANT_ID as publisher_tenant_id,
 * falling back to 'publisher' for local dev/test environments where the env
 * var is not set.
 *
 * Inserts are idempotent (ON CONFLICT DO NOTHING) so re-running migrations
 * is safe.
 *
 * Note: Kysely wraps migrations in an implicit transaction, so SET LOCAL here
 * scopes the RLS bypass to only this migration's transaction.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  const publisherTenantId = process.env.ENTRA_TENANT_ID?.trim() ?? 'publisher';

  // Bypass RLS for these seed inserts. publisher_plans and plan_feature_gates
  // have FORCE ROW LEVEL SECURITY; SET LOCAL scopes the bypass to this migration transaction.
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
    VALUES (${publisherTenantId}, 'premium-1', 'dark-mode', true)
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
      AND feature_key = 'dark-mode'
  `.execute(db);

  await sql`
    DELETE FROM publisher_plans
    WHERE publisher_tenant_id = ${publisherTenantId}
      AND id = 'premium-1'
  `.execute(db);
}
