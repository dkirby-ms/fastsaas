import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
    CREATE TABLE IF NOT EXISTS feature_definitions (
      feature_key  TEXT PRIMARY KEY,
      label        TEXT NOT NULL,
      description  TEXT,
      category     TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).execute(db);

  await sql.raw(`
    INSERT INTO feature_definitions (feature_key, label, description, category) VALUES
      ('dark-mode',           'Dark Mode',          'Unlock dark theme toggle',                                          'visual'),
      ('advanced-analytics',  'Advanced Analytics', 'Usage analytics dashboard with charts',                            'visual'),
      ('export-csv',          'Export CSV',          'Export data tables to CSV',                                        'functional'),
      ('custom-webhooks',     'Custom Webhooks',     'Configure custom webhook endpoints for lifecycle events',          'functional')
    ON CONFLICT DO NOTHING
  `).execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql.raw('DROP TABLE IF EXISTS feature_definitions').execute(db);
}
