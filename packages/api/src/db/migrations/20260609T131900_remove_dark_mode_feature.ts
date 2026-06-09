import { sql, type Kysely } from 'kysely';

/**
 * Remove the dark-mode feature definition and any plan gates referencing it.
 * Dark mode is now available to all users unconditionally.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`SET LOCAL app.bypass_rls = 'true'`.execute(db);

  await sql`
    DELETE FROM plan_feature_gates WHERE feature_key = 'dark-mode'
  `.execute(db);

  await sql`
    DELETE FROM feature_definitions WHERE feature_key = 'dark-mode'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const publisherTenantId = process.env.ENTRA_TENANT_ID?.trim() ?? 'publisher';

  await sql`SET LOCAL app.bypass_rls = 'true'`.execute(db);

  await sql`
    INSERT INTO feature_definitions (feature_key, label, description, category)
    VALUES ('dark-mode', 'Dark Mode', 'Unlock dark theme toggle', 'visual')
    ON CONFLICT DO NOTHING
  `.execute(db);

  await sql`
    INSERT INTO plan_feature_gates (publisher_tenant_id, plan_id, feature_key, enabled)
    VALUES (${publisherTenantId}, 'premium-1', 'dark-mode', true)
    ON CONFLICT DO NOTHING
  `.execute(db);
}
