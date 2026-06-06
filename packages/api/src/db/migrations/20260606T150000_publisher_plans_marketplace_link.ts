import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw('ALTER TABLE publisher_plans ADD COLUMN IF NOT EXISTS marketplace_plan_id TEXT NULL').execute(db);
  await sql.raw('ALTER TABLE publisher_plans ADD COLUMN IF NOT EXISTS seat_limit INTEGER NULL').execute(db);
  await sql.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_publisher_plans_marketplace_plan_id
    ON publisher_plans (marketplace_plan_id)
    WHERE marketplace_plan_id IS NOT NULL
  `).execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql.raw('DROP INDEX IF EXISTS idx_publisher_plans_marketplace_plan_id').execute(db);
  await sql.raw('ALTER TABLE publisher_plans DROP COLUMN IF EXISTS seat_limit').execute(db);
  await sql.raw('ALTER TABLE publisher_plans DROP COLUMN IF EXISTS marketplace_plan_id').execute(db);
}
