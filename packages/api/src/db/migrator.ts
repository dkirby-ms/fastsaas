import { Migrator, type Kysely, type Migration, type MigrationProvider } from 'kysely';

import type { Database } from './database';
import * as auditLogsMigration from './migrations/20260531T213532_audit_logs';

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      '20260531T213532_audit_logs': auditLogsMigration
    };
  }
}

export async function runMigrations(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new StaticMigrationProvider()
  });
  const { error } = await migrator.migrateToLatest();

  if (error) {
    throw error;
  }
}
