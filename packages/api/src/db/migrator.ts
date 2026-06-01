import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Migrator, type Kysely, type Migration, type MigrationProvider, type MigrationResultSet } from 'kysely';
import type { Logger } from 'pino';

import type { Database } from './database';

const MIGRATION_FILE_PATTERN = /\.(c|m)?(j|t)s$/;

class SortedFileMigrationProvider implements MigrationProvider {
  constructor(private readonly migrationFolder: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const migrationFiles = (await fs.readdir(this.migrationFolder, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && MIGRATION_FILE_PATTERN.test(entry.name) && !entry.name.endsWith('.d.ts'))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    const migrations = await Promise.all(
      migrationFiles.map(async (fileName) => {
        const modulePath = path.join(this.migrationFolder, fileName);
        const migrationName = path.basename(fileName, path.extname(fileName));
        const migrationModule = (await import(pathToFileURL(modulePath).href)) as Migration;

        return [migrationName, migrationModule] as const;
      })
    );

    return Object.fromEntries(migrations);
  }
}

export function createMigrator(db: Kysely<Database>): Migrator {
  return new Migrator({
    db,
    provider: new SortedFileMigrationProvider(path.join(__dirname, 'migrations'))
  });
}

export async function migrateToLatest(
  db: Kysely<Database>,
  migrationLogger?: Logger
): Promise<MigrationResultSet> {
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
