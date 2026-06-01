import { FileMigrationProvider, Migrator, type Kysely, type MigrationResultSet } from 'kysely';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { Database } from './database';

export function createMigrator(db: Kysely<Database>): Migrator {
  return new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, 'migrations')
    })
  });
}

export async function migrateToLatest(db: Kysely<Database>): Promise<MigrationResultSet> {
  const migrator = createMigrator(db);
  const result = await migrator.migrateToLatest();

  if (result.error) {
    throw result.error;
  }

  return result;
}
