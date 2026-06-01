import { Migrator, type Kysely, type Migration, type MigrationProvider, type MigrationResult } from 'kysely';

import type { Database } from './database';
import * as tenantRlsMigration from './migrations/20260531T213532_tenant_rls';

const MIGRATIONS: Readonly<Record<string, Migration>> = {
  '20260531T213532_tenant_rls': tenantRlsMigration
};

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return { ...MIGRATIONS };
  }
}

export async function runDatabaseMigrations(db: Kysely<Database>): Promise<MigrationResult[]> {
  const migrator = new Migrator({
    db,
    provider: new StaticMigrationProvider()
  });
  const { error, results } = await migrator.migrateToLatest();

  if (error) {
    throw error;
  }

  return results ?? [];
}
