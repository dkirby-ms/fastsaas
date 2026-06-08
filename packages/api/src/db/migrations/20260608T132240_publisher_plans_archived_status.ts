import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw("ALTER TABLE publisher_plans ADD COLUMN IF NOT EXISTS status TEXT").execute(db);
  await sql.raw("UPDATE publisher_plans SET status = 'active' WHERE status IS NULL").execute(db);
  await sql.raw("UPDATE publisher_plans SET status = 'archived' WHERE status <> 'active'").execute(db);
  await sql.raw("ALTER TABLE publisher_plans ALTER COLUMN status SET DEFAULT 'active'").execute(db);
  await sql.raw('ALTER TABLE publisher_plans ALTER COLUMN status SET NOT NULL').execute(db);
  await sql.raw('ALTER TABLE publisher_plans DROP CONSTRAINT IF EXISTS publisher_plans_status_check').execute(db);
  await sql.raw(
    "ALTER TABLE publisher_plans ADD CONSTRAINT publisher_plans_status_check CHECK (status IN ('active', 'archived'))"
  ).execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql.raw('ALTER TABLE publisher_plans DROP CONSTRAINT IF EXISTS publisher_plans_status_check').execute(db);
  await sql.raw("UPDATE publisher_plans SET status = 'draft' WHERE status = 'archived'").execute(db);
  await sql.raw("ALTER TABLE publisher_plans ALTER COLUMN status SET DEFAULT 'active'").execute(db);
  await sql.raw(
    "ALTER TABLE publisher_plans ADD CONSTRAINT publisher_plans_status_check CHECK (status IN ('active', 'draft'))"
  ).execute(db);
}
