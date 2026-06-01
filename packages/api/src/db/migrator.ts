import { Migrator, type Kysely, type Migration, type MigrationProvider, type MigrationResultSet } from 'kysely';
import type { Logger } from 'pino';

import type { Database } from './database';
import * as auditLogsMigration from './migrations/20260531T213532_audit_logs';
import * as tenantRlsMigration from './migrations/20260531T213532_tenant_rls';
import * as publisherPlansMigration from './migrations/20260601T004305_publisher_plans';

const MIGRATIONS: Record<string, Migration> = {
  '20260531T213532_audit_logs': auditLogsMigration,
  '20260531T213532_tenant_rls': tenantRlsMigration,
  '20260601T004305_publisher_plans': publisherPlansMigration
};

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return MIGRATIONS;
  }
}

export function createMigrator(db: Kysely<Database>): Migrator {
  return new Migrator({
    db,
    provider: new StaticMigrationProvider()
  });
}

export async function migrateToLatest(db: Kysely<Database>, migrationLogger?: Logger): Promise<MigrationResultSet> {
  const migrator = createMigrator(db);
  const result = await migrator.migrateToLatest();

  for (const migration of result.results ?? []) {
    migrationLogger?.info({ migration: migration.migrationName, status: migration.status }, 'Database migration executed');
  }

  if (result.error) {
    migrationLogger?.error({ err: result.error }, 'Database migration failed');
    throw result.error;
  }

  return result;
}

export const runMigrations = migrateToLatest;
