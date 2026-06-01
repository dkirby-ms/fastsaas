import { Migrator, type Kysely, type Migration, type MigrationProvider } from 'kysely';
import type { Logger } from 'pino';

import type { Database } from './database';
import * as auditLogsMigration from './migrations/20260531T213532_audit_logs';
import * as publisherPlansMigration from './migrations/20260601T004305_publisher_plans';

const MIGRATIONS: Record<string, Migration> = {
  '20260531T213532_audit_logs': auditLogsMigration,
  '20260601T004305_publisher_plans': publisherPlansMigration
};

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return MIGRATIONS;
  }
}

export async function migrateToLatest(db: Kysely<Database>, migrationLogger?: Logger): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new StaticMigrationProvider()
  });

  const { error, results } = await migrator.migrateToLatest();

  for (const result of results ?? []) {
    migrationLogger?.info({ migration: result.migrationName, status: result.status }, 'Database migration executed');
  }

  if (error) {
    migrationLogger?.error({ err: error }, 'Database migration failed');
    throw error;
  }
}

export const runMigrations = migrateToLatest;
