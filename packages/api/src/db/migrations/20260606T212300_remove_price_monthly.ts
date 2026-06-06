import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw('ALTER TABLE publisher_plans DROP COLUMN IF EXISTS price_monthly').execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql.raw("ALTER TABLE publisher_plans ADD COLUMN IF NOT EXISTS price_monthly TEXT NOT NULL DEFAULT ''").execute(db);
}
