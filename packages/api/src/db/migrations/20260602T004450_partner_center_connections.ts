import type { Kysely } from 'kysely';

// Stub migration — the partner_center tables have been removed but this entry
// must remain so Kysely's migrator doesn't consider the migration history corrupted.
// The original migration created partner_center_accounts and partner_center_credentials
// tables which are no longer needed (single-publisher-per-deployment model).

export async function up(_db: Kysely<unknown>): Promise<void> {
  // no-op: tables already exist in staging DB from original run
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // no-op
}
