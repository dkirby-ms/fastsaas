import { createConfig } from '../config';
import { createDatabase } from './database';
import { migrateToLatest } from './migrator';

async function main(): Promise<void> {
  const config = createConfig();
  const databaseUrl = config.database.url?.trim();

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run migrations');
  }

  const db = createDatabase(databaseUrl);

  try {
    const result = await migrateToLatest(db);

    for (const migration of result.results ?? []) {
      const status = migration.status === 'Success' ? 'applied' : migration.status.toLowerCase();
      console.info(`${status}: ${migration.migrationName}`);
    }
  } finally {
    await db.destroy();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
